export const queryKeys = {
  workflows: {
    all: ['workflows'] as const,
    lists: () => ['workflows', 'list'] as const,
    list: (page: number, pageSize: number, keyword: string) =>
      ['workflows', 'list', { page, pageSize, keyword }] as const,
    detail: (id: string) => ['workflows', 'detail', id] as const,
  },
  // Outside the workflow detail key: invalidating the detail after every save must not refetch
  // immutable version snapshots.
  versions: {
    list: (workflowId: string) => ['workflowVersions', workflowId, 'list'] as const,
    detail: (workflowId: string, versionId: string) =>
      ['workflowVersions', workflowId, 'detail', versionId] as const,
  },
  apiKeys: {
    list: (workflowId: string) => ['workflowApiKeys', workflowId] as const,
  },
  credentials: {
    list: ['credentials', 'list'] as const,
  },
  // Invalidate `all` after any model write or credential revoke: `available` depends on both.
  models: {
    all: ['models'] as const,
    byCredential: (credentialId: string) => ['models', 'credential', credentialId] as const,
    available: ['models', 'available'] as const,
    detail: (id: string) => ['models', 'detail', id] as const,
  },
  runs: {
    all: ['runs'] as const,
    detail: (runId: string) => ['runs', 'detail', runId] as const,
    // Status is part of the key so a status change (e.g. RUNNING -> SUCCESS) triggers one more
    // fetch after polling stops, picking up the final "运行成功/运行失败" entry.
    logs: (runId: string, status: string) => ['runs', 'detail', runId, 'logs', status] as const,
    workflowHistory: (workflowId: string) => ['runs', 'workflow', workflowId] as const,
  },
};