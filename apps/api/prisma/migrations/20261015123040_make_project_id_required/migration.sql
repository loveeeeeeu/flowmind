/*
  Warnings:

  - Made the column `projectId` on table `Credential` required. This step will fail if there are existing NULL values in that column.
  - Made the column `projectId` on table `Workflow` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Credential" ALTER COLUMN "projectId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Workflow" ALTER COLUMN "projectId" SET NOT NULL;
