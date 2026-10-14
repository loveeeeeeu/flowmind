import type { WorkflowVersionDetail } from '../../types/workflow';
import { formatRunTime } from '../execution/runUtils';

interface VersionPreviewBannerProps {
  version: WorkflowVersionDetail | undefined;
  error: Error | null;
  hasUnsavedDraft: boolean;
  onBackToDraft: () => void;
}

export function VersionPreviewBanner({
  version,
  error,
  hasUnsavedDraft,
  onBackToDraft,
}: VersionPreviewBannerProps) {
  return (
    <div className="version-preview-banner" role="status">
      <span className="version-preview-text">
        {error ? (
          <span className="version-preview-error">加载版本失败：{error.message}</span>
        ) : version ? (
          <>
            正在查看已发布的 <strong>v{version.version}</strong>（只读）· 发布于{' '}
            {formatRunTime(version.createdAt)}
          </>
        ) : (
          '正在加载版本…'
        )}
        {hasUnsavedDraft && <span className="version-preview-note">草稿中未保存的修改已保留</span>}
      </span>
      <button type="button" className="subtle-button" onClick={onBackToDraft}>
        返回草稿
      </button>
    </div>
  );
}
