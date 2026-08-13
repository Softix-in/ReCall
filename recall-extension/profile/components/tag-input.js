import { escapeHtml } from '../profile-utils.js';

export function createTagInput({ values = [], placeholder = 'Add skill…', onChange }) {
  const root = document.createElement('div');
  root.className = 'tag-input';

  const chips = document.createElement('div');
  chips.className = 'tag-input-chips';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tag-input-field';
  input.placeholder = placeholder;
  input.autocomplete = 'off';

  let currentValues = [...values];

  function emitChange() {
    onChange?.([...currentValues]);
  }

  function renderChips() {
    chips.innerHTML = '';

    for (const value of currentValues) {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.innerHTML = `${escapeHtml(value)} <button type="button" class="tag-chip-remove" aria-label="Remove ${escapeHtml(value)}">×</button>`;

      chip.querySelector('.tag-chip-remove').addEventListener('click', () => {
        currentValues = currentValues.filter((entry) => entry !== value);
        renderChips();
        emitChange();
      });

      chips.appendChild(chip);
    }
  }

  function addValue(raw) {
    const trimmed = raw.trim();
    if (!trimmed) {
      return;
    }

    if (currentValues.some((entry) => entry.toLowerCase() === trimmed.toLowerCase())) {
      return;
    }

    currentValues.push(trimmed);
    renderChips();
    emitChange();
  }

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addValue(input.value);
      input.value = '';
    } else if (event.key === 'Backspace' && !input.value && currentValues.length > 0) {
      currentValues = currentValues.slice(0, -1);
      renderChips();
      emitChange();
    }
  });

  input.addEventListener('blur', () => {
    if (input.value.trim()) {
      addValue(input.value);
      input.value = '';
    }
  });

  root.appendChild(chips);
  root.appendChild(input);
  renderChips();

  return {
    element: root,
    getValues: () => [...currentValues],
    setValues: (nextValues) => {
      currentValues = [...(nextValues || [])];
      renderChips();
    },
  };
}
