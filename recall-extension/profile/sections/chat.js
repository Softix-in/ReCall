import { careerChat } from '../../shared/api.js';
import { escapeHtml } from '../profile-utils.js';

const STORAGE_KEY = 'careerChatHistory';

const SUGGESTED_PROMPTS = [
  'Update my LinkedIn URL to linkedin.com/in/me',
  'Add a project called Recall with React and Node.js',
  'Which of my projects fits a backend engineer role?',
  'Generate a short professional bio for me',
];

export function mountChatDrawer(container, ctx) {
  container.innerHTML = `
    <div class="chat-drawer" id="chat-drawer">
      <button type="button" class="chat-toggle" id="chat-toggle" aria-expanded="false">
        <span class="chat-toggle-label">Chat with AI to edit anything…</span>
        <span class="chat-toggle-icon">↑</span>
      </button>

      <div class="chat-panel" id="chat-panel" hidden>
        <div class="chat-header">
          <h3>Career assistant</h3>
          <button type="button" class="text-btn" id="chat-clear-btn">Clear</button>
        </div>

        <div class="chat-suggestions" id="chat-suggestions"></div>
        <div class="chat-messages" id="chat-messages"></div>
        <p class="inline-error" id="chat-error" hidden></p>

        <form class="chat-input-row" id="chat-form">
          <input type="text" id="chat-input" class="text-input" placeholder="Ask to update your profile, add projects, or analyse a JD…" autocomplete="off" />
          <button type="submit" class="btn btn-primary" id="chat-send-btn">Send</button>
        </form>
      </div>
    </div>
  `;

  const drawer = container.querySelector('#chat-drawer');
  const toggleBtn = container.querySelector('#chat-toggle');
  const panel = container.querySelector('#chat-panel');
  const messagesEl = container.querySelector('#chat-messages');
  const suggestionsEl = container.querySelector('#chat-suggestions');
  const errorEl = container.querySelector('#chat-error');
  const form = container.querySelector('#chat-form');
  const input = container.querySelector('#chat-input');
  const sendBtn = container.querySelector('#chat-send-btn');

  let expanded = false;
  let messages = [];
  let sending = false;

  function setExpanded(next) {
    expanded = next;
    panel.hidden = !expanded;
    toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggleBtn.querySelector('.chat-toggle-icon').textContent = expanded ? '↓' : '↑';
    drawer.classList.toggle('expanded', expanded);

    if (expanded) {
      input.focus();
      renderSuggestions();
    }
  }

  function setError(message) {
    if (!message) {
      errorEl.hidden = true;
      errorEl.textContent = '';
      return;
    }

    errorEl.hidden = false;
    errorEl.textContent = message;
  }

  async function loadHistory() {
    if (!chrome.storage?.local) {
      return;
    }

    const stored = await chrome.storage.local.get(STORAGE_KEY);
    messages = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
    renderMessages();
  }

  async function saveHistory() {
    if (!chrome.storage?.local) {
      return;
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: messages });
  }

  function renderSuggestions() {
    if (messages.length > 0) {
      suggestionsEl.innerHTML = '';
      return;
    }

    suggestionsEl.innerHTML = SUGGESTED_PROMPTS.map((prompt) => (
      `<button type="button" class="chat-suggestion-chip" data-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`
    )).join('');

    suggestionsEl.querySelectorAll('.chat-suggestion-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        input.value = chip.dataset.prompt || '';
        input.focus();
      });
    });
  }

  function renderMessages() {
    messagesEl.innerHTML = '';

    for (const message of messages) {
      const row = document.createElement('div');
      row.className = `chat-message ${message.role}`;

      if (message.role === 'assistant' && message.actions?.length) {
        const chips = message.actions.map((action) => {
          const label = formatActionLabel(action);
          const tab = action.refresh?.[0] || null;
          return `<button type="button" class="action-chip" data-tab="${escapeHtml(tab || '')}">${escapeHtml(label)}</button>`;
        }).join('');

        row.innerHTML = `
          <div class="chat-bubble">${escapeHtml(message.content)}</div>
          <div class="action-chip-row">${chips}</div>
        `;

        row.querySelectorAll('.action-chip').forEach((chip) => {
          chip.addEventListener('click', () => {
            const tab = chip.dataset.tab;
            if (tab) {
              ctx.navigateToTab?.(tab);
            }
          });
        });
      } else {
        row.innerHTML = `<div class="chat-bubble">${escapeHtml(message.content)}</div>`;
      }

      messagesEl.appendChild(row);
    }

    messagesEl.scrollTop = messagesEl.scrollHeight;
    renderSuggestions();
  }

  function formatActionLabel(action) {
    switch (action.tool) {
      case 'update_profile_field':
        return `Updated ${action.params?.field || 'profile'}`;
      case 'update_skills':
        return 'Updated skills';
      case 'add_project':
        return `Added project ${action.params?.name || ''}`.trim();
      case 'update_project':
        return `Updated project ${action.params?.project_identifier || ''}`.trim();
      case 'delete_project':
        return `Deleted project ${action.params?.project_identifier || ''}`.trim();
      case 'analyze_jd':
        return 'Ran JD analysis';
      case 'generate_text':
        return `Generated ${action.params?.type || 'text'}`;
      default:
        return action.tool || 'Action';
    }
  }

  async function applyRefreshTargets(actions) {
    const refreshTargets = new Set(actions.flatMap((action) => action.refresh || []));

    if (refreshTargets.has('identity') || refreshTargets.has('projects') || refreshTargets.has('career')) {
      await ctx.reloadProfile?.();
    }

    for (const target of refreshTargets) {
      if (target === 'identity') {
        ctx.refreshIdentity?.();
      }
      if (target === 'projects') {
        ctx.refreshProjects?.();
      }
      if (target === 'career') {
        ctx.refreshCareer?.();
      }
      if (target === 'resume') {
        ctx.refreshResume?.();
      }
    }
  }

  function isApiKeyError(error) {
    const code = error.code || error.data?.code || error.data?.error;
    return code === 'missing_api_key' || code === 'invalid_api_key';
  }

  function isRateLimitError(error) {
    const code = error.code || error.data?.code || error.data?.error;
    return code === 'rate_limit_exceeded' || error.status === 429;
  }

  async function sendMessage(text) {
    if (!text.trim() || sending) {
      return;
    }

    sending = true;
    sendBtn.disabled = true;
    setError(null);
    setExpanded(true);

    messages.push({ role: 'user', content: text.trim() });
    renderMessages();
    input.value = '';

    try {
      const payloadMessages = messages
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .map((message) => ({ role: message.role, content: message.content }));

      const result = await careerChat(payloadMessages);

      messages.push({
        role: 'assistant',
        content: result.reply,
        actions: result.actions_taken || [],
      });

      await saveHistory();
      renderMessages();
      await applyRefreshTargets(result.actions_taken || []);
    } catch (error) {
      if (isApiKeyError(error)) {
        setError('Fireworks API key required. Add your key in Settings.');
      } else if (isRateLimitError(error)) {
        setError(error.data?.message || error.message || 'Too many requests — try again later');
      } else {
        setError(error.message || 'Chat failed');
      }

      ctx.showToast(error.message || 'Chat failed', 'error');
    } finally {
      sending = false;
      sendBtn.disabled = false;
    }
  }

  toggleBtn.addEventListener('click', () => setExpanded(!expanded));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    sendMessage(input.value);
  });

  container.querySelector('#chat-clear-btn').addEventListener('click', async () => {
    messages = [];
    await saveHistory();
    renderMessages();
    setError(null);
  });

  loadHistory();

  return {
    refresh() {
      renderSuggestions();
    },
  };
}
