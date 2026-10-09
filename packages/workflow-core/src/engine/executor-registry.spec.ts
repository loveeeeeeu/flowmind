import { EndExecutor } from '../executors/end.executor.js';
import type { NodeExecutor } from '../executors/node-executor.js';
import { StartExecutor } from '../executors/start.executor.js';
import { TemplateExecutor } from '../executors/template.executor.js';
import { ExecutorRegistry } from './executor-registry.js';
import { VariableResolver } from './variable-resolver.js';

describe('ExecutorRegistry', () => {
  const start = new StartExecutor();
  const template = new TemplateExecutor(new VariableResolver());
  const end = new EndExecutor();

  const registry = new ExecutorRegistry([start, template, end]);

  it('returns executor by node type', () => {
    expect(registry.get('start')).toBe(start);
    expect(registry.get('template')).toBe(template);
  });

  it('reports whether a node type is supported', () => {
    expect(registry.has('end')).toBe(true);
    expect(registry.has('magic')).toBe(false);
  });

  it('rejects unknown node type', () => {
    expect(() => registry.get('magic')).toThrow('Unsupported node type: magic');
  });

  it('rejects two executors claiming the same type', () => {
    const duplicate: NodeExecutor = { type: 'template', execute: async () => ({}) };

    expect(() => new ExecutorRegistry([start, template, duplicate])).toThrow(
      'Duplicate executor type: template',
    );
  });
});
