const path = require('path');
const config = require('../config');
const { runCommand } = require('../utils/subprocess');

const SUMMARISE_SCRIPT = path.join(__dirname, '..', '..', 'summarise', 'summarise.py');

async function summariseText(text) {
  if (!text?.trim()) {
    return { title: '', summary: '' };
  }

  const { stdout } = await runCommand(
    config.PYTHON_BIN,
    [SUMMARISE_SCRIPT],
    {
      input: text,
      timeout: 30_000,
    }
  );

  return JSON.parse(stdout.trim());
}

function summariseManualNote(note) {
  const trimmed = note.trim();
  const firstLine = trimmed.split(/\n/)[0];
  const firstSentenceMatch = firstLine.match(/^[^.!?]+[.!?]?/);
  const title = (firstSentenceMatch?.[0] || firstLine).trim();

  return {
    title: title || 'Saved note',
    summary: trimmed,
  };
}

module.exports = {
  summariseText,
  summariseManualNote,
};
