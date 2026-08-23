import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as fs from 'fs';
import * as path from 'path';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: false });

  // Static hosting for admin-uploaded branding assets (logo/favicon). Kept
  // outside the 'api' global prefix, at plain /uploads/*, so it's a normal
  // static file URL the frontend can point <img>/<link rel="icon"> at
  // directly. See branding.service.ts for where files get written.
  const uploadsRoot = process.env.BRANDING_UPLOADS_DIR || path.join(process.cwd(), 'uploads', 'branding');
  fs.mkdirSync(uploadsRoot, { recursive: true });
  app.useStaticAssets(path.join(uploadsRoot, '..'), { prefix: '/uploads' });

  // Security headers (CSP kept permissive for the API-only surface; the
  // frontend, which actually serves HTML/JS, sets its own CSP via next.config.js).
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Required to read the httpOnly refresh-token cookie (see auth.controller.ts).
  app.use(cookieParser());

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || 'http://localhost:3000',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      // Strip anything not declared on the DTO *and* reject unknown fields,
      // which also blocks basic mass-assignment / prototype-pollution style
      // payloads from ever reaching a service method.
    }),
  );

  app.setGlobalPrefix('api', { exclude: ['/'] });

  const port = process.env.PORT ? parseInt(process.env.PORT) : 4000;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`Bot Hosting API listening on :${port}`);
}
bootstrap();
