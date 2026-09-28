import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createWorkflow, deleteWorkflow, getWorkflows } from '../../api/workflow';
import { queryKeys } from '../../api/queryKeys';
import { CreateWorkflowForm } from '../../components/CreateWorkflowForm';

export function WorkflowListPage() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const queryClient = useQueryClient();

  const workflowQuery = useQuery({
    queryKey: queryKeys.workflows.all,
    queryFn: () => getWorkflows(),
  });

  const createMutation = useMutation({
    mutationFn: createWorkflow,
    onSuccess: async () => {
      setShowCreateForm(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWorkflow,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all });
    },
  });

  const workflows = workflowQuery.data?.items ?? [];

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: 32 }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ marginBottom: 4 }}>Workflows</h1>
          <div style={{ color: '#666' }}>Build and manage AI workflows.</div>
        </div>

        <button onClick={() => setShowCreateForm(true)}>+ Create Workflow</button>
      </header>

      {showCreateForm && (
        <CreateWorkflowForm
          pending={createMutation.isPending}
          onCancel={() => setShowCreateForm(false)}
          onSubmit={(input) => createMutation.mutate(input)}
        />
      )}

      {createMutation.isError && (
        <div style={{ color: '#d32f2f', marginBottom: 16 }}>
          Create failed: {createMutation.error?.message}
        </div>
      )}

      {deleteMutation.isError && (
        <div style={{ color: '#d32f2f', marginBottom: 16 }}>
          Delete failed: {deleteMutation.error?.message}
        </div>
      )}

      {workflowQuery.isPending && <div>Loading workflows...</div>}

      {workflowQuery.isError && (
        <div style={{ color: '#d32f2f' }}>
          Failed to load workflows: {workflowQuery.error?.message}
        </div>
      )}

      {workflowQuery.isSuccess && workflows.length === 0 && (
        <div>No workflows yet.</div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {workflows.map((workflow) => {
          const deleting =
            deleteMutation.isPending && deleteMutation.variables === workflow.id;

          return (
            <article
              key={workflow.id}
              style={{
                background: '#fff',
                border: '1px solid #e5e5e5',
                borderRadius: 12,
                padding: 20,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                }}
              >
                <div>
                  <strong>{workflow.name}</strong>
                  <p style={{ marginBottom: 0, color: '#666' }}>
                    {workflow.description ?? 'No description'}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span>{workflow.status}</span>
                  <button
                    disabled={deleting}
                    onClick={() => {
                      if (window.confirm(`Delete "${workflow.name}"?`)) {
                        deleteMutation.mutate(workflow.id);
                      }
                    }}
                  >
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}