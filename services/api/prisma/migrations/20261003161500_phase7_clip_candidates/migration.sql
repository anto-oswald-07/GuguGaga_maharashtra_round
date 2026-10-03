-- Phase 7: ClipCandidate (propose / accept / reject / render → Asset)

CREATE TYPE "ClipCandidateStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'RENDERED');

CREATE TABLE "ClipCandidate" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "sourceAssetId" UUID NOT NULL,
    "transcriptId" UUID,
    "scriptDocumentId" UUID,
    "title" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "rationale" TEXT,
    "status" "ClipCandidateStatus" NOT NULL DEFAULT 'PROPOSED',
    "renderedAssetId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClipCandidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClipCandidate_renderedAssetId_key" ON "ClipCandidate"("renderedAssetId");

CREATE INDEX "ClipCandidate_projectId_status_idx" ON "ClipCandidate"("projectId", "status");

CREATE INDEX "ClipCandidate_projectId_createdAt_idx" ON "ClipCandidate"("projectId", "createdAt");

CREATE INDEX "ClipCandidate_sourceAssetId_idx" ON "ClipCandidate"("sourceAssetId");

CREATE INDEX "ClipCandidate_transcriptId_idx" ON "ClipCandidate"("transcriptId");

CREATE INDEX "ClipCandidate_scriptDocumentId_idx" ON "ClipCandidate"("scriptDocumentId");

ALTER TABLE "ClipCandidate" ADD CONSTRAINT "ClipCandidate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClipCandidate" ADD CONSTRAINT "ClipCandidate_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClipCandidate" ADD CONSTRAINT "ClipCandidate_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClipCandidate" ADD CONSTRAINT "ClipCandidate_scriptDocumentId_fkey" FOREIGN KEY ("scriptDocumentId") REFERENCES "ScriptDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClipCandidate" ADD CONSTRAINT "ClipCandidate_renderedAssetId_fkey" FOREIGN KEY ("renderedAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
