import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import * as crypto from 'crypto';
import cookieParser from 'cookie-parser';
import { AuthModule } from '../src/auth/auth.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/common/mail/mail.service';

/**
 * Exercises the real HTTP layer (routing, global ValidationPipe, JWT guard,
 * cookie-based refresh tokens) for the full auth flow, with only the two
 * external dependencies mocked: Prisma (no real database) and Mail (no real
 * SMTP — we capture the OTP code it "sends" instead).
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;

  // Simple in-memory "tables" so register -> verify -> login -> refresh can
  // be tested end to end without a real database.
  const users: any[] = [];
  const otps: any[] = [];
  const refreshTokens: any[] = [];
  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}${++idCounter}`;
  const sha256 = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

  const prisma = {
    user: {
      findFirst: jest.fn(({ where }: any) => {
        const clauses = where.OR as any[];
        return Promise.resolve(
          users.find((u) => clauses.some((c) => (c.email && u.email === c.email) || (c.username && u.username === c.username))) || null,
        );
      }),
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(users.find((u) => u.id === where.id || u.email === where.email) || null),
      ),
      findUniqueOrThrow: jest.fn(({ where }: any) => {
        const found = users.find((u) => u.id === where.id || u.email === where.email);
        if (!found) throw new Error('not found');
        return Promise.resolve(found);
      }),
      create: jest.fn(({ data }: any) => {
        const user = {
          id: nextId('u'),
          role: 'USER',
          sessionVersion: 0,
          suspended: false,
          emailVerified: false,
          ...data,
        };
        users.push(user);
        return Promise.resolve(user);
      }),
      update: jest.fn(({ where, data }: any) => {
        const user = users.find((u) => u.id === where.id);
        if (data.sessionVersion?.increment) {
          user.sessionVersion += data.sessionVersion.increment;
          delete data.sessionVersion;
        }
        Object.assign(user, data);
        return Promise.resolve(user);
      }),
    },
    emailOtp: {
      create: jest.fn(({ data }: any) => {
        const otp = { id: nextId('otp'), attempts: 0, consumedAt: null, createdAt: new Date(), ...data };
        otps.push(otp);
        return Promise.resolve(otp);
      }),
      findFirst: jest.fn(({ where }: any) => {
        const matches = otps
          .filter((o) => o.userId === where.userId && o.purpose === where.purpose && o.consumedAt === where.consumedAt)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return Promise.resolve(matches[0] || null);
      }),
      update: jest.fn(({ where, data }: any) => {
        const otp = otps.find((o) => o.id === where.id);
        if (data.attempts?.increment) {
          otp.attempts += data.attempts.increment;
          delete data.attempts;
        }
        Object.assign(otp, data);
        return Promise.resolve(otp);
      }),
    },
    refreshToken: {
      create: jest.fn(({ data }: any) => {
        const token = { id: nextId('rt'), revokedAt: null, ...data };
        refreshTokens.push(token);
        return Promise.resolve(token);
      }),
      findUnique: jest.fn(({ where }: any) => Promise.resolve(refreshTokens.find((t) => t.tokenHash === where.tokenHash) || null)),
      update: jest.fn(({ where, data }: any) => {
        const token = refreshTokens.find((t) => t.id === where.id);
        Object.assign(token, data);
        return Promise.resolve(token);
      }),
      updateMany: jest.fn(({ where, data }: any) => {
        let count = 0;
        refreshTokens
          .filter((t) => t.userId === where.userId && t.revokedAt === where.revokedAt)
          .forEach((t) => {
            Object.assign(t, data);
            count++;
          });
        return Promise.resolve({ count });
      }),
    },
  };

  let lastVerificationCode = '';
  const mail = {
    sendVerificationOtp: jest.fn((_to: string, code: string) => {
      lastVerificationCode = code;
      return Promise.resolve();
    }),
    sendPasswordResetOtp: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';

    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('rejects registration with an invalid payload (400)', async () => {
    await request(server())
      .post('/api/auth/register')
      .send({ email: 'not-an-email', username: 'a', password: 'short', passwordConfirmation: 'short' })
      .expect(400);
  });

  it('rejects registration when passwords do not match (400)', async () => {
    await request(server())
      .post('/api/auth/register')
      .send({ email: 'e2e@example.com', username: 'e2euser', password: 'password123', passwordConfirmation: 'nope12345' })
      .expect(400);
  });

  it('registers a new user without logging them in', async () => {
    const res = await request(server())
      .post('/api/auth/register')
      .send({
        email: 'e2e@example.com',
        username: 'e2euser',
        password: 'password123',
        passwordConfirmation: 'password123',
      })
      .expect(201);

    expect(res.body).toEqual({ success: true, email: 'e2e@example.com' });
    expect(res.body.accessToken).toBeUndefined();
    expect(mail.sendVerificationOtp).toHaveBeenCalled();
  });

  it('rejects duplicate registration with 409', async () => {
    await request(server())
      .post('/api/auth/register')
      .send({
        email: 'e2e@example.com',
        username: 'e2euser',
        password: 'password123',
        passwordConfirmation: 'password123',
      })
      .expect(409);
  });

  it('refuses login before the email is verified (403)', async () => {
    await request(server())
      .post('/api/auth/login')
      .send({ email: 'e2e@example.com', password: 'password123' })
      .expect(403);
  });

  it('rejects an incorrect verification code (400)', async () => {
    await request(server())
      .post('/api/auth/verify-email')
      .send({ email: 'e2e@example.com', code: '000000' })
      .expect(400);
  });

  let refreshCookie: string;

  it('verifies the email with the correct OTP and logs the user in', async () => {
    const res = await request(server())
      .post('/api/auth/verify-email')
      .send({ email: 'e2e@example.com', code: lastVerificationCode })
      .expect(201);

    expect(res.body).toHaveProperty('accessToken');
    expect(res.headers['set-cookie']?.[0]).toContain('refresh_token=');
    refreshCookie = res.headers['set-cookie'][0].split(';')[0];
  });

  it('logs in with correct credentials now that the email is verified', async () => {
    const res = await request(server())
      .post('/api/auth/login')
      .send({ email: 'e2e@example.com', password: 'password123' })
      .expect(201);

    expect(res.body).toHaveProperty('accessToken');
    expect(res.headers['set-cookie']?.[0]).toContain('refresh_token=');
  });

  it('rejects login with the wrong password (401)', async () => {
    await request(server())
      .post('/api/auth/login')
      .send({ email: 'e2e@example.com', password: 'wrong-password' })
      .expect(401);
  });

  it('rejects an unauthenticated request to a protected route', async () => {
    await request(server()).get('/api/auth/me').expect(401);
  });

  it('allows a protected route with a valid bearer token', async () => {
    const login = await request(server())
      .post('/api/auth/login')
      .send({ email: 'e2e@example.com', password: 'password123' });

    await request(server())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
  });

  it('mints a new access token from the refresh-token cookie', async () => {
    const res = await request(server())
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(201);

    expect(res.body).toHaveProperty('accessToken');
  });

  it('rejects a reused (already-rotated) refresh token', async () => {
    await request(server()).post('/api/auth/refresh').set('Cookie', refreshCookie).expect(401);
  });
});
