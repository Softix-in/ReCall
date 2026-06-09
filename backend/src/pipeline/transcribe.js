const fs = require('fs');
const path = require('path');
const config = require('../config');
const { runCommand } = require('../utils/subprocess');
const { getSettings } = require('../services/settings-service');

function whisperBinaryPath() {
  const win = path.join(config.WHISPER_DIR, 'whisper-cli.exe');
  const winAlt = path.join(config.WHISPER_DIR, 'main.exe');
  const unix = path.join(config.WHISPER_DIR, 'whisper-cli');
  const unixAlt = path.join(config.WHISPER_DIR, 'main');

  if (fs.existsSync(win)) return win;
  if (fs.existsSync(winAlt)) return winAlt;
  if (fs.existsSync(unix)) return unix;
  if (fs.existsSync(unixAlt)) return unixAlt;

  return null;
}

function whisperModelPath() {
  const settings = getSettings();
  const preferred = path.join(config.WHISPER_DIR, `ggml-${settings.whisperModel}.bin`);

  const candidates = [
    preferred,
    path.join(config.WHISPER_DIR, 'ggml-small.bin'),
    path.join(config.WHISPER_DIR, 'ggml-base.bin'),
    path.join(config.WHISPER_DIR, 'ggml-tiny.bin'),
    path.join(config.WHISPER_DIR, 'ggml-medium.bin'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function isWhisperAvailable() {
  return Boolean(whisperBinaryPath() && whisperModelPath());
}

function transcriptRelativePath(itemId) {
  return path.join('transcripts', `${itemId}.txt`);
}

function transcriptAbsolutePath(itemId) {
  return path.join(config.TRANSCRIPTS_DIR, `${itemId}.txt`);
}

async function transcribeAudio(audioPath, itemId) {
  const binary = whisperBinaryPath();
  const model = whisperModelPath();

  if (!binary || !model) {
    throw new Error(
      'Whisper.cpp is not installed. Run backend/scripts/setup-whisper.ps1'
    );
  }

  const outputBase = path.join(config.TRANSCRIPTS_DIR, itemId);
  fs.mkdirSync(config.TRANSCRIPTS_DIR, { recursive: true });

  const args = [
    '-m', model,
    '-f', audioPath,
    '-of', outputBase,
    '-otxt',
  ];

  if (process.platform === 'darwin') {
    args.push('-ng', '0');
  }

  await runCommand(binary, args, {
    timeout: config.TRANSCRIPTION_TIMEOUT_MS,
  });

  const txtPath = `${outputBase}.txt`;

  if (!fs.existsSync(txtPath)) {
    throw new Error('Whisper.cpp completed but transcript file was not created');
  }

  const transcript = fs.readFileSync(txtPath, 'utf8').trim();

  if (!transcript) {
    throw new Error('Whisper.cpp produced an empty transcript');
  }

  return {
    text: transcript,
    relativePath: transcriptRelativePath(itemId),
    absolutePath: txtPath,
  };
}

module.exports = {
  transcribeAudio,
  isWhisperAvailable,
  whisperBinaryPath,
  whisperModelPath,
  transcriptRelativePath,
};
