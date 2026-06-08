const { fetchOgMetadata } = require('./fetch-og');
const { fetchArticleText } = require('./fetch-article');
const { downloadAudio, cleanupAudio } = require('./fetch-audio');
const { transcribeAudio } = require('./transcribe');

async function fetchLinkContent(url, itemId) {
  const og = await fetchOgMetadata(url, itemId);
  return {
    title: og.title,
    text: og.text,
    thumbnail: og.thumbnail,
    og_type: og.og_type,
  };
}

async function fetchSocialPostContent(url, itemId) {
  return fetchLinkContent(url, itemId);
}

async function fetchArticleContent(url, itemId) {
  try {
    const article = await fetchArticleText(url);
    const og = await fetchOgMetadata(url, itemId);

    return {
      title: article.title || og.title,
      text: article.text,
      thumbnail: og.thumbnail,
      og_type: 'article',
    };
  } catch (error) {
    const og = await fetchOgMetadata(url, itemId);
    if (og.text?.trim()) {
      return {
        title: og.title,
        text: og.text,
        thumbnail: og.thumbnail,
        og_type: og.og_type,
        fallback: true,
        fallbackReason: error.message,
      };
    }
    throw error;
  }
}

async function fetchVideoContent(url, itemId) {
  let audioPath = null;

  try {
    audioPath = await downloadAudio(url, itemId);
    const transcript = await transcribeAudio(audioPath, itemId);
    const og = await fetchOgMetadata(url, itemId);

    return {
      title: og.title,
      text: transcript.text,
      thumbnail: og.thumbnail,
      transcript: transcript.relativePath,
      og_type: og.og_type || 'video',
    };
  } finally {
    cleanupAudio(audioPath);
  }
}

async function fetchBySourceType(sourceType, url, itemId) {
  switch (sourceType) {
    case 'video':
      return fetchVideoContent(url, itemId);
    case 'article':
      return fetchArticleContent(url, itemId);
    case 'social-post':
      return fetchSocialPostContent(url, itemId);
    case 'link':
    default:
      return fetchLinkContent(url, itemId);
  }
}

module.exports = {
  fetchBySourceType,
  fetchLinkContent,
  fetchArticleContent,
  fetchVideoContent,
};
