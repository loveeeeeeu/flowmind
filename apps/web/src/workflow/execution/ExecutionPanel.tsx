import { useState } from 'react';
import type { WorkflowVersionSummary } from '../../types/workflow';
import type { WorkflowCanvas } from '../types/workflowCanvas';
import { RunDetail } from './RunDetail';
import { RunHistory } from './RunHistory';
import { RunStatusBadge } from './RunStatusBadge';
import { parseRunInput } from './runUtils';
import type { ExecutionState } from './useExecutionState';

type ExecutionTab = 'run' | 'history';

interface ExecutionPanelProps {
  execution: ExecutionState;
  workflowUpdatedAt: string;
  /** What "运行 vN" executes; unsaved or unpublished draft edits never affect it. */
  latestVersion: WorkflowVersionSummary | null;
  /** While a historical version is shown read-only there is no draft on screen to test. */
  isPreviewing: boolean;
  /** VIEWER can inspect run history but cannot start a test or production run. */
  canEdit: boolean;
  /** Snapshot of the editor's current canvas, unsaved edits included, taken at click time. */
  getTestCanvas: () => WorkflowCanvas;
  nodeLabels: Record<string, string>;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onViewVersion: (versionId: string) => void;
}

export function ExecutionPanel({
  execution,
  workflowUpdatedAt,
  latestVersion,
  isPreviewing,
  canEdit,
  getTestCanvas,
  nodeLabels,
  selectedNodeId,
  onSelectNode,
  onViewVersion,
}: ExecutionPanelProps) {
  const {
    isOpen,
    setIsOpen,
    historyQuery,
    trackedRun,
    viewedRunId,
    viewedRunQuery,
    runMutation,
    testRunMutation,
  } = execution;
  const [tab, setTab] = useState<ExecutionTab>('run');
  const [inputText, setInputText] = useState('{}');
  const [inputError, setInputError] = useState<string | null>(null);

  function readInput(): Record<string, unknown> | null {
    try {
      const input = parseRunInput(inputText);
      setInputError(null);
      return input;
    } catch (error) {
      setInputError(error instanceof SyntaxError ? 'JSON 格式错误' : (error as Error).message);
      return null;
    }
  }

  function handleRun() {
    const input = readInput();

    if (canEdit && input) {
      runMutation.mutate(input);
    }
  }

  // Never saves: the dirty flag stays as it was, the snapshot only lives on the run.
  function handleTestDraft() {
    const input = readInput();

    if (canEdit && input) {
      testRunMutation.mutate({ input, canvas: getTestCanvas() });
    }
  }

  function openTab(nextTab: ExecutionTab) {
    setTab(nextTab);
    setIsOpen(true);
  }

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
                    disabled={!canEdit}
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

                <p className="panel-hint">
                  {isPreviewing
                    ? '正在预览历史版本，返回草稿后才能测试草稿'
                    : '测试草稿：运行当前画布（含未保存的修改），不会生成版本'}
                  <br />
                  {latestVersion
                    ? `运行 v${latestVersion.version}：运行已发布版本，不受草稿修改影响`
                    : '正式运行需要先发布工作流'}
                </p>
                {testRunMutation.isError && (
                  <p className="error-message">测试草稿失败：{testRunMutation.error.message}</p>
                )}
                {runMutation.isError && (
                  <p className="error-message">启动运行失败：{runMutation.error.message}</p>
                )}

                <div className="execution-run-actions">
                  <button
                    type="button"
                    className="execution-test-button"
                    onClick={handleTestDraft}
                    disabled={!canEdit || isPreviewing || testRunMutation.isPending}
                  >
                    {testRunMutation.isPending ? '启动中…' : '测试草稿'}
                  </button>
                  <button
                    type="button"
                    className="primary-button execution-run-button"
                    title={latestVersion ? undefined : '请先发布工作流再运行'}
                    onClick={handleRun}
                    disabled={!canEdit || !latestVersion || runMutation.isPending}
                  >
                    {runMutation.isPending
                      ? '启动中…'
                      : latestVersion
                        ? `运行 v${latestVersion.version}`
                        : '运行'}
                  </button>
                </div>
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
              projectId={execution.projectId}
              run={viewedRunQuery.data}
              isLoading={viewedRunQuery.isLoading || historyQuery.isLoading}
              refreshError={viewedRunQuery.error}
              fetchedAt={viewedRunQuery.dataUpdatedAt}
              workflowUpdatedAt={workflowUpdatedAt}
              nodeLabels={nodeLabels}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
              onViewVersion={onViewVersion}
            />
          </div>
        </div>
      )}
    </section>
  );
}
