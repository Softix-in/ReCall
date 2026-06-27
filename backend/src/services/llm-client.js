const OpenAI = require('openai');
const config = require('../config');
const profileDb = require('../db/profile');

const FIREWORKS_BASE_URL = 'https://api.fireworks.ai/inference/v1';
const DEFAULT_QUALITY_MODEL = 'accounts/fireworks/models/deepseek-v3p1';
const DEFAULT_CHAT_MODEL = 'accounts/fireworks/models/kimi-k2-instruct-0905';
const DEFAULT_REASONING_MODEL = 'accounts/fireworks/models/glm-5p2';

class LlmError extends Error {
  constructor(message, { code, status } = {}) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
    this.status = status;
  }
}

function resolveApiKey(userApiKey) {
  return userApiKey || profileDb.getFireworksApiKey() || config.FIREWORKS_API_KEY || null;
}

function getClient(userApiKey) {
  const apiKey = resolveApiKey(userApiKey);

  if (!apiKey) {
    throw new LlmError('Fireworks API key is not configured', {
      code: 'missing_api_key',
      status: 400,
    });
  }

  return new OpenAI({
    apiKey,
    baseURL: FIREWORKS_BASE_URL,
  });
}

function mapClientError(error) {
  const status = error?.status || error?.response?.status;
  const providerCode = error?.error?.code || error?.code;
  const message = error?.error?.message || error?.message || '';

  if (status === 401 || status === 403) {
    return new LlmError('Invalid Fireworks API key', {
      code: 'invalid_api_key',
      status: 401,
    });
  }

  // Fireworks often masks invalid API keys as model inaccessible (404).
  if (status === 404 && (providerCode === 'NOT_FOUND' || message.includes('inaccessible'))) {
    return new LlmError('Invalid Fireworks API key', {
      code: 'invalid_api_key',
      status: 401,
    });
  }

  return new LlmError(message || 'Fireworks request failed', {
    code: 'llm_error',
    status: status || 502,
  });
}

function getQualityModel(override) {
  const settings = profileDb.getAiModelSettings();
  return override || settings.qualityModel || DEFAULT_QUALITY_MODEL;
}

function getChatModel(override) {
  const settings = profileDb.getAiModelSettings();
  return override || settings.chatModel || DEFAULT_CHAT_MODEL;
}

function getReasoningModel(override) {
  const settings = profileDb.getAiModelSettings();
  return override || settings.reasoningModel || DEFAULT_REASONING_MODEL;
}

function resolveExtractionModel({ deepMode = false, model } = {}) {
  if (model) {
    return model;
  }

  const settings = profileDb.getAiModelSettings();
  if (deepMode || settings.deepAnalysisEnabled) {
    return getReasoningModel();
  }

  return getQualityModel();
}

async function completeStructured({
  prompt,
  schema,
  schemaName,
  userApiKey,
  model,
  temperature = 0.2,
}) {
  try {
    const client = getClient(userApiKey);
    const response = await client.chat.completions.create({
      model: getQualityModel(model),
      messages: [{ role: 'user', content: prompt }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: schemaName,
          schema,
        },
      },
      temperature,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new LlmError('Empty structured response from Fireworks', { code: 'llm_error', status: 502 });
    }

    return JSON.parse(content);
  } catch (error) {
    if (error instanceof LlmError) {
      throw error;
    }

    throw mapClientError(error);
  }
}

async function streamCompletion({ messages, userApiKey, model, temperature = 0.4, onToken }) {
  try {
    const client = getClient(userApiKey);
    const stream = await client.chat.completions.create({
      model: getQualityModel(model),
      messages,
      stream: true,
      temperature,
    });

    let fullText = '';

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (!text) {
        continue;
      }

      fullText += text;
      if (onToken) {
        onToken(text);
      }
    }

    return fullText;
  } catch (error) {
    if (error instanceof LlmError) {
      throw error;
    }

    throw mapClientError(error);
  }
}

async function completeStreaming({ messages, res, userApiKey, model, temperature = 0.4 }) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  await streamCompletion({
    messages,
    userApiKey,
    model,
    temperature,
    onToken: (text) => {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    },
  });

  res.write('data: [DONE]\n\n');
  res.end();
}

async function completeWithTools({
  messages,
  tools,
  userApiKey,
  model,
  temperature = 0.3,
}) {
  try {
    const client = getClient(userApiKey);
    return await client.chat.completions.create({
      model: getChatModel(model),
      messages,
      tools,
      tool_choice: 'auto',
      temperature,
    });
  } catch (error) {
    if (error instanceof LlmError) {
      throw error;
    }

    throw mapClientError(error);
  }
}

async function testApiKey(userApiKey) {
  const client = getClient(userApiKey);
  const response = await client.chat.completions.create({
    model: DEFAULT_QUALITY_MODEL,
    messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    max_tokens: 8,
    temperature: 0,
  });

  const text = response.choices[0]?.message?.content || '';
  return { ok: true, response: text.trim() };
}

module.exports = {
  LlmError,
  getClient,
  completeStructured,
  completeStreaming,
  streamCompletion,
  completeWithTools,
  testApiKey,
  getQualityModel,
  getChatModel,
  getReasoningModel,
  resolveExtractionModel,
  DEFAULT_QUALITY_MODEL,
  DEFAULT_CHAT_MODEL,
  DEFAULT_REASONING_MODEL,
  mapClientError,
};
