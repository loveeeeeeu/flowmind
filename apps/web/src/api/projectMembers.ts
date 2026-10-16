import { request } from './client';
import type { ProjectRole } from './projects';

export interface ProjectMember {
  id: string;
  role: ProjectRole;
  createdAt: string;
  user: { id: string; email: string; name: string | null };
}

export function getProjectMembers(projectId: string): Promise<ProjectMember[]> {
  return request<ProjectMember[]>(`/projects/${projectId}/members`);
}

export function addProjectMember(projectId: string, input: { email: string; role: ProjectRole }) {
  return request<ProjectMember>(`/projects/${projectId}/members`, { method: 'POST', body: JSON.stringify(input) });
}

export function updateProjectMemberRole(projectId: string, memberId: string, role: ProjectRole) {
  return request<ProjectMember>(`/projects/${projectId}/members/${memberId}`, { method: 'PATCH', body: JSON.stringify({ role }) });
}

export function removeProjectMember(projectId: string, memberId: string) {
  return request<void>(`/projects/${projectId}/members/${memberId}`, { method: 'DELETE' });
}
