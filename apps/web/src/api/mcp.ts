import { request } from './client';

export type McpConnectionStatus = 'ACTIVE' | 'DISABLED';
export type McpAuthType = 'NONE' | 'BEARER';

export interface McpConnection {
  id: string;
  projectId: string;
  name: string;
  transport: string;
  url: string;
  status: McpConnectionStatus;
  authType: McpAuthType;
  hasSecret: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaveMcpConnectionInput {
  name: string;
  url: string;
  authType: McpAuthType;
  secret?: string;
}

export function getMcpConnections(projectId: string): Promise<McpConnection[]> {
  return request(`/projects/${projectId}/mcp-connections`);
}

export function createMcpConnection(projectId: string, input: SaveMcpConnectionInput): Promise<McpConnection> {
  return request(`/projects/${projectId}/mcp-connections`, { method: 'POST', body: JSON.stringify(input) });
}

export function updateMcpConnection(
  projectId: string,
  connectionId: string,
  input: Partial<SaveMcpConnectionInput> & { status?: McpConnectionStatus },
): Promise<McpConnection> {
  return request(`/projects/${projectId}/mcp-connections/${connectionId}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function testMcpConnection(projectId: string, connectionId: string): Promise<{ ok: true; toolCount: number }> {
  return request(`/projects/${projectId}/mcp-connections/${connectionId}/test`, { method: 'POST' });
}

export function deleteMcpConnection(projectId: string, connectionId: string): Promise<void> {
  return request(`/projects/${projectId}/mcp-connections/${connectionId}`, { method: 'DELETE' });
}
