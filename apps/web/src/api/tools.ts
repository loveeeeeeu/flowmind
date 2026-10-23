import { request } from './client';

export interface ProjectTool { name: string; displayName: string; description: string; source: 'BUILT_IN' | 'MCP'; inputSchema: Record<string, unknown>; }
export function getProjectTools(projectId: string): Promise<{ tools: ProjectTool[]; warnings: Array<{ message: string }> }> { return request(`/projects/${projectId}/tools`); }
