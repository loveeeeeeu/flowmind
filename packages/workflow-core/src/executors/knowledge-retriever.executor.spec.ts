import { ExecutionContext } from '../engine/execution-context.js';
import type { WorkflowNode } from '../engine/workflow-engine.types.js';
import { VariableResolver } from '../engine/variable-resolver.js';
import type { KnowledgeRetrieverPort } from '../ports/knowledge-retriever.js';
import { KnowledgeRetrieverExecutor, buildKnowledgeContextResult } from './knowledge-retriever.executor.js';

describe('KnowledgeRetrieverExecutor', () => {
  const item = {
    chunkId: 'chunk-1', documentId: 'document-1', documentName: 'Employee handbook',
    chunkIndex: 3, content: '住宿报销最高 600 元/晚。', metadata: null, score: 0.91,
  };

  it('resolves the query template, scopes retrieval to project, and returns context plus items', async () => {
    const retrieve = vi.fn(async () => ({ items: [item] }));
    const executor = new KnowledgeRetrieverExecutor({ retrieve } as KnowledgeRetrieverPort, new VariableResolver());
    const node: WorkflowNode = {
      id: 'retriever', type: 'knowledgeRetriever',
      data: { knowledgeBaseId: 'kb-1', query: '{{input.question}}', outputVariable: 'retrieved', topK: 5, minScore: 0.4 },
    };
    const context = new ExecutionContext({ input: { question: '住宿最多报销多少？' } }, 'project-1');

    const result = await executor.execute(node, context);

    expect(retrieve).toHaveBeenCalledWith({
      projectId: 'project-1', knowledgeBaseId: 'kb-1', query: '住宿最多报销多少？', topK: 5, minScore: 0.4,
    });
    expect(result.output).toEqual({
      query: '住宿最多报销多少？',
      context: '[Source 1]\nDocument: Employee handbook\nChunk: 3\nContent:\n住宿报销最高 600 元/晚。',
      items: [item],
    });
    expect(context.getVariable('retrieved')).toEqual(result.output);
  });

  it('treats an empty retrieval as success and keeps the output empty', async () => {
    const executor = new KnowledgeRetrieverExecutor({ retrieve: vi.fn(async () => ({ items: [] })) }, new VariableResolver());
    const result = await executor.execute(
      { id: 'retriever', type: 'knowledgeRetriever', data: { knowledgeBaseId: 'kb-1', query: 'nothing' } },
      new ExecutionContext({}, 'project-1'),
    );
    expect(result.output).toEqual({ query: 'nothing', context: '', items: [] });
  });

  it('limits both context and items to chunks actually used in context', () => {
    const result = buildKnowledgeContextResult([item, { ...item, chunkId: 'chunk-2', content: 'x'.repeat(100) }], 100);
    expect(result.items).toEqual([item]);
    expect(result.context).toContain('Source 1');
  });

  it('preserves score order and never exposes an accidental embedding field in node output', () => {
    const first = { ...item, chunkId: 'first', content: 'best match', score: 0.91, embedding: [0.1, 0.2] };
    const second = { ...item, chunkId: 'second', content: 'next match', score: 0.84, embedding: [0.3, 0.4] };

    const result = buildKnowledgeContextResult(
      [first, second] as unknown as typeof item[],
      1_000,
    );

    expect(result.context).toMatch(/\[Source 1\][\s\S]*best match[\s\S]*\[Source 2\][\s\S]*next match/);
    expect(result.items).toEqual([
      expect.objectContaining({ chunkId: 'first', score: 0.91 }),
      expect.objectContaining({ chunkId: 'second', score: 0.84 }),
    ]);
    expect(JSON.stringify(result)).not.toContain('embedding');
  });
});
