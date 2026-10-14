-- AlterTable
ALTER TABLE "WorkflowRun" ADD COLUMN     "workflowApiKeyId" TEXT;

-- CreateTable
CREATE TABLE "WorkflowApiKey" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowApiKey_prefix_key" ON "WorkflowApiKey"("prefix");

-- CreateIndex
CREATE INDEX "WorkflowApiKey_workflowId_idx" ON "WorkflowApiKey"("workflowId");

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowApiKeyId_idx" ON "WorkflowRun"("workflowApiKeyId");

-- AddForeignKey
ALTER TABLE "WorkflowApiKey" ADD CONSTRAINT "WorkflowApiKey_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowApiKeyId_fkey" FOREIGN KEY ("workflowApiKeyId") REFERENCES "WorkflowApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
