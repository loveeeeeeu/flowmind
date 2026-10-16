import { request } from './client';

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export function getProjects(): Promise<Project[]> {
  return request<Project[]>('/projects');
}
