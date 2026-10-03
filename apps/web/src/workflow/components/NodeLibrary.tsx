interface NodeLibraryProps {
  onAddLlm: () => void;
  onAddTemplate: () => void;
  onAddVariable: () => void;
  onAddHttp: () => void;
}

export function NodeLibrary({ onAddLlm, onAddTemplate, onAddVariable, onAddHttp }: NodeLibraryProps) {
  return (
    <aside
      style={{
        width: 200,
        flexShrink: 0,
        padding: 16,
        borderRight: '1px solid #e5e5e5',
        background: '#fff',
      }}
    >
      <h3 style={{ marginTop: 0 }}>Nodes</h3>

      <button onClick={onAddLlm} style={{ width: '100%', padding: 10, textAlign: 'left' }}>
        + LLM
      </button>

      <button
        onClick={onAddTemplate}
        style={{ width: '100%', padding: 10, marginTop: 8, textAlign: 'left' }}
      >
        + Template
      </button>

      <button
        onClick={onAddVariable}
        style={{ width: '100%', padding: 10, marginTop: 8, textAlign: 'left' }}
      >
        + Variable
      </button>

      <button
        onClick={onAddHttp}
        style={{ width: '100%', padding: 10, marginTop: 8, textAlign: 'left' }}
      >
        + HTTP
      </button>
    </aside>
  );
}