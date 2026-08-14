import { ConfigError, getApiBaseUrl } from './config';

describe('getApiBaseUrl', () => {
  it('T1.1 strips a trailing slash from the API URL', () => {
    expect(getApiBaseUrl({ EXPO_PUBLIC_API_URL: 'https://example.com/' })).toBe('https://example.com');
    expect(getApiBaseUrl({ EXPO_PUBLIC_API_URL: 'https://example.com///' })).toBe('https://example.com');
  });

  it('T1.2 rejects an empty URL', () => {
    expect(() => getApiBaseUrl({ EXPO_PUBLIC_API_URL: '' })).toThrow(ConfigError);
    expect(() => getApiBaseUrl({ EXPO_PUBLIC_API_URL: '   ' })).toThrow(ConfigError);
    expect(() => getApiBaseUrl({})).toThrow(ConfigError);
  });
});
