import { assertPublicHttpUrl, isHttpUrl } from './url';

describe('url helpers', () => {
  it('T1.3 accepts https URLs', () => {
    expect(isHttpUrl('https://example.com')).toBe(true);
    expect(assertPublicHttpUrl('https://example.com')).toBe('https://example.com');
  });

  it('T1.3 rejects javascript, empty, and ftp URLs', () => {
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('')).toBe(false);
    expect(isHttpUrl('ftp://x')).toBe(false);
    expect(() => assertPublicHttpUrl('javascript:alert(1)')).toThrow();
    expect(() => assertPublicHttpUrl('')).toThrow();
    expect(() => assertPublicHttpUrl('ftp://x')).toThrow();
  });
});
