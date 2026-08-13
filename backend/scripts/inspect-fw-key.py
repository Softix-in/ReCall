import os
from pathlib import Path

env_path = Path(os.environ.get("ENV_PATH", "/home/shubh-memory/recall/.env"))
if env_path.exists():
    found = False
    for line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("FIREWORKS_API_KEY="):
            val = line.split("=", 1)[1]
            stripped = val.strip().strip('"').strip("'")
            print("file_raw_len=%d" % len(val))
            print("file_stripped_len=%d" % len(stripped))
            print("file_has_quotes=%s" % str(val[:1] in ('"', "'")))
            print("file_prefix=%r" % (stripped[:6],))
            found = True
            break
    if not found:
        print("file_missing=1")
else:
    print("file_missing=1")

k = os.environ.get("FIREWORKS_API_KEY", "")
print("env_len=%d" % len(k))
print("env_prefix=%r" % (k[:6] if k else None,))
print("env_has_newline=%s" % str(("\n" in k) or ("\r" in k)))
