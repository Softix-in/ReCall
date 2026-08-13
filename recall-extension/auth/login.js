import { forgotPassword, login, register } from '../shared/auth.js';
import { openSettingsPage, redirectIfAuthenticated } from '../shared/auth-gate.js';
import { getBackendBase } from '../shared/config.js';
import { ensureBackendHostPermission } from '../shared/permissions.js';

const $ = (id) => document.getElementById(id);

let mode = 'login';

function bindPasswordToggle(buttonId, inputId) {
  const button = $(buttonId);
  const input = $(inputId);

  button.addEventListener('click', () => {
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    button.textContent = showing ? 'Show' : 'Hide';
    button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    button.title = showing ? 'Show password' : 'Hide password';
  });
}

function showError(message) {
  $('error-banner').textContent = message;
  $('error-banner').hidden = !message;
  if (message) {
    $('success-banner').hidden = true;
  }
}

function showSuccess(message) {
  $('success-banner').textContent = message;
  $('success-banner').hidden = !message;
  if (message) {
    $('error-banner').hidden = true;
  }
}

function setMode(nextMode) {
  mode = nextMode;
  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';

  $('auth-subtitle').textContent = isRegister
    ? 'Create your Recall account'
    : isForgot
      ? 'Reset your password'
      : 'Sign in to your library';

  $('submit-btn').textContent = isRegister
    ? 'Create account'
    : isForgot
      ? 'Send reset link'
      : 'Sign in';

  $('mode-toggle').textContent = isRegister
    ? 'Already have an account? Sign in'
    : 'Create an account';

  $('mode-toggle').hidden = isForgot;
  $('forgot-wrap').hidden = isRegister || isForgot;
  $('password-label').hidden = isForgot;
  $('confirm-password-label').hidden = !isRegister;
  $('confirm-password-label').style.display = isRegister ? '' : 'none';
  $('password').required = !isForgot;
  $('confirm-password').required = isRegister;
  $('password').autocomplete = isRegister ? 'new-password' : 'current-password';

  if (!isRegister) {
    $('confirm-password').value = '';
  }
}

$('mode-toggle').addEventListener('click', () => {
  setMode(mode === 'register' ? 'login' : 'register');
  showError('');
  showSuccess('');
});

$('forgot-toggle').addEventListener('click', () => {
  setMode(mode === 'forgot' ? 'login' : 'forgot');
  showError('');
  showSuccess('');
});

$('settings-link').addEventListener('click', (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

$('auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('');
  showSuccess('');

  const email = $('email').value.trim();
  const password = $('password').value;
  const submitBtn = $('submit-btn');

  submitBtn.disabled = true;
  const prevLabel = submitBtn.textContent;
  submitBtn.textContent = 'Please wait…';

  try {
    await ensureBackendHostPermission();

    if (mode === 'forgot') {
      const result = await forgotPassword(email);
      showSuccess(result.message || 'If that email exists, a reset link has been sent.');
      setMode('login');
      return;
    }

    if (mode === 'register') {
      const confirm = $('confirm-password').value;

      if (password !== confirm) {
        showError('Passwords do not match');
        return;
      }

      if (password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        showError('Password must be at least 10 characters and include a letter and a number');
        return;
      }

      const result = await register(email, password);
      showSuccess(result.message || 'Account created. Check your email to verify your address.');
      openSettingsPage();
      return;
    }

    await login(email, password);
    window.location.replace(chrome.runtime.getURL('home/home.html'));
  } catch (error) {
    showError(error.message || 'Authentication failed');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = prevLabel;
  }
});

async function init() {
  if (await redirectIfAuthenticated('home/home.html')) {
    return;
  }

  bindPasswordToggle('toggle-password', 'password');
  bindPasswordToggle('toggle-confirm-password', 'confirm-password');

  const base = await getBackendBase();
  $('backend-hint').textContent = `Backend: ${base}`;
  setMode('login');
}

init().catch((error) => {
  showError(error.message);
});
