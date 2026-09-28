import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { createWorkflow, deleteWorkflow, getWorkflows } from '../../api/workflow';
import { queryKeys } from '../../api/queryKeys';
import { CreateWorkflowForm } from '../../components/CreateWorkflowForm';
import { WorkflowSearchForm } from '../../components/WorkflowSearchForm';

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function getPositiveInt(value: string | null, fallback: number, max = Infinity) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

export function WorkflowListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = getPositiveInt(searchParams.get('page'), 1);
  const pageSize = getPositiveInt(searchParams.get('pageSize'), 10, 100);
  const keyword = searchParams.get('keyword') ?? '';

  const [showCreateForm, setShowCreateForm] = useState(false);
  const queryClient = useQueryClient();

  const workflowQuery = useQuery({
    queryKey: queryKeys.workflows.list(page, pageSize, keyword),
    queryFn: () => getWorkflows(page, pageSize, keyword),
    placeholderData: keepPreviousData,
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
  const pagination = workflowQuery.data?.pagination;

  function updateSearchParams(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);

    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }

    setSearchParams(next);
  }

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

      <WorkflowSearchForm
        key={keyword}
        initialKeyword={keyword}
        onSearch={(value) => updateSearchParams({ keyword: value, page: '1' })}
      />

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

      {workflowQuery.isFetching && !workflowQuery.isPending && (
        <div style={{ color: '#666', marginBottom: 8 }}>Refreshing...</div>
      )}

      {workflowQuery.isSuccess && workflows.length === 0 && (
        <div>{keyword ? `No workflows match "${keyword}".` : 'No workflows yet.'}</div>
      )}

      <div
        style={{
          display: 'grid',
          gap: 12,
          opacity: workflowQuery.isPlaceholderData ? 0.5 : 1,
        }}
      >
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
                  <Link
                    to={`/workflows/${workflow.id}`}
                    style={{ color: 'inherit', textDecoration: 'none' }}
                  >
                    <strong>{workflow.name}</strong>
                  </Link>
                  <p style={{ marginBottom: 0, color: '#666' }}>
                    {workflow.description ?? 'No description'}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span>{workflow.status}</span>
                  <Link to={`/workflows/${workflow.id}`}>Open →</Link>
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

      {pagination && (
        <footer
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 24,
          }}
        >
          <div>Total: {pagination.total}</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              disabled={page <= 1}
              onClick={() => updateSearchParams({ page: String(page - 1) })}
            >
              Previous
            </button>

            <span>
              Page {page} / {Math.max(pagination.totalPages, 1)}
            </span>

            <button
              disabled={page >= pagination.totalPages || workflowQuery.isPlaceholderData}
              onClick={() => updateSearchParams({ page: String(page + 1) })}
            >
              Next
            </button>

            <select
              value={String(pageSize)}
              onChange={(event) =>
                updateSearchParams({ pageSize: event.target.value, page: '1' })
              }
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
          </div>
        </footer>
      )}
    </main>
  );
}