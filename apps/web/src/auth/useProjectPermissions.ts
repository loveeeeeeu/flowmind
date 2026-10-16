import { useQuery } from '@tanstack/react-query';
import { getProjects, type ProjectRole } from '../api/projects';

/**
 * UI convenience only. The API still enforces every write through ProjectRoleGuard.
 * Keeping the role out of the JWT means a changed membership takes effect immediately.
 */
export function useProjectPermissions(projectId: string) {
  const projectsQuery = useQuery({
    queryKey: ['projects'] as const,
    queryFn: getProjects,
  });
  const role: ProjectRole | undefined = projectsQuery.data?.find(
    (project) => project.id === projectId,
  )?.role;

  return {
    role,
    canEdit: role === 'OWNER' || role === 'EDITOR',
    canManageProject: role === 'OWNER',
    isLoading: projectsQuery.isPending,
  };
}
