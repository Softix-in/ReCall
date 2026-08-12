#!/usr/bin/env python3
import json
import pathlib
import urllib.error
import urllib.request

env_lines = pathlib.Path.home().joinpath("recall/.env").read_text(encoding="utf-8").splitlines()
fw = next(line.split("=", 1)[1].strip() for line in env_lines if line.startswith("FIREWORKS_API_KEY="))
print("key_len", len(fw), "prefix", fw[:6])

models = [
    "accounts/fireworks/models/minimax-m3",
    "accounts/fireworks/models/deepseek-v4-flash-0731",
]

for model in models:
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "Say OK"}],
        "max_tokens": 32,
        "temperature": 0,
    }
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
        with urllib.request.urlopen(req, timeout=45) as response:
            body = json.loads(response.read().decode("utf-8"))
            text = ((body.get("choices") or [{}])[0].get("message") or {}).get("content")
            print(json.dumps({
                "model": model,
                "ok": True,
                "status": response.status,
                "text": (text or "")[:80],
            }))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:400]
        print(json.dumps({
            "model": model,
            "ok": False,
            "status": error.code,
            "body": detail,
        }))
    except Exception as error:
        print(json.dumps({
            "model": model,
            "ok": False,
            "error": str(error),
        }))
