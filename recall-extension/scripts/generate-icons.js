const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ICON_DIR = path.join(__dirname, '..', 'icons');

function crc32(buf) {
  let crc = 0xffffffff;

  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];

    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePng(size, drawPixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;

    for (let x = 0; x < size; x += 1) {
      const color = drawPixel(x, y, size);
      const i = rowStart + 1 + x * 4;
      raw[i] = color[0];
      raw[i + 1] = color[1];
      raw[i + 2] = color[2];
      raw[i + 3] = color[3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function backgroundColor(x, y, size) {
  const t = (x + y) / (2 * (size - 1));
  return [
    lerp(129, 79, t),
    lerp(140, 70, t),
    lerp(248, 229, t),
    255,
  ];
}

function insideRoundedRect(x, y, size, radius) {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return false;
  }

  const corners = [
    [radius, radius],
    [size - radius, radius],
    [radius, size - radius],
    [size - radius, size - radius],
  ];

  if (x < radius && y < radius) {
    return (x - radius) ** 2 + (y - radius) ** 2 <= radius ** 2;
  }

  if (x >= size - radius && y < radius) {
    return (x - (size - radius)) ** 2 + (y - radius) ** 2 <= radius ** 2;
  }

  if (x < radius && y >= size - radius) {
    return (x - radius) ** 2 + (y - (size - radius)) ** 2 <= radius ** 2;
  }

  if (x >= size - radius && y >= size - radius) {
    return (x - (size - radius)) ** 2 + (y - (size - radius)) ** 2 <= radius ** 2;
  }

  return true;
}

function insideGlyph(x, y, size) {
  const scale = size / 128;
  const gx = (x - 34 * scale) / scale;
  const gy = (y - 34 * scale) / scale;

  if (gx < 0 || gy < 0 || gx > 60 || gy > 60) {
    return false;
  }

  const ix = Math.floor(gx);
  const iy = Math.floor(gy);

  const glyph = [
    '1111100000',
    '1000010000',
    '1000010000',
    '1111100000',
    '1000100000',
    '1000100000',
    '1000010000',
    '1000010000',
    '1000000000',
    '1000000000',
  ];

  if (iy >= glyph.length || ix >= glyph[iy].length) {
    return false;
  }

  return glyph[iy][ix] === '1';
}

function insideAccent(x, y, size) {
  const scale = size / 128;
  const cx = 94 * scale;
  const cy = 38 * scale;
  const r = 6 * scale;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function createLogoPng(size) {
  const radius = Math.max(2, Math.round(size * 0.22));

  return encodePng(size, (x, y) => {
    if (!insideRoundedRect(x, y, size, radius)) {
      return [0, 0, 0, 0];
    }

    if (insideGlyph(x, y, size) || insideAccent(x, y, size)) {
      return [255, 255, 255, 255];
    }

    return backgroundColor(x, y, size);
  });
}

fs.mkdirSync(ICON_DIR, { recursive: true });

const sizes = [
  ['icon-16.png', 16],
  ['icon-48.png', 48],
  ['icon-128.png', 128],
];

for (const [name, size] of sizes) {
  fs.writeFileSync(path.join(ICON_DIR, name), createLogoPng(size));
}

console.log('Generated Recall logo icons in', ICON_DIR);
