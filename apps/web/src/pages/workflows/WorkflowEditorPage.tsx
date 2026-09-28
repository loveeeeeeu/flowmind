import {
    Background,
    Controls,
    ReactFlow,
    useEdgesState,
    useNodesState,
    type Edge,
    type Node,
  } from '@xyflow/react';
  import '@xyflow/react/dist/style.css';
  import { Link, useParams } from 'react-router';
  import { useQuery } from '@tanstack/react-query';
  import { getWorkflow } from '../../api/workflow';
  import { queryKeys } from '../../api/queryKeys';
  
  const initialNodes: Node[] = [
    {
      id: 'start',
      position: { x: 100, y: 200 },
      data: { label: 'Start' },
    },
    {
      id: 'end',
      position: { x: 500, y: 200 },
      data: { label: 'End' },
    },
  ];
  
  const initialEdges: Edge[] = [
    {
      id: 'start-end',
      source: 'start',
      target: 'end',
    },
  ];
  
  export function WorkflowEditorPage() {
    const { id = '' } = useParams();
  
    const [nodes, , onNodesChange] = useNodesState(initialNodes);
    const [edges, , onEdgesChange] = useEdgesState(initialEdges);
  
    const workflowQuery = useQuery({
      queryKey: queryKeys.workflows.detail(id),
      queryFn: () => getWorkflow(id),
      enabled: Boolean(id),
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
            <Link to={`/workflows/${id}`}>← Back</Link>
            <strong>{workflowQuery.data?.name ?? 'Workflow Editor'}</strong>
          </div>
  
          <button>Save</button>
        </header>
  
        <div style={{ flex: 1, minHeight: 0 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      </div>
    );
  }