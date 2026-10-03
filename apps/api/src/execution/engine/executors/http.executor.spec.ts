import { ExecutionContext } from '../execution-context.js';
import { VariableResolver } from '../variable-resolver.js';
import type { WorkflowNode } from '../workflow-engine.types.js';
import { HttpExecutor } from './http.executor.js';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function httpNode(data: Record<string, unknown>): WorkflowNode {
  return { id: 'http-1', type: 'http', data: { outputVariable: 'response', ...data } };
}

describe('HttpExecutor', () => {
  let executor: HttpExecutor;

  beforeEach(() => {
    executor = new HttpExecutor(new VariableResolver());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves URL variables and stores JSON response in context', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ id: 1, name: 'FlowMind' }));
    const context = new ExecutionContext({ userId: 1 });

    await executor.execute(
      httpNode({ method: 'GET', url: 'https://example.com/users/{{userId}}', outputVariable: 'user' }),
      context,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/users/1',
      expect.objectContaining({ method: 'GET', body: undefined }),
    );
    expect(context.getVariable('user')).toEqual({ id: 1, name: 'FlowMind' });
  });

  it('sends resolved headers and JSON body for POST', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }));
    const context = new ExecutionContext({ message: 'Hello FlowMind', token: 'abc' });

    await executor.execute(
      httpNode({
        method: 'POST',
        url: 'https://example.com/messages',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer {{token}}' },
        body: '{"message":"{{message}}"}',
      }),
      context,
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer abc',
    });
    expect(JSON.parse(init.body as string)).toEqual({ message: 'Hello FlowMind' });
  });

  it('keeps JSON body valid when variable contains quotes and newlines', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }));
    const summary = 'line1\nHe said "hi"';

    await executor.execute(
      httpNode({ method: 'POST', url: 'https://example.com/messages', body: '{"text":"{{summary}}"}' }),
      new ExecutionContext({ summary }),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ text: summary });
  });

  it('stores text response when content type is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('pong', { status: 200 }));
    const context = new ExecutionContext({});

    await executor.execute(httpNode({ method: 'GET', url: 'https://example.com/ping' }), context);

    expect(context.getVariable('response')).toBe('pong');
  });

  it('throws when response status is not ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'not found' }, 404));

    await expect(
      executor.execute(httpNode({ method: 'GET', url: 'https://example.com/x' }), new ExecutionContext({})),
    ).rejects.toThrow('HTTP node http-1 received 404');
  });

  it('passes timeout signal and maps timeout error', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new DOMException('aborted', 'TimeoutError'));

    await expect(
      executor.execute(
        httpNode({ method: 'GET', url: 'https://example.com/slow', timeoutMs: 5000 }),
        new ExecutionContext({}),
      ),
    ).rejects.toThrow('HTTP node http-1 timed out after 5000ms');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects non-HTTP protocols without sending request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(
      executor.execute(httpNode({ method: 'GET', url: 'file:///etc/passwd' }), new ExecutionContext({})),
    ).rejects.toThrow('Only HTTP and HTTPS URLs are allowed');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});