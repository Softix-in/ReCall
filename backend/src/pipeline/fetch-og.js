const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const config = require('../config');

const DEFAULT_HEADERS = {
  'User-Agent': 'RecallBot/0.1 (+local; knowledge-capture)',
  Accept: 'text/html,application/xhtml+xml',
};

async function fetchHtml(url, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: DEFAULT_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`);
    }

    const html = await response.text();
    return html;
  } finally {
    clearTimeout(timer);
  }
}

function parseOgTags(html) {
  const $ = cheerio.load(html);

  function meta(selector) {
    return $(selector).attr('content')?.trim() || null;
  }

  return {
    og_title: meta('meta[property="og:title"]') || $('title').first().text().trim() || null,
    og_description: meta('meta[property="og:description"]')
      || meta('meta[name="description"]'),
    og_image: meta('meta[property="og:image"]'),
    og_type: meta('meta[property="og:type"]'),
  };
}

async function downloadThumbnail(imageUrl, itemId) {
  if (!imageUrl) {
    return null;
  }

  try {
    const response = await fetch(imageUrl, { headers: DEFAULT_HEADERS });
    if (!response.ok) {
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const ext = path.extname(new URL(imageUrl).pathname) || '.jpg';
    const safeExt = ext.length <= 5 ? ext : '.jpg';
    const filename = `${itemId}${safeExt}`;
    const absolutePath = path.join(config.THUMBNAILS_DIR, filename);

    fs.mkdirSync(config.THUMBNAILS_DIR, { recursive: true });
    fs.writeFileSync(absolutePath, buffer);

    return path.join('thumbnails', filename);
  } catch {
    return null;
  }
}

async function fetchOgMetadata(url, itemId = null) {
  const html = await fetchHtml(url);
  const og = parseOgTags(html);

  let thumbnail = null;
  if (itemId && og.og_image) {
    thumbnail = await downloadThumbnail(og.og_image, itemId);
  }

  const text = [og.og_title, og.og_description].filter(Boolean).join('\n\n');

  return {
    title: og.og_title,
    description: og.og_description,
    image: og.og_image,
    og_type: og.og_type,
    text,
    thumbnail,
  };
}

module.exports = {
  fetchHtml,
  fetchOgMetadata,
  parseOgTags,
};
