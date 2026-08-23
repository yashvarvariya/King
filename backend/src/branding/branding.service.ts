import { Injectable, Logger } from '@nestjs/common';
import { Branding } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SINGLETON_ID = 'singleton';
const CACHE_TTL_MS = 30_000;

@Injectable()
export class BrandingService {
  private readonly logger = new Logger(BrandingService.name);
  private cached: Branding | null = null;
  private cachedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async getCached(): Promise<Branding> {
    const now = Date.now();
    if (this.cached && now - this.cachedAt < CACHE_TTL_MS) {
      return this.cached;
    }
    const branding = await this.findOrCreate();
    this.cached = branding;
    this.cachedAt = now;
    return branding;
  }

  async refresh(): Promise<Branding> {
    const branding = await this.findOrCreate();
    this.cached = branding;
    this.cachedAt = Date.now();
    return branding;
  }

  async update(data: Partial<Omit<Branding, 'id' | 'updatedAt'>>): Promise<Branding> {
    const branding = await this.prisma.branding.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: { ...data },
    });
    this.cached = branding;
    this.cachedAt = Date.now();
    return branding;
  }

  private async findOrCreate(): Promise<Branding> {
    const existing = await this.prisma.branding.findUnique({
      where: { id: SINGLETON_ID },
    });
    if (existing) return existing;

    this.logger.log('No Branding row found — creating singleton with defaults.');
    return this.prisma.branding.create({
      data: { id: SINGLETON_ID },
    });
  }
}
