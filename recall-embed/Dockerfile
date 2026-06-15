FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY recall-embed/requirements.txt ./recall-embed/
RUN pip install --no-cache-dir -r recall-embed/requirements.txt transformers

COPY recall-embed ./recall-embed
COPY docker/entrypoint-embed.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV RECALL_HOME=/data/recall \
    EMBED_HOST=0.0.0.0 \
    EMBED_PORT=7879

VOLUME ["/data/recall"]
EXPOSE 7879

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD curl -fsS http://127.0.0.1:7879/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["python3", "recall-embed/embed_service.py"]
