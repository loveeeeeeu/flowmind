import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getWorkflow, updateWorkflow } from '../../api/workflow';
import { queryKeys } from '../../api/queryKeys';
import { WorkflowEditForm } from '../../components/WorkflowEditForm';
import type { UpdateWorkflowInput } from '../../types/workflow';
import { ApiKeyList } from '../../workflow/api-keys/ApiKeyList';
import { useProjectPermissions } from '../../auth/useProjectPermissions';

export function WorkflowDetailPage() {
  const { projectId = '', id = '' } = useParams();
  const queryClient = useQueryClient();
  const { canEdit } = useProjectPermissions(projectId);

  const workflowQuery = useQuery({
    queryKey: queryKeys.workflows.detail(projectId, id),
    queryFn: () => getWorkflow(projectId, id),
    enabled: Boolean(projectId && id),
  });

  const updateMutation = useMutation({
    mutationFn: (input: UpdateWorkflowInput) => updateWorkflow(projectId, id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all(projectId) });
    },
  });

  if (!id) {
    return <main className="workspace-page detail-page"><div className="error-message">无效的工作流标识。</div></main>;
  }

  if (workflowQuery.isPending) {
    return <main className="workspace-page detail-page"><div className="empty-state">正在加载应用…</div></main>;
  }

  if (workflowQuery.isError) {
    return (
      <main className="workspace-page detail-page">
        <Link className="back-link" to="/workflows">‹ 返回工作室</Link>
        <div className="error-message">
          加载应用失败：{workflowQuery.error.message}
        </div>
      </main>
    );
  }

  const workflow = workflowQuery.data;

  return (
    <main className="workspace-page detail-page">
      <Link className="back-link" to="/workflows">‹ 返回工作室</Link>

      <header className="detail-header">
        <span className="detail-app-icon">✦</span>
        <div>
          <p className="page-eyebrow">WORKFLOW APP</p>
          <h1>{workflow.name}</h1>
          <div className="detail-meta">
            <span className={`status-pill ${workflow.status === 'PUBLISHED' ? 'published' : ''}`}>
              {workflow.status === 'PUBLISHED' ? '已发布' : '草稿'}
            </span>
            <span>工作流应用</span>
          </div>
        </div>
        <Link className="primary-button detail-editor-link" to={`/projects/${projectId}/workflows/${id}/editor`}>打开编排器</Link>
      </header>

      <WorkflowEditForm
        key={workflow.id}
        workflow={workflow}
        pending={updateMutation.isPending}
        readOnly={!canEdit}
        onSubmit={(input) => updateMutation.mutate(input)}
      />

      {updateMutation.isError && (
        <div className="error-message">保存失败：{updateMutation.error?.message}</div>
      )}

      {updateMutation.isSuccess && (
        <div className="saved-message">已保存更改。</div>
      )}

      {canEdit && (
        <ApiKeyList
          projectId={projectId}
          workflowId={workflow.id}
          hasPublishedVersion={workflow.latestVersion !== null}
        />
      )}
    </main>
  );
}
