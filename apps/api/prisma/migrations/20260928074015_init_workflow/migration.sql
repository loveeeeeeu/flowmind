/*
  Warnings:

  - You are about to drop the `WorkflowVersion` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- DropForeignKey
ALTER TABLE "WorkflowVersion" DROP CONSTRAINT "WorkflowVersion_workflowId_fkey";

-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN     "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT';

-- DropTable
DROP TABLE "WorkflowVersion";
