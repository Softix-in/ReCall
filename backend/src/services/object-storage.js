const fs = require('fs/promises');
const path = require('path');
const config = require('../config');

function isObjectStorageEnabled() {
  return Boolean(
    config.R2_ENDPOINT
    && config.R2_BUCKET
    && config.R2_ACCESS_KEY_ID
    && config.R2_SECRET_ACCESS_KEY,
  );
}

async function uploadLocalFallback(kind, userId, itemId, buffer, extension) {
  const dir = kind === 'thumbnail' ? config.THUMBNAILS_DIR : config.TRANSCRIPTS_DIR;
  const filename = `${itemId}${extension}`;
  const absolutePath = path.join(dir, filename);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  const relativePath = path.relative(config.RECALL_HOME, absolutePath).replace(/\\/g, '/');
  return {
    url: null,
    relativePath,
  };
}

async function uploadObject(kind, userId, itemId, content, { contentType, extension }) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');

  if (!isObjectStorageEnabled()) {
    return uploadLocalFallback(kind, userId, itemId, buffer, extension);
  }

  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const key = `${userId}/${kind}s/${itemId}${extension}`;

  const client = new S3Client({
    region: 'auto',
    endpoint: config.R2_ENDPOINT,
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    },
  });

  await client.send(new PutObjectCommand({
    Bucket: config.R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));

  const publicUrl = config.R2_PUBLIC_BASE_URL
    ? `${config.R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`
    : null;

  return {
    url: publicUrl,
    relativePath: null,
    key,
  };
}

async function uploadTranscript(userId, itemId, text) {
  return uploadObject('transcript', userId, itemId, text, {
    contentType: 'text/plain; charset=utf-8',
    extension: '.txt',
  });
}

async function uploadThumbnail(userId, itemId, buffer, extension = '.jpg') {
  return uploadObject('thumbnail', userId, itemId, buffer, {
    contentType: extension === '.png' ? 'image/png' : 'image/jpeg',
    extension,
  });
}

async function readTranscriptContent(item) {
  if (item.transcript_url) {
    const response = await fetch(item.transcript_url);

    if (!response.ok) {
      throw new Error(`Failed to fetch transcript (${response.status})`);
    }

    return response.text();
  }

  if (item.transcript) {
    const absolutePath = path.isAbsolute(item.transcript)
      ? item.transcript
      : path.join(config.RECALL_HOME, item.transcript);

    return fs.readFile(absolutePath, 'utf8');
  }

  return null;
}

module.exports = {
  isObjectStorageEnabled,
  uploadTranscript,
  uploadThumbnail,
  readTranscriptContent,
};
