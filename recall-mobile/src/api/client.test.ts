import { ApiError, health, request } from './client';

function jsonResponse(body: unknown, status = 200, ok = status >= 200 && status < 300): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

function textResponse(body: string, status = 200, ok = status >= 200 && status < 300): Response {
  return {
    ok,
    status,
    text: async () => body,
  } as Response;
}

describe('api client', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('T1.4 GET /health with skipAuth parses { ok: true }', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ ok: true, version: '1.0' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await health();

    expect(result).toEqual({ ok: true, version: '1.0' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/health$/);
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('T1.5 non-JSON body does not crash and maps to an error', async () => {
    global.fetch = jest.fn().mockResolvedValue(textResponse('not-json', 200, true)) as unknown as typeof fetch;

    await expect(request('/health', { skipAuth: true })).rejects.toBeInstanceOf(ApiError);
    await expect(request('/health', { skipAuth: true })).rejects.toMatchObject({
      code: 'invalid_json',
    });
  });

  it('T1.6 abort/timeout maps to a user-safe error', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortError) as unknown as typeof fetch;

    await expect(health()).rejects.toMatchObject({
      name: 'ApiError',
      code: 'timeout',
      message: 'The request timed out. Check your connection and retry.',
    });
  });
});
