import type { CSSProperties } from 'react';
import type { WorkflowNode, WorkflowNodeData } from '../types/workflowCanvas';

interface PropertiesPanelProps {
  node: WorkflowNode | null;
  onNodeDataChange: (nodeId: string, patch: Partial<WorkflowNodeData>) => void;
  onDeleteNode: (nodeId: string) => void;
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

const textareaStyle: CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
  fontFamily: 'inherit',
};

function DeleteNodeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        marginTop: 24,
        width: '100%',
        padding: 8,
        color: '#b91c1c',
        border: '1px solid #fca5a5',
        background: '#fff',
        cursor: 'pointer',
      }}
    >
      Delete Node
    </button>
  );
}

export function PropertiesPanel({ node, onNodeDataChange, onDeleteNode }: PropertiesPanelProps) {
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
            style={textareaStyle}
            value={node.data.prompt ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { prompt: event.target.value })}
          />
        </label>

        <DeleteNodeButton onClick={() => onDeleteNode(node.id)} />
      </aside>
    );
  }

  if (node.type === 'template') {
    return (
      <aside style={panelStyle}>
        <h3 style={{ marginTop: 0 }}>Template Properties</h3>

        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Name</div>
          <input
            style={inputStyle}
            value={node.data.label ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { label: event.target.value })}
          />
        </label>

        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Template</div>
          <textarea
            rows={8}
            style={textareaStyle}
            placeholder="Hello {{name}}"
            value={node.data.template ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { template: event.target.value })}
          />
        </label>

        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Output Variable</div>
          <input
            style={inputStyle}
            placeholder="result"
            value={node.data.outputVariable ?? ''}
            onChange={(event) =>
              onNodeDataChange(node.id, { outputVariable: event.target.value })
            }
          />
        </label>

        <DeleteNodeButton onClick={() => onDeleteNode(node.id)} />
      </aside>
    );
  }

  if (node.type === 'variable') {
    return (
      <aside style={panelStyle}>
        <h3 style={{ marginTop: 0 }}>Variable Properties</h3>
  
        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Name</div>
          <input
            style={inputStyle}
            value={node.data.label ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { label: event.target.value })}
          />
        </label>
  
        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Variable Name</div>
          <input
            style={inputStyle}
            value={node.data.variableName ?? ''}
            onChange={(event) =>
              onNodeDataChange(node.id, { variableName: event.target.value })
            }
          />
        </label>
  
        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Value</div>
          <input
            style={inputStyle}
            value={String(node.data.value ?? '')}
            onChange={(event) => onNodeDataChange(node.id, { value: event.target.value })}
          />
        </label>
  
        <DeleteNodeButton onClick={() => onDeleteNode(node.id)} />
      </aside>
    );
  }
  
  if (node.type === 'end') {
    return (
      <aside style={panelStyle}>
        <h3 style={{ marginTop: 0 }}>End Properties</h3>

        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Output Variable</div>
          <input
            style={inputStyle}
            placeholder="result"
            value={node.data.outputVariable ?? ''}
            onChange={(event) =>
              onNodeDataChange(node.id, { outputVariable: event.target.value })
            }
          />
        </label>

        <p style={{ fontSize: 13, color: '#777' }}>End node cannot be deleted.</p>
      </aside>
    );
  }

  return (
    <aside style={panelStyle}>
      <h3 style={{ marginTop: 0 }}>Properties</h3>
      <p>Name: {node.data.label}</p>
      <p>Type: {node.type}</p>
      <p style={{ fontSize: 13, color: '#777' }}>Start node cannot be deleted.</p>
    </aside>
  );
}