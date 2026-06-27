import { escapeHtml } from '../profile-utils.js';
import { attachCopyButton, flashButtonLabel } from './copy-button.js';

export function renderDiffBlock({ projectName, originals = [], tailored = [], streamingText = '' }) {
  const block = document.createElement('div');
  block.className = 'diff-block';

  block.innerHTML = `
    <div class="diff-block-header">
      <h4>${escapeHtml(projectName)}</h4>
      <button type="button" class="btn btn-secondary copy-bullets-btn">Copy tailored</button>
    </div>
    <div class="diff-columns">
      <div class="diff-column">
        <span class="diff-label">Original</span>
        <ul class="diff-list original-list"></ul>
      </div>
      <div class="diff-column">
        <span class="diff-label">ATS version</span>
        <ul class="diff-list tailored-list"></ul>
        <pre class="diff-stream" hidden></pre>
      </div>
    </div>
  `;

  const originalList = block.querySelector('.original-list');
  const tailoredList = block.querySelector('.tailored-list');
  const streamEl = block.querySelector('.diff-stream');

  for (const bullet of originals) {
    const li = document.createElement('li');
    li.textContent = bullet;
    originalList.appendChild(li);
  }

  if (streamingText) {
    streamEl.hidden = false;
    streamEl.textContent = streamingText;
  } else {
    for (const bullet of tailored) {
      const li = document.createElement('li');
      li.textContent = bullet;
      tailoredList.appendChild(li);
    }
  }

  const copyBtn = block.querySelector('.copy-bullets-btn');
  let currentTailored = [...tailored];
  let currentStream = streamingText;

  attachCopyButton(copyBtn, () => {
    if (currentStream) {
      return currentStream;
    }

    return currentTailored.join('\n');
  }, {
    onCopied: () => flashButtonLabel(copyBtn, 'Copied!'),
    onError: () => flashButtonLabel(copyBtn, 'Failed'),
  });

  return {
    element: block,
    setStreamingText(text) {
      currentStream = text;
      streamEl.hidden = !text;
      streamEl.textContent = text;
      tailoredList.innerHTML = '';
    },
    setTailoredBullets(bullets) {
      currentStream = '';
      currentTailored = bullets;
      streamEl.hidden = true;
      tailoredList.innerHTML = '';
      for (const bullet of bullets) {
        const li = document.createElement('li');
        li.textContent = bullet;
        tailoredList.appendChild(li);
      }
    },
  };
}
