import { describe, expect, it, vi } from 'vitest';
import { ExecutionContext } from '../engine/execution-context.js';
import type { AgentChatPort, AgentToolPort } from '../ports/agent.js';
import { VariableResolver } from '../engine/variable-resolver.js';
import { AgentExecutor } from './agent.executor.js';

const node = (toolNames: string[] = ['search_knowledge']) => ({ id: 'agent', type: 'agent', data: { modelId: 'model-1', prompt: 'Question: {{question}}', toolNames, outputVariable: 'answer' } });
const allowed = [{ name: 'search_knowledge', description: 'Search', inputSchema: { type: 'object', properties: {} } }];
function setup(responses: Array<{ text: string | null; toolCalls: Array<{ id: string; name: string; arguments: unknown }> }>) {
  const chat: AgentChatPort = { generate: vi.fn(async () => responses.shift()!) };
  const tools: AgentToolPort = {
    listAllowed: vi.fn(async () => allowed),
    execute: vi.fn(async (input) => ({ toolCallId: input.call.id, toolName: input.call.name, ok: true, output: { limit: 600 } })),
  };
  return { executor: new AgentExecutor(chat, tools, new VariableResolver()), chat, tools };
}
function context() { return new ExecutionContext({ question: '住宿报销上限' }, { projectId: 'project-1', workflowRunId: 'run-1' }); }

describe('AgentExecutor', () => {
  it('returns a direct answer without executing a tool', async () => {
    const { executor, tools } = setup([{ text: '2', toolCalls: [] }]);
    await expect(executor.execute(node(), context())).resolves.toEqual({ output: { answer: '2' } });
    expect(tools.execute).not.toHaveBeenCalled();
  });

  it('executes exactly one allowed tool then asks the model for a final answer', async () => {
    const { executor, chat, tools } = setup([
      { text: null, toolCalls: [{ id: 'call-1', name: 'search_knowledge', arguments: { query: '住宿' } }] },
      { text: '最高 600 元。', toolCalls: [] },
    ]);
    const result = await executor.execute(node(), context());
    expect(result.output).toMatchObject({ answer: '最高 600 元。', toolCall: { id: 'call-1' }, toolResult: { ok: true } });
    expect(tools.execute).toHaveBeenCalledTimes(1);
    expect(chat.generate).toHaveBeenCalledTimes(2);
  });

  it('rejects a tool the model was not allowed to call before execution', async () => {
    const { executor, tools } = setup([{ text: null, toolCalls: [{ id: 'call-1', name: 'run_workflow', arguments: {} }] }]);
    await expect(executor.execute(node(), context())).rejects.toMatchObject({ code: 'TOOL_NOT_ALLOWED' });
    expect(tools.execute).not.toHaveBeenCalled();
  });

  it('rejects a second requested tool call after the first tool has run', async () => {
    const { executor } = setup([
      { text: null, toolCalls: [{ id: 'call-1', name: 'search_knowledge', arguments: {} }] },
      { text: null, toolCalls: [{ id: 'call-2', name: 'search_knowledge', arguments: {} }] },
    ]);
    await expect(executor.execute(node(), context())).rejects.toMatchObject({ code: 'AGENT_ADDITIONAL_TOOL_CALL_REQUIRED', retryable: false });
  });
});
