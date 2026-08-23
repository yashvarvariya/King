-- CreateTable
CREATE TABLE "DiscordBotSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "botToken" TEXT,
    "clientId" TEXT,
    "guildId" TEXT,
    "ownerDiscordId" TEXT,
    "desiredState" TEXT NOT NULL DEFAULT 'stopped',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "DiscordBotSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscordCommandLog" (
    "id" TEXT NOT NULL,
    "discordUserId" TEXT,
    "discordUsername" TEXT,
    "command" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordCommandLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscordCommandLog_createdAt_idx" ON "DiscordCommandLog"("createdAt");

-- InsertRow
INSERT INTO "DiscordBotSettings" ("id", "updatedAt") VALUES ('singleton', CURRENT_TIMESTAMP) ON CONFLICT (id) DO NOTHING;
