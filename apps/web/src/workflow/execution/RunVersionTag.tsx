import type { WorkflowRunSummary } from '../../types/run';

interface RunVersionTagProps {
  run: Pick<WorkflowRunSummary, 'source' | 'workflowVersion'>;
}

/** What a run executed: a draft snapshot, a published version, or (legacy) nothing recorded. */
export function RunVersionTag({ run }: RunVersionTagProps) {
  if (run.source === 'DRAFT') {
    return (
      <span className="run-version-tag draft" title="测试草稿：执行的是点击测试时的画布快照">
        测试
      </span>
    );
  }

  if (!run.workflowVersion) {
    return (
      <span className="run-version-tag legacy" title="版本化之前创建的运行，没有绑定发布版本">
        旧版运行
      </span>
    );
  }

  return (
    <span className="run-version-tag" title="这次运行执行的发布版本快照；在运行详情中点击“查看”可预览该版本画布">
      v{run.workflowVersion.version}
    </span>
  );
}
