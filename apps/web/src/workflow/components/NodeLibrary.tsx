interface NodeLibraryProps {
  /** Read-only version preview: nothing may be added. */
  disabled?: boolean;
  onAddLlm: () => void;
  onAddTemplate: () => void;
  onAddVariable: () => void;
  onAddHttp: () => void;
  onAddIf: () => void;
  onAddLoop: () => void;
  onAddCode: () => void;
  onAddKnowledgeRetriever: () => void;
}

export function NodeLibrary({
  disabled = false,
  onAddLlm,
  onAddTemplate,
  onAddVariable,
  onAddHttp,
  onAddIf,
  onAddLoop,
  onAddCode,
  onAddKnowledgeRetriever,
}: NodeLibraryProps) {
  return (
    <aside className={`node-library ${disabled ? 'disabled' : ''}`}>
      <div className="node-library-heading">
        <h3>节点</h3>
        <span>{disabled ? '只读预览' : '拖入或点击添加'}</span>
      </div>

      <p className="node-group">AI</p>
      <button type="button" disabled={disabled} onClick={onAddKnowledgeRetriever}><span className="node-icon knowledge">⌕</span>Knowledge Retriever</button>
      <button type="button" disabled={disabled} onClick={onAddLlm}><span className="node-icon ai">✦</span>LLM</button>
      <button type="button" disabled={disabled} onClick={onAddTemplate}><span className="node-icon template">T</span>模板</button>

      <p className="node-group">流程控制</p>
      <button type="button" disabled={disabled} onClick={onAddVariable}><span className="node-icon variable">{'{}'}</span>变量</button>
      <button type="button" disabled={disabled} onClick={onAddIf}><span className="node-icon condition">⌘</span>条件分支</button>
      <button type="button" disabled={disabled} onClick={onAddLoop}><span className="node-icon loop">↻</span>循环</button>

      <p className="node-group">工具</p>
      <button type="button" disabled={disabled} onClick={onAddHttp}><span className="node-icon http">↗</span>HTTP 请求</button>
      <button type="button" disabled={disabled} onClick={onAddCode}><span className="node-icon code">›_</span>代码执行</button>
    </aside>
  );
}
