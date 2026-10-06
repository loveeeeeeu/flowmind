import { Injectable } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { WorkflowExecutionError } from '../engine/workflow-execution.error.js';
import type {
  CodeWorkerData,
  CodeWorkerMessage,
  RunCodeInput,
  RunCodeResult,
} from './code-runner.types.js';

// Extra time for worker startup before the outer timer kills it.
const WORKER_GRACE_MS = 500;

function resolveWorkerUrl() {
  const compiled = new URL('./code-worker.js', import.meta.url);
  // Vitest runs from src/, where only the .ts source exists (needs Node type stripping).
  return existsSync(compiled) ? compiled : new URL('./code-worker.ts', import.meta.url);
}

const WORKER_URL = resolveWorkerUrl();

@Injectable()
export class CodeRunnerService {
  run(input: RunCodeInput): Promise<RunCodeResult> {
    return new Promise((resolve, reject) => {
      const workerData: CodeWorkerData = {
        code: input.code,
        input: input.input,
        vmTimeoutMs: input.timeoutMs,
      };

      const worker = new Worker(WORKER_URL, {
        workerData,
        // The worker would otherwise copy process.env, which holds LLM API keys.
        env: {},
        resourceLimits: {
          maxOldGenerationSizeMb: 32,
          maxYoungGenerationSizeMb: 16,
          stackSizeMb: 2,
        },
      });

      let settled = false;

      const finish = (error: Error | null, result?: RunCodeResult) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        void worker.terminate();

        if (error) {
          reject(error);
        } else {
          resolve(result!);
        }
      };

      const timer = setTimeout(
        () =>
          finish(new WorkflowExecutionError(`Code execution timed out after ${input.timeoutMs}ms`)),
        input.timeoutMs + WORKER_GRACE_MS,
      );

      worker.once('message', (message: CodeWorkerMessage) => {
        if (message.ok) {
          finish(null, { output: message.output });
        } else {
          finish(new WorkflowExecutionError(`Code execution failed: ${message.error}`));
        }
      });

      worker.once('error', (error) =>
        finish(new WorkflowExecutionError(`Code worker failed: ${error.message}`)),
      );

      worker.once('exit', (exitCode) =>
        finish(new WorkflowExecutionError(`Code worker exited unexpectedly with code ${exitCode}`)),
      );
    });
  }
}
