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

const DOC_CONTENT_SELECTORS = [
  'main',
  'article',
  '[role="main"]',
  '.docs-content',
  '.doc-content',
  '.documentation',
  '#content',
  '#main-content',
  '.markdown-body',
  '.theme-doc-markdown',
];

function findDocumentationRoot() {
  for (const selector of DOC_CONTENT_SELECTORS) {
    const el = document.querySelector(selector);
    if (el && textOf(el).length > 200) {
      return el;
    }
  }

  return document.body;
}

function guessCodeLang(element) {
  const className = element.className || '';
  const match = className.match(/language-(\w+)/);
  if (match) return match[1];

  const dataLang = element.getAttribute('data-language') || element.getAttribute('data-lang');
  return dataLang || 'text';
}

function extractDocumentation() {
  const root = findDocumentationRoot();
  const sections = [];
  let current = null;
  let charCount = 0;

  const blockElements = root.querySelectorAll('h1, h2, h3, h4, h5, h6, p, pre, ul, ol, table, blockquote, li');

  for (const el of blockElements) {
    if (el.closest('nav, header, footer, aside, [role="navigation"], .sidebar, .nav')) {
      continue;
    }

    const tag = el.tagName;

    if (/^H[1-6]$/.test(tag)) {
      if (current) {
        sections.push(current);
      }

      current = {
        heading: textOf(el),
        level: Number(tag[1]),
        blocks: [],
      };
      continue;
    }

    if (!current) {
      current = {
        heading: 'Overview',
        level: 1,
        blocks: [],
      };
    }

    if (tag === 'PRE') {
      const code = el.textContent?.trim() || '';
      if (code) {
        current.blocks.push({ type: 'code', lang: guessCodeLang(el), text: code });
        charCount += code.length;
      }
      continue;
    }

    const text = textOf(el);
    if (!text || text.length < 2) {
      continue;
    }

    current.blocks.push({ type: 'text', text });
    charCount += text.length;
  }

  if (current) {
    sections.push(current);
  }

  const page = scrapePage();

  return {
    ...page,
    hash: window.location.hash || null,
    sections,
    char_count: charCount,
  };
}

function getSelectedText() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return null;

  const text = selection.toString().trim();
  return text.length > 0 ? text : null;
}

function isYcCompanyPage() {
  try {
    const host = window.location.hostname.replace(/^www\./i, '').toLowerCase();
    return host === 'ycombinator.com' && /^\/companies\/[^/]+\/?$/i.test(window.location.pathname);
  } catch {
    return false;
  }
}

function textOf(el) {
  return el?.textContent?.replace(/\s+/g, ' ').trim() || '';
}

function findByLabel(labels) {
  const nodes = Array.from(document.querySelectorAll('div, span, dt, th, p, li'));
  for (const node of nodes) {
    const text = textOf(node).toLowerCase();
    if (!labels.some((label) => text === label || text.startsWith(`${label}:`))) {
      continue;
    }

    const next = node.nextElementSibling;
    if (next) {
      const value = textOf(next);
      if (value) return value;
    }

    const parent = node.parentElement;
    if (parent) {
      const clone = parent.cloneNode(true);
      const first = clone.firstElementChild;
      if (first) first.remove();
      const value = textOf(clone);
      if (value && value.toLowerCase() !== text) return value;
    }
  }
  return null;
}

function extractWebsite() {
  const links = Array.from(document.querySelectorAll('a[href^="http"]'));
  for (const link of links) {
    const href = link.href;
    const label = textOf(link).toLowerCase();
    if (/ycombinator\.com|linkedin\.com|twitter\.com|x\.com|github\.com|facebook\.com/i.test(href)) {
      continue;
    }
    if (label.includes('website') || label.includes('company') || label === 'site') {
      return href;
    }
  }

  // Prefer first external non-social link in main content
  for (const link of links) {
    const href = link.href;
    if (/ycombinator\.com|linkedin\.com|twitter\.com|x\.com|github\.com|cloudflare|google/i.test(href)) {
      continue;
    }
    try {
      const host = new URL(href).hostname;
      if (host && !host.includes('ycombinator')) {
        return href;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

function extractFounders() {
  const founders = [];
  const seen = new Set();

  // YC pages often list founders with LinkedIn links nearby
  const anchors = Array.from(document.querySelectorAll('a[href*="linkedin.com"], a[href*="twitter.com"], a[href*="x.com"], a[href*="github.com"]'));

  for (const anchor of anchors) {
    const card = anchor.closest('div, li, article, section') || anchor.parentElement;
    if (!card) continue;

    const nameEl =
      card.querySelector('h3, h4, strong, a[href*="/people/"], [class*="name"]') ||
      card.querySelector('a');

    let name = textOf(nameEl);
    if (!name || name.length < 2 || name.length > 80) {
      name = textOf(card).split(/LinkedIn|Twitter|GitHub|X\b/i)[0].trim().slice(0, 80);
    }

    // Prefer text that looks like a person name (2+ words, letters)
    if (!/^[A-Za-z][A-Za-z.'\-]+(\s+[A-Za-z][A-Za-z.'\-]+)+/.test(name)) {
      continue;
    }

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const links = Array.from(card.querySelectorAll('a[href]'));
    const founder = {
      full_name: name,
      current_role: null,
      linkedin_url: null,
      twitter_url: null,
      github_url: null,
      personal_website: null,
    };

    for (const link of links) {
      const href = link.href;
      if (/linkedin\.com/i.test(href)) founder.linkedin_url = href;
      else if (/twitter\.com|x\.com/i.test(href)) founder.twitter_url = href;
      else if (/github\.com/i.test(href)) founder.github_url = href;
    }

    const roleMatch = textOf(card).match(/\b(CEO|CTO|COO|Founder|Co-Founder|Engineer|CPO)\b[^,]{0,40}/i);
    if (roleMatch) {
      founder.current_role = roleMatch[0].trim();
    }

    founders.push(founder);
    if (founders.length >= 8) break;
  }

  return founders;
}

function extractBatch() {
  const body = document.body?.innerText || '';
  const match = body.match(/\b((?:Winter|Spring|Summer|Fall)\s+20\d{2}|W\d{2}|S\d{2}|F\d{2})\b/);
  if (match) return match[1];

  return findByLabel(['batch', 'yc batch']) || null;
}

function scrapeYcCompany() {
  if (!isYcCompanyPage()) {
    return null;
  }

  const page = scrapePage();
  const h1 = document.querySelector('h1');
  const companyName =
    textOf(h1) ||
    page.og_title?.split('|')[0]?.trim() ||
    page.title?.split('|')[0]?.trim() ||
    window.location.pathname.split('/').filter(Boolean).pop();

  const description =
    page.og_description ||
    textOf(document.querySelector('[class*="description"], [data-testid*="description"]')) ||
    findByLabel(['description', 'about']) ||
    null;

  const industry = findByLabel(['industry', 'industries', 'tags']) || null;
  const location = findByLabel(['location', 'based in', 'hq']) || null;
  const teamSize = findByLabel(['team size', 'employees', 'headcount']) || null;

  const visibleText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 50_000);

  return {
    page_type: 'yc_company',
    ...page,
    yc_url: window.location.href.split('#')[0],
    company_name: companyName,
    batch: extractBatch(),
    short_description: description,
    industry,
    location,
    team_size: teamSize,
    website: extractWebsite(),
    founders: extractFounders(),
    visible_text: visibleText,
  };
}

function scrapeStartupPage() {
  const yc = scrapeYcCompany();
  if (yc) {
    return yc;
  }

  const page = scrapePage();
  const h1 = document.querySelector('h1');
  const companyName =
    textOf(h1)?.split(/[·|—-]/)[0]?.trim() ||
    page.og_title?.split(/[·|—-]/)[0]?.trim() ||
    page.title?.split(/[·|—-]/)[0]?.trim() ||
    page.domain?.replace(/^www\./i, '').split('.')[0] ||
    'Unknown company';

  const description = page.og_description || textOf(document.querySelector('main p, article p, p')) || null;
  const visibleText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 50_000);

  return {
    page_type: 'company_website',
    ...page,
    yc_url: null,
    company_name: companyName,
    batch: null,
    short_description: description,
    industry: null,
    location: null,
    team_size: null,
    website: window.location.origin + '/',
    founders: extractFounders(),
    visible_text: visibleText,
  };
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

function ensureYcResearchFab() {
  if (!isYcCompanyPage()) {
    document.getElementById('recall-yc-fab')?.remove();
    return;
  }

  if (document.getElementById('recall-yc-fab')) return;

  const btn = document.createElement('button');
  btn.id = 'recall-yc-fab';
  btn.type = 'button';
  btn.textContent = 'Research startup';
  btn.title = 'Save to Recall YC research';
  btn.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483646;
    border: none;
    border-radius: 999px;
    padding: 12px 18px;
    background: #111;
    color: #fff;
    font: 600 13px Inter, system-ui, sans-serif;
    cursor: pointer;
    box-shadow: 0 10px 30px rgba(0,0,0,0.35);
  `;

  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.textContent = 'Queuing…';
    chrome.runtime.sendMessage(
      { type: 'RESEARCH_YC_STARTUP', extracted: scrapeYcCompany() },
      (response) => {
        btn.disabled = false;
        if (response?.ok) {
          btn.textContent = 'Queued ✓';
          setTimeout(() => {
            btn.textContent = 'Research startup';
          }, 2500);
        } else {
          btn.textContent = response?.authRequired ? 'Sign in required' : 'Failed — retry';
          setTimeout(() => {
            btn.textContent = 'Research startup';
          }, 2800);
        }
      },
    );
  });

  document.body.appendChild(btn);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SCRAPE_PAGE') {
    sendResponse({ ok: true, data: scrapePage() });
    return false;
  }

  if (message.type === 'SCRAPE_YC_COMPANY') {
    const data = scrapeYcCompany();
    if (!data) {
      sendResponse({ ok: false, error: 'Not a YC company page' });
      return false;
    }
    sendResponse({ ok: true, data });
    return false;
  }

  if (message.type === 'SCRAPE_STARTUP_PAGE') {
    sendResponse({ ok: true, data: scrapeStartupPage() });
    return false;
  }

  if (message.type === 'EXTRACT_DOCUMENTATION') {
    sendResponse({ ok: true, data: extractDocumentation() });
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensureYcResearchFab);
} else {
  ensureYcResearchFab();
}

let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    ensureYcResearchFab();
  }
}, 1500);
