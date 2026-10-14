-- AlterTable
ALTER TABLE "WorkflowRun" ALTER COLUMN "source" DROP DEFAULT;

-- One canvas source per run. Prisma cannot model CHECK constraints, so this lives only in SQL.
-- PUBLISHED does not require a version: legacy runs predate versioning and
-- "workflowVersionId" is ON DELETE SET NULL.
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_source_canvas_check" CHECK (
  (
    "source" = 'DRAFT'
    AND "draftSnapshot" IS NOT NULL
    AND "workflowVersionId" IS NULL
    AND "workflowApiKeyId" IS NULL
  )
  OR ("source" = 'PUBLISHED' AND "draftSnapshot" IS NULL)
);
