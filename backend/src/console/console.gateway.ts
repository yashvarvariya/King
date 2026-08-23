import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { DockerService } from '../docker/docker.service';

interface Subscription {
  serverId: string;
  statsInterval?: NodeJS.Timeout;
  logStream?: any;
}

/**
 * One socket connection can subscribe to a single server's live console
 * (stdout/stderr) and a 2s resource-usage tick. Auth is done via a JWT
 * passed in the `auth.token` field of the Socket.IO handshake.
 */
@WebSocketGateway({ cors: { origin: process.env.CORS_ORIGIN?.split(',') || '*' } })
export class ConsoleGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ConsoleGateway.name);
  private subscriptions = new Map<string, Subscription>();

  constructor(private prisma: PrismaService, private docker: DockerService) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string;
      const payload = jwt.verify(token, process.env.JWT_SECRET as string) as { sub: string };
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.suspended) throw new Error('unauthorized');
      (client as any).userId = user.id;
      (client as any).isAdmin = user.role === 'ADMIN';
    } catch {
      client.emit('error', 'Authentication failed');
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const sub = this.subscriptions.get(client.id);
    if (sub?.statsInterval) clearInterval(sub.statsInterval);
    this.subscriptions.delete(client.id);
  }

  @SubscribeMessage('subscribe')
  async onSubscribe(@ConnectedSocket() client: Socket, @MessageBody() data: { serverId: string }) {
    const userId = (client as any).userId;
    const isAdmin = (client as any).isAdmin;

    const server = await this.prisma.server.findUnique({ where: { id: data.serverId } });
    if (!server || (server.ownerId !== userId && !isAdmin)) {
      client.emit('error', 'Not authorized for this server');
      return;
    }

    // Tear down any prior subscription on this socket first
    const existing = this.subscriptions.get(client.id);
    if (existing?.statsInterval) clearInterval(existing.statsInterval);

    const sub: Subscription = { serverId: server.id };
    this.subscriptions.set(client.id, sub);

    // Stream logs if the container is up
    if (server.containerId) {
      try {
        const stream = await this.docker.attachLogs(server.containerId, (chunk) => {
          client.emit('log', chunk);
        });
        sub.logStream = stream;
      } catch (err) {
        this.logger.warn(`Could not attach logs for ${server.id}: ${(err as Error).message}`);
      }
    }

    // Push CPU/RAM stats every 2s
    sub.statsInterval = setInterval(async () => {
      const fresh = await this.prisma.server.findUnique({ where: { id: server.id } });
      if (!fresh?.containerId || fresh.status !== 'RUNNING') return;
      try {
        const stats = await this.docker.stats(fresh.containerId);
        client.emit('stats', stats);
      } catch {
        // container likely mid-restart; ignore this tick
      }
    }, 2000);

    client.emit('subscribed', { serverId: server.id });
  }

  @SubscribeMessage('command')
  async onCommand(@ConnectedSocket() client: Socket, @MessageBody() data: { serverId: string; input: string }) {
    const userId = (client as any).userId;
    const isAdmin = (client as any).isAdmin;

    const server = await this.prisma.server.findUnique({ where: { id: data.serverId } });
    if (!server || (server.ownerId !== userId && !isAdmin) || !server.containerId) {
      client.emit('error', 'Not authorized or server not running');
      return;
    }

    await this.docker.sendInput(server.containerId, data.input).catch((err) => {
      client.emit('error', `Failed to send input: ${err.message}`);
    });
  }

  @SubscribeMessage('unsubscribe')
  onUnsubscribe(@ConnectedSocket() client: Socket) {
    const sub = this.subscriptions.get(client.id);
    if (sub?.statsInterval) clearInterval(sub.statsInterval);
    this.subscriptions.delete(client.id);
  }
}
