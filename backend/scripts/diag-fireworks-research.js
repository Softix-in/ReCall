const { testApiKey, RESEARCH_ANALYSIS_MODEL, getClient } = require('../src/services/llm-client');
const profileDb = require('../src/db/profile');
const { query } = require('../src/db/pg-pool');

(async () => {
  const envSet = Boolean(process.env.FIREWORKS_API_KEY);
  console.log(JSON.stringify({
    env_key_configured: envSet,
    env_key_len: envSet ? String(process.env.FIREWORKS_API_KEY).length : 0,
    research_model: RESEARCH_ANALYSIS_MODEL,
  }));

  const { rows } = await query(
    `SELECT user_id,
            CASE WHEN fireworks_api_key_enc IS NULL OR fireworks_api_key_enc = '' THEN false ELSE true END AS has_profile_key,
            ai_quality_model,
            ai_chat_model,
            ai_reasoning_model
     FROM user_profile
     LIMIT 5`,
  );
  console.log(JSON.stringify({ profiles: rows }));

  // Env key alone
  try {
    const result = await testApiKey(process.env.FIREWORKS_API_KEY);
    console.log(JSON.stringify({ stage: 'env_testApiKey', ...result }));
  } catch (error) {
    console.log(JSON.stringify({
      stage: 'env_testApiKey',
      ok: false,
      message: error.message,
      code: error.code || null,
      status: error.status || null,
    }));
  }

  for (const row of rows) {
    const key = await profileDb.getFireworksApiKey(row.user_id);
    const sameAsEnv = Boolean(key && process.env.FIREWORKS_API_KEY && key === process.env.FIREWORKS_API_KEY);
    console.log(JSON.stringify({
      user_id: row.user_id,
      resolved_key_len: key ? key.length : 0,
      resolved_prefix: key ? `${key.slice(0, 6)}...` : null,
      same_as_env: sameAsEnv,
      has_profile_key: row.has_profile_key,
    }));

    try {
      const result = await testApiKey(key);
      console.log(JSON.stringify({ user_id: row.user_id, stage: 'resolved_testApiKey', ...result }));
    } catch (error) {
      console.log(JSON.stringify({
        user_id: row.user_id,
        stage: 'resolved_testApiKey',
        ok: false,
        message: error.message,
        code: error.code || null,
        status: error.status || null,
      }));
    }

    try {
      const client = await getClient({ userId: row.user_id });
      const started = Date.now();
      const response = await client.chat.completions.create({
        model: RESEARCH_ANALYSIS_MODEL,
        messages: [{ role: 'user', content: 'Reply with JSON: {"ok":true}' }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'ping',
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: { ok: { type: 'boolean' } },
              required: ['ok'],
            },
          },
        },
        max_tokens: 64,
        temperature: 0,
      });
      console.log(JSON.stringify({
        user_id: row.user_id,
        stage: 'structured_research_model',
        ok: true,
        ms: Date.now() - started,
        content: String(response.choices?.[0]?.message?.content || '').slice(0, 120),
      }));
    } catch (error) {
      console.log(JSON.stringify({
        user_id: row.user_id,
        stage: 'structured_research_model',
        ok: false,
        message: error.message,
        status: error.status || null,
        code: error.code || null,
        provider: error.error?.message || null,
      }));
    }
  }

  process.exit(0);
})().catch((error) => {
  console.error(JSON.stringify({ fatal: error.message, stack: error.stack }));
  process.exit(1);
});
