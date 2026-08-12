const { getClient } = require("../src/services/llm-client");
(async () => {
  const client = await getClient();
  for (const model of ["accounts/fireworks/models/kimi-k2p6", "accounts/fireworks/routers/kimi-k2p6-turbo"]) {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Say OK" }],
      max_tokens: 64,
      temperature: 0,
    });
    console.log(JSON.stringify({
      model,
      finish: response.choices?.[0]?.finish_reason,
      text: String(response.choices?.[0]?.message?.content || "").trim().slice(0, 80),
      usage: response.usage,
    }));
  }
})().catch((e) => { console.error(e.message); process.exit(1); });