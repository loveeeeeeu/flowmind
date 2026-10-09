import { CodeRunnerService } from './code-runner.service.js';

describe('CodeRunnerService', () => {
  const runner = new CodeRunnerService();

  function run(code: string, input: unknown = {}, timeoutMs = 1000) {
    return runner.run({ code, input, timeoutMs });
  }

  it('returns object result', async () => {
    const result = await run('return { total: input.price * input.quantity };', {
      price: 100,
      quantity: 3,
    });

    expect(result.output).toEqual({ total: 300 });
  });

  it('returns array and primitive results', async () => {
    expect((await run('return input.map((n) => n * 2);', [1, 2, 3])).output).toEqual([2, 4, 6]);
    expect((await run('return input.length;', [1, 2, 3])).output).toBe(3);
  });

  it('supports async code', async () => {
    const result = await run('await Promise.resolve(); return input;', { ok: true });

    expect(result.output).toEqual({ ok: true });
  });

  it('tolerates a trailing line comment', async () => {
    expect((await run('return 1; // done')).output).toBe(1);
  });

  it('reports thrown errors', async () => {
    await expect(run("throw new Error('boom');")).rejects.toThrow('boom');
  });

  it('rejects code without return value', async () => {
    await expect(run('const x = 1;')).rejects.toThrow('Code must return a value');
  });

  it('rejects non-transferable return value', async () => {
    await expect(run('return () => 1;')).rejects.toThrow('cannot be transferred');
  });

  it('terminates synchronous infinite loop', async () => {
    await expect(run('while (true) {}', {}, 100)).rejects.toThrow(/timed out/);
  });

  it('terminates async code that never finishes', async () => {
    await expect(run('await new Promise(() => {});', {}, 100)).rejects.toThrow(
      'Code execution timed out after 100ms',
    );
  });

  it('does not expose parent env vars even through a vm escape', async () => {
    vi.stubEnv('FLOWMIND_TEST_SECRET', 'should-not-leak');

    const result = await run("return this.constructor.constructor('return process')().env;");

    expect(result.output).not.toHaveProperty('FLOWMIND_TEST_SECRET');
    vi.unstubAllEnvs();
  });
});
