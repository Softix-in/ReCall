const config = require('../config');

class EmbedClientError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'EmbedClientError';
    this.status = status;
  }
}

async function request(path, options = {}) {
  const url = `${config.EMBED_BASE_URL}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout ?? config.EMBED_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { detail: text };
      }
    }

    if (!response.ok) {
      throw new EmbedClientError(
        data?.detail || data?.error || `Embed service error (${response.status})`,
        response.status,
      );
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new EmbedClientError('Embed service request timed out', 504);
    }

    if (error instanceof EmbedClientError) {
      throw error;
    }

    throw new EmbedClientError(`Embed service unavailable: ${error.message}`, 503);
  } finally {
    clearTimeout(timeout);
  }
}

async function checkHealth() {
  return request('/health', { timeout: 5_000 });
}

async function embedText(text) {
  const data = await request('/embed', {
    method: 'POST',
    body: { text },
  });

  return data.embedding;
}

module.exports = {
  EmbedClientError,
  checkHealth,
  embedText,
};
