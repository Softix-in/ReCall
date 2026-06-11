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

function getSelectedText() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return null;

  const text = selection.toString().trim();
  return text.length > 0 ? text : null;
}

function showHighlightToast() {
  if (document.getElementById('recall-hl-toast')) return;

  const toast = document.createElement('div');
  toast.id = 'recall-hl-toast';
  toast.textContent = '📌 Saved to Recall';
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #ffffff;
    color: #000000;
    padding: 10px 18px;
    border-radius: 10px;
    font-family: Inter, system-ui, sans-serif;
    font-size: 13px;
    font-weight: 600;
    z-index: 2147483647;
    box-shadow: 0 8px 24px rgba(0,0,0,0.45);
    animation: recall-fadein 0.2s ease;
  `;

  const style = document.createElement('style');
  style.textContent = '@keyframes recall-fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}';
  document.head.appendChild(style);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SCRAPE_PAGE') {
    sendResponse({ ok: true, data: scrapePage() });
    return false;
  }

  if (message.type === 'CAPTURE_HIGHLIGHT') {
    const text = getSelectedText();
    if (!text) {
      sendResponse({ ok: false, error: 'No text selected' });
      return false;
    }

    const page = scrapePage();
    sendResponse({
      ok: true,
      data: {
        ...page,
        highlight: text,
      },
    });
    return false;
  }

  if (message.type === 'HIGHLIGHT_SAVED') {
    showHighlightToast();
    return false;
  }

  return false;
});
