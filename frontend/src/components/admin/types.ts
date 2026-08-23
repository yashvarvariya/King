export interface AdminStats {
  totalUsers: number;
  totalServers: number;
  runningServers: number;
  stoppedServers: number;
  premiumUsers: number;
  freeUsers: number;
  suspendedUsers: number;
}

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  role: 'USER' | 'ADMIN';
  suspended: boolean;
  emailVerified: boolean;
  isPremium: boolean;
  premiumSince: string | null;
  lastActiveAt: string;
  maxServers: number;
  maxMemoryMb: number;
  maxDiskMb: number;
  maxCpuPercent: number;
  backupLimit: number;
  createdAt: string;
  _count: { servers: number };
}

export type AdminServerStatus = 'INSTALLING' | 'OFFLINE' | 'RUNNING' | 'STOPPING' | 'SUSPENDED' | 'ERRORED';

export interface AdminServer {
  id: string;
  name: string;
  description?: string | null;
  status: AdminServerStatus;
  runtime: 'NODEJS' | 'PYTHON';
  startupCommand?: string | null;
  suspended: boolean;
  autoRestart: boolean;
  memoryLimitMb: number;
  cpuLimitPercent: number;
  diskLimitMb: number;
  createdAt: string;
  owner: { username: string; email: string; isPremium: boolean };
}

export interface QuotaFields {
  maxServers: number;
  maxMemoryMb: number;
  maxDiskMb: number;
  maxCpuPercent: number;
  backupLimit: number;
}

export interface ServerResourceFields {
  memoryLimitMb: number;
  cpuLimitPercent: number;
  diskLimitMb: number;
}

export type PlanBadge = 'NONE' | 'FREE' | 'MOST_POPULAR' | 'BEST_VALUE' | 'NEW' | 'LIMITED_OFFER';

export interface Plan {
  id: string;
  name: string;
  description: string;
  oldPrice: number | null;
  price: number;
  ram: string;
  storage: string;
  cpu: string;
  maxServers: string;
  lifetime: boolean;
  active: boolean;
  displayOrder: number;
  badge: PlanBadge;
  badgeLabel: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SubscriptionStatus = 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED';

export interface Subscription {
  userId: string;
  planId: string;
  planName: string;
  plan: Plan | null;
  status: SubscriptionStatus;
  activationDate: string;
  expiryDate: string | null;
  lifetime: boolean;
  daysRemaining: number | null;
  updatedAt: string;
  username?: string;
}

export interface BillingHistoryEntry {
  id: string;
  userId: string;
  subscriptionId: string | null;
  action: string;
  fromPlan: string | null;
  toPlan: string | null;
  note: string | null;
  performedBy: string | null;
  createdAt: string;
  username?: string;
}

export interface BillingNotification {
  id: string;
  userId: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface BillingOverview {
  activeSubscriptions: number;
  expiredSubscriptions: number;
  suspendedUsers: number;
  cancelledSubscriptions: number;
  totalPaidUsers: number;
  totalRevenue: number;
  monthlyRevenue: number;
  revenueUpdatedAt: string;
}

export type RuntimeFamily = 'NODEJS' | 'PYTHON';

export interface RuntimeVersion {
  id: string;
  runtimeEngineId: string;
  version: string;
  image: string;
  enabled: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeEngine {
  id: string;
  name: string;
  icon: string;
  description: string;
  family: RuntimeFamily;
  enabled: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  versions?: RuntimeVersion[];
}

export interface RuntimeDefaults {
  defaultRuntimeEngineId: string | null;
  defaultRuntimeVersionId: string | null;
  defaultRuntimeEngine: RuntimeEngine | null;
  defaultRuntimeVersion: RuntimeVersion | null;
}
