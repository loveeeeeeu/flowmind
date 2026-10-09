import { createContext, Script } from 'node:vm';
import { parentPort, workerData } from 'node:worker_threads';
import type { CodeWorkerData, CodeWorkerMessage } from './code-runner.types.js';

const { code, input, vmTimeoutMs } = workerData as CodeWorkerData;

function describeError(error: unknown) {
  // Errors thrown inside the vm context belong to another realm, so `instanceof Error` is false.
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message);
  }

  return String(error);
}

async function run(): Promise<CodeWorkerMessage> {
  try {
    const context = createContext({ input });
    // Newlines keep a trailing `// comment` in user code from swallowing the closing `})()`.
    const script = new Script(`(async () => {\n${code}\n})()`, {
      filename: 'flowmind-code-node.js',
    });
    const output: unknown = await script.runInContext(context, { timeout: vmTimeoutMs });

    if (output === undefined) {
      return { ok: false, error: 'Code must return a value' };
    }

    return { ok: true, output };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

// Without a pending handle, a never-settling promise would let the worker exit early
// instead of hitting the parent's timeout.
const keepAlive = setInterval(() => {}, 1 << 30);
const message = await run();
clearInterval(keepAlive);

try {
  parentPort?.postMessage(message);
} catch (error) {
  parentPort?.postMessage({
    ok: false,
    error: `Return value cannot be transferred: ${describeError(error)}`,
  } satisfies CodeWorkerMessage);
}
