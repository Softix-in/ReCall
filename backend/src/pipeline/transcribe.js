const fs = require('fs');
const path = require('path');
const config = require('../config');
const { runCommand } = require('../utils/subprocess');
const { getWhisperAccelArgs } = require('../utils/whisper-gpu');
const { getSettings } = require('../services/settings-service');

function whisperBinaryPath() {
  const releaseDir = path.join(config.WHISPER_DIR, 'Release');

  const candidates = [
    // Prefer the Release/ directory where DLLs (ggml.dll, whisper.dll etc.) are co-located
    path.join(releaseDir, 'whisper-cli.exe'),
    path.join(releaseDir, 'main.exe'),
    // Root-level binaries (may lack required DLLs on Windows builds)
    path.join(config.WHISPER_DIR, 'whisper-cli.exe'),
    path.join(config.WHISPER_DIR, 'main.exe'),
    // Unix
    path.join(releaseDir, 'whisper-cli'),
    path.join(config.WHISPER_DIR, 'whisper-cli'),
    path.join(config.WHISPER_DIR, 'main'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
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
    ...getWhisperAccelArgs(),
  ];

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
