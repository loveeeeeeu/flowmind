export const API_BASE_URL = 'http://localhost:3000';

/** `code` is the API's stable error code (e.g. MODEL_NAME_CONFLICT); `message` is for display. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code: string | undefined) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  if (response.status === 401) {
    clearAccessToken();
    // The server is authoritative: an expired token returns the user to Login.
    if (window.location.pathname !== '/login') {
      window.location.assign('/login');
    }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : body?.message;
    throw new ApiRequestError(
      message ?? `Request failed with status ${response.status}`,
      response.status,
      typeof body?.code === 'string' ? body.code : undefined,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
import { clearAccessToken, getAccessToken } from '../auth/token';
