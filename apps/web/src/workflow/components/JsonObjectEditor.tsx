import { useState, type CSSProperties } from 'react';

interface JsonObjectEditorProps {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  rows?: number;
  style?: CSSProperties;
}

export function JsonObjectEditor({ value, onChange, rows = 6, style }: JsonObjectEditorProps) {
  const [draft, setDraft] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);

  function handleChange(text: string) {
    setDraft(text);

    try {
      const parsed: unknown = JSON.parse(text);

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setError('Must be a JSON object');
        return;
      }

      setError(null);
      onChange(parsed as Record<string, string>);
    } catch {
      setError('Invalid JSON');
    }
  }

  return (
    <>
      <textarea
        rows={rows}
        style={style}
        value={draft}
        onChange={(event) => handleChange(event.target.value)}
      />
      {error && <div style={{ marginTop: 4, fontSize: 12, color: '#b91c1c' }}>{error}</div>}
    </>
  );
}