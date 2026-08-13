const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const { fetchHtml } = require('./fetch-og');

async function fetchArticleText(url) {
  const html = await fetchHtml(url);
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article || !article.textContent?.trim()) {
    throw new Error(`Readability could not extract article content from ${url}`);
  }

  return {
    title: article.title || null,
    textContent: article.textContent.trim(),
    excerpt: article.excerpt || null,
    text: article.textContent.trim(),
  };
}

module.exports = {
  fetchArticleText,
};
