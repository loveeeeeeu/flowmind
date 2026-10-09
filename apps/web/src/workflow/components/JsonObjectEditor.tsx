import { useState } from 'react';

interface JsonObjectEditorProps {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  rows?: number;
  className?: string;
}

export function JsonObjectEditor({ value, onChange, rows = 6, className }: JsonObjectEditorProps) {
  const [draft, setDraft] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);

  function handleChange(text: string) {
    setDraft(text);

    try {
      const parsed: unknown = JSON.parse(text);

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setError('必须是 JSON 对象');
        return;
      }

      setError(null);
      onChange(parsed as Record<string, string>);
    } catch {
      setError('JSON 格式错误');
    }
  }

  return (
    <>
      <textarea
        rows={rows}
        className={className}
        spellCheck={false}
        value={draft}
        onChange={(event) => handleChange(event.target.value)}
      />
      {error && <div className="panel-field-error">{error}</div>}
    </>
  );
}
