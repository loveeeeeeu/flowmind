import { useCallback, useEffect, useState } from 'react';
import {
  Background,
  Controls,
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
  LlmNodeType,
  TemplateNodeType,
  VariableNodeType,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeData,
} from './types/workflowCanvas';

const nodeTypes = {
  start: StartNode,
  end: EndNode,
  llm: LlmNode,
  template: TemplateNode,
  variable: VariableNode,
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

      return !exists;
    },
    [edges],
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
        value: 'FlowMind',
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
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          height: 60,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          borderBottom: '1px solid #e5e5e5',
          background: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link to={`/workflows/${workflow.id}`}>← Back</Link>
          <strong>{workflow.name}</strong>
          <span style={{ fontSize: 13, color: isDirty ? '#b45309' : '#15803d' }}>
            {isDirty ? '● Unsaved changes' : '✓ Saved'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {saveCanvasMutation.isError && (
            <span style={{ fontSize: 13, color: '#d32f2f' }}>
              Save failed: {saveCanvasMutation.error.message}
            </span>
          )}

          <button
            onClick={() => saveCanvasMutation.mutate()}
            disabled={!isDirty || saveCanvasMutation.isPending}
          >
            {saveCanvasMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      <NodeLibrary
        onAddLlm={addLlmNode}
        onAddTemplate={addTemplateNode}
        onAddVariable={addVariableNode}
      />

        <div style={{ flex: 1, minWidth: 0 }}>
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
            <Background />
            <Controls />
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