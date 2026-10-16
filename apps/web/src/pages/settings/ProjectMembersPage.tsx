import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import {
  addProjectMember,
  getProjectMembers,
  removeProjectMember,
  updateProjectMemberRole,
  type ProjectMember,
} from '../../api/projectMembers';
import type { ProjectRole } from '../../api/projects';
import { ApiRequestError } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { useProjectPermissions } from '../../auth/useProjectPermissions';
import { SettingsTabs } from '../../settings/SettingsTabs';

const ROLES: ProjectRole[] = ['OWNER', 'EDITOR', 'VIEWER'];

function memberErrorMessage(error: Error) {
  if (error instanceof ApiRequestError && error.code === 'LAST_PROJECT_OWNER') {
    return 'This project must keep at least one owner.';
  }
  return error.message;
}

export function ProjectMembersPage() {
  const { projectId = '' } = useParams();
  const queryClient = useQueryClient();
  const { canManageProject } = useProjectPermissions(projectId);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ProjectRole>('EDITOR');

  const membersQuery = useQuery({
    queryKey: queryKeys.projectMembers.list(projectId),
    queryFn: () => getProjectMembers(projectId),
    enabled: Boolean(projectId),
  });
  const invalidateMembers = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers.list(projectId) });
  const invalidateMembershipViews = () =>
    Promise.all([
      invalidateMembers(),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
    ]);
  const addMutation = useMutation({
    mutationFn: () => addProjectMember(projectId, { email: email.trim(), role }),
    onSuccess: async () => {
      setEmail('');
      setRole('EDITOR');
      await invalidateMembers();
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ memberId, nextRole }: { memberId: string; nextRole: ProjectRole }) =>
      updateProjectMemberRole(projectId, memberId, nextRole),
    onSuccess: invalidateMembershipViews,
  });
  const removeMutation = useMutation({
    mutationFn: (memberId: string) => removeProjectMember(projectId, memberId),
    onSuccess: invalidateMembershipViews,
  });

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canManageProject && email.trim()) {
      addMutation.mutate();
    }
  }

  function remove(member: ProjectMember) {
    if (window.confirm(`Remove ${member.user.name ?? member.user.email} from this project?`)) {
      removeMutation.mutate(member.id);
    }
  }

  const mutationError = addMutation.error ?? updateMutation.error ?? removeMutation.error;

  return (
    <main className="workspace-page members-page">
      <SettingsTabs />
      <header className="page-title-row">
        <div>
          <p className="page-eyebrow">PROJECT SETTINGS</p>
          <h1>Members</h1>
          <p className="page-subtitle">All members can view this list. Only owners can change it.</p>
        </div>
      </header>

      {canManageProject && (
        <form className="member-add-form" onSubmit={add}>
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="member@example.com" required />
          </label>
          <label>
            Role
            <select value={role} onChange={(event) => setRole(event.target.value as ProjectRole)}>
              {ROLES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <button className="primary-button" type="submit" disabled={addMutation.isPending}>
            {addMutation.isPending ? 'Adding…' : 'Add member'}
          </button>
        </form>
      )}

      {mutationError && <p className="error-message">{memberErrorMessage(mutationError)}</p>}
      {membersQuery.isPending && <p className="empty-state">Loading members…</p>}
      {membersQuery.isError && <p className="error-message">{membersQuery.error.message}</p>}

      {membersQuery.data && (
        <section className="member-list" aria-label="Project members">
          {membersQuery.data.map((member) => {
            const changing = updateMutation.isPending && updateMutation.variables?.memberId === member.id;
            const removing = removeMutation.isPending && removeMutation.variables === member.id;
            return (
              <article className="member-row" key={member.id}>
                <div className="member-identity">
                  <strong>{member.user.name ?? 'Unnamed user'}</strong>
                  <span>{member.user.email}</span>
                </div>
                {canManageProject ? (
                  <div className="member-actions">
                    <select
                      value={member.role}
                      disabled={changing || removing}
                      onChange={(event) => updateMutation.mutate({ memberId: member.id, nextRole: event.target.value as ProjectRole })}
                      aria-label={`Role for ${member.user.email}`}
                    >
                      {ROLES.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                    <button type="button" className="subtle-button credential-revoke" disabled={removing || changing} onClick={() => remove(member)}>
                      {removing ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                ) : (
                  <span className="member-role">{member.role}</span>
                )}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
