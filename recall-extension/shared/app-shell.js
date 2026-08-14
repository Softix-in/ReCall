import { health } from './api.js';
import { getSession } from './auth.js';
import { isCrampedExtensionWindow, openExtensionTab } from './auth-gate.js';

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: '⌂', path: 'home/home.html' },
  { id: 'search', label: 'Search', icon: '⌕', path: 'search/search.html' },
  { id: 'profile', label: 'Profile & Career', icon: '◈', path: 'profile/profile.html' },
  { id: 'research', label: 'YC Research', icon: '◎', path: 'research/board.html' },
  { id: 'settings', label: 'Settings', icon: '⚙', path: 'settings/settings.html' },
];

const SUBTITLES = {
  home: 'Library home',
  search: 'Search library',
  profile: 'Profile & Career',
  research: 'YC Research',
  settings: 'Settings',
};

function pageUrl(path) {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }
  return `../${path}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Mount the shared primary sidebar into #app-sidebar-root.
 * @param {{ active: 'home'|'search'|'profile'|'research'|'settings', subtitle?: string }} options
 */
export function mountAppShell({ active, subtitle } = {}) {
  const root = document.getElementById('app-sidebar-root');
  if (!root) {
    console.warn('[app-shell] #app-sidebar-root not found');
    return;
  }

  const label = subtitle || SUBTITLES[active] || 'Recall';
  const logoSrc = pageUrl('icons/logo.svg');

  root.className = 'app-sidebar';
  root.setAttribute('aria-label', 'Primary');
  root.innerHTML = `
    <div class="sidebar-brand">
      <img class="brand-logo" src="${logoSrc}" width="30" height="30" alt="" />
      <div>
        <strong>Recall</strong>
        <span id="app-sidebar-subtitle">${escapeHtml(label)}</span>
      </div>
    </div>

    <nav class="app-nav" aria-label="Primary">
      ${NAV_ITEMS.map((item) => `
        <a class="nav-btn${item.id === active ? ' active' : ''}" href="${pageUrl(item.path)}" data-nav="${item.id}">
          <span class="nav-icon">${item.icon}</span> ${item.label}
        </a>
      `).join('')}
    </nav>

    <div class="sidebar-status">
      <div class="daemon-status">
        <span class="status-dot" id="app-daemon-dot"></span>
        <span id="app-daemon-label">Checking…</span>
      </div>
      <p id="app-user-email" class="user-email">Not signed in</p>
    </div>
  `;

  root.querySelectorAll('a[data-nav]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (!isCrampedExtensionWindow()) {
        return;
      }

      event.preventDefault();
      openExtensionTab(link.href);
      window.close();
    });
  });

  refreshAppShellStatus().catch(() => {});
}

export async function refreshAppShellStatus() {
  const emailEl = document.getElementById('app-user-email');
  const dotEl = document.getElementById('app-daemon-dot');
  const labelEl = document.getElementById('app-daemon-label');

  if (!emailEl && !dotEl && !labelEl) return;

  try {
    const session = await getSession();
    const email = session?.user?.email;
    if (emailEl) {
      emailEl.textContent = email || 'Not signed in';
    }
  } catch {
    if (emailEl) emailEl.textContent = 'Not signed in';
  }

  if (!dotEl || !labelEl) return;

  try {
    await health();
    dotEl.classList.add('online');
    labelEl.textContent = 'Backend online';
  } catch {
    dotEl.classList.remove('online');
    labelEl.textContent = 'Backend offline';
  }
}
