const fs = require('fs');
const config = require('./config');

const DIRECTORIES = [
  config.DATA_DIR,
  config.CHROMA_DIR,
  config.MODELS_DIR,
  config.TRANSCRIPTS_DIR,
  config.THUMBNAILS_DIR,
  config.LOGS_DIR,
  config.WHISPER_DIR,
  config.BACKUPS_DIR,
];

function ensureRecallDirs() {
  for (const dir of DIRECTORIES) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created ${dir}`);
    }
  }
}

function getDirectorySizeBytes(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return 0;
  }

  let total = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = require('path').join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += getDirectorySizeBytes(fullPath);
    } else if (entry.isFile()) {
      total += fs.statSync(fullPath).size;
    }
  }

  return total;
}

function getStorageBytes() {
  return (
    getDirectorySizeBytes(config.RECALL_HOME)
  );
}

module.exports = {
  ensureRecallDirs,
  getStorageBytes,
};
