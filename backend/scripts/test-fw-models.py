#!/usr/bin/env python3
import json
import pathlib
import urllib.error
import urllib.request

env_lines = pathlib.Path.home().joinpath("recall/.env").read_text(encoding="utf-8").splitlines()
fw = next(line.split("=", 1)[1].strip() for line in env_lines if line.startswith("FIREWORKS_API_KEY="))

models = [
    "accounts/fireworks/models/deepseek-v4-flash-0731",
    "accounts/fireworks/models/deepseek-v4-flash",
    "accounts/fireworks/models/glm-5p2",
    "accounts/fireworks/models/qwen3p7-plus",
    "accounts/fireworks/models/minimax-m2p7",
    "accounts/fireworks/models/minimax-m3",
]

schema_payload_extra = {
    "response_format": {
        "type": "json_schema",
        "json_schema": {
            "name": "ping",
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "properties": {"ok": {"type": "boolean"}},
                "required": ["ok"],
            },
        },
    }
}

for model in models:
    for mode, extra in (("plain", {}), ("json_schema", schema_payload_extra)):
        content = "Reply with JSON {\"ok\":true}" if mode == "json_schema" else "Say OK"
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": content}],
            "max_tokens": 64,
            "temperature": 0,
        }
        payload.update(extra)
        req = urllib.request.Request(
            "https://api.fireworks.ai/inference/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": "Bearer " + fw,
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=25) as response:
                body = json.loads(response.read().decode("utf-8"))
                text = ((body.get("choices") or [{}])[0].get("message") or {}).get("content")
                print(json.dumps({
                    "model": model,
                    "mode": mode,
                    "ok": True,
                    "status": response.status,
                    "text": (text or "")[:100],
                    "usage": body.get("usage"),
                }))
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:250]
            print(json.dumps({
                "model": model,
                "mode": mode,
                "ok": False,
                "status": error.code,
                "body": detail,
            }))
        except Exception as error:
            print(json.dumps({
                "model": model,
                "mode": mode,
                "ok": False,
                "error": str(error),
            }))
