import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Stable, machine-readable error codes. Clients branch on `code`; `message` is for humans and may
 * change. Adding a code is fine, renaming or removing one breaks callers of the External API.
 */
export const API_ERROR_CODES = [
  'VALIDATION_FAILED',
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
};
