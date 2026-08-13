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

function readPemEnv(name) {
  const value = process.env[name];
  if (!value) {
    return '';
  }

  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}

module.exports = {
  PORT: Number(process.env.PORT) || 7878,
  HOST: process.env.HOST || '127.0.0.1',
  DATABASE_URL: process.env.DATABASE_URL || '',
  API_KEY: process.env.RECALL_API_KEY || '',
  AUTH_LEGACY_API_KEY: process.env.AUTH_LEGACY_API_KEY === 'true',
  BOOTSTRAP_USER_EMAIL: process.env.BOOTSTRAP_USER_EMAIL || 'bootstrap@recall.local',
  JWT_PRIVATE_KEY: readPemEnv('JWT_PRIVATE_KEY'),
  JWT_PUBLIC_KEY: readPemEnv('JWT_PUBLIC_KEY'),
  FIREWORKS_API_KEY: process.env.FIREWORKS_API_KEY || '',
  CORS_ORIGIN: process.env.CORS_ORIGIN || process.env.RECALL_CORS_ORIGINS || 'extension',
  TRUST_PROXY: process.env.TRUST_PROXY === 'true',
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || '',
  JWT_ISSUER: process.env.JWT_ISSUER || 'recall',
  JWT_AUDIENCE: process.env.JWT_AUDIENCE || 'recall-api',
  AUTH_ALLOW_REGISTRATION: process.env.AUTH_ALLOW_REGISTRATION !== 'false',
  FIREWORKS_ALLOW_SHARED_KEY: process.env.FIREWORKS_ALLOW_SHARED_KEY === 'true',
  EMBED_AUTO_START: process.env.EMBED_AUTO_START !== 'false',
  VERSION: '0.7.1',
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
  R2_ENDPOINT: process.env.R2_ENDPOINT || '',
  R2_BUCKET: process.env.R2_BUCKET || '',
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || '',
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || '',
  R2_PUBLIC_BASE_URL: process.env.R2_PUBLIC_BASE_URL || '',
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX) || 100,
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || `http://${process.env.HOST || '127.0.0.1'}:${Number(process.env.PORT) || 7878}`,
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: Number(process.env.SMTP_PORT) || 587,
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || '',
  EMAIL_DEV_LOG: process.env.EMAIL_DEV_LOG === 'true',
  JSON_BODY_LIMIT: process.env.JSON_BODY_LIMIT || '1mb',
  FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY || '',
  FIRECRAWL_MAX_CRAWL_PAGES: Number(process.env.FIRECRAWL_MAX_CRAWL_PAGES) || 25,
  RESEARCH_MAX_CRAWL_PAGES: Number(process.env.RESEARCH_MAX_CRAWL_PAGES) || 12,
  RESEARCH_MAX_SEARCH_RESULTS: Number(process.env.RESEARCH_MAX_SEARCH_RESULTS) || 5,
  DOC_EXTRACT_MIN_CLIENT_CHARS: Number(process.env.DOC_EXTRACT_MIN_CLIENT_CHARS) || 800,
};
