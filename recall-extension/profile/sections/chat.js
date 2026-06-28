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
    <div class="chat-sidebar-inner">
      <header class="chat-sidebar-header">
        <div class="chat-sidebar-title">
          <span class="chat-sidebar-icon" aria-hidden="true">✦</span>
          <div>
            <h2>Career assistant</h2>
            <p>Edit profile, projects & resume via chat</p>
          </div>
        </div>
        <button type="button" class="text-btn chat-clear-btn" id="chat-clear-btn" title="Clear conversation">Clear</button>
      </header>

      <div class="chat-suggestions" id="chat-suggestions"></div>

      <div class="chat-messages" id="chat-messages">
        <div class="chat-welcome" id="chat-welcome">
          <p class="chat-welcome-lead">Ask me to update your profile, add projects, or tailor your resume for a role.</p>
        </div>
      </div>

      <p class="inline-error chat-error" id="chat-error" hidden></p>

      <form class="chat-composer" id="chat-form">
        <textarea
          id="chat-input"
          class="chat-composer-input"
          rows="2"
          placeholder="e.g. Add my GitHub URL or analyse this JD…"
          autocomplete="off"
        ></textarea>
        <button type="submit" class="btn btn-primary chat-send-btn" id="chat-send-btn" aria-label="Send message">
          Send
        </button>
      </form>
    </div>
  `;

  const messagesEl = container.querySelector('#chat-messages');
  const suggestionsEl = container.querySelector('#chat-suggestions');
  const errorEl = container.querySelector('#chat-error');
  const form = container.querySelector('#chat-form');
  const input = container.querySelector('#chat-input');
  const sendBtn = container.querySelector('#chat-send-btn');

  let messages = [];
  let sending = false;

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
    const show = messages.length === 0;

    if (!show) {
      suggestionsEl.innerHTML = '';
      suggestionsEl.hidden = true;
      return;
    }

    suggestionsEl.hidden = false;
    suggestionsEl.innerHTML = `
      <p class="chat-suggestions-label">Try asking</p>
      <div class="chat-suggestion-chips">
        ${SUGGESTED_PROMPTS.map((prompt) => (
          `<button type="button" class="chat-suggestion-chip" data-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`
        )).join('')}
      </div>
    `;

    suggestionsEl.querySelectorAll('.chat-suggestion-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        input.value = chip.dataset.prompt || '';
        input.focus();
        autoResizeInput();
      });
    });
  }

  function autoResizeInput() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }

  function renderMessages() {
    const messageNodes = messages.map((message) => {
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

      return row;
    });

    messagesEl.innerHTML = '';
    if (messages.length === 0) {
      const welcome = document.createElement('div');
      welcome.className = 'chat-welcome';
      welcome.innerHTML = `
        <p class="chat-welcome-lead">Ask me to update your profile, add projects, or tailor your resume for a role.</p>
      `;
      messagesEl.appendChild(welcome);
    } else {
      for (const node of messageNodes) {
        messagesEl.appendChild(node);
      }
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

    messages.push({ role: 'user', content: text.trim() });
    renderMessages();
    input.value = '';
    autoResizeInput();

    const thinking = document.createElement('div');
    thinking.className = 'chat-message assistant chat-thinking';
    thinking.innerHTML = '<div class="chat-bubble">Thinking…</div>';
    messagesEl.appendChild(thinking);
    messagesEl.scrollTop = messagesEl.scrollHeight;

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
      thinking.remove();

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

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    sendMessage(input.value);
  });

  input.addEventListener('input', autoResizeInput);

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage(input.value);
    }
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
