import { Injectable } from '@nestjs/common';
import { CodeExecutor } from './executors/code.executor.js';
import { EndExecutor } from './executors/end.executor.js';
import { HttpExecutor } from './executors/http.executor.js';
import { IfExecutor } from './executors/if.executor.js';
import { LlmExecutor } from './executors/llm.executor.js';
import { LoopExecutor } from './executors/loop.executor.js';
import type { NodeExecutor } from './executors/node-executor.js';
import { StartExecutor } from './executors/start.executor.js';
import { TemplateExecutor } from './executors/template.executor.js';
import { VariableExecutor } from './executors/variable.executor.js';
import { WorkflowExecutionError } from './workflow-execution.error.js';

@Injectable()
export class ExecutorRegistry {
  private readonly executors = new Map<string, NodeExecutor>();

  constructor(
    startExecutor: StartExecutor,
    variableExecutor: VariableExecutor,
    templateExecutor: TemplateExecutor,
    httpExecutor: HttpExecutor,
    ifExecutor: IfExecutor,
    loopExecutor: LoopExecutor,
    codeExecutor: CodeExecutor,
    llmExecutor: LlmExecutor,
    endExecutor: EndExecutor,
  ) {
    for (const executor of [
      startExecutor,
      variableExecutor,
      templateExecutor,
      httpExecutor,
      ifExecutor,
      loopExecutor,
      codeExecutor,
      llmExecutor,
      endExecutor,
    ]) {
      this.register(executor);
    }
  }

  has(nodeType: string) {
    return this.executors.has(nodeType);
  }

  get(nodeType: string): NodeExecutor {
    const executor = this.executors.get(nodeType);

    if (!executor) {
      throw new WorkflowExecutionError(`Unsupported node type: ${nodeType}`);
    }

    return executor;
  }

  private register(executor: NodeExecutor) {
    // A duplicate means two executors claim the same type: a startup bug, not a user error.
    if (this.executors.has(executor.type)) {
      throw new Error(`Duplicate executor type: ${executor.type}`);
    }

    this.executors.set(executor.type, executor);
  }
}
