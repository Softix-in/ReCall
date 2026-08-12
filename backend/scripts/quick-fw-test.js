const { testApiKey, RESEARCH_ANALYSIS_MODEL, getClient } = require('../src/services/llm-client');

const timeoutMs = 20000;

function withTimeout(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms (${label})`)), timeoutMs);
    }),
  ]);
}

(async () => {
  const key = process.env.FIREWORKS_API_KEY || '';
  console.log(JSON.stringify({
    env_len: key.length,
    prefix: key ? key.slice(0, 6) : null,
    model: RESEARCH_ANALYSIS_MODEL,
  }));

  try {
    const result = await withTimeout(testApiKey(key), 'testApiKey');
    console.log(JSON.stringify({ stage: 'testApiKey', ok: true, response: result.response }));
  } catch (error) {
    console.log(JSON.stringify({
      stage: 'testApiKey',
      ok: false,
      message: error.message,
      status: error.status || null,
      code: error.code || null,
    }));
  }

  try {
    const client = await getClient({ userApiKey: key });
    const response = await withTimeout(client.chat.completions.create({
      model: RESEARCH_ANALYSIS_MODEL,
      messages: [{ role: 'user', content: 'Say OK' }],
      max_tokens: 32,
      temperature: 0,
    }), 'chat');
    console.log(JSON.stringify({
      stage: 'chat',
      ok: true,
      text: String(response.choices?.[0]?.message?.content || '').trim().slice(0, 80),
    }));
  } catch (error) {
    console.log(JSON.stringify({
      stage: 'chat',
      ok: false,
      message: error.message,
      status: error.status || null,
      code: error.code || null,
    }));
  }
})();
