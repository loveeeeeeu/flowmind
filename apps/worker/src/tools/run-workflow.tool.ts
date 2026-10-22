import type { Tool, ToolExecutionContext, ToolExecutionResult } from '@flowmind/shared';
import { boundToolOutput, ToolInputError, ToolRuntimeError } from '@flowmind/tool-runtime';
import type { PublishedWorkflowRunPort } from '../execution/published-workflow-run.service.js';

const MAX_WORKFLOW_TOOL_DEPTH = 3;

interface RunWorkflowToolInput {
  workflowId: string;
  input?: Record<string, unknown>;
}

/** Adapter from an Agent tool call to the normal, published-only WorkflowRun runtime. */
export class RunWorkflowTool implements Tool {
  readonly definition = {
    name: 'run_workflow',
    displayName: 'Run Workflow',
    description: 'Runs the latest published version of a FlowMind workflow in the current project.',
    source: 'BUILT_IN',
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: { type: 'string', description: 'The FlowMind workflow ID to run.' },
        input: { description: 'Input passed to the workflow.' },
      },
      required: ['workflowId'],
      additionalProperties: false,
    },
  } as const;

  constructor(private readonly runs: PublishedWorkflowRunPort) {}

  async execute(rawInput: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const input = parseRunWorkflowInput(rawInput);
    const depth = context.workflowCallDepth ?? 0;
    if (depth >= MAX_WORKFLOW_TOOL_DEPTH) {
      throw new ToolRuntimeError('WORKFLOW_TOOL_MAX_DEPTH_EXCEEDED', 'Maximum workflow tool call depth exceeded');
    }
    if (context.workflowId && input.workflowId === context.workflowId) {
      throw new ToolRuntimeError('WORKFLOW_TOOL_RECURSIVE_CALL', 'A workflow cannot directly call itself as a tool');
    }

    const created = await this.runs.createAndEnqueue({
      projectId: context.projectId,
      workflowId: input.workflowId,
      input: input.input ?? {},
    });
    const terminal = await this.runs.waitForTerminal(created.id);
    if (terminal.status !== 'SUCCESS') {
      // The child trace remains in the database for the human operator. The model only gets a
      // stable failure code, never NodeRun traces, stack frames, or raw error metadata.
      throw new ToolRuntimeError('WORKFLOW_TOOL_RUN_FAILED', 'Workflow execution failed');
    }
    return boundToolOutput({ runId: terminal.id, status: terminal.status, output: terminal.output });
  }
}

function parseRunWorkflowInput(value: unknown): RunWorkflowToolInput {
  if (!isRecord(value)) throw new ToolInputError('Run workflow input must be an object');
  if (Object.keys(value).some((key) => key !== 'workflowId' && key !== 'input')) {
    throw new ToolInputError('Run workflow input contains an unsupported field');
  }
  if (typeof value.workflowId !== 'string' || !value.workflowId.trim()) {
    throw new ToolInputError('workflowId must be a non-empty string');
  }
  if (value.input !== undefined && !isRecord(value.input)) {
    throw new ToolInputError('input must be a JSON object');
  }
  return {
    workflowId: value.workflowId.trim(),
    ...(value.input === undefined ? {} : { input: value.input }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
