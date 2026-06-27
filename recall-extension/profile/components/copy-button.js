import { escapeHtml } from '../profile-utils.js';

export function attachCopyButton(button, getText, { onCopied, onError } = {}) {
  button.addEventListener('click', async () => {
    const text = typeof getText === 'function' ? getText() : getText;

    if (!text) {
      onError?.('Nothing to copy');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      onCopied?.();
    } catch (error) {
      onError?.(error.message || 'Clipboard access denied');
    }
  });
}

export function flashButtonLabel(button, label, durationMs = 1500) {
  const original = button.textContent;
  button.textContent = label;
  button.disabled = true;

  setTimeout(() => {
    button.textContent = original;
    button.disabled = false;
  }, durationMs);
}

export function createFieldLabel(text, htmlFor) {
  const label = document.createElement('label');
  label.className = 'field-label';
  label.htmlFor = htmlFor;
  label.textContent = text;
  return label;
}

export function createTextInput({ id, value = '', placeholder = '', type = 'text' }) {
  const input = document.createElement('input');
  input.id = id;
  input.type = type;
  input.className = 'text-input';
  input.value = value ?? '';
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  return input;
}

export function createTextarea({ id, value = '', placeholder = '', rows = 3 }) {
  const textarea = document.createElement('textarea');
  textarea.id = id;
  textarea.className = 'text-area';
  textarea.value = value ?? '';
  textarea.placeholder = placeholder;
  textarea.rows = rows;
  return textarea;
}

export function renderEmptyState(message) {
  const el = document.createElement('p');
  el.className = 'empty-state';
  el.textContent = message;
  return el;
}

export function renderInlineError(message) {
  const el = document.createElement('p');
  el.className = 'inline-error';
  el.textContent = message;
  return el;
}

export { escapeHtml };
