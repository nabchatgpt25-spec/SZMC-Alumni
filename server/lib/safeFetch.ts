import dns from 'dns/promises';
import net from 'net';

export const MAX_UNFURL_HTML_BYTES = 512 * 1024; // 512 KB cap
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  '0.0.0.0',
  '127.0.0.1',
  '::1',
  'metadata.google.internal',
  'metadata.goog',
  '169.254.169.254',
  '100.100.100.200', // Alibaba Cloud metadata
]);

function normalizeIpv6MappedIpv4(ip: string): string | null {
  const lower = ip.toLowerCase().trim();
  // Dotted form: ::ffff:127.0.0.1
  const dotted = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) return dotted[1];

  // Hex form: ::ffff:7f00:1 or ::ffff:a9fe:a9fe
  const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }
  return null;
}

export function isPrivateOrNonRoutableIp(rawIp: string): boolean {
  const ip = rawIp.trim().replace(/^\[|\]$/g, '').toLowerCase();
  if (!ip) return true;

  // Handle IPv4-mapped IPv6 addresses
  const mappedV4 = normalizeIpv6MappedIpv4(ip);
  if (mappedV4) {
    return isPrivateOrNonRoutableIp(mappedV4);
  }

  // IPv4 validation
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b, c] = parts;
    if (a === 0) return true; // 0.0.0.0/8 "This network"
    if (a === 10) return true; // 10.0.0.0/8 RFC 1918
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT / Tailscale
    if (a === 127) return true; // 127.0.0.0/8 Loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 Link-local & Cloud Metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 RFC 1918
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // IETF / TEST-NET-1
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 RFC 1918
    if (a === 198 && (b === 18 || b === 19)) return true; // Benchmark
    if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
    if (a >= 224) return true; // Multicast & Reserved (224.0.0.0 - 255.255.255.255)
    return false;
  }

  // IPv6 validation
  if (net.isIPv6(ip)) {
    if (ip === '::' || ip === '::1') return true;
    if (ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')) {
      return true; // fe80::/10 Link-local
    }
    if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // fc00::/7 Unique local
    if (ip.startsWith('ff')) return true; // ff00::/8 Multicast
    if (ip.startsWith('2001:db8:')) return true; // Documentation
    if (ip.startsWith('100::')) return true; // Discard-Only
    return false;
  }

  // Non-standard numeric/octal/hex IP representations (e.g., 2130706433, 0x7f000001, 0177.0.0.1)
  if (/^(0x[0-9a-f]+|\d+)$/i.test(ip)) {
    return true;
  }

  return false;
}

export function isSafeTargetUrl(rawUrl: string): { safe: boolean; error?: string; parsed?: URL } {
  try {
    const parsed = new URL(rawUrl.trim());

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { safe: false, error: 'Only HTTP and HTTPS URLs are permitted.' };
    }

    if (parsed.username || parsed.password) {
      return { safe: false, error: 'URLs containing embedded credentials are not allowed.' };
    }

    if (!ALLOWED_PORTS.has(parsed.port)) {
      return { safe: false, error: 'Non-standard network port is not allowed.' };
    }

    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!host) {
      return { safe: false, error: 'Missing hostname.' };
    }

    if (
      BLOCKED_HOSTNAMES.has(host) ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.home.arpa') ||
      host.includes('metadata.google')
    ) {
      return { safe: false, error: 'Requests to internal or localhost addresses are blocked.' };
    }

    if (isPrivateOrNonRoutableIp(host)) {
      return { safe: false, error: 'Requests to private or non-routable IP addresses are blocked.' };
    }

    return { safe: true, parsed };
  } catch {
    return { safe: false, error: 'Malformed URL.' };
  }
}

export async function validateHostDns(hostname: string): Promise<{ safe: boolean; error?: string }> {
  const cleanHost = hostname.toLowerCase().trim().replace(/^\[|\]$/g, '');
  if (!cleanHost) {
    return { safe: false, error: 'Missing hostname.' };
  }

  if (net.isIP(cleanHost)) {
    if (isPrivateOrNonRoutableIp(cleanHost)) {
      return { safe: false, error: 'Private or non-routable IP address is blocked.' };
    }
    return { safe: true };
  }

  const resolvedIps = new Set<string>();

  try {
    const records = await dns.lookup(cleanHost, { all: true, verbatim: true });
    for (const r of records) {
      if (r?.address) resolvedIps.add(r.address);
    }
  } catch {
    // Continue to explicit A/AAAA resolution below
  }

  const [v4Res, v6Res] = await Promise.allSettled([
    dns.resolve4(cleanHost),
    dns.resolve6(cleanHost),
  ]);

  if (v4Res.status === 'fulfilled') {
    for (const ip of v4Res.value) resolvedIps.add(ip);
  }
  if (v6Res.status === 'fulfilled') {
    for (const ip of v6Res.value) resolvedIps.add(ip);
  }

  if (resolvedIps.size === 0) {
    return { safe: false, error: 'Unable to resolve destination hostname.' };
  }

  for (const ip of resolvedIps) {
    if (isPrivateOrNonRoutableIp(ip)) {
      return {
        safe: false,
        error: 'Destination resolves to a private or non-routable IP address.',
      };
    }
  }

  return { safe: true };
}

export async function safeFetchHtml(
  targetUrl: string,
  options?: {
    userAgent?: string;
    timeoutMs?: number;
    maxRedirects?: number;
    maxBytes?: number;
  }
): Promise<{ html: string; finalUrl: string; contentType: string }> {
  const maxRedirects = options?.maxRedirects ?? 4;
  const timeoutMs = options?.timeoutMs ?? 6000;
  const maxBytes = options?.maxBytes ?? MAX_UNFURL_HTML_BYTES;
  const userAgent =
    options?.userAgent ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  let currentUrl = targetUrl.trim();
  let redirectsRemaining = maxRedirects;

  while (redirectsRemaining >= 0) {
    const urlCheck = isSafeTargetUrl(currentUrl);
    if (!urlCheck.safe || !urlCheck.parsed) {
      throw new Error(urlCheck.error || 'Target URL is not permitted.');
    }

    const dnsCheck = await validateHostDns(urlCheck.parsed.hostname);
    if (!dnsCheck.safe) {
      throw new Error(dnsCheck.error || 'Destination host resolution blocked.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let resp: Response;
    try {
      resp = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,bn;q=0.8',
          'Cache-Control': 'no-cache',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(resp.status)) {
      redirectsRemaining -= 1;
      const location = resp.headers.get('location');
      if (!location) {
        throw new Error('Redirect response missing Location header.');
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!resp.ok) {
      throw new Error(`Upstream returned HTTP ${resp.status}`);
    }

    const contentType = resp.headers.get('content-type') || '';
    const reader = resp.body?.getReader();
    if (!reader) {
      return { html: '', finalUrl: currentUrl, contentType };
    }

    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        const remaining = maxBytes - receivedBytes;
        if (remaining <= 0) {
          await reader.cancel().catch(() => {});
          break;
        }
        const slice = value.length > remaining ? value.subarray(0, remaining) : value;
        chunks.push(slice);
        receivedBytes += slice.length;
        if (receivedBytes >= maxBytes) {
          await reader.cancel().catch(() => {});
          break;
        }
      }
    }

    const merged = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const html = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true }).decode(merged);
    return { html, finalUrl: currentUrl, contentType };
  }

  throw new Error('Too many redirects.');
}
