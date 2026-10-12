import { useState } from 'react';
import { RunDetail } from './RunDetail';
import { RunHistory } from './RunHistory';
import { RunStatusBadge } from './RunStatusBadge';
import { parseRunInput } from './runUtils';
import type { ExecutionState } from './useExecutionState';

type ExecutionTab = 'run' | 'history';

interface ExecutionPanelProps {
  execution: ExecutionState;
  workflowUpdatedAt: string;
  isDirty: boolean;
  isSaving: boolean;
  nodeLabels: Record<string, string>;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

export function ExecutionPanel({
  execution,
  workflowUpdatedAt,
  isDirty,
  isSaving,
  nodeLabels,
  selectedNodeId,
  onSelectNode,
}: ExecutionPanelProps) {
  const { isOpen, setIsOpen, historyQuery, trackedRun, viewedRunId, viewedRunQuery, runMutation } =
    execution;
  const [tab, setTab] = useState<ExecutionTab>('run');
  const [inputText, setInputText] = useState('{}');
  const [inputError, setInputError] = useState<string | null>(null);

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
          {trackedRun && (
            <>
              <span className="execution-panel-caption">最近运行</span>
              <RunStatusBadge status={trackedRun.status} />
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

      {isOpen && (
        <div className="execution-panel-body">
          <div className="execution-side">
            {tab === 'run' ? (
              <>
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
              </>
            ) : (
              <RunHistory
                runs={historyQuery.data}
                isLoading={historyQuery.isLoading}
                error={historyQuery.error}
                selectedRunId={viewedRunId}
                onSelectRun={execution.selectRun}
              />
            )}
          </div>

          <div className="execution-main">
            <RunDetail
              run={viewedRunQuery.data}
              isLoading={viewedRunQuery.isLoading || historyQuery.isLoading}
              refreshError={viewedRunQuery.error}
              fetchedAt={viewedRunQuery.dataUpdatedAt}
              workflowUpdatedAt={workflowUpdatedAt}
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
