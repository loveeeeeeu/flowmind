-- CreateEnum
CREATE TYPE "ModelType" AS ENUM ('CHAT');

-- CreateTable
CREATE TABLE "Model" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "type" "ModelType" NOT NULL DEFAULT 'CHAT',
    "contextWindow" INTEGER,
    "supportsTemperature" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Model_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Model_credentialId_modelName_key" ON "Model"("credentialId", "modelName");

-- AddForeignKey
ALTER TABLE "Model" ADD CONSTRAINT "Model_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
