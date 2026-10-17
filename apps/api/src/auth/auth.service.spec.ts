import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';

function setup({ existing = null, loginUser = null as unknown } = {}) {
  const tx = {
    user: { create: vi.fn().mockResolvedValue({ id: 'user-1', email: 'alice@example.com', name: 'Alice' }) },
    project: { create: vi.fn().mockResolvedValue({ id: 'project-1', name: 'Personal Workspace' }) },
  };
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue(existing ?? loginUser) },
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const passwordHasher = { hash: vi.fn().mockResolvedValue('argon2-hash'), verify: vi.fn().mockResolvedValue(false) };
  const jwt = { signAsync: vi.fn().mockResolvedValue('jwt-token') };
  return { service: new AuthService(prisma as never, passwordHasher as never, jwt as never), prisma, tx, passwordHasher, jwt };
}

describe('AuthService', () => {
  it('registers atomically: user + personal workspace + OWNER membership, with no password in the response', async () => {
    const { service, tx, passwordHasher, jwt } = setup();
    const password = 'flowmind-test-password';

    const response = await service.register({ email: ' Alice@Example.com ', name: 'Alice', password });

    expect(passwordHasher.hash).toHaveBeenCalledWith(password);
    expect(tx.user.create).toHaveBeenCalledWith({
      data: { email: 'alice@example.com', name: 'Alice', passwordHash: 'argon2-hash' },
      select: { id: true, email: true, name: true },
    });
    expect(tx.project.create).toHaveBeenCalledWith({
      data: { name: 'Personal Workspace', members: { create: { userId: 'user-1', role: 'OWNER' } } },
      select: { id: true, name: true },
    });
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'user-1' });
    expect(JSON.stringify(response)).not.toContain(password);
    expect(JSON.stringify(response)).not.toContain('passwordHash');
  });

  it('uses one INVALID_CREDENTIALS response for unknown email and wrong password', async () => {
    const missing = setup();
    await expect(missing.service.login({ email: 'missing@example.com', password: 'wrong' })).rejects.toMatchObject({
      status: 401,
      response: expect.objectContaining({ code: 'INVALID_CREDENTIALS' }),
    });

    const wrongPassword = setup({
      loginUser: { id: 'user-1', email: 'alice@example.com', name: 'Alice', passwordHash: 'stored-hash' },
    });
    await expect(wrongPassword.service.login({ email: 'alice@example.com', password: 'wrong' })).rejects.toMatchObject({
      status: 401,
      response: expect.objectContaining({ code: 'INVALID_CREDENTIALS' }),
    });
  });
});
