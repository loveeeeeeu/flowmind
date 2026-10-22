import { HttpUrlSafetyService, isPrivateOrReservedIp } from './http-url-safety.service.js';

describe('HttpUrlSafetyService', () => {
  it.each(['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fc00::1', 'fe80::1'])(
    'recognises %s as a private or reserved address',
    (address) => expect(isPrivateOrReservedIp(address)).toBe(true),
  );

  it('rejects localhost and an innocent-looking hostname that resolves to a private address', async () => {
    const safety = new HttpUrlSafetyService(async () => [{ address: '127.0.0.1', family: 4 }]);
    await expect(safety.assertAllowed('http://localhost:3000')).rejects.toMatchObject({ code: 'TOOL_INPUT_INVALID' });
    await expect(safety.assertAllowed('https://evil.example/path')).rejects.toMatchObject({ code: 'TOOL_INPUT_INVALID' });
  });

  it('permits a public HTTP endpoint after DNS validation', async () => {
    const safety = new HttpUrlSafetyService(async () => [{ address: '93.184.216.34', family: 4 }]);
    await expect(safety.assertAllowed('https://example.com/')).resolves.toMatchObject({ hostname: 'example.com' });
  });
});
