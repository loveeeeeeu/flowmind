import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
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
import type { CreateWorkflowInput } from '../../types/workflow';

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function getPositiveInt(value: string | null, fallback: number, max = Infinity) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

export function WorkflowListPage() {
  const { projectId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = getPositiveInt(searchParams.get('page'), 1);
  const pageSize = getPositiveInt(searchParams.get('pageSize'), 10, 100);
  const keyword = searchParams.get('keyword') ?? '';

  const [showCreateForm, setShowCreateForm] = useState(false);
  const queryClient = useQueryClient();

  const workflowQuery = useQuery({
    queryKey: queryKeys.workflows.list(projectId, page, pageSize, keyword),
    queryFn: () => getWorkflows(projectId, page, pageSize, keyword),
    enabled: Boolean(projectId),
    placeholderData: keepPreviousData,
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateWorkflowInput) => createWorkflow(projectId, input),
    onSuccess: async () => {
      setShowCreateForm(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all(projectId) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWorkflow(projectId, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all(projectId) });
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
    <main className="workspace-page">
      <header className="page-title-row">
        <div>
          <p className="page-eyebrow">WORKSPACE</p>
          <h1>工作室</h1>
          <div className="page-subtitle">创建、编排并管理你的 AI 工作流。</div>
        </div>
        <button className="primary-button" onClick={() => setShowCreateForm(true)}>＋ 创建应用</button>
      </header>

      <section className="workspace-filter-bar">
        <div className="app-tabs"><span className="active">▦ 全部</span><span>⌘ 工作流</span><span>◉ Chatflow</span><span>◌ Agent</span></div>
        <WorkflowSearchForm key={keyword} initialKeyword={keyword} onSearch={(value) => updateSearchParams({ keyword: value, page: '1' })} />
      </section>

      {showCreateForm && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" aria-label="创建应用">
            <CreateWorkflowForm
              pending={createMutation.isPending}
              onCancel={() => setShowCreateForm(false)}
              onSubmit={(input) => createMutation.mutate(input)}
            />
          </div>
        </div>
      )}

      {createMutation.isError && (
        <div className="error-message">
          Create failed: {createMutation.error?.message}
        </div>
      )}

      {deleteMutation.isError && (
        <div className="error-message">
          Delete failed: {deleteMutation.error?.message}
        </div>
      )}

      {workflowQuery.isPending && <div className="empty-state">正在加载应用…</div>}

      {workflowQuery.isError && (
        <div className="error-message">
          Failed to load workflows: {workflowQuery.error?.message}
        </div>
      )}

      {workflowQuery.isFetching && !workflowQuery.isPending && (
        <div className="refreshing">正在同步最新内容…</div>
      )}

      {workflowQuery.isSuccess && workflows.length === 0 && (
        <div className="empty-state">{keyword ? `未找到与 “${keyword}” 匹配的应用。` : '还没有应用，创建第一个工作流开始吧。'}</div>
      )}

      <div className="app-card-grid" style={{ opacity: workflowQuery.isPlaceholderData ? 0.5 : 1 }}>
        <button className="create-card" onClick={() => setShowCreateForm(true)}><span>＋</span><strong>创建空白应用</strong><small>从工作流开始编排</small></button>
        {workflows.map((workflow) => {
          const deleting =
            deleteMutation.isPending && deleteMutation.variables === workflow.id;

          return (
            <article key={workflow.id} className="app-card">
              <div className="app-card-header"><span className="app-icon">✦</span><span className="app-status">{workflow.status === 'PUBLISHED' ? '已发布' : '草稿'}</span></div>
              <Link to={`/projects/${projectId}/workflows/${workflow.id}`} className="app-card-title"><strong>{workflow.name}</strong></Link>
              <p>{workflow.description ?? '尚未添加应用描述'}</p>
              <div className="app-card-footer">
                <span>工作流 · 最近编辑</span>
                <div className="card-actions"><Link to={`/projects/${projectId}/workflows/${workflow.id}/editor`}>编排</Link>
                  <button
                    className="icon-delete"
                    disabled={deleting}
                    onClick={() => {
                      if (window.confirm(`Delete "${workflow.name}"?`)) {
                        deleteMutation.mutate(workflow.id);
                      }
                    }}
                    title="删除应用"
                  >
                    {deleting ? '…' : '×'}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {pagination && (
        <footer className="pagination-bar">
          <div>共 {pagination.total} 个应用</div>
          <div className="pagination-actions">
            <button
              disabled={page <= 1}
              onClick={() => updateSearchParams({ page: String(page - 1) })}
            >
              上一页
            </button>

            <span>
              第 {page} / {Math.max(pagination.totalPages, 1)} 页
            </span>

            <button
              disabled={page >= pagination.totalPages || workflowQuery.isPlaceholderData}
              onClick={() => updateSearchParams({ page: String(page + 1) })}
            >
              下一页
            </button>

            <select
              value={String(pageSize)}
              onChange={(event) =>
                updateSearchParams({ pageSize: event.target.value, page: '1' })
              }
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size} / 页
                </option>
              ))}
            </select>
          </div>
        </footer>
      )}
    </main>
  );
}
