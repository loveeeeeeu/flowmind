import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAvailableModels } from '../api/models';
import { getWorkflowVersion, publishWorkflow, updateWorkflowCanvas } from '../api/workflow';
import { queryKeys } from '../api/queryKeys';
import type { WorkflowDetail } from '../types/workflow';
import { StartNode } from './nodes/StartNode';
import { EndNode } from './nodes/EndNode';
import { LlmNode } from './nodes/LlmNode';
import { TemplateNode } from './nodes/TemplateNode';
import { NodeLibrary } from './components/NodeLibrary';
import { PropertiesPanel } from './components/PropertiesPanel';
import { toPersistedCanvas } from './toPersistedCanvas';
import { VariableNode } from './nodes/VariableNode';
import type {
  CodeNodeType,
  HttpNodeType,
  IfNodeType,
  LlmNodeType,
  LoopNodeType,
  TemplateNodeType,
  VariableNodeType,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeData,
} from './types/workflowCanvas';
import { HttpNode } from './nodes/HttpNode';
import { IfNode } from './nodes/IfNode';
import { LoopNode } from './nodes/LoopNode';
import { CodeNode } from './nodes/CodeNode';
import { ExecutionPanel } from './execution/ExecutionPanel';
import { NodeDebugPanel } from './execution/NodeDebugPanel';
import { buildNodeExecutionViews, getUnexecutedNodeView } from './execution/runUtils';
import { useExecutionState } from './execution/useExecutionState';
import { VersionHistory } from './version/VersionHistory';
import { VersionPreviewBanner } from './version/VersionPreviewBanner';
import { hasUnpublishedChanges } from './version/publishState';
import { AvailableModelsContext } from './llm/llmNodeData';
import { useProjectPermissions } from '../auth/useProjectPermissions';

const nodeTypes = {
  start: StartNode,
  end: EndNode,
  llm: LlmNode,
  template: TemplateNode,
  variable: VariableNode,
  http: HttpNode,
  if: IfNode,
  loop: LoopNode,
  code: CodeNode,
};

const defaultNodes: WorkflowNode[] = [
  {
    id: 'start-1',
    type: 'start',
    position: { x: 100, y: 200 },
    data: { label: '开始' },
  },
  {
    id: 'end-1',
    type: 'end',
    position: { x: 600, y: 200 },
    data: { label: '结束', outputVariable: 'result' },
  },
];

const defaultEdges: WorkflowEdge[] = [];

function isProtectedNode(node: WorkflowNode) {
  return node.type === 'start' || node.type === 'end';
}

function withDeleteRules(nodes: WorkflowNode[]): WorkflowNode[] {
  return nodes.map((node) => (isProtectedNode(node) ? { ...node, deletable: false } : node));
}

// 'dimensions' is emitted when React Flow measures nodes on first render, so it must not count as an edit.
function isCanvasChange(change: NodeChange | EdgeChange) {
  return change.type !== 'select' && change.type !== 'dimensions';
}

interface WorkflowCanvasEditorProps {
  projectId: string;
  workflow: WorkflowDetail;
}

export function WorkflowCanvasEditor({ projectId, workflow }: WorkflowCanvasEditorProps) {
  const queryClient = useQueryClient();
  const { canEdit } = useProjectPermissions(projectId);
  // Shared (same key) with the LLM properties panel; canvas nodes read it through context.
  const availableModelsQuery = useQuery({
    queryKey: queryKeys.models.available(projectId),
    queryFn: () => getAvailableModels(projectId),
  });
  const availableModels = useMemo(
    () =>
      availableModelsQuery.data
        ? new Map(availableModelsQuery.data.map((model) => [model.id, model]))
        : undefined,
    [availableModelsQuery.data],
  );

  const [nodes, setNodes] = useNodesState<WorkflowNode>(
    withDeleteRules(workflow.draftCanvas?.nodes ?? defaultNodes),
  );
  const [edges, setEdges] = useEdgesState<WorkflowEdge>(
    workflow.draftCanvas?.edges ?? defaultEdges,
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [flow, setFlow] = useState<ReactFlowInstance<WorkflowNode, WorkflowEdge> | null>(null);
  const [isVersionsOpen, setIsVersionsOpen] = useState(false);
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const execution = useExecutionState(projectId, workflow.id);

  // Read-only preview of a published version. It only switches what the canvas displays:
  // the draft's nodes/edges/isDirty are never replaced, so "返回草稿" loses nothing.
  const isPreviewing = previewVersionId !== null;
  const previewQuery = useQuery({
    queryKey: queryKeys.versions.detail(projectId, workflow.id, previewVersionId ?? ''),
    queryFn: () => getWorkflowVersion(projectId, workflow.id, previewVersionId as string),
    enabled: isPreviewing,
    // Versions are immutable.
    staleTime: Infinity,
  });
  const previewVersion = isPreviewing ? previewQuery.data : undefined;

  const latestVersion = workflow.latestVersion;
  // isDirty: local canvas differs from the saved draft. isPublishPending: the saved draft differs
  // from the latest version. Independent, so both can be true at once.
  const isPublishPending = hasUnpublishedChanges(workflow);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const nodeLabels = useMemo(
    () => Object.fromEntries(nodes.map((node) => [node.id, node.data.label])),
    [nodes],
  );

  // No run overlay on a version preview: the viewed run may belong to another canvas.
  const overlayRun =
    execution.isOpen && !isPreviewing ? execution.viewedRunQuery.data : undefined;
  // This is a render-only projection: persisted `nodes` never receive execution data.
  const renderedNodes = useMemo(() => {
    if (!overlayRun) {
      return nodes;
    }

    const executionByNode = buildNodeExecutionViews(overlayRun.nodeRuns);

    return nodes.map((node) => {
      const execution = executionByNode.get(node.id) ?? getUnexecutedNodeView(node.id, overlayRun.status);

      return {
        ...node,
        data: { ...node.data, execution },
        className: `run-node-${execution.status.toLowerCase()}`,
      } as unknown as WorkflowNode;
    });
  }, [nodes, overlayRun]);

  // Selection is not persisted by toPersistedCanvas, so focusing a node never marks the canvas dirty.
  const focusNode = useCallback(
    (nodeId: string, nodeRunId?: string) => {
      // A historical run can reference a node that has since been deleted.
      if (isPreviewing || !nodes.some((node) => node.id === nodeId)) {
        return;
      }

      setNodes((currentNodes) =>
        currentNodes.map((node) => ({ ...node, selected: node.id === nodeId })),
      );
      setSelectedNodeId(nodeId);
      const latestNodeRunId = overlayRun
        ? buildNodeExecutionViews(overlayRun.nodeRuns).get(nodeId)?.latestNodeRunId ?? null
        : null;
      execution.selectNodeRun(nodeRunId ?? latestNodeRunId);
      void flow?.fitView({ nodes: [{ id: nodeId }], duration: 300, maxZoom: 1.2 });
    },
    [execution, flow, isPreviewing, nodes, overlayRun, setNodes],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<WorkflowNode>[]) => {
      if (!canEdit) {
        return;
      }
      setNodes((currentNodes) => applyNodeChanges(changes, currentNodes));

      if (changes.some(isCanvasChange)) {
        setIsDirty(true);
      }
    },
    [canEdit, setNodes],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<WorkflowEdge>[]) => {
      if (!canEdit) {
        return;
      }
      setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges));

      if (changes.some(isCanvasChange)) {
        setIsDirty(true);
      }
    },
    [canEdit, setEdges],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!canEdit) {
        return;
      }
      setEdges((currentEdges) => addEdge(connection, currentEdges));
      setIsDirty(true);
    },
    [canEdit, setEdges],
  );

  const isValidConnection = useCallback(
    (connection: Connection | WorkflowEdge) => {
      if (!connection.source || !connection.target) {
        return false;
      }

      if (connection.source === connection.target) {
        return false;
      }

      const exists = edges.some(
        (edge) => edge.source === connection.source && edge.target === connection.target,
      );

      if (exists) {
        return false;
      }

      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);
      const outgoing = edges.filter((edge) => edge.source === connection.source);

      if (targetNode?.type === 'loop' && connection.targetHandle === 'loop') {
        const loopBackUsed = edges.some(
          (edge) => edge.target === connection.target && edge.targetHandle === 'loop',
        );

        if (loopBackUsed) {
          return false;
        }
      }

      const branchHandles =
        sourceNode?.type === 'if'
          ? ['true', 'false']
          : sourceNode?.type === 'loop'
            ? ['body', 'done']
            : null;

      if (branchHandles) {
        const handle = connection.sourceHandle;

        if (!handle || !branchHandles.includes(handle)) {
          return false;
        }

        return !outgoing.some((edge) => edge.sourceHandle === handle);
      }

      // Scheduler has no parallel branches: plain nodes get one outgoing edge.
      return outgoing.length === 0;
    },
    [nodes, edges],
  );

  function addLlmNode() {
    if (!canEdit) return;
    const newNode: LlmNodeType = {
      id: crypto.randomUUID(),
      type: 'llm',
      position: { x: 300, y: 300 },
      data: {
        label: 'LLM',
        // Never preselected: the user picks which (possibly paid) model to call.
        modelId: '',
        systemPrompt: 'You are a helpful assistant.',
        prompt: '{{prompt}}',
        temperature: 0.7,
        outputVariable: 'answer',
      },
    };

    setNodes((currentNodes) => [...currentNodes, newNode]);
    setIsDirty(true);
  }

  function addTemplateNode() {
    if (!canEdit) return;
    const newNode: TemplateNodeType = {
      id: crypto.randomUUID(),
      type: 'template',
      position: { x: 350, y: 300 },
      data: {
        label: '模板',
        template: 'Hello {{name}}',
        outputVariable: 'result',
      },
    };

    setNodes((currentNodes) => [...currentNodes, newNode]);
    setIsDirty(true);
  }
  function addVariableNode() {
    if (!canEdit) return;
    const newNode: VariableNodeType = {
      id: crypto.randomUUID(),
      type: 'variable',
      position: { x: 350, y: 300 },
      data: {
        label: '变量',
        variableName: 'name',
        sourceType: 'literal',
        value: 'FlowMind',
      },
    };
  
    setNodes((currentNodes) => [...currentNodes, newNode]);
    setIsDirty(true);
  }
  function addHttpNode() {
    if (!canEdit) return;
    const newNode: HttpNodeType = {
      id: crypto.randomUUID(),
      type: 'http',
      position: { x: 400, y: 300 },
      data: {
        label: 'HTTP 请求',
        method: 'GET',
        url: 'https://jsonplaceholder.typicode.com/users/{{userId}}',
        headers: { Accept: 'application/json' },
        body: '',
        timeoutMs: 10000,
        outputVariable: 'response',
      },
    };
  
    setNodes((currentNodes) => [...currentNodes, newNode]);
    setIsDirty(true);
  }

  function addIfNode() {
    if (!canEdit) return;
    const newNode: IfNodeType = {
      id: crypto.randomUUID(),
      type: 'if',
      position: { x: 400, y: 300 },
      data: {
        label: '条件分支',
        variable: 'score',
        operator: 'gte',
        valueType: 'number',
        value: '60',
      },
    };

    setNodes((currentNodes) => [...currentNodes, newNode]);
    setIsDirty(true);
  }

  function addLoopNode() {
    if (!canEdit) return;
    const newNode: LoopNodeType = {
      id: crypto.randomUUID(),
      type: 'loop',
      position: { x: 400, y: 300 },
      data: {
        label: '循环',
        itemsPath: 'items',
        itemVariable: 'item',
        indexVariable: 'index',
      },
    };

    setNodes((currentNodes) => [...currentNodes, newNode]);
    setIsDirty(true);
  }

  function addCodeNode() {
    if (!canEdit) return;
    const newNode: CodeNodeType = {
      id: crypto.randomUUID(),
      type: 'code',
      position: { x: 400, y: 300 },
      data: {
        label: '代码执行',
        inputPath: 'order',
        code: 'return { total: input.price * input.quantity };',
        outputVariable: 'calculation',
        timeoutMs: 1000,
      },
    };

    setNodes((currentNodes) => [...currentNodes, newNode]);
    setIsDirty(true);
  }

  function updateNodeData(nodeId: string, patch: Partial<WorkflowNodeData>) {
    if (!canEdit) {
      return;
    }
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        return {
          ...node,
          data: {
            ...node.data,
            ...patch,
          },
        } as WorkflowNode;
      }),
    );
    setIsDirty(true);
  }

  function replaceNodeData(nodeId: string, data: WorkflowNodeData) {
    if (!canEdit) {
      return;
    }
    setNodes((currentNodes) =>
      currentNodes.map((node) => (node.id === nodeId ? ({ ...node, data } as WorkflowNode) : node)),
    );
    setIsDirty(true);
  }

  function deleteNode(nodeId: string) {
    if (!canEdit) {
      return;
    }
    const node = nodes.find((item) => item.id === nodeId);

    if (!node || isProtectedNode(node)) {
      return;
    }

    setNodes((currentNodes) => currentNodes.filter((item) => item.id !== nodeId));
    setEdges((currentEdges) =>
      currentEdges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    );
    setSelectedNodeId(null);
    setIsDirty(true);
  }

  const saveCanvasMutation = useMutation({
    mutationFn: () => updateWorkflowCanvas(projectId, workflow.id, toPersistedCanvas(nodes, edges)),
    onSuccess: async () => {
      setIsDirty(false);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.workflows.detail(projectId, workflow.id),
      });
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => publishWorkflow(projectId, workflow.id),
    // The header and the run button read latestVersion from the refetched detail, not from here.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.workflows.detail(projectId, workflow.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.versions.list(projectId, workflow.id) }),
      ]),
  });

  // Publishing snapshots the server-side draft, so unsaved edits would silently be left out.
  const publishBlockedReason = isPreviewing
    ? '预览历史版本时不能发布'
    : isDirty
      ? '请先保存草稿再发布'
      : workflow.draftCanvas === null
        ? '请先保存草稿'
        : !isPublishPending
          ? '草稿与已发布版本一致，无需重复发布'
          : null;

  const getTestCanvas = useCallback(() => toPersistedCanvas(nodes, edges), [nodes, edges]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isSaveShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's';

      if (!isSaveShortcut) {
        return;
      }

      event.preventDefault();

      if (canEdit && isDirty && !isPreviewing && !saveCanvasMutation.isPending) {
        saveCanvasMutation.mutate();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [canEdit, isDirty, isPreviewing, saveCanvasMutation]);

  return (
    <div className="workflow-editor" data-can-edit={canEdit}>
      <header className="editor-toolbar">
        <div className="editor-identity">
          <Link className="editor-back" to={`/projects/${projectId}/workflows/${workflow.id}`} aria-label="返回工作流详情">
            ‹
          </Link>
          <span className="editor-workflow-icon">⌘</span>
          <div>
            <span className="editor-title-row">
              <strong className="editor-name">{workflow.name}</strong>
              {latestVersion ? (
                <button
                  type="button"
                  className="editor-version-badge published clickable"
                  title={`点击只读查看 v${latestVersion.version} 的画布；编辑的始终是草稿`}
                  onClick={() => setPreviewVersionId(latestVersion.id)}
                >
                  已发布 v{latestVersion.version}
                </button>
              ) : (
                <span
                  className="editor-version-badge"
                  title="尚未发布：发布后才会生成不可修改的版本，并且才能运行"
                >
                  仅草稿
                </span>
              )}
            </span>
            <span className="editor-state-row">
              <span className={`editor-save-state ${isDirty ? 'dirty' : ''}`}>
                {isDirty ? '未保存的更改' : '草稿已保存'}
              </span>
              {latestVersion ? (
                <span
                  className={`editor-publish-state ${isPublishPending ? 'pending' : ''}`}
                >
                  {isPublishPending
                    ? '有未发布的修改'
                    : `与 v${latestVersion.version} 一致`}
                </span>
              ) : (
                <span className="editor-publish-state">尚未发布</span>
              )}
            </span>
          </div>
        </div>

        <div className="editor-actions">
          {saveCanvasMutation.isError && (
            <span className="editor-save-error">保存失败：{saveCanvasMutation.error.message}</span>
          )}
          {publishMutation.isError && (
            <span className="editor-save-error" title={publishMutation.error.message}>
              发布失败：{publishMutation.error.message}
            </span>
          )}
          <button
            type="button"
            className={`versions-action ${isVersionsOpen ? 'active' : ''}`}
            onClick={() => setIsVersionsOpen((open) => !open)}
          >
            版本历史
          </button>
          <button
            className="save-action"
            title={isPreviewing ? '预览历史版本时不能保存' : undefined}
            onClick={() => saveCanvasMutation.mutate()}
            disabled={!canEdit || isPreviewing || !isDirty || saveCanvasMutation.isPending}
          >
            {saveCanvasMutation.isPending ? '保存中…' : '保存草稿'}
          </button>
          <button
            className="publish-action"
            title={publishBlockedReason ?? '把已保存的草稿发布为新的不可修改版本'}
            onClick={() => publishMutation.mutate()}
            disabled={
              !canEdit ||
              publishBlockedReason !== null ||
              saveCanvasMutation.isPending ||
              publishMutation.isPending
            }
          >
            {publishMutation.isPending ? '发布中…' : '发布'}
          </button>
        </div>
      </header>

      {isPreviewing && (
        <VersionPreviewBanner
          version={previewVersion}
          error={previewQuery.error}
          hasUnsavedDraft={isDirty}
          onBackToDraft={() => setPreviewVersionId(null)}
        />
      )}

      <div className="editor-body">
      <NodeLibrary
        disabled={!canEdit || isPreviewing}
        onAddLlm={addLlmNode}
        onAddTemplate={addTemplateNode}
        onAddVariable={addVariableNode}
        onAddHttp={addHttpNode}
        onAddIf={addIfNode}
        onAddLoop={addLoopNode}
        onAddCode={addCodeNode}
      />

        <div className="canvas-stage">
          <AvailableModelsContext.Provider value={availableModels}>
            {/* Keyed by what is shown so each switch remounts and fits the view to that canvas. */}
            <ReactFlow
              key={previewVersion?.id ?? 'draft'}
              nodes={isPreviewing ? (previewVersion?.canvas.nodes ?? []) : renderedNodes}
              edges={isPreviewing ? (previewVersion?.canvas.edges ?? []) : edges}
              nodeTypes={nodeTypes}
              onInit={setFlow}
              onNodesChange={isPreviewing || !canEdit ? undefined : handleNodesChange}
              onEdgesChange={isPreviewing || !canEdit ? undefined : handleEdgesChange}
              onConnect={isPreviewing || !canEdit ? undefined : onConnect}
              isValidConnection={isValidConnection}
              nodesDraggable={!isPreviewing && canEdit}
              nodesConnectable={!isPreviewing && canEdit}
              elementsSelectable={!isPreviewing}
              deleteKeyCode={isPreviewing || !canEdit ? null : ['Backspace', 'Delete']}
              onNodeClick={isPreviewing ? undefined : (_, node) => focusNode(node.id)}
              onPaneClick={
                isPreviewing
                  ? undefined
                  : () => {
                      setSelectedNodeId(null);
                      execution.selectNodeRun(null);
                    }
              }
              fitView
            >
              <Background color="#d9e0eb" gap={18} size={1} />
              <Controls showInteractive={!isPreviewing} />
              <MiniMap zoomable pannable />
            </ReactFlow>
          </AvailableModelsContext.Provider>
        </div>

        {overlayRun ? (
          <NodeDebugPanel
            projectId={projectId}
            run={overlayRun}
            node={selectedNode}
            selectedNodeRunId={execution.selectedNodeRunId}
            onSelectNodeRun={execution.selectNodeRun}
          />
        ) : (
          <PropertiesPanel
            node={isPreviewing ? null : selectedNode}
            onNodeDataChange={updateNodeData}
            onNodeDataReplace={replaceNodeData}
            onDeleteNode={deleteNode}
          />
        )}

        {isVersionsOpen && (
          <VersionHistory
            projectId={projectId}
            workflowId={workflow.id}
            latestVersionId={latestVersion?.id ?? null}
            previewVersionId={previewVersionId}
            onPreview={setPreviewVersionId}
            onClose={() => setIsVersionsOpen(false)}
          />
        )}
      </div>

      <ExecutionPanel
        execution={execution}
        workflowUpdatedAt={workflow.updatedAt}
        latestVersion={latestVersion}
        isPreviewing={isPreviewing}
        canEdit={canEdit}
        getTestCanvas={getTestCanvas}
        nodeLabels={nodeLabels}
        selectedNodeId={selectedNodeId}
        onSelectNode={focusNode}
        onViewVersion={setPreviewVersionId}
      />
    </div>
  );
}
