import { lookup as nodeLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ToolInputError } from '@flowmind/tool-runtime';

export interface ResolvedAddress {
  address: string;
  family: number;
}

export type DnsLookup = (hostname: string, options: { all: true }) => Promise<ResolvedAddress[]>;

/**
 * The HTTP tool is deliberately restricted to public network destinations. Checking both the
 * hostname and every DNS answer is important: a public-looking hostname may resolve to 127.0.0.1.
 */
export class HttpUrlSafetyService {
  constructor(private readonly lookup: DnsLookup = nodeLookup as DnsLookup) {}

  async assertAllowed(rawUrl: string): Promise<URL> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new ToolInputError('url must be a valid absolute HTTP or HTTPS URL');
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new ToolInputError('Only HTTP and HTTPS URLs are allowed');
    }
    if (url.username || url.password) {
      throw new ToolInputError('Credentials in URLs are not allowed');
    }

    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      throw blockedAddress();
    }

    // Literal addresses do not need DNS, but must go through the same private/reserved check.
    if (isIP(hostname)) {
      if (isPrivateOrReservedIp(hostname)) throw blockedAddress();
      return url;
    }

    let addresses: ResolvedAddress[];
    try {
      addresses = await this.lookup(hostname, { all: true });
    } catch {
      throw new ToolInputError('URL hostname could not be resolved');
    }
    if (addresses.length === 0 || addresses.some(({ address }) => isPrivateOrReservedIp(address))) {
      throw blockedAddress();
    }

    return url;
  }
}

function blockedAddress() {
  return new ToolInputError('Private or reserved network addresses are not allowed');
}

/** Kept parser-based rather than regex-based so CIDR boundaries are explicit and testable. */
export function isPrivateOrReservedIp(address: string): boolean {
  const normalized = address.toLowerCase();
  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split('.').map(Number);
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 0 || b === 168))
      || (a === 198 && (b === 18 || b === 19 || b === 51))
      || (a === 203 && b === 0)
      || a >= 224;
  }

  if (isIP(normalized) === 6) {
    const withoutZone = normalized.split('%')[0] ?? normalized;
    if (withoutZone === '::1' || withoutZone === '::') return true;
    // IPv4-mapped IPv6 addresses should inherit the IPv4 policy.
    const mapped = withoutZone.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
    if (mapped) return isPrivateOrReservedIp(mapped);
    const firstHextet = Number.parseInt(withoutZone.split(':')[0] ?? '', 16);
    const firstByte = firstHextet >> 8;
    return (firstByte >= 0xfc && firstByte <= 0xfd) || firstByte === 0xfe;
  }

  // A DNS answer must always be a parseable IP address.
  return true;
}
