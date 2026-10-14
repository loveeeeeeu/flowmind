-- CreateEnum
CREATE TYPE "WorkflowRunSource" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN     "draftRevision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
-- Existing runs become PUBLISHED; those without a version are legacy and fail explicitly.
ALTER TABLE "WorkflowRun" ADD COLUMN     "draftSnapshot" JSONB,
ADD COLUMN     "source" "WorkflowRunSource" NOT NULL DEFAULT 'PUBLISHED';

-- AlterTable
-- The generated NOT NULL column without a default fails on existing versions: backfill them
-- with revision 0 (matching Workflow's default), then drop the default so new rows must set it.
ALTER TABLE "WorkflowVersion" ADD COLUMN     "draftRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WorkflowVersion" ALTER COLUMN "draftRevision" DROP DEFAULT;
