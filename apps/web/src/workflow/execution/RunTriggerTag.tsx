import type { WorkflowRunSummary } from '../../types/run';

interface RunTriggerTagProps {
  run: Pick<WorkflowRunSummary, 'workflowApiKey'>;
}

/** Marks runs triggered through the external API; editor runs show nothing. */
export function RunTriggerTag({ run }: RunTriggerTagProps) {
  if (!run.workflowApiKey) {
    return null;
  }

  const { name, prefix } = run.workflowApiKey;

  return (
    <span className="run-trigger-tag" title={`通过 API 密钥「${name}」（fm_${prefix}_…）调用`}>
      API
    </span>
  );
}
