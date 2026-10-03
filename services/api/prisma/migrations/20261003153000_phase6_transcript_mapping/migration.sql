-- CreateTable
CREATE TABLE "Transcript" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptSegment" (
    "id" UUID NOT NULL,
    "transcriptId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "TranscriptSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScriptFootageMap" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "transcriptId" UUID,
    "scriptDocumentId" UUID,
    "scriptRef" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'AI',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScriptFootageMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Transcript_projectId_createdAt_idx" ON "Transcript"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Transcript_projectId_assetId_idx" ON "Transcript"("projectId", "assetId");

-- CreateIndex
CREATE INDEX "Transcript_assetId_idx" ON "Transcript"("assetId");

-- CreateIndex
CREATE INDEX "TranscriptSegment_transcriptId_ordinal_idx" ON "TranscriptSegment"("transcriptId", "ordinal");

-- CreateIndex
CREATE INDEX "ScriptFootageMap_projectId_createdAt_idx" ON "ScriptFootageMap"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ScriptFootageMap_transcriptId_idx" ON "ScriptFootageMap"("transcriptId");

-- CreateIndex
CREATE INDEX "ScriptFootageMap_scriptDocumentId_idx" ON "ScriptFootageMap"("scriptDocumentId");

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptSegment" ADD CONSTRAINT "TranscriptSegment_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptFootageMap" ADD CONSTRAINT "ScriptFootageMap_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptFootageMap" ADD CONSTRAINT "ScriptFootageMap_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptFootageMap" ADD CONSTRAINT "ScriptFootageMap_scriptDocumentId_fkey" FOREIGN KEY ("scriptDocumentId") REFERENCES "ScriptDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

