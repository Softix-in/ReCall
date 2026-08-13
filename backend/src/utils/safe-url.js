const dns = require('dns').promises;
const net = require('net');

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.goog',
  'kubernetes',
  'kubernetes.default',
  'kubernetes.default.svc',
]);

class UnsafeUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsafeUrlError';
    this.status = 400;
    this.code = 'unsafe_url';
  }
}

function isBlockedIpv4(ip) {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }

  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

function isBlockedIp(ip) {
  const version = net.isIP(ip);
  if (version === 4) {
    return isBlockedIpv4(ip);
  }

  if (version === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === '::' || normalized === '::1') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (normalized.startsWith('fe80')) return true;
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice('::ffff:'.length);
      if (net.isIP(mapped) === 4) {
        return isBlockedIpv4(mapped);
      }
    }
    return false;
  }

  return true;
}

function hostnameLooksLocal(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (BLOCKED_HOSTS.has(host)) return true;
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host.endsWith('.arpa')) return true;
  return false;
}

function looksLikeNonstandardIpLiteral(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  if (net.isIP(host)) return false;
  if (/^\d+$/.test(host)) return true;
  if (/^0x[0-9a-f]+$/i.test(host)) return true;
  if (/^[\d.]+$/.test(host) && host.includes('.')) return true;
  if (/^0x[0-9a-f.]+$/i.test(host)) return true;
  return false;
}

async function assertPublicHttpUrl(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new UnsafeUrlError('URL is required');
  }

  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new UnsafeUrlError('Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http and https URLs are allowed');
  }

  if (parsed.username || parsed.password) {
    throw new UnsafeUrlError('URLs with credentials are not allowed');
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

  if (hostnameLooksLocal(hostname)) {
    throw new UnsafeUrlError('Private or local URLs are not allowed');
  }

  if (looksLikeNonstandardIpLiteral(hostname)) {
    throw new UnsafeUrlError('Private or local URLs are not allowed');
  }

  if (net.isIP(hostname) && isBlockedIp(hostname)) {
    throw new UnsafeUrlError('Private or local URLs are not allowed');
  }

  let records;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeUrlError('Could not resolve URL host');
  }

  if (!records.length || records.some((record) => isBlockedIp(record.address))) {
    throw new UnsafeUrlError('Private or local URLs are not allowed');
  }

  return parsed.toString();
}

async function fetchSafe(url, {
  timeoutMs = 15_000,
  maxRedirects = 5,
  headers = {},
  method = 'GET',
} = {}) {
  let current = await assertPublicHttpUrl(url);

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(current, {
        method,
        headers,
        redirect: 'manual',
        signal: controller.signal,
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new UnsafeUrlError('Redirect missing Location header');
        }
        current = await assertPublicHttpUrl(new URL(location, current).toString());
        continue;
      }

      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new UnsafeUrlError('Too many redirects');
}

async function readResponseLimited(response, maxBytes = 2_000_000) {
  const chunks = [];
  let total = 0;
  const reader = response.body?.getReader?.();

  if (!reader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw new UnsafeUrlError('Response too large');
    }
    return buffer;
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new UnsafeUrlError('Response too large');
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
}

function safeHref(raw) {
  if (!raw || typeof raw !== 'string') {
    return '';
  }

  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    if (parsed.username || parsed.password) {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

module.exports = {
  UnsafeUrlError,
  assertPublicHttpUrl,
  fetchSafe,
  readResponseLimited,
  safeHref,
  isBlockedIp,
};
