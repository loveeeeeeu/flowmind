import type { CSSProperties } from 'react';
import type { LlmProviderInfo } from '../../api/llm';
import {
  CONDITION_OPERATORS,
  HTTP_METHODS,
  type ConditionOperator,
  type ConditionValueType,
  type HttpMethod,
  type WorkflowNode,
  type WorkflowNodeData,
  type VariableSourceType,
} from '../types/workflowCanvas';
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

  if (node.type === 'code') {
    return (
      <aside style={panelStyle}>
        <h3 style={{ marginTop: 0 }}>Code Properties</h3>

        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Name</div>
          <input
            style={inputStyle}
            value={node.data.label ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { label: event.target.value })}
          />
        </label>

        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Input Variable Path</div>
          <input
            style={inputStyle}
            placeholder="order or response.data"
            value={node.data.inputPath ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { inputPath: event.target.value })}
          />
        </label>

        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>JavaScript</div>
          <textarea
            rows={14}
            spellCheck={false}
            style={{ ...textareaStyle, fontFamily: 'monospace', fontSize: 13 }}
            value={node.data.code ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { code: event.target.value })}
          />
        </label>

        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Output Variable</div>
          <input
            style={inputStyle}
            placeholder="calculation"
            value={node.data.outputVariable ?? ''}
            onChange={(event) =>
              onNodeDataChange(node.id, { outputVariable: event.target.value })
            }
          />
        </label>

        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Timeout (ms, 50 ~ 5000)</div>
          <input
            type="number"
            min={50}
            max={5000}
            step={50}
            style={inputStyle}
            placeholder="1000"
            value={node.data.timeoutMs ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              onNodeDataChange(node.id, { timeoutMs: value === '' ? undefined : Number(value) });
            }}
          />
        </label>

        <p style={{ fontSize: 13, color: '#777' }}>
          Read the input value from <code>input</code> and <code>return</code> a JSON-compatible
          value. <code>await</code> is supported; Node APIs like require and process are not
          available.
        </p>

        <DeleteNodeButton onClick={() => onDeleteNode(node.id)} />
      </aside>
    );
  }

  if (node.type === 'loop') {
    return (
      <aside style={panelStyle}>
        <h3 style={{ marginTop: 0 }}>Loop Properties</h3>

        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Name</div>
          <input
            style={inputStyle}
            value={node.data.label ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { label: event.target.value })}
          />
        </label>

        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Items Variable Path</div>
          <input
            style={inputStyle}
            placeholder="items or response.data.users"
            value={node.data.itemsPath ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { itemsPath: event.target.value })}
          />
        </label>

        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Item Variable</div>
          <input
            style={inputStyle}
            placeholder="item"
            value={node.data.itemVariable ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { itemVariable: event.target.value })}
          />
        </label>

        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Index Variable</div>
          <input
            style={inputStyle}
            placeholder="index"
            value={node.data.indexVariable ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { indexVariable: event.target.value })}
          />
        </label>

        <p style={{ fontSize: 13, color: '#777' }}>
          Connect "body" to the first body node, and the last body node back to the bottom
          "loop" handle. Connect "done" to what runs after the loop.
        </p>

        <DeleteNodeButton onClick={() => onDeleteNode(node.id)} />
      </aside>
    );
  }

  if (node.type === 'if') {
    return (
      <aside style={panelStyle}>
        <h3 style={{ marginTop: 0 }}>IF Properties</h3>

        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Name</div>
          <input
            style={inputStyle}
            value={node.data.label ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { label: event.target.value })}
          />
        </label>

        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Variable</div>
          <input
            style={inputStyle}
            placeholder="score or response.data.score"
            value={node.data.variable ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { variable: event.target.value })}
          />
        </label>

        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Operator</div>
          <select
            style={inputStyle}
            value={node.data.operator}
            onChange={(event) =>
              onNodeDataChange(node.id, { operator: event.target.value as ConditionOperator })
            }
          >
            {CONDITION_OPERATORS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Value Type</div>
          <select
            style={inputStyle}
            value={node.data.valueType}
            onChange={(event) =>
              onNodeDataChange(node.id, { valueType: event.target.value as ConditionValueType })
            }
          >
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
          </select>
        </label>

        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>Value</div>
          <input
            style={inputStyle}
            placeholder="60"
            value={node.data.value ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { value: event.target.value })}
          />
        </label>

        <p style={{ fontSize: 13, color: '#777' }}>
          &gt; / &gt;= / &lt; / &lt;= require Value Type "number". Connect both the true and
          false handles before running.
        </p>

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
    const isReference = node.data.sourceType === 'reference';
  
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
          <div style={fieldLabelStyle}>Source Type</div>
          <select
            style={inputStyle}
            value={node.data.sourceType ?? 'literal'}
            onChange={(event) =>
              onNodeDataChange(node.id, {
                sourceType: event.target.value as VariableSourceType,
              })
            }
          >
            <option value="literal">Literal</option>
            <option value="reference">Variable Reference</option>
          </select>
        </label>
  
        <label style={fieldStyle}>
          <div style={fieldLabelStyle}>{isReference ? 'Variable Path' : 'Value'}</div>
          <input
            style={inputStyle}
            placeholder={isReference ? 'response.data.user.name' : 'FlowMind'}
            value={String(node.data.value ?? '')}
            onChange={(event) => onNodeDataChange(node.id, { value: event.target.value })}
          />
        </label>
  
        {isReference && (
          <p style={{ fontSize: 13, color: '#777' }}>
            Path only, without {'{{ }}'}. Use users.0.name for arrays.
          </p>
        )}
  
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