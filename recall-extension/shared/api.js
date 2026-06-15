const DEFAULT_API_BASE = 'http://127.0.0.1:7878';
const STORAGE_KEYS = {
  backendUrl: 'recallBackendUrl',
  apiKey: 'recallApiKey',
};

export const API_BASE = DEFAULT_API_BASE;

export async function getExtensionConfig() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return { base: DEFAULT_API_BASE, apiKey: '' };
  }

  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.backendUrl,
    STORAGE_KEYS.apiKey,
  ]);

  const base = (stored[STORAGE_KEYS.backendUrl] || DEFAULT_API_BASE).replace(/\/$/, '');
  const apiKey = stored[STORAGE_KEYS.apiKey] || '';

  return { base, apiKey };
}

export async function saveExtensionConfig({ backendUrl, apiKey }) {
  const payload = {};

  if (backendUrl !== undefined) {
    payload[STORAGE_KEYS.backendUrl] = backendUrl.trim().replace(/\/$/, '') || DEFAULT_API_BASE;
  }

  if (apiKey !== undefined) {
    payload[STORAGE_KEYS.apiKey] = apiKey.trim();
  }

  await chrome.storage.local.set(payload);
}

export async function getConnectionSettings() {
  return getExtensionConfig();
}

export async function loadExtensionConfig() {
  const { base, apiKey } = await getExtensionConfig();
  return {
    backendUrl: base,
    apiKey,
  };
}

async function buildAuthHeaders(apiKey) {
  if (!apiKey) {
    return {};
  }

  return {
    Authorization: `Bearer ${apiKey}`,
  };
}

async function request(path, options = {}) {
  const { signal, ...fetchOptions } = options;
  const { base, apiKey } = await getExtensionConfig();

  const response = await fetch(`${base}${path}`, {
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(await buildAuthHeaders(apiKey)),
      ...options.headers,
    },
    signal,
    ...fetchOptions,
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export function health() {
  return request('/health');
}

export function capture(payload) {
  return request('/capture', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function saveLink(payload) {
  return request('/link', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getStatus() {
  return request('/status');
}

export function getItemStatus(id) {
  return request(`/status/${id}`);
}

export function getItems(limit = 20) {
  const params = new URLSearchParams({ limit: String(limit) });
  return request(`/items?${params}`);
}

export function getItem(id, { includeTranscript = false } = {}) {
  const params = includeTranscript ? '?include_transcript=1' : '';
  return request(`/items/${id}${params}`);
}

export function getSettings() {
  return request('/settings');
}

export function updateSettings(patch) {
  return request('/settings', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export function getJobHistory(days = 30, limit = 50) {
  const params = new URLSearchParams({ days: String(days), limit: String(limit) });
  return request(`/jobs/history?${params}`);
}

export function getFailedJobs(limit = 10) {
  const params = new URLSearchParams({ limit: String(limit) });
  return request(`/jobs/failed?${params}`);
}

export function retryItem(id) {
  return request(`/items/${id}/retry`, { method: 'POST' });
}

export function deleteItem(id) {
  return request(`/items/${id}`, { method: 'DELETE' });
}

export function getTestDataCount() {
  return request('/items/test-data/count');
}

export function clearTestData() {
  return request('/items/clear-test-data', { method: 'POST' });
}

export function pauseQueue() {
  return request('/queue/pause', { method: 'POST' });
}

export function resumeQueue() {
  return request('/queue/resume', { method: 'POST' });
}

export function search(query, filters = {}, { signal } = {}) {
  const params = new URLSearchParams({ q: query });

  if (filters.type) {
    params.set('type', filters.type);
  }

  if (filters.mode) {
    params.set('mode', filters.mode);
  }

  if (filters.since) {
    params.set('since', filters.since);
  }

  return request(`/search?${params}`, { signal });
}

export function getSearchRecommendations() {
  return request('/search/recommendations');
}

export function getItemTags(id) {
  return request(`/items/${id}/tags`);
}

export function updateItemTags(id, tags) {
  return request(`/items/${id}/tags`, {
    method: 'PUT',
    body: JSON.stringify({ tags }),
  });
}

export async function getExportUrl(format = 'json', type = null) {
  const { base } = await getExtensionConfig();
  const params = new URLSearchParams({ format });
  if (type) params.set('type', type);
  return `${base}/export?${params}`;
}

export function getAskStatus() {
  return request('/ask/status');
}

export function askLibrary(question, limit = 8) {
  return request('/ask', {
    method: 'POST',
    body: JSON.stringify({ question, limit }),
  });
}

export async function authenticatedFetch(path, options = {}) {
  const { base, apiKey } = await getExtensionConfig();

  return fetch(`${base}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(await buildAuthHeaders(apiKey)),
      ...options.headers,
    },
  });
}
