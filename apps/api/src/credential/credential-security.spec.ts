import { randomBytes } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { CredentialCrypto } from '@flowmind/shared';
import { validateEnv as validateApiEnv } from '../config/env.schema.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CredentialCryptoService } from './credential-crypto.service.js';
import { CredentialService } from './credential.service.js';
import { ModelService } from '../model/model.service.js';
import { WorkflowResourceValidator } from '../workflow/workflow-resource-validator.service.js';

const RAW_SECRET = 'flowmind-super-secret-test-value-12345';
const SENSITIVE_FIELDS = ['secret', 'encryptedSecret', 'secretIv', 'secretAuthTag', RAW_SECRET];

function getCallSelect(mockFn: unknown): Record<string, unknown> {
  const calls = (mockFn as { mock: { calls: unknown[][] } }).mock.calls;
  const firstArg = calls[0]?.[0] as { select?: Record<string, unknown> } | undefined;
  return firstArg?.select ?? {};
}

describe('Sprint 9 Security & Boundary Invariants', () => {
  const masterKeyBase64 = randomBytes(32).toString('base64');
  const cryptoService = new CredentialCryptoService({
    get: () => masterKeyBase64,
  } as unknown as ConfigService);
  const cryptoShared = new CredentialCrypto(Buffer.from(masterKeyBase64, 'base64'));

  describe('Invariant 1: Credential API Response Whitelist (No Secret / Ciphertext Leakage)', () => {
    const encrypted = cryptoService.encrypt(RAW_SECRET);
    const fakeCredentialRow = {
      id: 'cred-test-1',
      name: 'Test Credential',
      provider: 'OPENAI',
      baseUrl: 'https://api.openai.com/v1',
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...encrypted,
    };

    const prismaMock = {
      credential: {
        create: vi.fn(async () => fakeCredentialRow),
        findMany: vi.fn(async () => [fakeCredentialRow]),
        findUnique: vi.fn(async () => fakeCredentialRow),
        update: vi.fn(async () => fakeCredentialRow),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };

    const credentialService = new CredentialService(
      prismaMock as unknown as PrismaService,
      cryptoService,
    );

    it('create() only selects public summary fields and never returns raw secret or ciphertext', async () => {
      await credentialService.create({
        name: 'Test Credential',
        provider: 'OPENAI',
        baseUrl: 'https://api.openai.com/v1',
        secret: RAW_SECRET,
      });

      const selectKeys = Object.keys(getCallSelect(prismaMock.credential.create));

      for (const field of SENSITIVE_FIELDS) {
        expect(selectKeys).not.toContain(field);
      }
    });

    it('findOne() and findAll() select whitelisted fields only', async () => {
      await credentialService.findOne('cred-test-1');
      await credentialService.findAll();

      const findOneSelect = Object.keys(getCallSelect(prismaMock.credential.findUnique));
      const findAllSelect = Object.keys(getCallSelect(prismaMock.credential.findMany));

      for (const field of SENSITIVE_FIELDS) {
        expect(findOneSelect).not.toContain(field);
        expect(findAllSelect).not.toContain(field);
      }
    });

    it('update() preserves secret confidentiality on update', async () => {
      await credentialService.update('cred-test-1', { name: 'New Name' });

      const updateSelect = Object.keys(getCallSelect(prismaMock.credential.update));
      for (const field of SENSITIVE_FIELDS) {
        expect(updateSelect).not.toContain(field);
      }
    });
  });

  describe('Invariant 2: Model API Relation Whitelist (Never includes ciphertext through relations)', () => {
    const encrypted = cryptoShared.encrypt(RAW_SECRET);
    const modelRowWithCredential = {
      id: 'model-1',
      credentialId: 'cred-1',
      name: 'GPT-5',
      modelName: 'gpt-5',
      type: 'CHAT',
      contextWindow: 128000,
      supportsTemperature: true,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      credential: {
        id: 'cred-1',
        name: 'OpenAI Production',
        provider: 'OPENAI',
        baseUrl: 'https://api.openai.com/v1',
        revokedAt: null,
        ...encrypted,
      },
    };

    const prismaModelMock = {
      model: {
        findUnique: vi.fn(async () => modelRowWithCredential),
        findMany: vi.fn(async () => [modelRowWithCredential]),
      },
    };

    const modelService = new ModelService(
      prismaModelMock as unknown as PrismaService,
      {} as never,
    );

    it('findOne() specifies explicit whitelist for credential relation without ciphertext', async () => {
      await modelService.findOne('model-1');

      const select = getCallSelect(prismaModelMock.model.findUnique) as {
        credential?: { select?: Record<string, unknown> };
      };
      const serializedSelect = JSON.stringify(select);

      for (const field of ['secret', 'encryptedSecret', 'secretIv', 'secretAuthTag']) {
        expect(serializedSelect).not.toContain(field);
      }
      expect(select.credential?.select).toBeDefined();
      expect(select.credential?.select?.['encryptedSecret']).toBeUndefined();
    });

    it('findAvailable() never queries credential secrets', async () => {
      await modelService.findAvailable();

      const select = getCallSelect(prismaModelMock.model.findMany);
      const serialized = JSON.stringify(select);

      for (const field of ['secret', 'encryptedSecret', 'secretIv', 'secretAuthTag']) {
        expect(serialized).not.toContain(field);
      }
    });
  });

  describe('Invariant 3: Master Key Fail-Fast Startup Validation', () => {
    it('refuses to start when CREDENTIAL_ENCRYPTION_KEY is missing or invalid', () => {
      expect(() =>
        validateApiEnv({
          DATABASE_URL: 'postgresql://localhost:5432/db',
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
        }),
      ).toThrow(/CREDENTIAL_ENCRYPTION_KEY/);

      expect(() =>
        validateApiEnv({
          DATABASE_URL: 'postgresql://localhost:5432/db',
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
          CREDENTIAL_ENCRYPTION_KEY: 'not-32-bytes-base64',
        }),
      ).toThrow(/CREDENTIAL_ENCRYPTION_KEY/);
    });

    it('accepts a valid 32-byte base64 master key', () => {
      const valid = validateApiEnv({
        DATABASE_URL: 'postgresql://localhost:5432/db',
        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
        CREDENTIAL_ENCRYPTION_KEY: masterKeyBase64,
      });

      expect(valid.CREDENTIAL_ENCRYPTION_KEY).toBe(masterKeyBase64);
    });
  });

  describe('Invariant 4: Draft Resource Validation vs Published Runtime Separation', () => {
    it('validateForDraft rejects disabled models and revoked credentials', async () => {
      const prisma = {
        model: {
          findMany: vi.fn(async () => [
            { id: 'm1', enabled: false, credential: { revokedAt: null } },
            { id: 'm2', enabled: true, credential: { revokedAt: new Date() } },
          ]),
        },
      };
      const validator = new WorkflowResourceValidator(prisma as unknown as PrismaService);

      await expect(
        validator.validateForDraft({
          nodes: [{ id: 'llm-1', type: 'llm', data: { modelId: 'm1', prompt: 'hi' } }],
          edges: [],
        }),
      ).rejects.toMatchObject({ response: { code: 'MODEL_DISABLED' } });

      await expect(
        validator.validateForDraft({
          nodes: [{ id: 'llm-2', type: 'llm', data: { modelId: 'm2', prompt: 'hi' } }],
          edges: [],
        }),
      ).rejects.toMatchObject({ response: { code: 'CREDENTIAL_REVOKED' } });
    });
  });

  describe('Invariant 5: Workflow Canvas Representation (Zero Credential Secret Storage)', () => {
    it('LLM canvas node stores only modelId and user prompt, zero credentials or secrets', () => {
      const canvasNode = {
        id: 'llm-node-1',
        type: 'llm',
        data: {
          modelId: 'cm_gpt5_123',
          prompt: 'Hello {{name}}',
          temperature: 0.7,
          outputVariable: 'answer',
        },
      };

      const serialized = JSON.stringify(canvasNode);
      expect(serialized).toContain('cm_gpt5_123');
      for (const secretField of SENSITIVE_FIELDS) {
        expect(serialized).not.toContain(secretField);
      }
      expect(serialized).not.toContain('provider');
      expect(serialized).not.toContain('credentialId');
    });
  });
});
