import type { LlmService } from '../../llm/llm.service.js';
import type { CodeRunnerService } from '../code/code-runner.service.js';
import { ExecutorRegistry } from './executor-registry.js';
import { CodeExecutor } from './executors/code.executor.js';
import { EndExecutor } from './executors/end.executor.js';
import { HttpExecutor } from './executors/http.executor.js';
import { IfExecutor } from './executors/if.executor.js';
import { LlmExecutor } from './executors/llm.executor.js';
import { LoopExecutor } from './executors/loop.executor.js';
import { StartExecutor } from './executors/start.executor.js';
import { TemplateExecutor } from './executors/template.executor.js';
import { VariableExecutor } from './executors/variable.executor.js';
import { VariableResolver } from './variable-resolver.js';

describe('ExecutorRegistry', () => {
  const resolver = new VariableResolver();
  const start = new StartExecutor();
  const variable = new VariableExecutor(resolver);
  const template = new TemplateExecutor(resolver);
  const http = new HttpExecutor(resolver);
  const ifExecutor = new IfExecutor(resolver);
  const loop = new LoopExecutor(resolver);
  const code = new CodeExecutor({} as CodeRunnerService, resolver);
  const llm = new LlmExecutor({} as LlmService, resolver);
  const end = new EndExecutor();

  const registry = new ExecutorRegistry(
    start,
    variable,
    template,
    http,
    ifExecutor,
    loop,
    code,
    llm,
    end,
  );

  it('returns executor by node type', () => {
    expect(registry.get('template')).toBe(template);
    expect(registry.get('code')).toBe(code);
  });

  it('reports whether a node type is supported', () => {
    expect(registry.has('loop')).toBe(true);
    expect(registry.has('magic')).toBe(false);
  });

  it('rejects unknown node type', () => {
    expect(() => registry.get('magic')).toThrow('Unsupported node type: magic');
  });

  it('rejects two executors claiming the same type', () => {
    expect(
      () =>
        new ExecutorRegistry(
          start,
          variable,
          template,
          http,
          ifExecutor,
          loop,
          code,
          llm,
          template as unknown as EndExecutor,
        ),
    ).toThrow('Duplicate executor type: template');
  });
});
