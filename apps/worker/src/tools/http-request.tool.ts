import type { Tool, ToolExecutionContext, ToolExecutionResult } from '@flowmind/shared';
import { ToolInputError, ToolRuntimeError } from '@flowmind/tool-runtime';
import { HttpUrlSafetyService } from './http-url-safety.service.js';

const HTTP_TOOL_TIMEOUT_MS = 10_000;
export const MAX_HTTP_TOOL_RESPONSE_BYTES = 256 * 1024;

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
interface HttpRequestToolInput {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

const BLOCKED_HEADERS = new Set([
  'host', 'connection', 'content-length', 'transfer-encoding', 'proxy-authorization',
  'proxy-authenticate', 'cookie', 'set-cookie', 'authorization',
]);

/** A small, public-API-only HTTP adapter. It intentionally has no credential integration yet. */
export class HttpRequestTool implements Tool {
  readonly definition = {
    name: 'http_request',
    displayName: 'HTTP Request',
    description: 'Makes an HTTP or HTTPS request to an allowed public endpoint.',
    source: 'BUILT_IN',
    inputSchema: {
      type: 'object',
      properties: {
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
        url: { type: 'string', description: 'The public HTTP or HTTPS URL to request.' },
        headers: { type: 'object', additionalProperties: { type: 'string' } },
        body: {},
      },
      required: ['method', 'url'],
      additionalProperties: false,
    },
  } as const;

  constructor(
    private readonly urlSafety: HttpUrlSafetyService,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async execute(rawInput: unknown, _context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const input = parseHttpRequestInput(rawInput);
    const url = await this.urlSafety.assertAllowed(input.url);
    const headers = sanitizeHeaders(input.headers ?? {});
    const body = serializeRequestBody(input);
    if (body !== undefined && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
      headers['content-type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: input.method,
        headers,
        ...(body === undefined ? {} : { body }),
        redirect: 'manual',
        signal: AbortSignal.timeout(HTTP_TOOL_TIMEOUT_MS),
      });
    } catch (error) {
      if (isTimeout(error)) throw new ToolRuntimeError('HTTP_TIMEOUT', 'HTTP request timed out');
      throw new ToolRuntimeError('HTTP_NETWORK_ERROR', 'HTTP request failed');
    }

    if (response.status >= 300 && response.status < 400) {
      throw new ToolRuntimeError('HTTP_REDIRECT_NOT_ALLOWED', 'HTTP redirects are not allowed');
    }

    return { output: await readBoundedHttpResponse(response), truncated: false };
  }
}

export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!BLOCKED_HEADERS.has(key.toLowerCase())) result[key] = value;
  }
  return result;
}

function parseHttpRequestInput(value: unknown): HttpRequestToolInput {
  if (!isRecord(value)) throw new ToolInputError('HTTP request input must be an object');
  const allowed = new Set(['method', 'url', 'headers', 'body']);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new ToolInputError('HTTP request input contains an unsupported field');
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(value.method as string)) {
    throw new ToolInputError('method must be GET, POST, PUT, PATCH, or DELETE');
  }
  if (typeof value.url !== 'string' || !value.url.trim()) throw new ToolInputError('url must be a non-empty string');
  if (value.headers !== undefined && (!isRecord(value.headers) || Object.values(value.headers).some((header) => typeof header !== 'string'))) {
    throw new ToolInputError('headers must be a string-to-string object');
  }
  if ((value.method === 'GET' || value.method === 'DELETE') && value.body !== undefined) {
    throw new ToolInputError(`${value.method} requests cannot have a body`);
  }
  return {
    method: value.method as HttpMethod,
    url: value.url.trim(),
    ...(value.headers === undefined ? {} : { headers: value.headers as Record<string, string> }),
    ...(value.body === undefined ? {} : { body: value.body }),
  };
}

function serializeRequestBody(input: HttpRequestToolInput): string | undefined {
  if (input.body === undefined) return undefined;
  if (typeof input.body === 'string') return input.body;
  try {
    return JSON.stringify(input.body);
  } catch {
    throw new ToolInputError('body must be JSON serializable');
  }
}

async function readBoundedHttpResponse(response: Response) {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType && !contentType.includes('json') && !contentType.startsWith('text/')) {
    throw new ToolRuntimeError('HTTP_UNSUPPORTED_CONTENT_TYPE', 'HTTP tool supports only JSON or text responses');
  }
  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_HTTP_TOOL_RESPONSE_BYTES) {
    throw new ToolRuntimeError('HTTP_RESPONSE_TOO_LARGE', 'HTTP response exceeds the 256 KB limit');
  }

  const bytes = await readResponseBytes(response);
  const text = new TextDecoder().decode(bytes);
  let body: unknown = text;
  if (contentType.includes('json') && text) {
    try { body = JSON.parse(text); } catch { /* A broken server response remains observable as text. */ }
  }
  const headers: Record<string, string> = {};
  for (const name of ['content-type', 'content-length']) {
    const value = response.headers.get(name);
    if (value) headers[name] = value;
  }
  return { status: response.status, ok: response.ok, headers, body, truncated: false };
}

async function readResponseBytes(response: Response): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_HTTP_TOOL_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ToolRuntimeError('HTTP_RESPONSE_TOO_LARGE', 'HTTP response exceeds the 256 KB limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTimeout(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
}
