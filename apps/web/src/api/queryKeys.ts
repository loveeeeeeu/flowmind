export const queryKeys = {
  projectMembers: {
    list: (projectId: string) => ['project-members', projectId, 'list'] as const,
  },
  workflows: {
    all: (projectId: string) => ['workflows', projectId] as const,
    lists: (projectId: string) => ['workflows', projectId, 'list'] as const,
    list: (projectId: string, page: number, pageSize: number, keyword: string) =>
      ['workflows', projectId, 'list', { page, pageSize, keyword }] as const,
    detail: (projectId: string, id: string) => ['workflows', projectId, 'detail', id] as const,
  },
  // Outside the workflow detail key: invalidating the detail after every save must not refetch
  // immutable version snapshots.
  versions: {
    list: (projectId: string, workflowId: string) => ['workflowVersions', projectId, workflowId, 'list'] as const,
    detail: (projectId: string, workflowId: string, versionId: string) =>
      ['workflowVersions', projectId, workflowId, 'detail', versionId] as const,
  },
  apiKeys: {
    list: (projectId: string, workflowId: string) => ['workflowApiKeys', projectId, workflowId] as const,
  },
  credentials: {
    list: (projectId: string) => ['credentials', projectId, 'list'] as const,
    // Live provider data: fetched only while the import dialog is open, never cached.
    remoteModels: (projectId: string, credentialId: string) => ['credentials', projectId, credentialId, 'remote-models'] as const,
  },
  // Invalidate `all` after any model write or credential revoke: `available` depends on both.
  models: {
    all: (projectId: string) => ['models', projectId] as const,
    byCredential: (projectId: string, credentialId: string) => ['models', projectId, 'credential', credentialId] as const,
    available: (projectId: string) => ['models', projectId, 'available'] as const,
    detail: (projectId: string, id: string) => ['models', projectId, 'detail', id] as const,
  },
  knowledgeBases: {
    list: (projectId: string) => ['knowledge-bases', projectId, 'list'] as const,
    detail: (projectId: string, knowledgeBaseId: string) => ['knowledge-bases', projectId, 'detail', knowledgeBaseId] as const,
    documents: (projectId: string, knowledgeBaseId: string) => ['knowledge-bases', projectId, knowledgeBaseId, 'documents'] as const,
    chunks: (projectId: string, knowledgeBaseId: string, documentId: string) => ['knowledge-bases', projectId, knowledgeBaseId, 'documents', documentId, 'chunks'] as const,
  },
  runs: {
    all: ['runs'] as const,
    detail: (projectId: string, runId: string) => ['runs', projectId, 'detail', runId] as const,
    // Status is part of the key so a status change (e.g. RUNNING -> SUCCESS) triggers one more
    // fetch after polling stops, picking up the final "运行成功/运行失败" entry.
    logs: (projectId: string, runId: string) => ['runs', projectId, 'detail', runId, 'logs'] as const,
    workflowHistory: (projectId: string, workflowId: string) => ['runs', projectId, 'workflow', workflowId] as const,
  },
  nodeRuns: {
    detail: (projectId: string, runId: string, nodeRunId: string) =>
      ['node-runs', projectId, runId, nodeRunId] as const,
  },
};
