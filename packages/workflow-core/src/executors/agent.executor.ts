import type { ExecutionContext } from '../engine/execution-context.js';
import { WorkflowExecutionError } from '../engine/workflow-execution.error.js';
import type { VariableResolver } from '../engine/variable-resolver.js';
import type { WorkflowNode } from '../engine/workflow-engine.types.js';
import type { AgentChatPort, AgentMessage, AgentModelResponse, AgentToolPort } from '../ports/agent.js';
import type { NodeExecutor, NodeRetryMode } from './node-executor.js';

const MAX_AGENT_TOOLS = 20;
const MAX_AGENT_TOOL_SCHEMA_CHARS = 100_000;
const MAX_AGENT_TOOL_RESULT_CHARS = 40_000;

export class AgentExecutor implements NodeExecutor {
  readonly type = 'agent';
  constructor(private readonly chat: AgentChatPort, private readonly tools: AgentToolPort, private readonly resolver: VariableResolver) {}
  getRetryMode(): NodeRetryMode { return 'transient'; }

  async execute(node: WorkflowNode, context: ExecutionContext) {
    const data = validateData(node);
    if (!context.projectId) throw failure('AGENT_PROJECT_REQUIRED', 'Agent node requires a project execution context');
    const allowed = await this.tools.listAllowed({ projectId: context.projectId, toolNames: data.toolNames });
    const schemaSize = JSON.stringify(allowed).length;
    if (schemaSize > MAX_AGENT_TOOL_SCHEMA_CHARS) throw failure('AGENT_TOOL_SCHEMA_TOO_LARGE', 'Agent tool schemas are too large');

    const messages = this.buildInitialMessages(data, context);
    const first = await this.chat.generate({ modelId: data.modelId, messages, tools: allowed, temperature: data.temperature });
    if (first.toolCalls.length === 0) {
      const answer = requireFinalText(first);
      context.setVariable(data.outputVariable, answer);
      return { output: { answer } };
    }
    if (first.toolCalls.length !== 1) throw failure('AGENT_MULTIPLE_TOOL_CALLS_NOT_SUPPORTED', 'Only one tool call is supported in this agent version');
    const call = first.toolCalls[0];
    if (!data.toolNames.includes(call.name)) throw failure('TOOL_NOT_ALLOWED', 'Tool is not allowed for this agent');

    // From this point a tool might create side effects. Any later error must not replay the Agent node.
    try {
      const toolResult = await this.tools.execute({
        projectId: context.projectId,
        workflowId: context.workflowId,
        workflowRunId: context.workflowRunId,
        nodeRunId: context.currentNodeRunId,
        workflowCallDepth: context.workflowCallDepth,
        allowedToolNames: data.toolNames,
        call,
      });
      messages.push({ role: 'assistant', content: first.text ?? '', toolCalls: [call] });
      messages.push({ role: 'tool', toolCallId: call.id, content: serializeToolResult(toolResult) });
      const second = await this.chat.generate({ modelId: data.modelId, messages, tools: allowed, temperature: data.temperature });
      if (second.toolCalls.length > 0) throw failure('AGENT_ADDITIONAL_TOOL_CALL_REQUIRED', 'Agent requested another tool call, but multi-step execution is not enabled');
      const answer = requireFinalText(second);
      context.setVariable(data.outputVariable, answer);
      return { output: { answer, toolCall: call, toolResult } };
    } catch (error) {
      if (error instanceof WorkflowExecutionError && error.code === 'TOOL_NOT_ALLOWED') throw error;
      if (error instanceof WorkflowExecutionError && error.retryable === false) throw error;
      const message = error instanceof Error ? error.message : 'Agent failed after tool execution';
      throw failure('AGENT_TOOL_PHASE_FAILED', message, error);
    }
  }

  private buildInitialMessages(data: AgentData, context: ExecutionContext): AgentMessage[] {
    const messages: AgentMessage[] = [{ role: 'system', content: 'You are an agent with access to tools. Use only provided tools when necessary. Do not invent tool results.' }];
    if (data.systemPrompt?.trim()) messages.push({ role: 'system', content: this.resolver.resolveString(data.systemPrompt, context) });
    messages.push({ role: 'user', content: this.resolver.resolveString(data.prompt, context) });
    return messages;
  }
}

interface AgentData { modelId: string; systemPrompt?: string; prompt: string; toolNames: string[]; temperature?: number; outputVariable: string; }
function validateData(node: WorkflowNode): AgentData {
  const { modelId, systemPrompt, prompt, toolNames, temperature, outputVariable } = node.data;
  if (typeof modelId !== 'string' || !modelId.trim()) throw failure('AGENT_MODEL_REQUIRED', `Agent node ${node.id} requires modelId`);
  if (typeof prompt !== 'string' || !prompt.trim()) throw failure('AGENT_PROMPT_REQUIRED', `Agent node ${node.id} requires prompt`);
  if (typeof outputVariable !== 'string' || !outputVariable.trim()) throw failure('AGENT_OUTPUT_VARIABLE_REQUIRED', `Agent node ${node.id} requires outputVariable`);
  if (systemPrompt !== undefined && typeof systemPrompt !== 'string') throw failure('AGENT_SYSTEM_PROMPT_INVALID', `Agent node ${node.id} has invalid systemPrompt`);
  if (!Array.isArray(toolNames) || !toolNames.every((name) => typeof name === 'string' && name.trim())) throw failure('AGENT_TOOLS_INVALID', `Agent node ${node.id} toolNames must be an array of non-empty strings`);
  if (toolNames.length > MAX_AGENT_TOOLS) throw failure('AGENT_TOO_MANY_TOOLS', `Agent node ${node.id} may use at most ${MAX_AGENT_TOOLS} tools`);
  if (new Set(toolNames).size !== toolNames.length) throw failure('AGENT_DUPLICATE_TOOL', `Agent node ${node.id} contains duplicate tools`);
  if (temperature !== undefined && (typeof temperature !== 'number' || temperature < 0 || temperature > 2)) throw failure('AGENT_TEMPERATURE_INVALID', `Agent node ${node.id} temperature must be between 0 and 2`);
  return { modelId, systemPrompt: systemPrompt as string | undefined, prompt, toolNames: [...toolNames], temperature: temperature as number | undefined, outputVariable };
}
function requireFinalText(result: AgentModelResponse) {
  if (!result.text?.trim()) throw failure('AGENT_FINAL_ANSWER_MISSING', 'Agent model returned no final answer');
  return result.text;
}
function serializeToolResult(result: unknown) {
  const serialized = JSON.stringify(result);
  return serialized.length > MAX_AGENT_TOOL_RESULT_CHARS ? `${serialized.slice(0, MAX_AGENT_TOOL_RESULT_CHARS)}…` : serialized;
}
function failure(code: string, message: string, cause?: unknown) { return new WorkflowExecutionError(message, { code, retryable: false, cause }); }
