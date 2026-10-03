-- Phase 10: InsightMetric for manual engagement (FR-INT-003)

CREATE TABLE "InsightMetric" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "packId" UUID,
    "platform" "Platform",
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightMetric_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InsightMetric_workspaceId_createdAt_idx" ON "InsightMetric"("workspaceId", "createdAt");
CREATE INDEX "InsightMetric_workspaceId_projectId_idx" ON "InsightMetric"("workspaceId", "projectId");
CREATE INDEX "InsightMetric_projectId_createdAt_idx" ON "InsightMetric"("projectId", "createdAt");

ALTER TABLE "InsightMetric" ADD CONSTRAINT "InsightMetric_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InsightMetric" ADD CONSTRAINT "InsightMetric_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
