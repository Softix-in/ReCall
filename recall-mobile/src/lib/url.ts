const HTTP_RE = /^https?:\/\//i;
const JAVASCRIPT_RE = /^\s*javascript:/i;

export function trimUrl(value: string): string {
  return value.trim();
}

export function isHttpUrl(value: string): boolean {
  const trimmed = trimUrl(value);

  if (!trimmed || JAVASCRIPT_RE.test(trimmed)) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return HTTP_RE.test(trimmed) && !JAVASCRIPT_RE.test(trimmed);
  }
}

export function assertPublicHttpUrl(value: string): string {
  const trimmed = trimUrl(value);

  if (!trimmed) {
    throw new Error('URL is required');
  }

  if (JAVASCRIPT_RE.test(trimmed) || !isHttpUrl(trimmed)) {
    throw new Error('Only http and https URLs are allowed');
  }

  return trimmed;
}

export function extractHttpUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0].replace(/[),.;]+$/, '') : null;
}
