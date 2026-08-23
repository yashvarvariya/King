-- CreateTable
CREATE TABLE "RuntimeEngine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "family" "Runtime" NOT NULL DEFAULT 'NODEJS',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuntimeEngine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeEngineVersion" (
    "id" TEXT NOT NULL,
    "runtimeEngineId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuntimeEngineVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeDefaults" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "defaultRuntimeEngineId" TEXT,
    "defaultRuntimeVersionId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "RuntimeDefaults_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeEngine_name_key" ON "RuntimeEngine"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeEngineVersion_runtimeEngineId_version_key" ON "RuntimeEngineVersion"("runtimeEngineId", "version");

-- AddForeignKey
ALTER TABLE "RuntimeEngineVersion" ADD CONSTRAINT "RuntimeEngineVersion_runtimeEngineId_fkey" FOREIGN KEY ("runtimeEngineId") REFERENCES "RuntimeEngine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: additive, nullable columns only — every existing Server row
-- gets NULL for both, which is exactly the "no catalog assigned, use the
-- legacy hardcoded image map" state DockerService/ServersService expect.
ALTER TABLE "Server" ADD COLUMN "runtimeEngineId" TEXT;
ALTER TABLE "Server" ADD COLUMN "runtimeVersionId" TEXT;

-- InsertRow
INSERT INTO "RuntimeDefaults" ("id", "updatedAt") VALUES ('singleton', CURRENT_TIMESTAMP) ON CONFLICT (id) DO NOTHING;
