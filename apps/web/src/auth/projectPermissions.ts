import type { ProjectRole } from '../api/projects';

export function canEditProjectResources(role: ProjectRole | undefined) {
  return role === 'OWNER' || role === 'EDITOR';
}

export function canManageProject(role: ProjectRole | undefined) {
  return role === 'OWNER';
}
