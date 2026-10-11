import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createWorkflowRun, getWorkflowRun, getWorkflowRuns } from '../../api/runs';
import { queryKeys } from '../../api/queryKeys';
import { RunDetail } from './RunDetail';
import { RunHistory } from './RunHistory';
import { RunStatusBadge } from './RunStatusBadge';
import { isTerminalRunStatus, isUnfinishedRun, parseRunInput } from './runUtils';

type ExecutionTab = 'run' | 'history';

const RUN_POLL_INTERVAL_MS = 1000;

function useRunDetail(runId: string | null) {
  return useQuery({
    queryKey: queryKeys.runs.detail(runId ?? ''),
    queryFn: () => getWorkflowRun(runId as string),
    enabled: runId !== null,
    refetchInterval: (query) =>
      isTerminalRunStatus(query.state.data?.status) ? false : RUN_POLL_INTERVAL_MS,
  });
}

interface ExecutionPanelProps {
  workflowId: string;
  isDirty: boolean;
  isSaving: boolean;
  nodeLabels: Record<string, string>;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

export function ExecutionPanel({
  workflowId,
  isDirty,
  isSaving,
  nodeLabels,
  selectedNodeId,
  onSelectNode,
}: ExecutionPanelProps) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(true);
  const [tab, setTab] = useState<ExecutionTab>('run');
  const [inputText, setInputText] = useState('{}');
  const [inputError, setInputError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: queryKeys.runs.workflowHistory(workflowId),
    queryFn: () => getWorkflowRuns(workflowId),
  });
  const history = historyQuery.data;

  // After a page refresh there is no activeRunId, so keep following the newest unfinished run.
  const trackedRunId =
    activeRunId ?? history?.find(isUnfinishedRun)?.id ?? history?.[0]?.id ?? null;
  const historyRunId = selectedRunId ?? trackedRunId;

  const trackedRunQuery = useRunDetail(trackedRunId);
  // Same query key as trackedRunQuery when both point at one run, so it is fetched only once.
  const historyRunQuery = useRunDetail(tab === 'history' ? historyRunId : null);

  const trackedStatus = trackedRunQuery.data?.status;
  const trackedStatusInHistory = history?.find((run) => run.id === trackedRunId)?.status;

  useEffect(() => {
    if (isTerminalRunStatus(trackedStatus) && trackedStatus !== trackedStatusInHistory) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.runs.workflowHistory(workflowId),
      });
    }
  }, [trackedStatus, trackedStatusInHistory, queryClient, workflowId]);

  const runMutation = useMutation({
    mutationFn: (input: Record<string, unknown>) => createWorkflowRun(workflowId, input),
    onSuccess: async (run) => {
      setActiveRunId(run.id);
      setSelectedRunId(run.id);
      setTab('run');
      await queryClient.invalidateQueries({
        queryKey: queryKeys.runs.workflowHistory(workflowId),
      });
    },
  });

  function handleRun() {
    let input: Record<string, unknown>;

    try {
      input = parseRunInput(inputText);
    } catch (error) {
      setInputError(error instanceof SyntaxError ? 'JSON 格式错误' : (error as Error).message);
      return;
    }

    setInputError(null);
    runMutation.mutate(input);
  }

  function openTab(nextTab: ExecutionTab) {
    setTab(nextTab);
    setIsOpen(true);
  }

  const runBlockedHint = isSaving
    ? '正在保存，保存完成后即可运行'
    : isDirty
      ? '画布有未保存的更改，请先保存再运行'
      : null;

  return (
    <section className={`execution-panel ${isOpen ? 'open' : ''}`}>
      <header className="execution-panel-header">
        <div className="execution-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'run'}
            className={`execution-tab ${tab === 'run' ? 'active' : ''}`}
            onClick={() => openTab('run')}
          >
            运行
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'history'}
            className={`execution-tab ${tab === 'history' ? 'active' : ''}`}
            onClick={() => openTab('history')}
          >
            运行历史
          </button>
        </div>

        <div className="execution-panel-status">
          {trackedRunQuery.data && (
            <>
              <span className="execution-panel-caption">最近运行</span>
              <RunStatusBadge status={trackedRunQuery.data.status} />
            </>
          )}
          <button
            type="button"
            className="execution-toggle"
            onClick={() => setIsOpen((open) => !open)}
          >
            {isOpen ? '收起' : '展开'}
          </button>
        </div>
      </header>

      {isOpen && tab === 'run' && (
        <div className="execution-panel-body">
          <div className="execution-side">
            <label className="panel-field">
              <span className="panel-field-label">运行输入（JSON 对象）</span>
              <textarea
                className="code-input execution-input"
                value={inputText}
                spellCheck={false}
                onChange={(event) => {
                  setInputText(event.target.value);
                  setInputError(null);
                }}
              />
              {inputError && <span className="panel-field-error">{inputError}</span>}
            </label>
            <p className="execution-input-hint">
              直接填写开始节点的变量，例如 <code>{'{"name": "FlowMind"}'}</code>，无需外层 input
            </p>

            {runBlockedHint && <p className="panel-hint">{runBlockedHint}</p>}
            {runMutation.isError && (
              <p className="error-message">启动运行失败：{runMutation.error.message}</p>
            )}

            <button
              type="button"
              className="primary-button execution-run-button"
              onClick={handleRun}
              disabled={isDirty || isSaving || runMutation.isPending}
            >
              {runMutation.isPending ? '启动中…' : '运行'}
            </button>
          </div>

          <div className="execution-main">
            <RunDetail
              run={trackedRunQuery.data}
              isLoading={trackedRunQuery.isLoading || historyQuery.isLoading}
              refreshError={trackedRunQuery.error}
              nodeLabels={nodeLabels}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
            />
          </div>
        </div>
      )}

      {isOpen && tab === 'history' && (
        <div className="execution-panel-body">
          <div className="execution-side">
            <RunHistory
              runs={history}
              isLoading={historyQuery.isLoading}
              error={historyQuery.error}
              selectedRunId={historyRunId}
              onSelectRun={setSelectedRunId}
            />
          </div>

          <div className="execution-main">
            <RunDetail
              run={historyRunQuery.data}
              isLoading={historyRunQuery.isLoading}
              refreshError={historyRunQuery.error}
              nodeLabels={nodeLabels}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
            />
          </div>
        </div>
      )}
    </section>
  );
}
