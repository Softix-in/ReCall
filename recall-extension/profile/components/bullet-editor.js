import { escapeHtml } from '../profile-utils.js';

export function createBulletEditor({ bullets = [], placeholder = 'Impact bullet…', onChange }) {
  const root = document.createElement('div');
  root.className = 'bullet-editor';

  const list = document.createElement('div');
  list.className = 'bullet-editor-list';

  let currentBullets = [...bullets];

  function emitChange() {
    onChange?.(currentBullets.filter((bullet) => bullet.trim()));
  }

  function render() {
    list.innerHTML = '';

    currentBullets.forEach((bullet, index) => {
      const row = document.createElement('div');
      row.className = 'bullet-row';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'text-input';
      input.value = bullet;
      input.placeholder = placeholder;
      input.addEventListener('input', () => {
        currentBullets[index] = input.value;
        emitChange();
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'icon-btn';
      removeBtn.title = 'Remove bullet';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => {
        currentBullets.splice(index, 1);
        render();
        emitChange();
      });

      row.appendChild(input);
      row.appendChild(removeBtn);
      list.appendChild(row);
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'text-btn';
    addBtn.textContent = '+ Add bullet';
    addBtn.addEventListener('click', () => {
      currentBullets.push('');
      render();
      const lastInput = list.querySelector('.bullet-row:last-child input');
      lastInput?.focus();
    });

    list.appendChild(addBtn);
  }

  render();
  root.appendChild(list);

  return {
    element: root,
    getBullets: () => currentBullets.filter((bullet) => bullet.trim()),
    setBullets: (nextBullets) => {
      currentBullets = [...(nextBullets || [])];
      if (currentBullets.length === 0) {
        currentBullets = [''];
      }
      render();
    },
  };
}

export function escapeBulletHtml(value) {
  return escapeHtml(value);
}
