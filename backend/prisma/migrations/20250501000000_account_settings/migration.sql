-- AlterEnum
-- Postgres requires enum values to be added outside a transaction block in
-- older versions; Prisma's migration runner handles this automatically.
ALTER TYPE "OtpPurpose" ADD VALUE 'EMAIL_CHANGE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "pendingEmail" TEXT;
