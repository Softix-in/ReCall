/**
 * Smoke-test Fireworks using env FIREWORKS_API_KEY (or optional CLI arg).
 * Usage: node scripts/smoke-fireworks.js
 */
const { testApiKey, DEFAULT_QUALITY_MODEL } = require('../src/services/llm-client');

(async () => {
  const keySet = Boolean(process.env.FIREWORKS_API_KEY);
  console.log(JSON.stringify({
    env_key_configured: keySet,
    model: DEFAULT_QUALITY_MODEL,
    key_prefix: keySet ? `${String(process.env.FIREWORKS_API_KEY).slice(0, 6)}...` : null,
  }));

  try {
    const result = await testApiKey();
    console.log(JSON.stringify({ ok: true, stage: 'testApiKey', ...result }));
    process.exit(0);
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      stage: 'testApiKey',
      message: error.message,
      code: error.code || null,
      status: error.status || null,
    }));
    process.exit(1);
  }
})();
