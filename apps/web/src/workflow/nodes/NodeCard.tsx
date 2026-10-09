import type { ReactNode } from 'react';

interface NodeCardProps {
  icon: string;
  iconClassName: string;
  title: string;
  meta?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function NodeCard({ icon, iconClassName, title, meta, className, children }: NodeCardProps) {
  return (
    <div className={className ? `flow-node ${className}` : 'flow-node'}>
      <div className="flow-node-header">
        <span className={`node-icon ${iconClassName}`}>{icon}</span>
        <span className="flow-node-title">{title}</span>
      </div>
      {meta !== undefined && <div className="flow-node-meta">{meta}</div>}
      {children}
    </div>
  );
}
