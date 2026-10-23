import { Injectable } from '@nestjs/common';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { apiError } from '../common/api-error.js';
import { CredentialCryptoService } from '../credential/credential-crypto.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateMcpConnectionDto, UpdateMcpConnectionDto } from './dto/mcp-connection.dto.js';

const summary = { id: true, projectId: true, name: true, transport: true, url: true, status: true, authType: true, createdAt: true, updatedAt: true,
  encryptedSecret: true, secretIv: true, secretAuthTag: true } as const;
function present(row: Awaited<ReturnType<PrismaService['mcpConnection']['findFirst']>>) {
  if (!row) return null;
  const { encryptedSecret, secretIv: _secretIv, secretAuthTag: _secretAuthTag, ...safe } = row as typeof row & { encryptedSecret: string | null };
  return { ...safe, hasSecret: Boolean(encryptedSecret) };
}

@Injectable()
export class McpConnectionService {
  constructor(private readonly prisma: PrismaService, private readonly crypto: CredentialCryptoService) {}
  async create(projectId: string, dto: CreateMcpConnectionDto) {
    await assertPublicHttpsUrl(dto.url);
    if (dto.authType === 'BEARER' && !dto.secret) throw apiError.badRequest('MCP_CREDENTIAL_MISSING', 'Bearer authentication requires a secret');
    const created = await this.prisma.mcpConnection.create({ data: { projectId, name: dto.name, url: dto.url, authType: dto.authType ?? 'NONE', ...(dto.secret ? this.crypto.encrypt(dto.secret) : {}) }, select: summary });
    return present(created);
  }
  async findAll(projectId: string) { return (await this.prisma.mcpConnection.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' }, select: summary })).map(present); }
  async findOne(projectId: string, id: string) { const row = await this.prisma.mcpConnection.findFirst({ where: { id, projectId }, select: summary }); if (!row) throw missing(); return present(row); }
  async update(projectId: string, id: string, dto: UpdateMcpConnectionDto) {
    await this.findOne(projectId, id);
    if (dto.url) await assertPublicHttpsUrl(dto.url);
    if (dto.authType === 'BEARER' && dto.secret === undefined) { const row = await this.prisma.mcpConnection.findUnique({ where: { id }, select: { encryptedSecret: true } }); if (!row?.encryptedSecret) throw apiError.badRequest('MCP_CREDENTIAL_MISSING', 'Bearer authentication requires a secret'); }
    const row = await this.prisma.mcpConnection.update({ where: { id }, data: { name: dto.name, url: dto.url, status: dto.status, authType: dto.authType, ...(dto.secret === undefined ? {} : this.crypto.encrypt(dto.secret)) }, select: summary });
    return present(row);
  }
  async remove(projectId: string, id: string) { await this.findOne(projectId, id); await this.prisma.mcpConnection.delete({ where: { id } }); }
  async test(projectId: string, id: string) {
    const row = await this.prisma.mcpConnection.findFirst({ where: { id, projectId } }); if (!row) throw missing(); if (row.status !== 'ACTIVE') throw apiError.badRequest('MCP_CONNECTION_DISABLED', 'MCP connection is disabled'); await assertPublicHttpsUrl(row.url);
    let token: string | null = null;
    if (row.authType === 'BEARER') { if (!row.encryptedSecret || !row.secretIv || !row.secretAuthTag) throw apiError.badRequest('MCP_CREDENTIAL_MISSING', 'MCP credential is missing'); token = this.crypto.decrypt({ encryptedSecret: row.encryptedSecret, secretIv: row.secretIv, secretAuthTag: row.secretAuthTag }); }
    const client = new Client({ name: 'flowmind', version: '1.0.0' }); const transport = new StreamableHTTPClientTransport(new URL(row.url), { requestInit: { headers: token ? { Authorization: `Bearer ${token}` } : undefined, redirect: 'error' } });
    try { await client.connect(transport); const { tools } = await client.listTools(); return { ok: true, toolCount: tools.length }; }
    catch { throw apiError.badGateway('MCP_CONNECTION_FAILED', 'Could not connect to MCP server'); }
    finally { await client.close().catch(() => undefined); }
  }
  /** Discovery is best-effort for an editor picker: a down MCP server must not hide built-ins. */
  async listProjectTools(projectId: string) {
    const tools: Array<{ name: string; displayName: string; description: string; source: 'BUILT_IN' | 'MCP'; inputSchema: Record<string, unknown> }> = builtInTools();
    const warnings: Array<{ connectionId: string; code: string; message: string }> = [];
    const connections = await this.prisma.mcpConnection.findMany({ where: { projectId, status: 'ACTIVE' } });
    for (const row of connections) {
      try {
        await assertPublicHttpsUrl(row.url);
        const token = row.authType === 'BEARER'
          ? (row.encryptedSecret && row.secretIv && row.secretAuthTag ? this.crypto.decrypt({ encryptedSecret: row.encryptedSecret, secretIv: row.secretIv, secretAuthTag: row.secretAuthTag }) : (() => { throw new Error('missing secret'); })())
          : null;
        const client = new Client({ name: 'flowmind', version: '1.0.0' });
        const transport = new StreamableHTTPClientTransport(new URL(row.url), { requestInit: { headers: token ? { Authorization: `Bearer ${token}` } : undefined, redirect: 'error' } });
        try {
          await client.connect(transport);
          const result = await client.listTools();
          for (const tool of result.tools.slice(0, 200)) {
            if (JSON.stringify(tool.inputSchema ?? {}).length > 20_000) continue;
            tools.push({ name: `mcp__${row.id}__${tool.name}`, displayName: `${row.name} · ${tool.name}`, description: tool.description ?? `MCP tool ${tool.name}`, source: 'MCP', inputSchema: tool.inputSchema ?? { type: 'object', properties: {} } });
          }
        } finally { await client.close().catch(() => undefined); }
      } catch { warnings.push({ connectionId: row.id, code: 'MCP_CONNECTION_FAILED', message: 'MCP connection is temporarily unavailable' }); }
    }
    return { tools, warnings };
  }
}
function builtInTools(): Array<{ name: string; displayName: string; description: string; source: 'BUILT_IN'; inputSchema: Record<string, unknown> }> { return [
  { name: 'search_knowledge', displayName: 'Search Knowledge', description: 'Search project knowledge bases', source: 'BUILT_IN', inputSchema: { type: 'object', properties: { knowledgeBaseId: { type: 'string' }, query: { type: 'string' } }, required: ['knowledgeBaseId', 'query'] } },
  { name: 'http_request', displayName: 'HTTP Request', description: 'Make a safe outbound HTTP request', source: 'BUILT_IN', inputSchema: { type: 'object', properties: { url: { type: 'string' }, method: { type: 'string' } }, required: ['url'] } },
  { name: 'run_workflow', displayName: 'Run Workflow', description: 'Run a published workflow in this project', source: 'BUILT_IN', inputSchema: { type: 'object', properties: { workflowId: { type: 'string' }, input: { type: 'object' } }, required: ['workflowId'] } },
]; }
function missing() { return apiError.notFound('MCP_CONNECTION_NOT_FOUND', 'MCP connection not found'); }

/** Management API validates the same public-endpoint boundary again before storing or testing it. */
async function assertPublicHttpsUrl(rawUrl: string) {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw apiError.badRequest('MCP_URL_INVALID', 'MCP URL is invalid'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) {
    throw apiError.badRequest('MCP_URL_INVALID', 'MCP URL must be a public HTTPS endpoint');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length || addresses.some(({ address }) => privateIp(address))) throw apiError.badRequest('MCP_URL_INVALID', 'MCP URL must not resolve to a private network');
}
function privateIp(address: string) {
  if (isIP(address) === 6) return address === '::1' || address.toLowerCase().startsWith('fc') || address.toLowerCase().startsWith('fd') || address.toLowerCase().startsWith('fe8') || address.toLowerCase().startsWith('fe9') || address.toLowerCase().startsWith('fea') || address.toLowerCase().startsWith('feb');
  const [a, b] = address.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}
