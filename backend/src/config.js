const path = require('path');
const os = require('os');

const RECALL_HOME = process.env.RECALL_HOME || path.join(os.homedir(), '.recall');
const DATA_DIR = path.join(RECALL_HOME, 'data');
const DB_PATH = path.join(DATA_DIR, 'recall.db');
const CHROMA_DIR = path.join(DATA_DIR, 'chroma');
const MODELS_DIR = path.join(RECALL_HOME, 'models');
const TRANSCRIPTS_DIR = path.join(RECALL_HOME, 'transcripts');
const THUMBNAILS_DIR = path.join(RECALL_HOME, 'thumbnails');
const LOGS_DIR = path.join(RECALL_HOME, 'logs');
const WHISPER_DIR = path.join(RECALL_HOME, 'whisper');
const BACKUPS_DIR = path.join(RECALL_HOME, 'backups');
const SETTINGS_PATH = path.join(RECALL_HOME, 'settings.json');

const EMBED_HOST = process.env.EMBED_HOST || '127.0.0.1';
const EMBED_PORT = Number(process.env.EMBED_PORT) || 7879;

module.exports = {
  PORT: Number(process.env.PORT) || 7878,
  HOST: process.env.HOST || '127.0.0.1',
  API_KEY: process.env.RECALL_API_KEY || '',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  EMBED_AUTO_START: process.env.EMBED_AUTO_START !== 'false',
  VERSION: '0.6.0',
  RECALL_HOME,
  DATA_DIR,
  DB_PATH,
  CHROMA_DIR,
  MODELS_DIR,
  TRANSCRIPTS_DIR,
  THUMBNAILS_DIR,
  LOGS_DIR,
  WHISPER_DIR,
  BACKUPS_DIR,
  SETTINGS_PATH,
  EMBED_HOST,
  EMBED_PORT,
  EMBED_BASE_URL: process.env.EMBED_BASE_URL || `http://${EMBED_HOST}:${EMBED_PORT}`,
  EMBED_TIMEOUT_MS: Number(process.env.EMBED_TIMEOUT_MS) || 30_000,
  PYTHON_BIN: process.env.PYTHON_BIN || 'python',
  YTDLP_BIN: process.env.YTDLP_BIN || 'yt-dlp',
  DEDUP_WINDOW_MS: 60_000,
  JOB_MAX_ATTEMPTS: 3,
  JOB_BACKOFF_MS: 1000,
  EMBEDDING_DIM: 384,
  AUDIO_DOWNLOAD_TIMEOUT_MS: 300_000,
  TRANSCRIPTION_TIMEOUT_MS: 300_000,
};
