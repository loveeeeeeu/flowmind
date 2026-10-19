import type { ReactNode } from 'react';
import type { NodeExecutionView } from '../execution/runUtils';
import { ExecutionBadge } from '../execution/ExecutionBadge';

interface NodeCardProps {
  icon: string;
  iconClassName: string;
  title: string;
  meta?: ReactNode;
  className?: string;
  execution?: NodeExecutionView | null;
  children?: ReactNode;
}

export function NodeCard({ icon, iconClassName, title, meta, className, execution, children }: NodeCardProps) {
  return (
    <div className={className ? `flow-node ${className}` : 'flow-node'}>
      <div className="flow-node-header">
        <span className={`node-icon ${iconClassName}`}>{icon}</span>
        <span className="flow-node-title">{title}</span>
        <ExecutionBadge execution={execution} />
      </div>
      {meta !== undefined && <div className="flow-node-meta">{meta}</div>}
      {children}
    </div>
  );
}
