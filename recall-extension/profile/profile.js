import { fetchProfile, health } from '../shared/api.js';
import { requireAuth } from '../shared/auth-gate.js';
import { mountIdentityTab } from './sections/identity.js';
import { mountProjectsTab } from './sections/projects.js';
import { mountResumeTab } from './sections/resume.js';
import { mountCareerTab } from './sections/career.js';
import { mountChatDrawer } from './sections/chat.js';

const $ = (selector) => document.querySelector(selector);

const state = {
  user_profile: null,
  projects: [],
  master_resume: null,
  activeTab: 'identity',
  online: true,
};

const tabControllers = {};

function showToast(message, type = 'success') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = `toast visible ${type}`;

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove('visible');
  }, 2800);
}

function setConnectionBanner(online, message) {
  state.online = online;
  const banner = $('#connection-banner');
  const text = $('#connection-banner-text');

  if (online) {
    banner.hidden = true;
    return;
  }

  banner.hidden = false;
  text.textContent = message || 'Backend unreachable. Sign in to sync your library.';
}

function createContext() {
  return {
    getProfile: () => state.user_profile,
    getProjects: () => state.projects,
    getMasterResume: () => state.master_resume,
    setProfile: (profile) => {
      state.user_profile = profile;
      tabControllers.identity?.refresh(profile);
      tabControllers.resume?.onProfileUpdated?.();
    },
    setProjects: (projects) => {
      state.projects = projects;
      tabControllers.projects?.refresh(projects);
    },
    setMasterResume: (resume) => {
      state.master_resume = resume;
    },
    showToast,
    reloadProfile: loadProfile,
    navigateToTab: setActiveTab,
    refreshIdentity: () => tabControllers.identity?.refresh(state.user_profile),
    refreshProjects: () => tabControllers.projects?.refresh(state.projects),
    refreshResume: () => tabControllers.resume?.refresh(state.master_resume),
    refreshCareer: () => tabControllers.career?.refresh?.(),
    onTailoredResumeBuilt: (resume) => {
      tabControllers.resume?.onTailoredResumeBuilt?.(resume);
    },
  };
}

function setActiveTab(tabName) {
  state.activeTab = tabName;

  document.querySelectorAll('.subnav-btn').forEach((button) => {
    const active = button.dataset.tab === tabName;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  document.querySelectorAll('.tab-panel').forEach((panel) => {
    const active = panel.id === `tab-${tabName}`;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

async function loadProfile() {
  try {
    await health();
    const data = await fetchProfile();
    state.user_profile = data.user_profile;
    state.projects = data.projects || [];
    state.master_resume = data.master_resume;
    setConnectionBanner(true);

    tabControllers.identity?.refresh(state.user_profile);
    tabControllers.projects?.refresh(state.projects);
    tabControllers.resume?.refresh(state.master_resume);
    tabControllers.career?.refresh?.();
    tabControllers.chat?.refresh?.();
  } catch (error) {
    setConnectionBanner(false, error.message || 'Backend unreachable');
    throw error;
  }
}

function bindNavigation() {
  document.querySelectorAll('.subnav-btn').forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
  });

  $('#back-link').addEventListener('click', (event) => {
    event.preventDefault();
    window.close();
  });

  $('#settings-link').addEventListener('click', (event) => {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

function mountTabs() {
  const ctx = createContext();

  tabControllers.identity = mountIdentityTab($('#tab-identity'), ctx);
  tabControllers.projects = mountProjectsTab($('#tab-projects'), ctx);
  tabControllers.resume = mountResumeTab($('#tab-resume'), ctx);
  tabControllers.career = mountCareerTab($('#tab-career'), ctx);
  tabControllers.chat = mountChatDrawer($('#chat-sidebar-root'), ctx);
}

async function init() {
  if (!(await requireAuth())) {
    return;
  }

  bindNavigation();
  mountTabs();

  try {
    await loadProfile();
  } catch {
    // Banner already shown; tabs remain usable for offline editing attempts.
  }
}

init();
