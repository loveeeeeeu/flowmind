import { useQuery } from '@tanstack/react-query';
import { getWorkflowVersions } from '../../api/workflow';
import { queryKeys } from '../../api/queryKeys';
import { formatRunTime } from '../execution/runUtils';

interface VersionHistoryProps {
  projectId: string;
  workflowId: string;
  latestVersionId: string | null;
  previewVersionId: string | null;
  onPreview: (versionId: string) => void;
  onClose: () => void;
}

/** Versions only appear through publish, which invalidates this list; no polling needed. */
export function VersionHistory({
  projectId,
  workflowId,
  latestVersionId,
  previewVersionId,
  onPreview,
  onClose,
}: VersionHistoryProps) {
  const versionsQuery = useQuery({
    queryKey: queryKeys.versions.list(projectId, workflowId),
    queryFn: () => getWorkflowVersions(projectId, workflowId),
  });

  return (
    <aside className="version-drawer" aria-label="版本历史">
      <header className="version-drawer-header">
        <h3>版本历史</h3>
        <button type="button" className="execution-toggle" onClick={onClose}>
          关闭
        </button>
      </header>
      <p className="version-drawer-hint">点击版本以只读方式查看当时的画布</p>

      {versionsQuery.isLoading && <p className="execution-empty">正在加载版本…</p>}
      {versionsQuery.error && (
        <p className="error-message">加载版本失败：{versionsQuery.error.message}</p>
      )}
      {versionsQuery.data?.length === 0 && (
        <p className="execution-empty">还没有发布过版本</p>
      )}

      {versionsQuery.data && versionsQuery.data.length > 0 && (
        <ul className="version-list">
          {versionsQuery.data.map((version) => (
            <li key={version.id}>
              <button
                type="button"
                className={`version-item ${version.id === previewVersionId ? 'active' : ''}`}
                onClick={() => onPreview(version.id)}
              >
                <span className="version-item-head">
                  <strong>v{version.version}</strong>
                  {version.id === latestVersionId && (
                    <span className="version-current-tag">当前发布</span>
                  )}
                </span>
                <span className="version-item-meta">
                  {formatRunTime(version.createdAt)} · 草稿修订 #{version.draftRevision}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
