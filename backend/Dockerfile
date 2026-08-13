FROM node:20-bookworm-slim AS whisper-build

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git cmake build-essential \
    && git clone --depth 1 --branch v1.8.6 https://github.com/ggml-org/whisper.cpp /src/whisper.cpp \
    && cmake -S /src/whisper.cpp -B /src/whisper.cpp/build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build /src/whisper.cpp/build --target whisper-cli -j \
    && rm -rf /var/lib/apt/lists/*

FROM node:20-bookworm-slim AS backend

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    ca-certificates \
    && pip3 install --no-cache-dir --break-system-packages yt-dlp \
    && rm -rf /var/lib/apt/lists/*

COPY --from=whisper-build /src/whisper.cpp/build/bin/whisper-cli /usr/local/bin/whisper-cli

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./backend/
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN cd backend && npm ci --omit=dev

COPY backend ./backend
COPY recall-embed ./recall-embed
COPY docker/entrypoint-backend.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    && pip3 install --no-cache-dir --break-system-packages -r recall-embed/requirements.txt transformers

ENV RECALL_HOME=/data/recall \
    HOST=0.0.0.0 \
    PORT=7878 \
    EMBED_HOST=embed \
    EMBED_PORT=7879 \
    EMBED_AUTO_START=false \
    PYTHON_BIN=python3 \
    YTDLP_BIN=yt-dlp

VOLUME ["/data/recall"]
EXPOSE 7878

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD curl -fsS http://127.0.0.1:7878/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "backend/src/server.js"]
