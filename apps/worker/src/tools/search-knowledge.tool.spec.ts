import type { KnowledgeRetrieverPort } from '@flowmind/workflow-core';
import { SearchKnowledgeTool } from './search-knowledge.tool.js';

describe('SearchKnowledgeTool', () => {
  it('uses only trusted context.projectId and forwards validated model arguments to the existing retriever', async () => {
    const retrieve = vi.fn(async () => ({ items: [{ chunkId: 'chunk-1' }] }));
    const tool = new SearchKnowledgeTool({ retrieve } as unknown as KnowledgeRetrieverPort);

    await expect(tool.execute({
      knowledgeBaseId: ' kb-a ', query: ' travel policy ', topK: 3,
    }, { projectId: 'project-a', workflowRunId: 'run-1' })).resolves.toEqual({
      output: { items: [{ chunkId: 'chunk-1' }] },
    });

    expect(retrieve).toHaveBeenCalledWith({
      projectId: 'project-a', knowledgeBaseId: 'kb-a', query: 'travel policy', topK: 3,
    });
  });

  it('rejects projectId injection and malformed LLM arguments before retrieval', async () => {
    const retrieve = vi.fn();
    const tool = new SearchKnowledgeTool({ retrieve } as unknown as KnowledgeRetrieverPort);

    await expect(tool.execute({ knowledgeBaseId: 'kb-b', query: 'secret', projectId: 'project-b' }, { projectId: 'project-a' }))
      .rejects.toMatchObject({ code: 'TOOL_INPUT_INVALID' });
    await expect(tool.execute({ knowledgeBaseId: 'kb-a', query: 123 }, { projectId: 'project-a' }))
      .rejects.toMatchObject({ code: 'TOOL_INPUT_INVALID' });
    expect(retrieve).not.toHaveBeenCalled();
  });
});
