const fs = require('fs');
const path = require('path');
const os = require('os');
const { fetchSafe, readResponseLimited, assertPublicHttpUrl } = require('../utils/safe-url');

async function downloadToTemp(url) {
  await assertPublicHttpUrl(url);
  const response = await fetchSafe(url, { timeoutMs: 30_000 });

  if (!response.ok) {
    throw new Error(`PDF download failed: HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('pdf') && !url.toLowerCase().includes('.pdf')) {
    throw new Error('URL does not appear to be a PDF');
  }

  const buffer = await readResponseLimited(response, 20_000_000);
  const tmpPath = path.join(os.tmpdir(), `recall-pdf-${Date.now()}.pdf`);
  fs.writeFileSync(tmpPath, buffer);
  return tmpPath;
}

async function fetchPdfContent(url) {
  let tmpPath = null;

  try {
    let pdfParse;
    try {
      pdfParse = require('pdf-parse');
    } catch {
      throw new Error('pdf-parse is not installed. Run: npm install pdf-parse');
    }

    tmpPath = await downloadToTemp(url);
    const dataBuffer = fs.readFileSync(tmpPath);
    const parsed = await pdfParse(dataBuffer);

    const text = (parsed.text || '').trim();
    if (!text) {
      throw new Error('PDF produced no extractable text (may be scanned/image-based)');
    }

    const firstLine = text.split('\n').find((line) => line.trim().length > 10) || '';

    return {
      title: firstLine.trim().slice(0, 200) || null,
      text,
      thumbnail: null,
      transcript: null,
      pageCount: parsed.numpages || null,
    };
  } finally {
    if (tmpPath && fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
  }
}

module.exports = { fetchPdfContent };
