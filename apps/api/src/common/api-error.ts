import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GatewayTimeoutException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Stable, machine-readable error codes. Clients branch on `code`; `message` is for humans and may
 * change. Adding a code is fine, renaming or removing one breaks callers of the External API.
 */
export const API_ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'INVALID_TOKEN',
  'INVALID_CREDENTIALS',
  'EMAIL_ALREADY_REGISTERED',
  'PROJECT_NOT_FOUND',
  'PROJECT_ROLE_FORBIDDEN',
  'USER_NOT_FOUND',
  'PROJECT_MEMBER_NOT_FOUND',
  'PROJECT_MEMBER_ALREADY_EXISTS',
  'LAST_PROJECT_OWNER',
  'WORKFLOW_NOT_FOUND',
  'WORKFLOW_ARCHIVED',
  'WORKFLOW_DRAFT_MISSING',
  'WORKFLOW_INVALID',
  'WORKFLOW_NOT_PUBLISHED',
  'WORKFLOW_NO_UNPUBLISHED_CHANGES',
  'DRAFT_CHANGED_DURING_PUBLISH',
  'WORKFLOW_PUBLISH_CONFLICT',
  'WORKFLOW_VERSION_NOT_FOUND',
  'INVALID_API_KEY',
  'API_KEY_FORBIDDEN',
  'API_KEY_NOT_FOUND',
  'RUN_NOT_FOUND',
  'NODE_RUN_NOT_FOUND',
  'KNOWLEDGE_BASE_NOT_FOUND',
  'EMBEDDING_MODEL_NOT_FOUND',
  'KNOWLEDGE_REEMBED_REQUIRED',
  'KNOWLEDGE_DOCUMENT_NOT_FOUND',
  'KNOWLEDGE_EMBEDDING_MODEL_REQUIRED',
  'KNOWLEDGE_TEXT_REQUIRED',
  'DOCUMENT_NOT_FAILED',
  'DOCUMENT_PROCESSING',
  'CREDENTIAL_NOT_FOUND',
  'CREDENTIAL_REVOKED',
  'CREDENTIAL_BASE_URL_REQUIRED',
  'CREDENTIAL_DECRYPTION_ERROR',
  'MODEL_NOT_FOUND',
  'MODEL_NAME_CONFLICT',
  'MODEL_ALREADY_EXISTS',
  'MODEL_DISABLED',
  'REMOTE_MODEL_NOT_FOUND',
  // Calling a provider (connection test, model discovery). Same codes as failed LLM nodes.
  'PROVIDER_NOT_SUPPORTED',
  'AUTH_ERROR',
  'RATE_LIMIT',
  'INSUFFICIENT_BALANCE',
  'INVALID_REQUEST',
  'ENDPOINT_NOT_FOUND',
  'PROVIDER_UNAVAILABLE',
  'INVALID_PROVIDER_RESPONSE',
  'TIMEOUT',
  'NETWORK_ERROR',
  'PROVIDER_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  code: ApiErrorCode;
  message: string;
}

// An object passed to a Nest HTTP exception becomes the response body verbatim, so statusCode and
// error are spelled out to keep the default Nest shape. `exception.message` still reads `message`.
function body(statusCode: number, error: string, code: ApiErrorCode, message: string): ApiErrorBody {
  return { statusCode, error, code, message };
}

export const apiError = {
  badRequest: (code: ApiErrorCode, message: string) =>
    new BadRequestException(body(400, 'Bad Request', code, message)),
  unauthorized: (code: ApiErrorCode, message: string) =>
    new UnauthorizedException(body(401, 'Unauthorized', code, message)),
  forbidden: (code: ApiErrorCode, message: string) =>
    new ForbiddenException(body(403, 'Forbidden', code, message)),
  notFound: (code: ApiErrorCode, message: string) =>
    new NotFoundException(body(404, 'Not Found', code, message)),
  conflict: (code: ApiErrorCode, message: string) =>
    new ConflictException(body(409, 'Conflict', code, message)),
  internal: (code: ApiErrorCode, message: string) =>
    new InternalServerErrorException(body(500, 'Internal Server Error', code, message)),
  /** An upstream service (a model provider) answered with an error. */
  badGateway: (code: ApiErrorCode, message: string) =>
    new BadGatewayException(body(502, 'Bad Gateway', code, message)),
  gatewayTimeout: (code: ApiErrorCode, message: string) =>
    new GatewayTimeoutException(body(504, 'Gateway Timeout', code, message)),
};
