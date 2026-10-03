-- Phase 9: PlatformPack + AspectRatio + PackStatus
CREATE TYPE "AspectRatio" AS ENUM ('R_16_9', 'R_9_16', 'R_1_1');
CREATE TYPE "PackStatus" AS ENUM ('DRAFT', 'READY', 'PUBLISHED');

CREATE TABLE "PlatformPack" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "aspectRatio" "AspectRatio" NOT NULL,
    "status" "PackStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT,
    "caption" TEXT,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "outputAssetId" UUID,
    "sourceAssetId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformPack_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformPack_projectId_platform_key" ON "PlatformPack"("projectId", "platform");
CREATE INDEX "PlatformPack_projectId_createdAt_idx" ON "PlatformPack"("projectId", "createdAt");
CREATE INDEX "PlatformPack_projectId_status_idx" ON "PlatformPack"("projectId", "status");
CREATE INDEX "PlatformPack_outputAssetId_idx" ON "PlatformPack"("outputAssetId");
CREATE INDEX "PlatformPack_sourceAssetId_idx" ON "PlatformPack"("sourceAssetId");

ALTER TABLE "PlatformPack" ADD CONSTRAINT "PlatformPack_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformPack" ADD CONSTRAINT "PlatformPack_outputAssetId_fkey" FOREIGN KEY ("outputAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlatformPack" ADD CONSTRAINT "PlatformPack_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
