const { fetchOgMetadata } = require('./fetch-og');
const { fetchArticleText } = require('./fetch-article');
const { downloadAudio, cleanupAudio } = require('./fetch-audio');
const { transcribeAudio } = require('./transcribe');
const { fetchPdfContent } = require('./fetch-pdf');

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

async function fetchVideoContent(url, itemId, userId) {
  let audioPath = null;

  try {
    audioPath = await downloadAudio(url, itemId);
    const transcript = await transcribeAudio(audioPath, itemId, userId);
    const og = await fetchOgMetadata(url, itemId);

    return {
      title: og.title,
      text: transcript.text,
      thumbnail: og.thumbnail,
      transcript: transcript.relativePath,
      og_type: og.og_type || 'video',
    };
  } catch (videoError) {
    cleanupAudio(audioPath);
    audioPath = null;

    // Fall back to OG/article metadata so the item is still saved without transcript.
    let og;
    try {
      og = await fetchOgMetadata(url, itemId);
    } catch {
      // Re-throw the original video error if we can't even fetch OG data.
      throw videoError;
    }

    const isDllError = videoError.code === 3221225781 || videoError.code === -1073741515;
    const fallbackReason = isDllError
      ? 'Video transcription unavailable — install the Visual C++ Redistributable (see https://aka.ms/vs/17/release/vc_redist.x64.exe)'
      : `Video transcription failed: ${videoError.message}`;

    return {
      title: og.title,
      text: og.text || og.title || '',
      thumbnail: og.thumbnail,
      transcript: null,
      og_type: og.og_type || 'video',
      fallback: true,
      fallbackReason,
    };
  } finally {
    cleanupAudio(audioPath);
  }
}

async function fetchPdfAsContent(url) {
  const pdf = await fetchPdfContent(url);
  return {
    title: pdf.title,
    text: pdf.text,
    thumbnail: null,
    transcript: null,
  };
}

async function fetchBySourceType(sourceType, url, itemId, userId) {
  switch (sourceType) {
    case 'video':
      return fetchVideoContent(url, itemId, userId);
    case 'article':
    case 'yc-startup':
      return fetchArticleContent(url, itemId);
    case 'social-post':
      return fetchSocialPostContent(url, itemId);
    case 'pdf':
      return fetchPdfAsContent(url);
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
