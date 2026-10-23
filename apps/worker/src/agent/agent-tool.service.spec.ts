import { describe, expect, it, vi } from 'vitest';
import { AgentToolService } from './agent-tool.service.js';

describe('AgentToolService security boundary', () => {
  it('throws instead of returning an observation when a call is not in the allowed tool set', async () => {
    const catalog = {
      listForProject: vi.fn(async () => ({
        tools: [{ definition: { name: 'search_knowledge', source: 'BUILT_IN' } }],
        warnings: [],
      })),
    };
    const service = new AgentToolService(catalog as never, { execute: vi.fn() } as never);

    await expect(service.execute({
      projectId: 'project-a',
      workflowCallDepth: 0,
      allowedToolNames: ['search_knowledge'],
      call: { id: 'call-1', name: 'run_workflow', arguments: {} },
    })).rejects.toMatchObject({ code: 'TOOL_NOT_ALLOWED', retryable: false });
  });
});
