-- Phase 8: EditTimeline + TimelineVersion + GENERATE_TIMELINE job type

ALTER TYPE "JobType" ADD VALUE 'GENERATE_TIMELINE';

CREATE TYPE "TimelineSource" AS ENUM ('USER', 'AI_PROPOSAL');

CREATE TABLE "EditTimeline" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "title" TEXT,
    "currentVersionId" UUID,
    "previewAssetId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditTimeline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TimelineVersion" (
    "id" UUID NOT NULL,
    "editTimelineId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "source" "TimelineSource" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EditTimeline_currentVersionId_key" ON "EditTimeline"("currentVersionId");

CREATE INDEX "EditTimeline_projectId_createdAt_idx" ON "EditTimeline"("projectId", "createdAt");

CREATE INDEX "EditTimeline_previewAssetId_idx" ON "EditTimeline"("previewAssetId");

CREATE UNIQUE INDEX "TimelineVersion_editTimelineId_version_key" ON "TimelineVersion"("editTimelineId", "version");

CREATE INDEX "TimelineVersion_editTimelineId_createdAt_idx" ON "TimelineVersion"("editTimelineId", "createdAt");

ALTER TABLE "EditTimeline" ADD CONSTRAINT "EditTimeline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EditTimeline" ADD CONSTRAINT "EditTimeline_previewAssetId_fkey" FOREIGN KEY ("previewAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TimelineVersion" ADD CONSTRAINT "TimelineVersion_editTimelineId_fkey" FOREIGN KEY ("editTimelineId") REFERENCES "EditTimeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EditTimeline" ADD CONSTRAINT "EditTimeline_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "TimelineVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
