import { Injectable } from '@nestjs/common';
import { CredentialCrypto } from '@flowmind/shared';
import { ToolRuntimeError } from '@flowmind/tool-runtime';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ResolvedMcpConnection } from './mcp.types.js';

@Injectable()
export class McpConnectionResolver {
  constructor(private readonly prisma: PrismaService, private readonly crypto: CredentialCrypto) {}
  async resolve(projectId: string, connectionId: string): Promise<ResolvedMcpConnection> {
    const connection = await this.prisma.mcpConnection.findFirst({ where: { id: connectionId, projectId } });
    if (!connection) throw new ToolRuntimeError('MCP_CONNECTION_NOT_FOUND', 'MCP connection not found');
    if (connection.status !== 'ACTIVE') throw new ToolRuntimeError('MCP_CONNECTION_DISABLED', 'MCP connection is disabled');
    let bearerToken: string | null = null;
    if (connection.authType === 'BEARER') {
      if (!connection.encryptedSecret || !connection.secretIv || !connection.secretAuthTag) throw new ToolRuntimeError('MCP_CREDENTIAL_MISSING', 'MCP credential is missing');
      try { bearerToken = this.crypto.decrypt({ encryptedSecret: connection.encryptedSecret, secretIv: connection.secretIv, secretAuthTag: connection.secretAuthTag }); }
      catch { throw new ToolRuntimeError('MCP_CREDENTIAL_DECRYPTION_FAILED', 'MCP credential could not be decrypted'); }
    }
    return { id: connection.id, projectId: connection.projectId, name: connection.name, url: connection.url, authType: connection.authType, bearerToken };
  }
}
