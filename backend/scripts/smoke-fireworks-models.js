const { getClient } = require("../src/services/llm-client");
(async () => {
  const client = await getClient();
  for (const model of [
    "accounts/fireworks/models/kimi-k2p6",
    "accounts/fireworks/models/kimi-k3",
    "accounts/fireworks/routers/kimi-k2p6-turbo",
  ]) {
    try {
      const started = Date.now();
      const response = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        max_tokens: 32,
        temperature: 0,
      });
      console.log(JSON.stringify({
        ok: true,
        model,
        ms: Date.now() - started,
        response: String(response.choices?.[0]?.message?.content || "").trim().slice(0, 80),
      }));
    } catch (error) {
      console.log(JSON.stringify({ ok: false, model, message: error.message, status: error.status || null }));
    }
  }
})();