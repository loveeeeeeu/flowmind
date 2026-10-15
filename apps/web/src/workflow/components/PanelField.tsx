import type { ReactNode } from 'react';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="panel-field">
      <div className="panel-field-label">{label}</div>
      {children}
    </label>
  );
}
