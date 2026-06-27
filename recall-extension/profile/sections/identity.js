import { updateProfile, generateBio } from '../../shared/api.js';
import { debounce } from '../profile-utils.js';
import { createTagInput } from '../components/tag-input.js';
import {
  attachCopyButton,
  createFieldLabel,
  createTextInput,
  flashButtonLabel,
} from '../components/copy-button.js';

const FIELDS = [
  { key: 'display_name', label: 'Display name', placeholder: 'Your full name' },
  { key: 'headline', label: 'Headline', placeholder: 'Full-Stack Engineer' },
  { key: 'github_url', label: 'GitHub', placeholder: 'github.com/username' },
  { key: 'linkedin_url', label: 'LinkedIn', placeholder: 'linkedin.com/in/username' },
  { key: 'twitter_url', label: 'Twitter / X', placeholder: 'x.com/username' },
  { key: 'website_url', label: 'Website', placeholder: 'yoursite.dev' },
];

export function mountIdentityTab(container, ctx) {
  container.innerHTML = `
    <section class="panel-card">
      <div class="panel-card-header">
        <h2>Identity</h2>
        <span class="save-indicator" id="identity-save-indicator" hidden>Saved</span>
      </div>
      <div class="field-grid" id="identity-fields"></div>
      <div class="field-block">
        <label class="field-label" for="identity-bio">Short bio</label>
        <textarea id="identity-bio" class="text-area" rows="4" placeholder="2–3 sentence professional bio"></textarea>
        <div class="field-actions">
          <button type="button" class="btn btn-secondary" id="generate-bio-btn">Generate bio</button>
          <button type="button" class="btn btn-secondary" id="copy-bio-btn">Copy bio</button>
        </div>
      </div>
      <div class="field-block">
        <label class="field-label">Skills</label>
        <div id="identity-skills"></div>
      </div>
      <p class="inline-error" id="identity-error" hidden></p>
    </section>
  `;

  const fieldsRoot = container.querySelector('#identity-fields');
  const inputs = new Map();
  const saveIndicator = container.querySelector('#identity-save-indicator');
  const errorEl = container.querySelector('#identity-error');
  const bioInput = container.querySelector('#identity-bio');

  const scheduleSave = debounce(async () => {
    errorEl.hidden = true;

    const payload = {
      bio_short: bioInput.value.trim() || null,
      skills: skillsControl.getValues(),
    };

    for (const field of FIELDS) {
      const value = inputs.get(field.key).value.trim();
      payload[field.key] = value || null;
    }

    try {
      const result = await updateProfile(payload);
      ctx.setProfile(result.user_profile);
      saveIndicator.hidden = false;
      clearTimeout(mountIdentityTab.saveTimer);
      mountIdentityTab.saveTimer = setTimeout(() => {
        saveIndicator.hidden = true;
      }, 1800);
    } catch (error) {
      errorEl.textContent = error.message || 'Failed to save profile';
      errorEl.hidden = false;
      ctx.showToast(error.message || 'Failed to save profile', 'error');
    }
  }, 300);

  for (const field of FIELDS) {
    const block = document.createElement('div');
    block.className = 'field-block';
    const id = `identity-${field.key}`;
    block.appendChild(createFieldLabel(field.label, id));
    const input = createTextInput({ id, placeholder: field.placeholder });
    block.appendChild(input);
    fieldsRoot.appendChild(block);
    inputs.set(field.key, input);
  }

  const skillsControl = createTagInput({
    values: [],
    placeholder: 'Add skill and press Enter',
    onChange: () => scheduleSave(),
  });
  container.querySelector('#identity-skills').appendChild(skillsControl.element);

  for (const input of inputs.values()) {
    input.addEventListener('blur', scheduleSave);
  }

  bioInput.addEventListener('blur', scheduleSave);

  const copyBtn = container.querySelector('#copy-bio-btn');
  attachCopyButton(copyBtn, () => bioInput.value.trim(), {
    onCopied: () => flashButtonLabel(copyBtn, 'Copied!'),
    onError: (message) => ctx.showToast(message, 'error'),
  });

  const generateBtn = container.querySelector('#generate-bio-btn');
  generateBtn.addEventListener('click', async () => {
    generateBtn.disabled = true;
    errorEl.hidden = true;

    try {
      const result = await generateBio({ tone: 'professional', word_limit: 80 });
      bioInput.value = result.bio || '';

      const payload = {
        bio_short: bioInput.value.trim() || null,
        skills: skillsControl.getValues(),
      };

      for (const field of FIELDS) {
        payload[field.key] = inputs.get(field.key).value.trim() || null;
      }

      const saveResult = await updateProfile(payload);
      ctx.setProfile(saveResult.user_profile);
      saveIndicator.hidden = false;
      ctx.showToast('Bio generated');
    } catch (error) {
      errorEl.textContent = error.message || 'Failed to generate bio';
      errorEl.hidden = false;
      ctx.showToast(error.message || 'Failed to generate bio', 'error');
    } finally {
      generateBtn.disabled = false;
    }
  });

  function populate(profile) {
    for (const field of FIELDS) {
      inputs.get(field.key).value = profile?.[field.key] || '';
    }

    bioInput.value = profile?.bio_short || '';
    skillsControl.setValues(profile?.skills || []);
  }

  populate(ctx.getProfile());

  return {
    refresh(profile) {
      populate(profile);
    },
  };
}
