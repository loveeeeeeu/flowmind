import { ExecutionContext } from './execution-context.js';
import type { WorkflowCanvas, WorkflowNode } from './workflow-engine.types.js';
import { WorkflowGraph } from './workflow-graph.js';
import type { SchedulerOptions, WorkflowScheduler } from './workflow-scheduler.js';
import type { WorkflowValidator } from './workflow-validator.js';

export interface WorkflowExecutionResult {
  result: unknown;
  executedNodeIds: string[];
  variables: Record<string, unknown>;
  nodeOutputs: Record<string, unknown>;
}

export class WorkflowEngine {
  constructor(
    private readonly validator: WorkflowValidator,
    private readonly scheduler: WorkflowScheduler,
  ) {}

  buildExecutionPlan(canvas: WorkflowCanvas): WorkflowNode[] {
    return this.validator.validate(new WorkflowGraph(canvas)).executionPlan;
  }

  async execute(
    canvas: WorkflowCanvas,
    input: Record<string, unknown>,
    options?: SchedulerOptions,
  ): Promise<WorkflowExecutionResult> {
    const graph = new WorkflowGraph(canvas);
    const { startNode } = this.validator.validate(graph);
    const context = new ExecutionContext(input);
    const { result, executedNodeIds } = await this.scheduler.run(
      graph,
      startNode,
      context,
      options,
    );

    return {
      result,
      executedNodeIds,
      variables: context.getVariables(),
      nodeOutputs: context.getNodeOutputs(),
    };
  }
}
