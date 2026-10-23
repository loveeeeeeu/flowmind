import { describe, expect, it, vi } from 'vitest';
import { ExecutionContext } from '../engine/execution-context.js';
import type { AgentChatPort, AgentModelResponse, AgentToolPort } from '../ports/agent.js';
import { VariableResolver } from '../engine/variable-resolver.js';
import { AgentExecutor } from './agent.executor.js';

const node = (toolNames: string[] = ['search_knowledge'], maxSteps = 5) => ({
  id: 'agent', type: 'agent', data: {
    modelId: 'model-1', prompt: 'Question: {{question}}', toolNames, maxSteps, outputVariable: 'answer',
  },
});
const allowed = [{ name: 'search_knowledge', description: 'Search', inputSchema: { type: 'object', properties: {} } }];
const call = (id: string, arguments_: unknown = {}) => ({ id, name: 'search_knowledge', arguments: arguments_ });

function setup(responses: Array<AgentModelResponse | Error>, toolResults: Array<unknown> = []) {
  const chat: AgentChatPort = {
    generate: vi.fn(async () => {
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next!;
    }),
  };
  const tools: AgentToolPort = {
    listAllowed: vi.fn(async () => allowed),
    execute: vi.fn(async (input) => {
      const next = toolResults.shift();
      if (next instanceof Error) throw next;
      return next ?? { toolCallId: input.call.id, toolName: input.call.name, ok: true, output: { limit: 600 } };
    }),
  };
  return { executor: new AgentExecutor(chat, tools, new VariableResolver()), chat, tools };
}

function context() {
  return new ExecutionContext({ question: 'expense policy' }, { projectId: 'project-1', workflowRunId: 'run-1' });
}

describe('AgentExecutor ReAct loop', () => {
  it('returns a direct answer without executing a tool', async () => {
    const { executor, tools } = setup([{ text: '2', toolCalls: [] }]);
    await expect(executor.execute(node(), context())).resolves.toMatchObject({
      output: { answer: '2', toolCallCount: 0, steps: [{ step: 1, type: 'FINAL_ANSWER' }] },
    });
    expect(tools.execute).not.toHaveBeenCalled();
  });

  it('executes two sequential tools then produces a final answer and trace', async () => {
    const { executor, chat, tools } = setup([
      { text: null, toolCalls: [call('call-1', { query: 'policy' })] },
      { text: null, toolCalls: [call('call-2', { query: 'weather' })] },
      { text: 'Travel is suitable.', toolCalls: [] },
    ]);
    const result = await executor.execute(node(), context());
    expect(result.output).toMatchObject({
      answer: 'Travel is suitable.', toolCallCount: 2,
      steps: [
        { step: 1, type: 'TOOL_CALL', toolCallId: 'call-1' },
        { step: 2, type: 'TOOL_CALL', toolCallId: 'call-2' },
        { step: 3, type: 'FINAL_ANSWER' },
      ],
    });
    expect(tools.execute).toHaveBeenCalledTimes(2);
    expect(chat.generate).toHaveBeenCalledTimes(3);
  });

  it('does not execute a tool requested in the final available step', async () => {
    const { executor, tools } = setup([
      { text: null, toolCalls: [call('call-1', { page: 1 })] },
      { text: null, toolCalls: [call('call-2', { page: 2 })] },
      { text: null, toolCalls: [call('call-3', { page: 3 })] },
    ]);
    await expect(executor.execute(node(['search_knowledge'], 3), context())).rejects.toMatchObject({
      code: 'AGENT_MAX_STEPS_EXCEEDED', retryable: false,
    });
    expect(tools.execute).toHaveBeenCalledTimes(2);
  });

  it('allows a tool business failure to become an observation and continue', async () => {
    const { executor } = setup([
      { text: null, toolCalls: [call('call-1', { city: 123 })] },
      { text: 'The tool input was invalid.', toolCalls: [] },
    ], [{ toolCallId: 'call-1', toolName: 'search_knowledge', ok: false, error: { code: 'TOOL_INPUT_INVALID', message: 'city must be text' } }]);
    await expect(executor.execute(node(), context())).resolves.toMatchObject({ output: { answer: 'The tool input was invalid.', toolCallCount: 1 } });
  });

  it('stops a repeated identical tool loop before the third execution', async () => {
    const { executor, tools } = setup([
      { text: null, toolCalls: [call('call-1', { query: 'same' })] },
      { text: null, toolCalls: [call('call-2', { query: 'same' })] },
      { text: null, toolCalls: [call('call-3', { query: 'same' })] },
    ]);
    await expect(executor.execute(node(), context())).rejects.toMatchObject({ code: 'AGENT_REPEATED_TOOL_CALL' });
    expect(tools.execute).toHaveBeenCalledTimes(2);
  });

  it('rejects duplicate model tool call IDs', async () => {
    const { executor, tools } = setup([
      { text: null, toolCalls: [call('call-1', { query: 'one' })] },
      { text: null, toolCalls: [call('call-1', { query: 'two' })] },
    ]);
    await expect(executor.execute(node(), context())).rejects.toMatchObject({ code: 'AGENT_DUPLICATE_TOOL_CALL_ID' });
    expect(tools.execute).toHaveBeenCalledTimes(1);
  });

  it('rejects a tool the model was not allowed to call before execution', async () => {
    const { executor, tools } = setup([{ text: null, toolCalls: [{ id: 'call-1', name: 'run_workflow', arguments: {} }] }]);
    await expect(executor.execute(node(), context())).rejects.toMatchObject({ code: 'TOOL_NOT_ALLOWED' });
    expect(tools.execute).not.toHaveBeenCalled();
  });

  it('marks a provider failure after a tool as non-retryable', async () => {
    const { executor } = setup([
      { text: null, toolCalls: [call('call-1')] },
      new Error('provider timeout'),
    ]);
    await expect(executor.execute(node(), context())).rejects.toMatchObject({
      code: 'AGENT_POST_TOOL_FAILURE', retryable: false,
    });
  });
});
