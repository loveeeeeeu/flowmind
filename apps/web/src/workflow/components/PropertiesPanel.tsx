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
import { LlmProperties } from './LlmProperties';
import { KnowledgeRetrieverProperties } from './KnowledgeRetrieverProperties';
import { Field } from './PanelField';

interface PropertiesPanelProps {
  projectId: string;
  node: WorkflowNode | null;
  onNodeDataChange: (nodeId: string, patch: Partial<WorkflowNodeData>) => void;
  /** Replaces data wholesale, for edits that must remove keys (e.g. legacy LLM fields). */
  onNodeDataReplace: (nodeId: string, data: WorkflowNodeData) => void;
  onDeleteNode: (nodeId: string) => void;
}

function DeleteNodeButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="panel-delete-button" onClick={onClick}>
      删除节点
    </button>
  );
}

function toOptionalNumber(value: string) {
  return value === '' ? undefined : Number(value);
}

export function PropertiesPanel({
  projectId,
  node,
  onNodeDataChange,
  onNodeDataReplace,
  onDeleteNode,
}: PropertiesPanelProps) {
  if (!node) {
    return (
      <aside className="properties-panel">
        <h3>节点配置</h3>
        <p className="panel-text">选择画布中的节点以编辑配置。</p>
      </aside>
    );
  }

  const labelField = (
    <Field label="节点名称">
      <input
        value={node.data.label ?? ''}
        onChange={(event) => onNodeDataChange(node.id, { label: event.target.value })}
      />
    </Field>
  );

  if (node.type === 'llm') {
    return (
      <aside className="properties-panel">
        <h3>LLM 调用</h3>
        {labelField}

        <LlmProperties
          node={node}
          onNodeDataChange={onNodeDataChange}
          onNodeDataReplace={onNodeDataReplace}
        />

        <DeleteNodeButton onClick={() => onDeleteNode(node.id)} />
      </aside>
    );
  }

  if (node.type === 'knowledgeRetriever') {
    return (
      <aside className="properties-panel">
        <h3>Knowledge Retriever</h3>
        {labelField}
        <KnowledgeRetrieverProperties projectId={projectId} node={node} onNodeDataChange={onNodeDataChange} />
        <DeleteNodeButton onClick={() => onDeleteNode(node.id)} />
      </aside>
    );
  }

  if (node.type === 'code') {
    return (
      <aside className="properties-panel">
        <h3>代码执行</h3>
        {labelField}

        <Field label="输入变量">
          <input
            placeholder="order 或 response.data"
            value={node.data.inputPath ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { inputPath: event.target.value })}
          />
        </Field>

        <Field label="代码（JavaScript）">
          <textarea
            rows={14}
            spellCheck={false}
            className="code-input"
            value={node.data.code ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { code: event.target.value })}
          />
        </Field>

        <Field label="输出变量">
          <input
            placeholder="calculation"
            value={node.data.outputVariable ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { outputVariable: event.target.value })}
          />
        </Field>

        <Field label="超时时间（毫秒，50 ~ 5000）">
          <input
            type="number"
            min={50}
            max={5000}
            step={50}
            placeholder="1000"
            value={node.data.timeoutMs ?? ''}
            onChange={(event) =>
              onNodeDataChange(node.id, { timeoutMs: toOptionalNumber(event.target.value) })
            }
          />
        </Field>

        <p className="panel-hint">
          通过 <code>input</code> 读取输入，用 <code>return</code> 返回可转成 JSON 的值。支持{' '}
          <code>await</code>，不能使用 require、process 等 Node API。
        </p>

        <DeleteNodeButton onClick={() => onDeleteNode(node.id)} />
      </aside>
    );
  }

  if (node.type === 'loop') {
    return (
      <aside className="properties-panel">
        <h3>循环</h3>
        {labelField}

        <Field label="迭代数组（变量路径）">
          <input
            placeholder="items 或 response.data.users"
            value={node.data.itemsPath ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { itemsPath: event.target.value })}
          />
        </Field>

        <Field label="当前项变量">
          <input
            placeholder="item"
            value={node.data.itemVariable ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { itemVariable: event.target.value })}
          />
        </Field>

        <Field label="索引变量">
          <input
            placeholder="index"
            value={node.data.indexVariable ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { indexVariable: event.target.value })}
          />
        </Field>

        <p className="panel-hint">
          把“循环体”连到循环内的第一个节点，循环内最后一个节点连回底部的“回到循环”；“完成”连到循环结束后要执行的节点。
        </p>

        <DeleteNodeButton onClick={() => onDeleteNode(node.id)} />
      </aside>
    );
  }

  if (node.type === 'if') {
    return (
      <aside className="properties-panel">
        <h3>条件分支</h3>
        {labelField}

        <Field label="条件变量">
          <input
            placeholder="score 或 response.data.score"
            value={node.data.variable ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { variable: event.target.value })}
          />
        </Field>

        <Field label="运算符">
          <select
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
        </Field>

        <Field label="值类型">
          <select
            value={node.data.valueType}
            onChange={(event) =>
              onNodeDataChange(node.id, { valueType: event.target.value as ConditionValueType })
            }
          >
            <option value="string">字符串</option>
            <option value="number">数字</option>
            <option value="boolean">布尔</option>
          </select>
        </Field>

        <Field label="比较值">
          <input
            placeholder="60"
            value={node.data.value ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { value: event.target.value })}
          />
        </Field>

        <p className="panel-hint">
          &gt; / &gt;= / &lt; / &lt;= 需要值类型为“数字”。运行前请同时连接 IF 和 ELSE 两个分支。
        </p>

        <DeleteNodeButton onClick={() => onDeleteNode(node.id)} />
      </aside>
    );
  }

  if (node.type === 'http') {
    return (
      <aside className="properties-panel">
        <h3>HTTP 请求</h3>
        {labelField}

        <Field label="请求方法">
          <select
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
        </Field>

        <Field label="请求地址">
          <input
            placeholder="https://example.com/users/{{userId}}"
            value={node.data.url ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { url: event.target.value })}
          />
        </Field>

        <Field label="请求头（JSON）">
          <JsonObjectEditor
            key={node.id}
            value={node.data.headers ?? {}}
            onChange={(headers) => onNodeDataChange(node.id, { headers })}
          />
        </Field>

        <Field label="请求体（仅 POST / PUT / PATCH）">
          <textarea
            rows={8}
            spellCheck={false}
            placeholder={'{"message": "{{prompt}}"}'}
            value={node.data.body ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { body: event.target.value })}
          />
        </Field>

        <Field label="超时时间（毫秒，最大 60000）">
          <input
            type="number"
            min={1}
            max={60000}
            placeholder="10000"
            value={node.data.timeoutMs ?? ''}
            onChange={(event) =>
              onNodeDataChange(node.id, { timeoutMs: toOptionalNumber(event.target.value) })
            }
          />
        </Field>

        <Field label="输出变量">
          <input
            placeholder="response"
            value={node.data.outputVariable ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { outputVariable: event.target.value })}
          />
        </Field>

        <DeleteNodeButton onClick={() => onDeleteNode(node.id)} />
      </aside>
    );
  }

  if (node.type === 'template') {
    return (
      <aside className="properties-panel">
        <h3>模板</h3>
        {labelField}

        <Field label="模板内容">
          <textarea
            rows={8}
            placeholder="你好 {{name}}"
            value={node.data.template ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { template: event.target.value })}
          />
        </Field>

        <Field label="输出变量">
          <input
            placeholder="result"
            value={node.data.outputVariable ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { outputVariable: event.target.value })}
          />
        </Field>

        <DeleteNodeButton onClick={() => onDeleteNode(node.id)} />
      </aside>
    );
  }

  if (node.type === 'variable') {
    const isReference = node.data.sourceType === 'reference';

    return (
      <aside className="properties-panel">
        <h3>变量</h3>
        {labelField}

        <Field label="变量名">
          <input
            value={node.data.variableName ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { variableName: event.target.value })}
          />
        </Field>

        <Field label="赋值方式">
          <select
            value={node.data.sourceType ?? 'literal'}
            onChange={(event) =>
              onNodeDataChange(node.id, { sourceType: event.target.value as VariableSourceType })
            }
          >
            <option value="literal">固定值</option>
            <option value="reference">引用变量</option>
          </select>
        </Field>

        <Field label={isReference ? '变量路径' : '值'}>
          <input
            placeholder={isReference ? 'response.data.user.name' : 'FlowMind'}
            value={String(node.data.value ?? '')}
            onChange={(event) => onNodeDataChange(node.id, { value: event.target.value })}
          />
        </Field>

        {isReference && (
          <p className="panel-hint">
            只填路径，不需要 <code>{'{{ }}'}</code>。数组元素用 <code>users.0.name</code> 这种写法。
          </p>
        )}

        <DeleteNodeButton onClick={() => onDeleteNode(node.id)} />
      </aside>
    );
  }

  if (node.type === 'end') {
    return (
      <aside className="properties-panel">
        <h3>结束</h3>

        <Field label="输出变量">
          <input
            placeholder="result"
            value={node.data.outputVariable ?? ''}
            onChange={(event) => onNodeDataChange(node.id, { outputVariable: event.target.value })}
          />
        </Field>

        <p className="panel-hint">结束节点不能删除。</p>
      </aside>
    );
  }

  return (
    <aside className="properties-panel">
      <h3>开始</h3>
      <p className="panel-text">节点名称：{node.data.label}</p>
      <p className="panel-hint">开始节点不能删除。运行时填写的输入会作为变量传给后续节点。</p>
    </aside>
  );
}
