import { useCallback, useEffect, useState } from 'react';
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getLlmProviders } from '../api/llm';
import { updateWorkflowCanvas } from '../api/workflow';
import { queryKeys } from '../api/queryKeys';
import type { Workflow } from '../types/workflow';
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
    data: { label: 'Start' },
  },
  {
    id: 'end-1',
    type: 'end',
    position: { x: 600, y: 200 },
    data: { label: 'End', outputVariable: 'result' },
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
  workflow: Workflow;
}

export function WorkflowCanvasEditor({ workflow }: WorkflowCanvasEditorProps) {
  const queryClient = useQueryClient();
  const providersQuery = useQuery({
    queryKey: queryKeys.llm.providers,
    queryFn: getLlmProviders,
  });

  const [nodes, setNodes] = useNodesState<WorkflowNode>(
    withDeleteRules(workflow.canvas?.nodes ?? defaultNodes),
  );
  const [edges, setEdges] = useEdgesState<WorkflowEdge>(workflow.canvas?.edges ?? defaultEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;

  const handleNodesChange = useCallback(
    (changes: NodeChange<WorkflowNode>[]) => {
      setNodes((currentNodes) => applyNodeChanges(changes, currentNodes));

      if (changes.some(isCanvasChange)) {
        setIsDirty(true);
      }
    },
    [setNodes],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<WorkflowEdge>[]) => {
      setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges));

      if (changes.some(isCanvasChange)) {
        setIsDirty(true);
      }
    },
    [setEdges],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) => addEdge(connection, currentEdges));
      setIsDirty(true);
    },
    [setEdges],
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
    const newNode: LlmNodeType = {
      id: crypto.randomUUID(),
      type: 'llm',
      position: { x: 300, y: 300 },
      data: {
        label: 'LLM',
        provider: 'deepseek',
        model: 'deepseek-flash',
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
    const newNode: TemplateNodeType = {
      id: crypto.randomUUID(),
      type: 'template',
      position: { x: 350, y: 300 },
      data: {
        label: 'Template',
        template: 'Hello {{name}}',
        outputVariable: 'result',
      },
    };

    setNodes((currentNodes) => [...currentNodes, newNode]);
    setIsDirty(true);
  }
  function addVariableNode() {
    const newNode: VariableNodeType = {
      id: crypto.randomUUID(),
      type: 'variable',
      position: { x: 350, y: 300 },
      data: {
        label: 'Variable',
        variableName: 'name',
        sourceType: 'literal',
        value: 'FlowMind',
      },
    };
  
    setNodes((currentNodes) => [...currentNodes, newNode]);
    setIsDirty(true);
  }
  function addHttpNode() {
    const newNode: HttpNodeType = {
      id: crypto.randomUUID(),
      type: 'http',
      position: { x: 400, y: 300 },
      data: {
        label: 'HTTP Request',
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
    const newNode: IfNodeType = {
      id: crypto.randomUUID(),
      type: 'if',
      position: { x: 400, y: 300 },
      data: {
        label: 'IF',
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
    const newNode: LoopNodeType = {
      id: crypto.randomUUID(),
      type: 'loop',
      position: { x: 400, y: 300 },
      data: {
        label: 'Loop',
        itemsPath: 'items',
        itemVariable: 'item',
        indexVariable: 'index',
      },
    };

    setNodes((currentNodes) => [...currentNodes, newNode]);
    setIsDirty(true);
  }

  function addCodeNode() {
    const newNode: CodeNodeType = {
      id: crypto.randomUUID(),
      type: 'code',
      position: { x: 400, y: 300 },
      data: {
        label: 'Code',
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

  function deleteNode(nodeId: string) {
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
    mutationFn: () => updateWorkflowCanvas(workflow.id, toPersistedCanvas(nodes, edges)),
    onSuccess: async () => {
      setIsDirty(false);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.workflows.detail(workflow.id),
      });
    },
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isSaveShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's';

      if (!isSaveShortcut) {
        return;
      }

      event.preventDefault();

      if (isDirty && !saveCanvasMutation.isPending) {
        saveCanvasMutation.mutate();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDirty, saveCanvasMutation]);

  return (
    <div className="workflow-editor">
      <header className="editor-toolbar">
        <div className="editor-identity">
          <Link className="editor-back" to={`/workflows/${workflow.id}`} aria-label="返回工作流详情">
            ‹
          </Link>
          <span className="editor-workflow-icon">⌘</span>
          <div>
            <strong className="editor-name">{workflow.name}</strong>
            <span className={`editor-save-state ${isDirty ? 'dirty' : ''}`}>
              {isDirty ? '未保存的更改' : '已自动保存'}
            </span>
          </div>
        </div>

        <div className="editor-actions">
          {saveCanvasMutation.isError && (
            <span className="editor-save-error">保存失败：{saveCanvasMutation.error.message}</span>
          )}
          <span className="editor-mode">编排模式</span>
          <button
            className="save-action"
            onClick={() => saveCanvasMutation.mutate()}
            disabled={!isDirty || saveCanvasMutation.isPending}
          >
            {saveCanvasMutation.isPending ? '保存中…' : '保存'}
          </button>
        </div>
      </header>

      <div className="editor-body">
      <NodeLibrary
        onAddLlm={addLlmNode}
        onAddTemplate={addTemplateNode}
        onAddVariable={addVariableNode}
        onAddHttp={addHttpNode}
        onAddIf={addIfNode}
        onAddLoop={addLoopNode}
        onAddCode={addCodeNode}
      />

        <div className="canvas-stage">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            deleteKeyCode={['Backspace', 'Delete']}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView
          >
            <Background color="#d9e0eb" gap={18} size={1} />
            <Controls />
            <MiniMap zoomable pannable />
          </ReactFlow>
        </div>

        <PropertiesPanel
          node={selectedNode}
          providers={providersQuery.data ?? []}
          onNodeDataChange={updateNodeData}
          onDeleteNode={deleteNode}
        />
      </div>
    </div>
  );
}
