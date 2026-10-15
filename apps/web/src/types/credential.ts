export type CredentialProvider = 'OPENAI' | 'DEEPSEEK' | 'OPENAI_COMPATIBLE';

/** What the API returns. There is deliberately no secret field: it can be written, never read. */
export interface Credential {
  id: string;
  name: string;
  provider: CredentialProvider;
  /** null: the provider's official endpoint. */
  baseUrl: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCredentialInput {
  name: string;
  provider: CredentialProvider;
  baseUrl: string | null;
  secret: string;
}

/** GET /credentials/:id/remote-models: what the provider's GET /models lists right now. */
export interface RemoteModel {
  /** The provider's model id; becomes modelName when imported. */
  id: string;
  /** A model with this modelName already exists under the credential. */
  imported: boolean;
}

/** Omitted fields are kept; omitting secret keeps the stored one. */
export interface UpdateCredentialInput {
  name?: string;
  baseUrl?: string | null;
  secret?: string;
}
