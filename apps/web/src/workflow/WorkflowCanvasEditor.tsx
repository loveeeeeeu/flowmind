import { useCallback, useState } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateWorkflowCanvas } from '../api/workflow';
import { queryKeys } from '../api/queryKeys';
import type { Workflow } from '../types/workflow';
import { StartNode } from './nodes/StartNode';
import { EndNode } from './nodes/EndNode';
import { LlmNode } from './nodes/LlmNode';
import { PropertiesPanel } from './components/PropertiesPanel';
import { toPersistedCanvas } from './toPersistedCanvas';
import type {
  LlmNodeType,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeData,
} from './types/workflowCanvas';

const nodeTypes = {
  start: StartNode,
  end: EndNode,
  llm: LlmNode,
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
    data: { label: 'End' },
  },
];

const defaultEdges: WorkflowEdge[] = [];

interface WorkflowCanvasEditorProps {
  workflow: Workflow;
}

export function WorkflowCanvasEditor({ workflow }: WorkflowCanvasEditorProps) {
  const queryClient = useQueryClient();

  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>(
    workflow.canvas?.nodes ?? defaultNodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<WorkflowEdge>(
    workflow.canvas?.edges ?? defaultEdges,
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) => addEdge(connection, currentEdges));
    },
    [setEdges],
  );

  function addLlmNode() {
    const newNode: LlmNodeType = {
      id: crypto.randomUUID(),
      type: 'llm',
      position: { x: 300, y: 300 },
      data: {
        label: 'LLM',
        model: 'gpt-5',
        prompt: '',
      },
    };

    setNodes((currentNodes) => [...currentNodes, newNode]);
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
  }

  const saveCanvasMutation = useMutation({
    mutationFn: () => updateWorkflowCanvas(workflow.id, toPersistedCanvas(nodes, edges)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.workflows.detail(workflow.id),
      });
    },
  });

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
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {saveCanvasMutation.isSuccess && <span style={{ color: '#2e7d32' }}>Saved</span>}
          {saveCanvasMutation.isError && (
            <span style={{ color: '#d32f2f' }}>
              Save failed: {saveCanvasMutation.error?.message}
            </span>
          )}

          <button
            onClick={() => saveCanvasMutation.mutate()}
            disabled={saveCanvasMutation.isPending}
          >
            {saveCanvasMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <aside
          style={{
            width: 180,
            flexShrink: 0,
            padding: 16,
            borderRight: '1px solid #e5e5e5',
            background: '#fff',
          }}
        >
          <strong>Nodes</strong>

          <div style={{ marginTop: 16 }}>
            <button onClick={addLlmNode} style={{ width: '100%' }}>
              + LLM
            </button>
          </div>
        </aside>

        <div style={{ flex: 1, minWidth: 0 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        <PropertiesPanel node={selectedNode} onNodeDataChange={updateNodeData} />
      </div>
    </div>
  );
}