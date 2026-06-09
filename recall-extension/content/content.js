function readMeta(property) {
  const element =
    document.querySelector(`meta[property="${property}"]`) ||
    document.querySelector(`meta[name="${property}"]`);

  return element?.content?.trim() || null;
}

function scrapePage() {
  return {
    url: window.location.href,
    title: document.title?.trim() || null,
    og_title: readMeta('og:title'),
    og_description: readMeta('og:description'),
    og_image: readMeta('og:image'),
    og_type: readMeta('og:type'),
    domain: window.location.hostname,
    has_video: Boolean(document.querySelector('video')),
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SCRAPE_PAGE') {
    sendResponse({ ok: true, data: scrapePage() });
    return false;
  }

  return false;
});
