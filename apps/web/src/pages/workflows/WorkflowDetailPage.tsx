import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getWorkflow, updateWorkflow } from '../../api/workflow';
import { queryKeys } from '../../api/queryKeys';
import { WorkflowEditForm } from '../../components/WorkflowEditForm';
import type { UpdateWorkflowInput } from '../../types/workflow';

export function WorkflowDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();

  const workflowQuery = useQuery({
    queryKey: queryKeys.workflows.detail(id),
    queryFn: () => getWorkflow(id),
    enabled: Boolean(id),
  });

  const updateMutation = useMutation({
    mutationFn: (input: UpdateWorkflowInput) => updateWorkflow(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all });
    },
  });

  if (!id) {
    return <div>Invalid workflow id.</div>;
  }

  if (workflowQuery.isPending) {
    return <div style={{ padding: 32 }}>Loading workflow...</div>;
  }

  if (workflowQuery.isError) {
    return (
      <main style={{ maxWidth: 800, margin: '0 auto', padding: 32 }}>
        <Link to="/workflows">← Back to Workflows</Link>
        <div style={{ color: '#d32f2f', marginTop: 24 }}>
          Failed to load: {workflowQuery.error.message}
        </div>
      </main>
    );
  }

  const workflow = workflowQuery.data;

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: 32 }}>
      <Link to="/workflows">← Back to Workflows</Link>

      <header style={{ marginTop: 24, marginBottom: 32 }}>
        <h1 style={{ marginBottom: 8 }}>{workflow.name}</h1>
        <div>
          Status: <strong>{workflow.status}</strong>
        </div>
      </header>

      <WorkflowEditForm
        key={workflow.id}
        workflow={workflow}
        pending={updateMutation.isPending}
        onSubmit={(input) => updateMutation.mutate(input)}
      />

      {updateMutation.isError && (
        <div style={{ color: '#d32f2f', marginTop: 16 }}>
          Save failed: {updateMutation.error?.message}
        </div>
      )}

      {updateMutation.isSuccess && (
        <div style={{ color: '#2e7d32', marginTop: 16 }}>Saved.</div>
      )}
    </main>
  );
}