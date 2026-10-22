CREATE TYPE "McpTransportType" AS ENUM ('STREAMABLE_HTTP');
CREATE TYPE "McpConnectionStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "McpAuthType" AS ENUM ('NONE', 'BEARER');

CREATE TABLE "McpConnection" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "transport" "McpTransportType" NOT NULL DEFAULT 'STREAMABLE_HTTP',
  "url" TEXT NOT NULL,
  "status" "McpConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "authType" "McpAuthType" NOT NULL DEFAULT 'NONE',
  "encryptedSecret" TEXT,
  "secretIv" TEXT,
  "secretAuthTag" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "McpConnection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "McpConnection_projectId_idx" ON "McpConnection"("projectId");
ALTER TABLE "McpConnection" ADD CONSTRAINT "McpConnection_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
