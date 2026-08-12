#!/usr/bin/env bash
set -euo pipefail

STAMP=$(date +%Y%m%d-%H%M%S)
EXPORT="$HOME/recall-export-$STAMP"
mkdir -p "$EXPORT"
echo "EXPORT_DIR=$EXPORT"

cd "$HOME/recall"

echo "=== volumes ==="
sudo docker volume ls

echo "=== pg_dump ==="
sudo docker compose exec -T postgres pg_dump -U recall -d recall -Fc > "$EXPORT/recall-db.dump"
ls -lh "$EXPORT/recall-db.dump"

echo "=== copy env ==="
cp "$HOME/recall/.env" "$EXPORT/env.backup"
cp "$HOME/.env" "$EXPORT/home-env.backup" 2>/dev/null || true

echo "=== archive docker volumes ==="
VOL_DATA=$(sudo docker volume ls -q | grep -E 'recall-data$' | head -1)
VOL_PG=$(sudo docker volume ls -q | grep -E 'postgres-data$' | head -1)
echo "VOL_DATA=$VOL_DATA VOL_PG=$VOL_PG"

if [ -z "$VOL_DATA" ] || [ -z "$VOL_PG" ]; then
  echo "ERROR: could not find docker volumes" >&2
  exit 1
fi

sudo docker run --rm -v "${VOL_DATA}:/data:ro" -v "${EXPORT}:/backup" alpine \
  tar czf /backup/recall-data.tar.gz -C /data .
sudo docker run --rm -v "${VOL_PG}:/data:ro" -v "${EXPORT}:/backup" alpine \
  tar czf /backup/postgres-data.tar.gz -C /data .

# Manifest for restore later
{
  echo "created_at=$(date -Is)"
  echo "hostname=$(hostname)"
  echo "export_dir=$EXPORT"
  echo "vol_data=$VOL_DATA"
  echo "vol_pg=$VOL_PG"
  sudo docker compose ps
} > "$EXPORT/MANIFEST.txt"

echo "=== done ==="
ls -lh "$EXPORT"
du -sh "$EXPORT"
echo "$EXPORT" > "$HOME/recall-export-latest.path"
echo "LATEST=$(cat "$HOME/recall-export-latest.path")"
