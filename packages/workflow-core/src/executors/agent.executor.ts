import type { ExecutionContext } from '../engine/execution-context.js';
import { WorkflowExecutionError } from '../engine/workflow-execution.error.js';
import type { VariableResolver } from '../engine/variable-resolver.js';
import type { WorkflowNode } from '../engine/workflow-engine.types.js';
import type {
  AgentChatPort,
  AgentMessage,
  AgentModelResponse,
  AgentToolPort,
  AgentTracePort,
  AgentTraceStep,
} from '../ports/agent.js';
import type { NodeExecutor, NodeRetryMode } from './node-executor.js';

const MAX_AGENT_TOOLS = 20;
const MAX_AGENT_TOOL_SCHEMA_CHARS = 100_000;
const MAX_AGENT_TOOL_RESULT_CHARS = 40_000;
// Individual tool responses may be large. The aggregate is deliberately smaller than the
// complete message budget so a multi-tool batch cannot make the next model decision impossible.
const MAX_AGENT_TOTAL_TOOL_OBSERVATION_CHARS = 60_000;
const MAX_AGENT_MESSAGE_CHARS = 100_000;
const MAX_AGENT_TRACE_VALUE_CHARS = 20_000;
const MAX_AGENT_TRACE_STEPS = 10;
const DEFAULT_AGENT_MAX_STEPS = 5;
const MAX_IDENTICAL_CONSECUTIVE_TOOL_CALLS = 2;

/**
 * A deliberately small sequential ReAct runtime. One step is one model decision:
 * it either produces the final answer or requests one or more tools. Even when a model emits
 * multiple tool calls in one decision, FlowMind executes them in order, never in parallel. We
 * only retain observable actions/results, never model reasoning text.
 */
export class AgentExecutor implements NodeExecutor {
  readonly type = 'agent';

  constructor(
    private readonly chat: AgentChatPort,
    private readonly tools: AgentToolPort,
    private readonly resolver: VariableResolver,
    private readonly traceLogger?: AgentTracePort,
  ) {}

  getRetryMode(): NodeRetryMode {
    return 'transient';
  }

  async execute(node: WorkflowNode, context: ExecutionContext) {
    const data = validateData(node);
    if (!context.projectId) {
      throw failure('AGENT_PROJECT_REQUIRED', 'Agent node requires a project execution context');
    }

    const allowed = await this.tools.listAllowed({ projectId: context.projectId, toolNames: data.toolNames });
    if (JSON.stringify(allowed).length > MAX_AGENT_TOOL_SCHEMA_CHARS) {
      throw failure('AGENT_TOOL_SCHEMA_TOO_LARGE', 'Agent tool schemas are too large');
    }

    const messages = this.buildInitialMessages(data, context);
    const trace: AgentTraceStep[] = [];
    const seenToolCallIds = new Set<string>();
    let previousFingerprint: string | undefined;
    let identicalConsecutiveCalls = 0;
    let toolExecutionStarted = false;
    let toolObservationChars = 0;

    for (let step = 1; step <= data.maxSteps; step += 1) {
      this.assertContextBudget(messages);
      let response: AgentModelResponse;

      try {
        response = await this.chat.generate({
          modelId: data.modelId,
          messages,
          tools: allowed,
          temperature: data.temperature,
        });
      } catch (error) {
        throw toolExecutionStarted ? nonReplayFailure(error) : error;
      }

      if (response.toolCalls.length === 0) {
        const answer = requireFinalText(response);
        trace.push({
          step,
          type: 'FINAL_ANSWER',
          answer: boundText(answer, MAX_AGENT_TRACE_VALUE_CHARS),
          createdAt: new Date().toISOString(),
        });
        await this.log(context, 'INFO', 'Agent generated final answer', {
          step,
          toolCallCount: trace.filter((item) => item.type === 'TOOL_CALL').length,
        });
        context.setVariable(data.outputVariable, answer);
        return {
          output: {
            answer,
            toolCallCount: trace.filter((item) => item.type === 'TOOL_CALL').length,
            steps: trace,
          },
        };
      }

      // The final allowed model decision must be a final answer. Do not spend or side-effect a
      // tool call that can never be consumed by another model decision. This applies to the
      // whole batch emitted by the model, before any side effect is performed.
      if (step === data.maxSteps) {
        throw failure('AGENT_MAX_STEPS_EXCEEDED', `Agent did not produce a final answer within ${data.maxSteps} steps`);
      }

      const calls = response.toolCalls;
      for (const call of calls) {
        if (!data.toolNames.includes(call.name)) {
          throw failure('TOOL_NOT_ALLOWED', 'Tool is not allowed for this agent');
        }
        if (seenToolCallIds.has(call.id)) {
          throw failure('AGENT_DUPLICATE_TOOL_CALL_ID', `Agent returned duplicate tool call id: ${call.id}`);
        }
        seenToolCallIds.add(call.id);

        const fingerprint = stableFingerprint({ name: call.name, arguments: call.arguments });
        identicalConsecutiveCalls = fingerprint === previousFingerprint ? identicalConsecutiveCalls + 1 : 1;
        previousFingerprint = fingerprint;
        if (identicalConsecutiveCalls > MAX_IDENTICAL_CONSECUTIVE_TOOL_CALLS) {
          throw failure('AGENT_REPEATED_TOOL_CALL', 'Agent repeated the same tool call too many times');
        }
      }

      messages.push({ role: 'assistant', content: response.text ?? '', toolCalls: calls });
      for (const call of calls) {
        const startedAt = Date.now();
        await this.log(context, 'INFO', 'Agent requested tool', {
          step,
          toolName: call.name,
          toolCallId: call.id,
        });

        let toolResult;
        try {
          // A tool may create a side effect before it throws. From this exact point on, retrying
          // the entire workflow node would replay prior actions and is therefore forbidden.
          toolExecutionStarted = true;
          toolResult = await this.tools.execute({
            projectId: context.projectId,
            workflowId: context.workflowId,
            workflowRunId: context.workflowRunId,
            nodeRunId: context.currentNodeRunId,
            workflowCallDepth: context.workflowCallDepth,
            allowedToolNames: data.toolNames,
            call,
          });
        } catch (error) {
          throw nonReplayFailure(error);
        }

        const finishedAt = Date.now();
        const durationMs = finishedAt - startedAt;
        trace.push({
          step,
          type: 'TOOL_CALL',
          toolCallId: call.id,
          toolName: call.name,
          arguments: safeTraceValue(call.arguments),
          result: safeTraceValue(toolResult),
          startedAt: new Date(startedAt).toISOString(),
          finishedAt: new Date(finishedAt).toISOString(),
          durationMs,
        });
        await this.log(context, toolResult.ok ? 'INFO' : 'WARN', 'Agent tool completed', {
          step,
          toolName: call.name,
          toolCallId: call.id,
          ok: toolResult.ok,
          durationMs,
          ...(toolResult.error ? { errorCode: toolResult.error.code } : {}),
        });

        const remainingObservationChars = Math.max(0, MAX_AGENT_TOTAL_TOOL_OBSERVATION_CHARS - toolObservationChars);
        const observation = serializeToolResult(toolResult, Math.min(MAX_AGENT_TOOL_RESULT_CHARS, remainingObservationChars));
        toolObservationChars += observation.length;
        messages.push({ role: 'tool', toolCallId: call.id, content: observation });
      }
    }

    // The loop always returns or throws within it. This keeps TypeScript's control flow explicit.
    throw failure('AGENT_MAX_STEPS_EXCEEDED', `Agent did not produce a final answer within ${data.maxSteps} steps`);
  }

  private buildInitialMessages(data: AgentData, context: ExecutionContext): AgentMessage[] {
    const messages: AgentMessage[] = [{
      role: 'system',
      content: 'You are an agent with access to tools. Use only provided tools when needed. After each tool result, decide whether another tool is necessary or provide a final answer. Do not repeat the same tool call unnecessarily. Do not invent tool results.',
    }];
    if (data.systemPrompt?.trim()) {
      messages.push({ role: 'system', content: this.resolver.resolveString(data.systemPrompt, context) });
    }
    messages.push({ role: 'user', content: this.resolver.resolveString(data.prompt, context) });
    return messages;
  }

  private assertContextBudget(messages: AgentMessage[]) {
    if (safeSerialize(messages).length > MAX_AGENT_MESSAGE_CHARS) {
      throw failure('AGENT_CONTEXT_TOO_LARGE', `Agent context exceeds ${MAX_AGENT_MESSAGE_CHARS} characters`);
    }
  }

  private async log(
    context: ExecutionContext,
    level: 'INFO' | 'WARN',
    message: string,
    metadata: Record<string, unknown>,
  ) {
    if (!this.traceLogger || !context.workflowRunId) return;
    // Logs are observability only. A database/SSE failure must never change Agent execution.
    await this.traceLogger.log({
      workflowRunId: context.workflowRunId,
      nodeRunId: context.currentNodeRunId,
      level,
      message,
      metadata,
    }).catch(() => undefined);
  }
}

interface AgentData {
  modelId: string;
  systemPrompt?: string;
  prompt: string;
  toolNames: string[];
  temperature?: number;
  maxSteps: number;
  outputVariable: string;
}

function validateData(node: WorkflowNode): AgentData {
  const { modelId, systemPrompt, prompt, toolNames, temperature, maxSteps, outputVariable } = node.data;
  if (typeof modelId !== 'string' || !modelId.trim()) throw failure('AGENT_MODEL_REQUIRED', `Agent node ${node.id} requires modelId`);
  if (typeof prompt !== 'string' || !prompt.trim()) throw failure('AGENT_PROMPT_REQUIRED', `Agent node ${node.id} requires prompt`);
  if (typeof outputVariable !== 'string' || !outputVariable.trim()) throw failure('AGENT_OUTPUT_VARIABLE_REQUIRED', `Agent node ${node.id} requires outputVariable`);
  if (systemPrompt !== undefined && typeof systemPrompt !== 'string') throw failure('AGENT_SYSTEM_PROMPT_INVALID', `Agent node ${node.id} has invalid systemPrompt`);
  if (!Array.isArray(toolNames) || !toolNames.every((name) => typeof name === 'string' && name.trim())) throw failure('AGENT_TOOLS_INVALID', `Agent node ${node.id} toolNames must be an array of non-empty strings`);
  if (toolNames.length > MAX_AGENT_TOOLS) throw failure('AGENT_TOO_MANY_TOOLS', `Agent node ${node.id} may use at most ${MAX_AGENT_TOOLS} tools`);
  if (new Set(toolNames).size !== toolNames.length) throw failure('AGENT_DUPLICATE_TOOL', `Agent node ${node.id} contains duplicate tools`);
  if (temperature !== undefined && (typeof temperature !== 'number' || temperature < 0 || temperature > 2)) throw failure('AGENT_TEMPERATURE_INVALID', `Agent node ${node.id} temperature must be between 0 and 2`);
  if (maxSteps !== undefined && (typeof maxSteps !== 'number' || !Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > MAX_AGENT_TRACE_STEPS)) throw failure('AGENT_MAX_STEPS_INVALID', `Agent node ${node.id} maxSteps must be an integer between 1 and ${MAX_AGENT_TRACE_STEPS}`);
  return { modelId, systemPrompt: systemPrompt as string | undefined, prompt, toolNames: [...toolNames], temperature: temperature as number | undefined, maxSteps: (maxSteps as number | undefined) ?? DEFAULT_AGENT_MAX_STEPS, outputVariable };
}

function requireFinalText(result: AgentModelResponse) {
  if (!result.text?.trim()) throw failure('AGENT_FINAL_ANSWER_MISSING', 'Agent model returned no final answer');
  return result.text;
}

function serializeToolResult(result: unknown, maxChars = MAX_AGENT_TOOL_RESULT_CHARS) {
  const serialized = safeSerialize(result);
  if (serialized.length <= maxChars) return serialized;
  // Keep a valid, compact observation when the shared Agent observation budget is exhausted.
  if (maxChars < 128) return JSON.stringify({ truncated: true, message: 'Tool result omitted because the Agent observation budget was exhausted' });
  return boundText(serialized, maxChars);
}

function nonReplayFailure(error: unknown) {
  if (error instanceof WorkflowExecutionError && error.retryable === false) return error;
  const message = error instanceof Error ? error.message : 'Agent failed after tool execution started';
  return failure('AGENT_POST_TOOL_FAILURE', message, error);
}

function failure(code: string, message: string, cause?: unknown) {
  return new WorkflowExecutionError(message, { code, retryable: false, cause });
}

function boundText(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}…[truncated]` : value;
}

function safeSerialize(value: unknown) {
  try {
    return JSON.stringify(value) ?? 'null';
  } catch {
    return String(value);
  }
}

function safeTraceValue(value: unknown): unknown {
  const projected = redactTraceValue(value, 0);
  const serialized = safeSerialize(projected);
  if (serialized.length <= MAX_AGENT_TRACE_VALUE_CHARS) return projected;
  return { truncated: true, preview: boundText(serialized, MAX_AGENT_TRACE_VALUE_CHARS) };
}

function redactTraceValue(value: unknown, depth: number): unknown {
  if (depth > 8) return '[MAX_DEPTH]';
  if (typeof value === 'string') return boundText(value, MAX_AGENT_TRACE_VALUE_CHARS);
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactTraceValue(item, depth + 1));
  if (typeof value !== 'object') return String(value);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 100).map(([key, child]) => [
    key,
    /authorization|api[-_]?key|token|secret|password|cookie/i.test(key)
      ? '[REDACTED]'
      : redactTraceValue(child, depth + 1),
  ]));
}

function stableFingerprint(value: unknown) {
  return safeSerialize(sortForStableJson(value));
}

function sortForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForStableJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, sortForStableJson(child)]));
}
