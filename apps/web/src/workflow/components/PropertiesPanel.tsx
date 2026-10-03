import type { CSSProperties } from 'react';
import type { LlmProviderInfo } from '../../api/llm';
import { HTTP_METHODS, type HttpMethod, type WorkflowNode, type WorkflowNodeData } from '../types/workflowCanvas';
import { JsonObjectEditor } from './JsonObjectEditor';

interface PropertiesPanelProps {
  node: WorkflowNode | null;
  providers: LlmProviderInfo[];
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

export function PropertiesPanel({
  node,
  providers,
  onNodeDataChange,
  onDeleteNode,
}: PropertiesPanelProps) {
  if (!node) {
    return (
      <aside style={panelStyle}>
        <h3 style={{ marginTop: 0 }}>Properties</h3>
        <p style={{ color: '#777' }}>Select a node to edit it.</p>
      </aside>
    );
  }

  if (node.type === 'llm') {
    const currentProvider = node.data.provider ?? '';
    const isUnknownProvider =
      currentProvider !== '' && !providers.some((provider) => provider.id === currentProvider);
  
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
          <div style={fieldLabelStyle}>Provider</div>
          <select
            style={inputStyle}
            value={currentProvider}
            onChange={(event) => onNodeDataChange(node.id, { provider: event.target.value })}
          >
            <option value="" disabled>
              Select provider
            </option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.id}
              </option>
            ))}
            {isUnknownProvider && (
              <option value={currentProvider}>{currentProvider} (not configured)</option>
            )}
          </select>
        </label>
  
        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Model</div>
          <input
            style={inputStyle}
            placeholder="deepseek-flash"
            value={node.data.model ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { model: event.target.value })}
          />
        </label>
  
        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>System Prompt</div>
          <textarea
            rows={4}
            style={textareaStyle}
            placeholder="You are a helpful assistant."
            value={node.data.systemPrompt ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { systemPrompt: event.target.value })}
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
  
        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Temperature (0 ~ 2)</div>
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            style={inputStyle}
            placeholder="0.7"
            value={node.data.temperature ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              onNodeDataChange(node.id, { temperature: value === '' ? undefined : Number(value) });
            }}
          />
        </label>
  
        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Output Variable</div>
          <input
            style={inputStyle}
            placeholder="answer"
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

  if (node.type === 'http') {
    return (
      <aside style={panelStyle}>
        <h3 style={{ marginTop: 0 }}>HTTP Properties</h3>
  
        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Name</div>
          <input
            style={inputStyle}
            value={node.data.label ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { label: event.target.value })}
          />
        </label>
  
        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Method</div>
          <select
            style={inputStyle}
            value={node.data.method}
            onChange={(event) =>
              onNodeDataChange(node.id, { method: event.target.value as HttpMethod })
            }
          >
            {HTTP_METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </label>
  
        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>URL</div>
          <input
            style={inputStyle}
            placeholder="https://example.com/users/{{userId}}"
            value={node.data.url ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { url: event.target.value })}
          />
        </label>
  
        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Headers (JSON)</div>
          <JsonObjectEditor
            key={node.id}
            style={textareaStyle}
            value={node.data.headers ?? {}}
            onChange={(headers) => onNodeDataChange(node.id, { headers })}
          />
        </label>
  
        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Body (only for POST / PUT / PATCH)</div>
          <textarea
            rows={8}
            style={textareaStyle}
            placeholder={'{"message": "{{prompt}}"}'}
            value={node.data.body ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { body: event.target.value })}
          />
        </label>
  
        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Timeout (ms, max 60000)</div>
          <input
            type="number"
            min={1}
            max={60000}
            style={inputStyle}
            placeholder="10000"
            value={node.data.timeoutMs ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              onNodeDataChange(node.id, { timeoutMs: value === '' ? undefined : Number(value) });
            }}
          />
        </label>
  
        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Output Variable</div>
          <input
            style={inputStyle}
            placeholder="response"
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