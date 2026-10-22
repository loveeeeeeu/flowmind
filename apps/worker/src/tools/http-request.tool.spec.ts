import { ToolExecutor, ToolRegistry } from '@flowmind/tool-runtime';
import { HttpRequestTool, MAX_HTTP_TOOL_RESPONSE_BYTES } from './http-request.tool.js';
import { HttpUrlSafetyService } from './http-url-safety.service.js';

function publicSafety() {
  return new HttpUrlSafetyService(async () => [{ address: '93.184.216.34', family: 4 }]);
}

describe('HttpRequestTool', () => {
  it('does not follow redirects', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 302, headers: { location: 'http://127.0.0.1/admin' } }));
    const tool = new HttpRequestTool(publicSafety(), fetcher as typeof fetch);
    await expect(tool.execute({ method: 'GET', url: 'https://example.com/redirect' }, { projectId: 'project-a' }))
      .rejects.toMatchObject({ code: 'HTTP_REDIRECT_NOT_ALLOWED' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((fetcher.mock.calls[0] as unknown as [unknown, RequestInit])[1]).toMatchObject({ redirect: 'manual' });
  });

  it('treats a remote 404 as a successful tool execution and strips dangerous headers', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ message: 'not found' }), {
      status: 404, headers: { 'content-type': 'application/json', 'set-cookie': 'secret' },
    }));
    const tool = new HttpRequestTool(publicSafety(), fetcher as typeof fetch);
    const registry = new ToolRegistry();
    registry.register(tool);
    const result = await new ToolExecutor(registry).execute({
      id: 'call-1', name: 'http_request', arguments: {
        method: 'GET', url: 'https://example.com/missing', headers: { Cookie: 'no', Connection: 'close', Accept: 'application/json' },
      },
    }, { projectId: 'project-a' });

    expect(result).toMatchObject({ ok: true, output: { status: 404, ok: false, body: { message: 'not found' } } });
    expect((fetcher.mock.calls[0] as unknown as [unknown, RequestInit])[1]).toMatchObject({ headers: { Accept: 'application/json' } });
  });

  it('rejects oversized and binary responses before they enter model context', async () => {
    const large = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(MAX_HTTP_TOOL_RESPONSE_BYTES + 1)); controller.close(); },
    });
    const tooLarge = new HttpRequestTool(publicSafety(), vi.fn(async () => new Response(large, { status: 200, headers: { 'content-type': 'text/plain' } })) as typeof fetch);
    await expect(tooLarge.execute({ method: 'GET', url: 'https://example.com/large' }, { projectId: 'project-a' }))
      .rejects.toMatchObject({ code: 'HTTP_RESPONSE_TOO_LARGE' });

    const binary = new HttpRequestTool(publicSafety(), vi.fn(async () => new Response(new Uint8Array([1, 2]), { status: 200, headers: { 'content-type': 'image/png' } })) as typeof fetch);
    await expect(binary.execute({ method: 'GET', url: 'https://example.com/image' }, { projectId: 'project-a' }))
      .rejects.toMatchObject({ code: 'HTTP_UNSUPPORTED_CONTENT_TYPE' });
  });
});
