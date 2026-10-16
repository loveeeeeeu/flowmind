export interface JwtPayload {
  sub: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
}
