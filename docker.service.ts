import { Injectable, Logger } from '@nestjs/common';
import Docker from 'dockerode';
import { PassThrough } from 'stream';

export type Runtime = 'NODEJS' | 'PYTHON';

const RUNTIME_IMAGE: Record<Runtime, string> = {
  NODEJS: 'node:20-alpine',
  PYTHON: 'python:3.12-alpine',
};

interface CreateContainerOpts {
  containerName: string;
  hostPath: string;      // absolute path on the host/volume for this server's files
  runtime: Runtime;
  startupCommand: string;
  env: Record<string, string>;
  memoryLimitMb: number;
  cpuLimitPercent: number; // 100 = 1 full core
}

/**
 * Thin wrapper around the Docker Engine API (via dockerode) that gives every
 * hosted bot its own isolated, resource-capped container. No Pterodactyl,
 * no wings daemon -- this talks directly to /var/run/docker.sock.
 */
@Injectable()
export class DockerService {
  private readonly logger = new Logger(DockerService.name);
  private docker: Docker;

  constructor() {
    // Prefer talking to the restricted docker-socket-proxy sidecar (see
    // docker-compose.yml) over TCP so the API container never gets a raw
    // bind-mount of /var/run/docker.sock — the proxy only exposes the
    // handful of Docker Engine endpoints this service actually needs
    // (containers, images, exec, attach) and blocks everything else
    // (e.g. host-level info/system endpoints that could be used to escape
    // the platform).
    if (process.env.DOCKER_HOST) {
      const url = new URL(process.env.DOCKER_HOST);
      this.docker = new Docker({ host: url.hostname, port: Number(url.port) || 2375 });
    } else {
      this.docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' });
    }
  }

  /** Creates (but does not start) an isolated container for a server. */
  async createContainer(opts: CreateContainerOpts): Promise<string> {
    const image = RUNTIME_IMAGE[opts.runtime];
    await this.ensureImage(image);

    const envList = Object.entries(opts.env).map(([k, v]) => `${k}=${v}`);
    const cpuQuota = Math.floor((opts.cpuLimitPercent / 100) * 100000);

    const container = await this.docker.createContainer({
      name: opts.containerName,
      Image: image,
      Tty: true,
      OpenStdin: true,
      WorkingDir: '/home/bot',
      Env: envList,
      Cmd: ['sh', '-c', opts.startupCommand],
      HostConfig: {
        Binds: [`${opts.hostPath}:/home/bot`],
        Memory: opts.memoryLimitMb * 1024 * 1024,
        MemorySwap: opts.memoryLimitMb * 1024 * 1024, // disable swap beyond limit
        CpuPeriod: 100000,
        CpuQuota: cpuQuota,
        PidsLimit: 256,
        NetworkMode: 'bridge',
        RestartPolicy: { Name: 'no' }, // we manage auto-restart ourselves
        ReadonlyRootfs: false,
        SecurityOpt: ['no-new-privileges'],
      },
      Labels: { 'platform.managed': 'true' },
    });

    return container.id;
  }

  async start(containerId: string) {
    const c = this.docker.getContainer(containerId);
    await c.start();
  }

  async stop(containerId: string, timeoutSec = 10) {
    const c = this.docker.getContainer(containerId);
    await c.stop({ t: timeoutSec }).catch((e) => {
      if (e.statusCode !== 304) throw e; // 304 = already stopped
    });
  }

  async kill(containerId: string) {
    const c = this.docker.getContainer(containerId);
    await c.kill().catch((e) => {
      if (e.statusCode !== 409 && e.statusCode !== 304) throw e;
    });
  }

  async restart(containerId: string) {
    const c = this.docker.getContainer(containerId);
    await c.restart({ t: 10 });
  }

  async remove(containerId: string) {
    const c = this.docker.getContainer(containerId);
    await c.remove({ force: true }).catch((e) => {
      if (e.statusCode !== 404) throw e;
    });
  }

  async inspect(containerId: string) {
    const c = this.docker.getContainer(containerId);
    return c.inspect();
  }

  /** Live CPU/RAM stats snapshot (single sample, non-streaming). */
  async stats(containerId: string) {
    const c = this.docker.getContainer(containerId);
    const raw: any = await c.stats({ stream: false });

    const cpuDelta = raw.cpu_stats.cpu_usage.total_usage - raw.precpu_stats.cpu_usage.total_usage;
    const systemDelta = raw.cpu_stats.system_cpu_usage - raw.precpu_stats.system_cpu_usage;
    const cpuCount = raw.cpu_stats.online_cpus || 1;
    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : 0;

    const memUsage = raw.memory_stats.usage || 0;
    const memLimit = raw.memory_stats.limit || 1;

    return {
      cpuPercent: Number(cpuPercent.toFixed(2)),
      memoryUsedMb: Number((memUsage / 1024 / 1024).toFixed(1)),
      memoryLimitMb: Number((memLimit / 1024 / 1024).toFixed(1)),
    };
  }

  /** Attaches to the container's stdio and streams output live (for the console). */
  async attachLogs(containerId: string, onData: (chunk: string) => void) {
    const c = this.docker.getContainer(containerId);
    const stream = await c.attach({ stream: true, stdout: true, stderr: true, logs: true });
    const passthrough = new PassThrough();
    // Demultiplex Docker's stream header when TTY is disabled; since we use Tty:true
    // above, output is raw text already.
    stream.pipe(passthrough);
    passthrough.on('data', (chunk: Buffer) => onData(chunk.toString('utf-8')));
    return stream;
  }

  /** Writes a command into the container's attached stdin (interactive console). */
  async sendInput(containerId: string, input: string) {
    const c = this.docker.getContainer(containerId);
    const stream = await c.attach({ stream: true, stdin: true, hijack: true });
    stream.write(input.endsWith('\n') ? input : input + '\n');
  }

  /**
   * Runs a one-off command inside a (running) container and resolves with
   * combined stdout/stderr once it exits. Used for dependency installation.
   */
  async exec(containerId: string, cmd: string[]): Promise<{ exitCode: number; output: string }> {
    const c = this.docker.getContainer(containerId);
    const exec = await c.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await exec.start({});
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (d: Buffer) => chunks.push(d));
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    const inspect = await exec.inspect();
    return { exitCode: inspect.ExitCode ?? -1, output: Buffer.concat(chunks).toString('utf-8') };
  }

  private async ensureImage(image: string) {
    const images = await this.docker.listImages({ filters: { reference: [image] } });
    if (images.length > 0) return;

    this.logger.log(`Pulling base image ${image} ...`);
    await new Promise<void>((resolve, reject) => {
      this.docker.pull(image, (err: any, stream: any) => {
        if (err) return reject(err);
        this.docker.modem.followProgress(stream, (err2: any) => (err2 ? reject(err2) : resolve()));
      });
    });
  }
}
