const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');

function downloadToTemp(url) {
  return new Promise((resolve, reject) => {
    const tmpPath = path.join(os.tmpdir(), `recall-pdf-${Date.now()}.pdf`);
    const file = fs.createWriteStream(tmpPath);
    const client = url.startsWith('https') ? https : http;

    const request = client.get(url, { timeout: 30_000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(tmpPath);
        resolve(downloadToTemp(res.headers.location));
        return;
      }

      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(tmpPath);
        reject(new Error(`PDF download failed: HTTP ${res.statusCode}`));
        return;
      }

      const contentType = res.headers['content-type'] || '';
      if (!contentType.includes('pdf') && !url.toLowerCase().endsWith('.pdf')) {
        file.close();
        fs.unlinkSync(tmpPath);
        reject(new Error('URL does not appear to be a PDF'));
        return;
      }

      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(tmpPath);
      });
    });

    request.on('error', (error) => {
      file.close();
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      reject(error);
    });
  });
}

async function fetchPdfContent(url) {
  let tmpPath = null;

  try {
    // Try to load pdf-parse lazily — it's an optional dep
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

    // Use first non-empty line as title fallback
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
