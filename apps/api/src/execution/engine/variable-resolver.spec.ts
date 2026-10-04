import { ExecutionContext } from './execution-context.js';
import { VariableResolver } from './variable-resolver.js';

describe('VariableResolver', () => {
  const resolver = new VariableResolver();

  describe('resolveString', () => {
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

    it('resolves nested path inside template', () => {
      const context = new ExecutionContext({ response: { data: { user: { name: 'Jack' } } } });

      expect(resolver.resolveString('Hello {{response.data.user.name}}', context)).toBe(
        'Hello Jack',
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

  describe('resolve', () => {
    it('resolves top-level variable', () => {
      expect(resolver.resolve('name', new ExecutionContext({ name: 'FlowMind' }))).toBe(
        'FlowMind',
      );
    });

    it('resolves nested object path and keeps original type', () => {
      const context = new ExecutionContext({ user: { profile: { name: 'Jack', age: 24 } } });

      expect(resolver.resolve('user.profile.name', context)).toBe('Jack');
      expect(resolver.resolve('user.profile.age', context)).toBe(24);
      expect(resolver.resolve('user.profile', context)).toEqual({ name: 'Jack', age: 24 });
    });

    it('resolves array index', () => {
      const context = new ExecutionContext({ users: [{ name: 'Jack' }, { name: 'Lucy' }] });

      expect(resolver.resolve('users.1.name', context)).toBe('Lucy');
    });

    it('throws when nested property does not exist', () => {
      expect(() => resolver.resolve('user.name', new ExecutionContext({ user: {} }))).toThrow(
        'Property "name" not found',
      );
    });

    it('throws when array index is out of range', () => {
      expect(() => resolver.resolve('users.0.name', new ExecutionContext({ users: [] }))).toThrow(
        'Array index "0" is out of range',
      );
    });

    it('throws when segment on array is not an index', () => {
      expect(() =>
        resolver.resolve('users.first', new ExecutionContext({ users: [{ name: 'Jack' }] })),
      ).toThrow('Expected array index');
    });

    it('throws when accessing property on primitive', () => {
      expect(() => resolver.resolve('name.length', new ExecutionContext({ name: 'Jack' }))).toThrow(
        'Cannot access "length" on string value',
      );
    });

    it('does not read prototype members', () => {
      expect(() => resolver.resolve('user.constructor', new ExecutionContext({ user: {} }))).toThrow(
        'Property "constructor" not found',
      );
    });

    it('rejects template syntax inside a path', () => {
      expect(() => resolver.resolve('{{score}}', new ExecutionContext({ score: 1 }))).toThrow(
        'Invalid variable path',
      );
    });
  });

  describe('resolveTemplateValue', () => {
    it('preserves object type for full variable expression', () => {
      const user = { id: 1, name: 'Jack' };

      expect(resolver.resolveTemplateValue('{{user}}', new ExecutionContext({ user }))).toEqual(
        user,
      );
    });

    it('returns string for mixed template', () => {
      const context = new ExecutionContext({ user: { name: 'Jack' } });

      expect(resolver.resolveTemplateValue('Hello {{user.name}}', context)).toBe('Hello Jack');
    });
  });
});