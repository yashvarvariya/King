import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Default content for every transactional email type the platform knows how
// to send. Admins can edit these afterwards from Admin > Email Settings >
// Templates; this seed only fills them in if they don't exist yet, so
// re-running the seed never clobbers admin customizations.
const DEFAULT_EMAIL_TEMPLATES: Record<string, { subject: string; title: string; body: string; footer: string }> = {
  welcome: {
    subject: 'Welcome to Bot Hosting Platform',
    title: 'Welcome aboard!',
    body: 'Hey {{username}}, thanks for signing up. Verify your email to get started.',
    footer: '',
  },
  email_verification_otp: {
    subject: 'Verify your email',
    title: 'Verify your email',
    body:
      "Welcome! Your email verification code is:\n\n{{code}}\n\nThis code expires in {{expiresInMinutes}} minutes. If you didn't create an account, you can ignore this email.",
    footer: '',
  },
  password_reset_otp: {
    subject: 'Reset your password',
    title: 'Reset your password',
    body:
      "We received a request to reset your password. Your code is:\n\n{{code}}\n\nThis code expires in {{expiresInMinutes}} minutes. If you didn't request this, you can safely ignore this email.",
    footer: '',
  },
  password_changed: {
    subject: 'Your password was changed',
    title: 'Password changed',
    body: "Hi {{username}}, this is a confirmation that your password was just changed. If this wasn't you, contact support immediately.",
    footer: '',
  },
  email_change_otp: {
    subject: 'Confirm your new email address',
    title: 'Confirm your new email address',
    body:
      "We received a request to change the email address on your account to this one. Your confirmation code is:\n\n{{code}}\n\nThis code expires in {{expiresInMinutes}} minutes. If you didn't request this, you can safely ignore this email — your account email won't change.",
    footer: '',
  },
  email_changed: {
    subject: 'Your account email was changed',
    title: 'Email address changed',
    body:
      "Hi {{username}}, this is a confirmation that your account's email address was just changed to {{newEmail}}. If this wasn't you, contact support immediately.",
    footer: '',
  },
  account_suspended: {
    subject: 'Your account has been suspended',
    title: 'Account suspended',
    body: 'Hi {{username}}, your account has been suspended by an administrator. Contact support if you believe this is a mistake.',
    footer: '',
  },
  account_unsuspended: {
    subject: 'Your account has been reinstated',
    title: 'Account reinstated',
    body: 'Hi {{username}}, your account is no longer suspended and you can log in as normal.',
    footer: '',
  },
};

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD || 'change_me_admin_password';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} already exists, skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      email,
      username: 'admin',
      passwordHash,
      role: 'ADMIN',
      emailVerified: true,
      maxServers: 999,
      maxDiskMb: 102400,
      maxMemoryMb: 8192,
    },
  });

  console.log(`Created admin account: ${email}`);
}

async function seedEmailTemplates() {
  for (const [type, tpl] of Object.entries(DEFAULT_EMAIL_TEMPLATES)) {
    await prisma.emailTemplate.upsert({
      where: { type },
      create: { type, ...tpl },
      update: {}, // never clobber an admin's edits on re-seed
    });
  }
  console.log(`Ensured ${Object.keys(DEFAULT_EMAIL_TEMPLATES).length} default email templates exist.`);
}

async function seedEmailValidationSettings() {
  await prisma.emailValidationSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  });
}

async function seedEmailSmtpSettings() {
  await prisma.emailSmtpSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  });
}

// Default plan catalog (Admin > Pricing Manager). Mirrors the original
// panel's hardcoded plan list so upgrading an existing install doesn't
// change anyone's price or specs. Only fills a plan in if its id doesn't
// exist yet, so re-running the seed never clobbers an admin's edits.
const DEFAULT_PLANS = [
  { id: 'free', name: 'Free', description: 'Try the platform out at no cost.', oldPrice: null, price: 0, ram: '256 MB', storage: '2 GB', cpu: '50%', maxServers: '1', lifetime: true, active: true, displayOrder: 1, badge: 'FREE' as const },
  { id: 'basic', name: 'Basic', description: 'A small always-on server for light workloads.', oldPrice: 49, price: 39, ram: '1 GB', storage: '5 GB', cpu: '150%', maxServers: '1', lifetime: false, active: true, displayOrder: 2, badge: 'MOST_POPULAR' as const },
  { id: 'starter_plus', name: 'Starter+', description: 'More headroom for growing projects.', oldPrice: 99, price: 79, ram: '2 GB', storage: '10 GB', cpu: '200%', maxServers: '2', lifetime: false, active: true, displayOrder: 3, badge: 'NONE' as const },
  { id: 'pro', name: 'Pro', description: 'Comfortable resources for production use.', oldPrice: 149, price: 129, ram: '3 GB', storage: '15 GB', cpu: '250%', maxServers: '3', lifetime: false, active: true, displayOrder: 4, badge: 'NONE' as const },
  { id: 'premium', name: 'Premium', description: 'High performance for demanding apps.', oldPrice: 199, price: 169, ram: '4 GB', storage: '20 GB', cpu: '300%', maxServers: '5', lifetime: false, active: true, displayOrder: 5, badge: 'BEST_VALUE' as const },
  { id: 'ultimate', name: 'Ultimate', description: 'Maximum resources, unlimited servers.', oldPrice: 299, price: 249, ram: '5 GB', storage: '30 GB', cpu: '400%', maxServers: 'Unlimited', lifetime: false, active: true, displayOrder: 6, badge: 'NONE' as const },
];

async function seedPlans() {
  const count = await prisma.plan.count();
  if (count > 0) {
    console.log('Plan catalog already has rows, skipping default seed.');
    return;
  }
  for (const plan of DEFAULT_PLANS) {
    await prisma.plan.upsert({ where: { id: plan.id }, create: plan, update: {} });
  }
  console.log(`Seeded ${DEFAULT_PLANS.length} default plans.`);
}

async function seedBillingStats() {
  await prisma.billingStats.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  });
}

// Default runtime catalog (Admin > Runtime Manager). node-20/python-3.12
// are marked as the platform default, matching the exact images
// DockerService hardcoded before this feature existed — so turning this
// feature on doesn't change what a brand-new server gets by default.
const DEFAULT_RUNTIMES: {
  id: string;
  name: string;
  icon: string;
  description: string;
  family: 'NODEJS' | 'PYTHON';
  displayOrder: number;
  versions: { id: string; version: string; image: string; displayOrder: number }[];
}[] = [
  {
    id: 'nodejs',
    name: 'Node.js',
    icon: '⬢',
    description: 'JavaScript / TypeScript bots and apps.',
    family: 'NODEJS',
    displayOrder: 1,
    versions: [
      { id: 'nodejs-18', version: '18 LTS', image: 'node:18-alpine', displayOrder: 1 },
      { id: 'nodejs-20', version: '20 LTS', image: 'node:20-alpine', displayOrder: 2 },
      { id: 'nodejs-22', version: '22 LTS', image: 'node:22-alpine', displayOrder: 3 },
    ],
  },
  {
    id: 'python',
    name: 'Python',
    icon: '🐍',
    description: 'Python bots and apps.',
    family: 'PYTHON',
    displayOrder: 2,
    versions: [
      { id: 'python-310', version: '3.10', image: 'python:3.10-alpine', displayOrder: 1 },
      { id: 'python-311', version: '3.11', image: 'python:3.11-alpine', displayOrder: 2 },
      { id: 'python-312', version: '3.12', image: 'python:3.12-alpine', displayOrder: 3 },
    ],
  },
];

async function seedRuntimes() {
  const count = await prisma.runtimeEngine.count();
  if (count > 0) {
    console.log('Runtime catalog already has rows, skipping default seed.');
    return;
  }
  for (const engine of DEFAULT_RUNTIMES) {
    const { versions, ...engineData } = engine;
    await prisma.runtimeEngine.upsert({ where: { id: engine.id }, create: engineData, update: {} });
    for (const v of versions) {
      await prisma.runtimeEngineVersion.upsert({
        where: { id: v.id },
        create: { ...v, runtimeEngineId: engine.id },
        update: {},
      });
    }
  }
  await prisma.runtimeDefaults.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', defaultRuntimeEngineId: 'nodejs', defaultRuntimeVersionId: 'nodejs-20' },
    update: {},
  });
  console.log(`Seeded ${DEFAULT_RUNTIMES.length} default runtimes.`);
}

async function main() {
  await seedAdmin();
  await seedEmailTemplates();
  await seedEmailValidationSettings();
  await seedEmailSmtpSettings();
  await seedPlans();
  await seedBillingStats();
  await seedRuntimes();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
