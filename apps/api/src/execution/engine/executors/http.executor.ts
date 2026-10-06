import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from '../execution-context.js';
import { VariableResolver } from '../variable-resolver.js';
import type { WorkflowNode } from '../workflow-engine.types.js';
import { WorkflowExecutionError } from '../workflow-execution.error.js';
import type { NodeExecutor } from './node-executor.js';

const SUPPORTED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
type HttpMethod = (typeof SUPPORTED_METHODS)[number];

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_ERROR_BODY_LENGTH = 500;

function isHttpMethod(value: string): value is HttpMethod {
  return (SUPPORTED_METHODS as readonly string[]).includes(value);
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` (${error.cause.message})` : '';
    return `${error.message}${cause}`;
  }

  return String(error);
}

@Injectable()
export class HttpExecutor implements NodeExecutor {
  readonly type = 'http';

  constructor(private readonly resolver: VariableResolver) {}

  async execute(node: WorkflowNode, context: ExecutionContext) {
    const { method, url, headers, body, timeoutMs, outputVariable } = node.data;

    if (typeof method !== 'string') {
      throw new WorkflowExecutionError(`HTTP node ${node.id} has no method`);
    }

    const normalizedMethod = method.toUpperCase();

    if (!isHttpMethod(normalizedMethod)) {
      throw new WorkflowExecutionError(`HTTP node ${node.id} has unsupported method: ${method}`);
    }

    if (typeof url !== 'string' || !url.trim()) {
      throw new WorkflowExecutionError(`HTTP node ${node.id} has no URL`);
    }

    if (typeof outputVariable !== 'string' || !outputVariable.trim()) {
      throw new WorkflowExecutionError(`HTTP node ${node.id} has no outputVariable`);
    }

    const finalTimeoutMs = this.resolveTimeout(node.id, timeoutMs);
    const resolvedUrl = this.resolver.resolveString(url, context);
    this.validateUrl(resolvedUrl);

    const resolvedHeaders = this.resolveHeaders(node.id, headers, context);
    const resolvedBody = this.canHaveBody(normalizedMethod)
      ? this.resolveBody(body, context)
      : undefined;

    let response: Response;
    let result: unknown;

    try {
      response = await fetch(resolvedUrl, {
        method: normalizedMethod,
        headers: resolvedHeaders,
        body: resolvedBody,
        signal: AbortSignal.timeout(finalTimeoutMs),
      });
      result = await this.parseResponse(response);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new WorkflowExecutionError(
          `HTTP node ${node.id} timed out after ${finalTimeoutMs}ms`,
        );
      }

      throw new WorkflowExecutionError(
        `HTTP node ${node.id} request failed: ${describeError(error)}`,
      );
    }

    if (!response.ok) {
      throw new WorkflowExecutionError(
        `HTTP node ${node.id} received ${response.status}: ${this.summarize(result)}`,
      );
    }

    context.setVariable(outputVariable, result);

    return {
      output: {
        status: response.status,
        data: result,
      },
    };
  }

  private resolveTimeout(nodeId: string, value: unknown): number {
    if (value === undefined) {
      return DEFAULT_TIMEOUT_MS;
    }

    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > MAX_TIMEOUT_MS) {
      throw new WorkflowExecutionError(
        `HTTP node ${nodeId} timeoutMs must be between 1 and ${MAX_TIMEOUT_MS}`,
      );
    }

    return value;
  }

  private validateUrl(url: string) {
    let parsed: URL;

    try {
      parsed = new URL(url);
    } catch {
      throw new WorkflowExecutionError(`Invalid HTTP URL: ${url}`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new WorkflowExecutionError('Only HTTP and HTTPS URLs are allowed');
    }
  }

  private canHaveBody(method: HttpMethod) {
    return method === 'POST' || method === 'PUT' || method === 'PATCH';
  }

  private resolveHeaders(
    nodeId: string,
    value: unknown,
    context: ExecutionContext,
  ): Record<string, string> {
    if (value === undefined || value === null) {
      return {};
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new WorkflowExecutionError(`HTTP node ${nodeId} headers must be an object`);
    }

    const result: Record<string, string> = {};

    for (const [key, headerValue] of Object.entries(value)) {
      result[key] = this.resolver.resolveString(String(headerValue), context);
    }

    return result;
  }

  private resolveBody(value: unknown, context: ExecutionContext): string | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    if (typeof value === 'string') {
      const parsed = this.tryParseJson(value);

      return parsed === undefined
        ? this.resolver.resolveString(value, context)
        : JSON.stringify(this.resolveJsonValue(parsed, context));
    }

    return JSON.stringify(this.resolveJsonValue(value, context));
  }

  private resolveJsonValue(value: unknown, context: ExecutionContext): unknown {
    if (typeof value === 'string') {
      return this.resolver.resolveString(value, context);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.resolveJsonValue(item, context));
    }

    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, this.resolveJsonValue(item, context)]),
      );
    }

    return value;
  }

  private tryParseJson(text: string): unknown {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return undefined;
    }
  }

  private async parseResponse(response: Response): Promise<unknown> {
    const text = await response.text();
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json') && text) {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return text;
      }
    }

    return text;
  }

  private summarize(result: unknown) {
    const text = typeof result === 'string' ? result : JSON.stringify(result);
    return text.length > MAX_ERROR_BODY_LENGTH ? `${text.slice(0, MAX_ERROR_BODY_LENGTH)}...` : text;
  }
}