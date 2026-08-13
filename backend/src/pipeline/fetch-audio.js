const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('../config');
const { runCommand } = require('../utils/subprocess');
const { assertPublicHttpUrl } = require('../utils/safe-url');

function getTempAudioPath(itemId) {
  const dir = path.join(os.tmpdir(), 'recall-audio');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${itemId}.mp3`);
}

async function downloadAudio(url, itemId) {
  await assertPublicHttpUrl(url);
  const outputPath = getTempAudioPath(itemId);
  const outputTemplate = outputPath.replace(/\.mp3$/, '.%(ext)s');

  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  await runCommand(
    config.YTDLP_BIN,
    [
      '--extract-audio',
      '--audio-format', 'mp3',
      '--no-playlist',
      '--no-warnings',
      '-o', outputTemplate,
      url,
    ],
    { timeout: config.AUDIO_DOWNLOAD_TIMEOUT_MS }
  );

  if (!fs.existsSync(outputPath)) {
    throw new Error(`yt-dlp did not produce audio file for ${url}`);
  }

  return outputPath;
}

function cleanupAudio(audioPath) {
  if (audioPath && fs.existsSync(audioPath)) {
    fs.unlinkSync(audioPath);
  }
}

module.exports = {
  downloadAudio,
  cleanupAudio,
};
