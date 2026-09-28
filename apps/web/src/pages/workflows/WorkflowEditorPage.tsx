import { useCallback } from 'react';
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
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { getWorkflow } from '../../api/workflow';
import { queryKeys } from '../../api/queryKeys';
import { StartNode } from '../../workflow/nodes/StartNode';
import { EndNode } from '../../workflow/nodes/EndNode';
import { LlmNode } from '../../workflow/nodes/LlmNode';
import type {
  LlmNodeType,
  WorkflowCanvas,
  WorkflowEdge,
  WorkflowNode,
} from '../../workflow/types/workflowCanvas';

const nodeTypes = {
  start: StartNode,
  end: EndNode,
  llm: LlmNode,
};

const initialNodes: WorkflowNode[] = [
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

const initialEdges: WorkflowEdge[] = [];

export function WorkflowEditorPage() {
  const { id = '' } = useParams();

  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<WorkflowEdge>(initialEdges);

  const workflowQuery = useQuery({
    queryKey: queryKeys.workflows.detail(id),
    queryFn: () => getWorkflow(id),
    enabled: Boolean(id),
  });

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
      data: { label: 'LLM' },
    };

    setNodes((currentNodes) => [...currentNodes, newNode]);
  }

  function handleSave() {
    const canvas: WorkflowCanvas = { nodes, edges };
    console.log('Workflow Canvas:', canvas);
  }

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
          <Link to={`/workflows/${id}`}>← Back</Link>
          <strong>{workflowQuery.data?.name ?? 'Workflow Editor'}</strong>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={addLlmNode}>+ Add LLM</button>
          <button onClick={handleSave}>Save</button>
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}