import { ExecutionContext } from './execution-context.js';
import { VariableResolver } from './variable-resolver.js';

describe('VariableResolver', () => {
  const resolver = new VariableResolver();

  it('resolves string and number variables', () => {
    const context = new ExecutionContext({ name: 'FlowMind', count: 3 });

    expect(resolver.resolveString('{{ name }} has {{count}} nodes', context)).toBe(
      'FlowMind has 3 nodes',
    );
  });

  it('resolves object variables as JSON', () => {
    const context = new ExecutionContext({ user: { id: 1, name: 'FlowMind' } });

    expect(resolver.resolveString('User: {{user}}', context)).toBe(
      'User: {"id":1,"name":"FlowMind"}',
    );
  });

  it('throws when variable is missing', () => {
    expect(() => resolver.resolveString('Hi {{missing}}', new ExecutionContext({}))).toThrow(
      'Variable "missing" not found',
    );
  });

  it('keeps text without placeholders unchanged', () => {
    expect(resolver.resolveString('plain text', new ExecutionContext({}))).toBe('plain text');
  });
});