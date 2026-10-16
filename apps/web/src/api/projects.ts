import { request } from './client';

export type ProjectRole = 'OWNER' | 'EDITOR' | 'VIEWER';

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** The calling user's role in this project, supplied by GET /projects. */
  role: ProjectRole;
}

export function getProjects(): Promise<Project[]> {
  return request<Project[]>('/projects');
}
