interface NodeLibraryProps {
  onAddLlm: () => void;
  onAddTemplate: () => void;
  onAddVariable: () => void;
  onAddHttp: () => void;
  onAddIf: () => void;
  onAddLoop: () => void;
  onAddCode: () => void;
}

export function NodeLibrary({
  onAddLlm,
  onAddTemplate,
  onAddVariable,
  onAddHttp,
  onAddIf,
  onAddLoop,
  onAddCode,
}: NodeLibraryProps) {
  return (
    <aside className="node-library">
      <div className="node-library-heading">
        <h3>节点</h3>
        <span>拖入或点击添加</span>
      </div>

      <p className="node-group">AI</p>
      <button type="button" onClick={onAddLlm}><span className="node-icon ai">✦</span>LLM</button>
      <button type="button" onClick={onAddTemplate}><span className="node-icon template">T</span>模板</button>

      <p className="node-group">流程控制</p>
      <button type="button" onClick={onAddVariable}><span className="node-icon variable">{'{}'}</span>变量</button>
      <button type="button" onClick={onAddIf}><span className="node-icon condition">⌘</span>条件分支</button>
      <button type="button" onClick={onAddLoop}><span className="node-icon loop">↻</span>循环</button>

      <p className="node-group">工具</p>
      <button type="button" onClick={onAddHttp}><span className="node-icon http">↗</span>HTTP 请求</button>
      <button type="button" onClick={onAddCode}><span className="node-icon code">›_</span>代码执行</button>
    </aside>
  );
}
