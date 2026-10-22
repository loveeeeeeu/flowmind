import type { KnowledgeRetrieverPort } from '@flowmind/workflow-core';
import { SearchKnowledgeTool } from './search-knowledge.tool.js';

describe('SearchKnowledgeTool', () => {
  it('uses only trusted context.projectId and forwards validated model arguments to the existing retriever', async () => {
    const retrieve = vi.fn(async () => ({
      query: 'ignored by adapter',
      items: [{ chunkId: 'chunk-1', documentId: 'document-1', documentName: 'Guide', chunkIndex: 2, content: 'answer', score: 0.9, metadata: null }],
    }));
    const tool = new SearchKnowledgeTool({ retrieve } as unknown as KnowledgeRetrieverPort);

    await expect(tool.execute({
      knowledgeBaseId: ' kb-a ', query: ' travel policy ', topK: 3, minScore: 0.5,
    }, { projectId: 'project-a', workflowRunId: 'run-1' })).resolves.toEqual({
      output: { query: 'travel policy', items: [{ documentName: 'Guide', chunkIndex: 2, content: 'answer', score: 0.9, metadata: null }] },
      truncated: false,
    });

    expect(retrieve).toHaveBeenCalledWith({
      projectId: 'project-a', knowledgeBaseId: 'kb-a', query: 'travel policy', topK: 3, minScore: 0.5,
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
