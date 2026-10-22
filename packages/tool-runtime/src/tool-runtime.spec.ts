import type { Tool } from '@flowmind/shared';
import { describe, expect, it, vi } from 'vitest';
import { ToolExecutor } from './tool-executor.js';
import { ToolRegistry } from './tool-registry.js';
import { ToolInputError } from './tool-runtime.error.js';

function tool(name: string, execute: Tool['execute'] = vi.fn(async () => ({ output: { ok: true } }))): Tool {
  return {
    definition: {
      name,
      displayName: name,
      description: `${name} tool`,
      source: 'BUILT_IN',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    execute,
  };
}

describe('ToolRegistry', () => {
  it('registers, looks up, sorts public definitions, and rejects duplicate names', () => {
    const registry = new ToolRegistry();
    const zebra = tool('zebra');
    const alpha = tool('alpha');
    registry.register(zebra);
    registry.register(alpha);

    expect(registry.get('zebra')).toBe(zebra);
    expect(registry.getMany(['alpha', 'zebra'])).toEqual([alpha, zebra]);
    expect(registry.listDefinitions().map((definition) => definition.name)).toEqual(['alpha', 'zebra']);
    expect(JSON.stringify(registry.listDefinitions())).not.toContain('execute');
    expect(() => registry.register(alpha)).toThrow('Tool already registered: alpha');
  });
});

describe('ToolExecutor', () => {
  it('normalizes unknown and disallowed tools instead of throwing from the Agent boundary', async () => {
    const executor = new ToolExecutor(new ToolRegistry());

    await expect(executor.execute({ id: 'call-1', name: 'destroy_database', arguments: {} }, { projectId: 'project-1' }))
      .resolves.toEqual({
        toolCallId: 'call-1', toolName: 'destroy_database', ok: false,
        error: { code: 'TOOL_NOT_FOUND', message: 'Tool not found' },
      });

    const registry = new ToolRegistry();
    registry.register(tool('echo'));
    await expect(new ToolExecutor(registry).execute(
      { id: 'call-2', name: 'echo', arguments: {} }, { projectId: 'project-1' }, new Set(['search_knowledge']),
    )).resolves.toMatchObject({ ok: false, error: { code: 'TOOL_NOT_ALLOWED' } });
  });

  it('preserves stable tool/business codes while hiding unstructured implementation errors', async () => {
    const registry = new ToolRegistry();
    registry.register(tool('invalid', async () => { throw new ToolInputError(); }));
    registry.register(tool('broken', async () => { throw new Error('secret stack detail'); }));
    const executor = new ToolExecutor(registry);

    await expect(executor.execute({ id: 'a', name: 'invalid', arguments: {} }, { projectId: 'project-1' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'TOOL_INPUT_INVALID' } });
    await expect(executor.execute({ id: 'b', name: 'broken', arguments: {} }, { projectId: 'project-1' }))
      .resolves.toEqual({
        toolCallId: 'b', toolName: 'broken', ok: false,
        error: { code: 'TOOL_EXECUTION_FAILED', message: 'Tool execution failed' },
      });
  });
});
