export const queryKeys = {
  workflows: {
    all: ['workflows'] as const,
    lists: () => ['workflows', 'list'] as const,
    list: (page: number, pageSize: number, keyword: string) =>
      ['workflows', 'list', { page, pageSize, keyword }] as const,
    detail: (id: string) => ['workflows', 'detail', id] as const,
  },
  llm: {
    providers: ['llm', 'providers'] as const,
  },
  runs: {
    all: ['runs'] as const,
    detail: (runId: string) => ['runs', 'detail', runId] as const,
    workflowHistory: (workflowId: string) => ['runs', 'workflow', workflowId] as const,
  },
};