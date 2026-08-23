-- CreateEnum
CREATE TYPE "PlanBadge" AS ENUM ('NONE', 'FREE', 'MOST_POPULAR', 'BEST_VALUE', 'NEW', 'LIMITED_OFFER');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingAction" AS ENUM ('CREATED', 'ACTIVATED', 'PLAN_CHANGED', 'EXTENDED', 'SUSPENDED', 'UNSUSPENDED', 'CANCELLED', 'EXPIRED', 'RENEWED');

-- CreateEnum
CREATE TYPE "BillingNotificationType" AS ENUM ('ACTIVATED', 'EXPIRING_SOON', 'EXPIRED', 'RENEWED', 'SUSPENDED', 'UNSUSPENDED');

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "oldPrice" DOUBLE PRECISION,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ram" TEXT NOT NULL,
    "storage" TEXT NOT NULL,
    "cpu" TEXT NOT NULL,
    "maxServers" TEXT NOT NULL DEFAULT '1',
    "lifetime" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "badge" "PlanBadge" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL DEFAULT 'free',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "activationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "action" "BillingAction" NOT NULL,
    "fromPlan" TEXT,
    "toPlan" TEXT,
    "note" TEXT,
    "performedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "BillingNotificationType" NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingStats" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "totalRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monthlyRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "BillingStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_name_key" ON "Plan"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "BillingHistory_userId_idx" ON "BillingHistory"("userId");

-- CreateIndex
CREATE INDEX "BillingHistory_createdAt_idx" ON "BillingHistory"("createdAt");

-- CreateIndex
CREATE INDEX "BillingNotification_userId_read_idx" ON "BillingNotification"("userId", "read");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingHistory" ADD CONSTRAINT "BillingHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingHistory" ADD CONSTRAINT "BillingHistory_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- InsertRow
INSERT INTO "BillingStats" ("id", "totalRevenue", "monthlyRevenue", "updatedAt") VALUES ('singleton', 0, 0, CURRENT_TIMESTAMP) ON CONFLICT (id) DO NOTHING;
