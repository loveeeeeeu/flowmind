export const queryKeys = {
    workflows: {
      all: ['workflows'] as const,
      lists: () => ['workflows', 'list'] as const,
      list: (page: number, pageSize: number, keyword: string) =>
        ['workflows', 'list', { page, pageSize, keyword }] as const,
      detail: (id: string) => ['workflows', 'detail', id] as const,
    },
  };