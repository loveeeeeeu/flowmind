import { request } from './client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
}

interface AuthResult {
  accessToken: string;
  tokenType: 'Bearer';
  user: AuthenticatedUser;
  project?: { id: string; name: string };
}

export function login(input: { email: string; password: string }) {
  return request<AuthResult>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function register(input: { email: string; password: string; name?: string }) {
  return request<AuthResult>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getMe() {
  return request<AuthenticatedUser>('/auth/me');
}
