import type { CSSProperties } from 'react';
import type { WorkflowNode, WorkflowNodeData } from '../types/workflowCanvas';

interface PropertiesPanelProps {
  node: WorkflowNode | null;
  onNodeDataChange: (nodeId: string, patch: Partial<WorkflowNodeData>) => void;
}

const panelStyle: CSSProperties = {
  width: 320,
  flexShrink: 0,
  padding: 20,
  borderLeft: '1px solid #e5e5e5',
  background: '#fff',
  overflowY: 'auto',
};

const fieldStyle: CSSProperties = {
  display: 'block',
  marginTop: 16,
};

const fieldLabelStyle: CSSProperties = {
  marginBottom: 6,
  fontSize: 13,
  color: '#555',
};

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '6px 8px',
};

export function PropertiesPanel({ node, onNodeDataChange }: PropertiesPanelProps) {
  if (!node) {
    return (
      <aside style={panelStyle}>
        <h3 style={{ marginTop: 0 }}>Properties</h3>
        <p style={{ color: '#777' }}>Select a node to edit it.</p>
      </aside>
    );
  }

  if (node.type === 'llm') {
    return (
      <aside style={panelStyle}>
        <h3 style={{ marginTop: 0 }}>LLM Properties</h3>

        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Name</div>
          <input
            style={inputStyle}
            value={node.data.label ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { label: event.target.value })}
          />
        </label>

        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Model</div>
          <input
            style={inputStyle}
            value={node.data.model ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { model: event.target.value })}
          />
        </label>

        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Prompt</div>
          <textarea
            rows={10}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            value={node.data.prompt ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { prompt: event.target.value })}
          />
        </label>
      </aside>
    );
  }

  return (
    <aside style={panelStyle}>
      <h3 style={{ marginTop: 0 }}>Properties</h3>
      <p>Name: {node.data.label}</p>
      <p>Type: {node.type}</p>
    </aside>
  );
}