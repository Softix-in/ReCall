import { buildResume, fetchResumeHistory, saveMasterResume } from '../../shared/api.js';
import { escapeHtml } from '../profile-utils.js';
import { createBulletEditor } from '../components/bullet-editor.js';
import {
  attachCopyButton,
  flashButtonLabel,
} from '../components/copy-button.js';

function blankExperience() {
  return { company: '', role: '', start: '', end: '', bullets: [''] };
}

function blankEducation() {
  return { institution: '', degree: '', year: '' };
}

function blankCertification() {
  return { name: '', issuer: '', year: '' };
}

function renderResumePlainText({ experience, education, certifications }, profile) {
  const lines = [];

  if (profile?.display_name) {
    lines.push(profile.display_name.toUpperCase());
  }

  if (profile?.headline) {
    lines.push(profile.headline);
  }

  const contact = [
    profile?.github_url,
    profile?.linkedin_url,
    profile?.twitter_url,
    profile?.website_url,
  ].filter(Boolean);

  if (contact.length) {
    lines.push(contact.join(' | '));
  }

  if (profile?.bio_short) {
    lines.push('');
    lines.push(profile.bio_short);
  }

  if (profile?.skills?.length) {
    lines.push('');
    lines.push('SKILLS');
    lines.push(profile.skills.join(', '));
  }

  if (experience.length) {
    lines.push('');
    lines.push('EXPERIENCE');

    for (const entry of experience) {
      lines.push('');
      lines.push(`${entry.role || 'Role'} — ${entry.company || 'Company'}`);
      if (entry.start || entry.end) {
        lines.push(`${entry.start || ''} – ${entry.end || 'Present'}`.trim());
      }

      for (const bullet of entry.bullets || []) {
        if (bullet.trim()) {
          lines.push(`- ${bullet.trim()}`);
        }
      }
    }
  }

  if (education.length) {
    lines.push('');
    lines.push('EDUCATION');

    for (const entry of education) {
      lines.push(`${entry.degree || 'Degree'}, ${entry.institution || 'Institution'}${entry.year ? ` (${entry.year})` : ''}`);
    }
  }

  if (certifications.length) {
    lines.push('');
    lines.push('CERTIFICATIONS');

    for (const entry of certifications) {
      lines.push(`${entry.name || 'Certification'}${entry.issuer ? ` — ${entry.issuer}` : ''}${entry.year ? ` (${entry.year})` : ''}`);
    }
  }

  return lines.join('\n').trim();
}

function entryKey(entry) {
  return `${(entry.company || '').toLowerCase()}|${(entry.role || '').toLowerCase()}`;
}

function renderTailoredDiffHtml(masterResume, tailoredResume) {
  const masterMap = new Map(
    (masterResume?.experience || []).map((entry) => [entryKey(entry), entry.bullets || []]),
  );

  const sections = [];

  if (tailoredResume.summary) {
    sections.push(`
      <div class="resume-diff-block">
        <h4>Summary</h4>
        <p class="diff-added">${escapeHtml(tailoredResume.summary)}</p>
      </div>
    `);
  }

  if (tailoredResume.skills_section?.length) {
    sections.push(`
      <div class="resume-diff-block">
        <h4>Skills</h4>
        <p class="diff-added">${escapeHtml(tailoredResume.skills_section.join(', '))}</p>
      </div>
    `);
  }

  for (const entry of tailoredResume.experience || []) {
    const masterBullets = masterMap.get(entryKey(entry)) || [];
    const bulletHtml = (entry.bullets || []).map((bullet) => {
      const isNew = !masterBullets.includes(bullet);
      return `<li class="${isNew ? 'diff-added' : ''}">${escapeHtml(bullet)}</li>`;
    }).join('');

    sections.push(`
      <div class="resume-diff-block">
        <h4>${escapeHtml(entry.role || 'Role')} — ${escapeHtml(entry.company || 'Company')}</h4>
        <ul>${bulletHtml}</ul>
      </div>
    `);
  }

  return sections.join('') || '<p class="empty-state">No differences to show.</p>';
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function mountResumeTab(container, ctx) {
  container.innerHTML = `
    <section class="panel-card">
      <div class="panel-card-header">
        <h2>Resume</h2>
        <div class="header-actions">
          <button type="button" class="btn btn-secondary view-toggle-btn" data-view="structured">Plain text</button>
          <button type="button" class="btn btn-secondary" id="resume-copy-all-btn">Copy all</button>
          <button type="button" class="btn btn-secondary" id="resume-pdf-btn">Download PDF</button>
          <button type="button" class="btn btn-primary" id="resume-save-btn">Save resume</button>
        </div>
      </div>

      <div id="resume-structured-view">
        <div class="resume-section">
          <div class="resume-section-header">
            <h3>Work experience</h3>
            <button type="button" class="text-btn" id="add-experience-btn">+ Add experience</button>
          </div>
          <div id="experience-list"></div>
        </div>

        <div class="resume-section">
          <div class="resume-section-header">
            <h3>Education</h3>
            <button type="button" class="text-btn" id="add-education-btn">+ Add education</button>
          </div>
          <div id="education-list"></div>
        </div>

        <div class="resume-section">
          <div class="resume-section-header">
            <h3>Certifications</h3>
            <button type="button" class="text-btn" id="add-cert-btn">+ Add certification</button>
          </div>
          <div id="cert-list"></div>
        </div>
      </div>

      <pre id="resume-plain-view" class="resume-plain-view" hidden></pre>
      <p class="inline-error" id="resume-error" hidden></p>
    </section>

    <section class="panel-card tailored-history-card">
      <div class="panel-card-header">
        <h2>Tailored versions</h2>
        <button type="button" class="text-btn" id="resume-refresh-tailored-btn">Refresh</button>
      </div>
      <div id="tailored-history-list" class="tailored-history-list"></div>
      <div id="tailored-diff-panel" class="tailored-diff-panel" hidden>
        <div class="resume-section-header">
          <h3 id="tailored-diff-title">Diff vs master</h3>
          <button type="button" class="text-btn" id="tailored-diff-close-btn">Close</button>
        </div>
        <div id="tailored-diff-content" class="tailored-diff-content"></div>
      </div>
    </section>
  `;

  const structuredView = container.querySelector('#resume-structured-view');
  const plainView = container.querySelector('#resume-plain-view');
  const viewToggleBtn = container.querySelector('.view-toggle-btn');
  const experienceList = container.querySelector('#experience-list');
  const educationList = container.querySelector('#education-list');
  const certList = container.querySelector('#cert-list');
  const errorEl = container.querySelector('#resume-error');
  const pdfBtn = container.querySelector('#resume-pdf-btn');
  const tailoredHistoryList = container.querySelector('#tailored-history-list');
  const tailoredDiffPanel = container.querySelector('#tailored-diff-panel');
  const tailoredDiffTitle = container.querySelector('#tailored-diff-title');
  const tailoredDiffContent = container.querySelector('#tailored-diff-content');

  let viewMode = 'structured';
  let experience = [];
  let education = [];
  let certifications = [];
  let latestTailoredResumeId = null;
  let tailoredResumes = [];
  const experienceEditors = new Map();
  const educationBlocks = new Map();
  const certBlocks = new Map();

  function collectData() {
    const nextExperience = experience.map((entry, index) => {
      const block = experienceEditors.get(index);
      return {
        company: block.company.value.trim(),
        role: block.role.value.trim(),
        start: block.start.value.trim(),
        end: block.end.value.trim(),
        bullets: block.bullets.getBullets(),
      };
    });

    const nextEducation = education.map((entry, index) => {
      const block = educationBlocks.get(index);
      return {
        institution: block.institution.value.trim(),
        degree: block.degree.value.trim(),
        year: block.year.value.trim(),
      };
    });

    const nextCerts = certifications.map((entry, index) => {
      const block = certBlocks.get(index);
      return {
        name: block.name.value.trim(),
        issuer: block.issuer.value.trim(),
        year: block.year.value.trim(),
      };
    });

    return {
      experience: nextExperience,
      education: nextEducation,
      certifications: nextCerts,
    };
  }

  function updatePlainPreview() {
    plainView.textContent = renderResumePlainText(collectData(), ctx.getProfile());
  }

  function renderExperience() {
    experienceList.innerHTML = '';
    experienceEditors.clear();

    experience.forEach((entry, index) => {
      const card = document.createElement('div');
      card.className = 'resume-entry-card';

      card.innerHTML = `
        <div class="field-grid two-col">
          <div class="field-block">
            <label class="field-label">Company</label>
            <input class="text-input company-input" type="text" value="" />
          </div>
          <div class="field-block">
            <label class="field-label">Role</label>
            <input class="text-input role-input" type="text" value="" />
          </div>
        </div>
        <div class="field-grid two-col">
          <div class="field-block">
            <label class="field-label">Start</label>
            <input class="text-input start-input" type="text" placeholder="MM/YYYY" />
          </div>
          <div class="field-block">
            <label class="field-label">End</label>
            <input class="text-input end-input" type="text" placeholder="MM/YYYY or Present" />
          </div>
        </div>
        <div class="field-block">
          <label class="field-label">Bullets</label>
          <div class="experience-bullets"></div>
        </div>
        <button type="button" class="text-btn danger remove-entry-btn">Remove experience</button>
      `;

      const company = card.querySelector('.company-input');
      const role = card.querySelector('.role-input');
      const start = card.querySelector('.start-input');
      const end = card.querySelector('.end-input');

      company.value = entry.company || '';
      role.value = entry.role || '';
      start.value = entry.start || '';
      end.value = entry.end || '';

      const bullets = createBulletEditor({
        bullets: entry.bullets?.length ? entry.bullets : [''],
        onChange: updatePlainPreview,
      });
      card.querySelector('.experience-bullets').appendChild(bullets.element);

      card.querySelector('.remove-entry-btn').addEventListener('click', () => {
        experience.splice(index, 1);
        renderExperience();
        updatePlainPreview();
      });

      [company, role, start, end].forEach((input) => {
        input.addEventListener('input', updatePlainPreview);
      });

      experienceEditors.set(index, { company, role, start, end, bullets });
      experienceList.appendChild(card);
    });
  }

  function renderEducation() {
    educationList.innerHTML = '';
    educationBlocks.clear();

    education.forEach((entry, index) => {
      const card = document.createElement('div');
      card.className = 'resume-entry-card';
      card.innerHTML = `
        <div class="field-grid three-col">
          <div class="field-block">
            <label class="field-label">Institution</label>
            <input class="text-input institution-input" type="text" />
          </div>
          <div class="field-block">
            <label class="field-label">Degree</label>
            <input class="text-input degree-input" type="text" />
          </div>
          <div class="field-block">
            <label class="field-label">Year</label>
            <input class="text-input year-input" type="text" />
          </div>
        </div>
        <button type="button" class="text-btn danger remove-entry-btn">Remove education</button>
      `;

      const institution = card.querySelector('.institution-input');
      const degree = card.querySelector('.degree-input');
      const year = card.querySelector('.year-input');

      institution.value = entry.institution || '';
      degree.value = entry.degree || '';
      year.value = entry.year || '';

      card.querySelector('.remove-entry-btn').addEventListener('click', () => {
        education.splice(index, 1);
        renderEducation();
        updatePlainPreview();
      });

      [institution, degree, year].forEach((input) => {
        input.addEventListener('input', updatePlainPreview);
      });

      educationBlocks.set(index, { institution, degree, year });
      educationList.appendChild(card);
    });
  }

  function renderCertifications() {
    certList.innerHTML = '';
    certBlocks.clear();

    certifications.forEach((entry, index) => {
      const card = document.createElement('div');
      card.className = 'resume-entry-card';
      card.innerHTML = `
        <div class="field-grid three-col">
          <div class="field-block">
            <label class="field-label">Name</label>
            <input class="text-input name-input" type="text" />
          </div>
          <div class="field-block">
            <label class="field-label">Issuer</label>
            <input class="text-input issuer-input" type="text" />
          </div>
          <div class="field-block">
            <label class="field-label">Year</label>
            <input class="text-input year-input" type="text" />
          </div>
        </div>
        <button type="button" class="text-btn danger remove-entry-btn">Remove certification</button>
      `;

      const name = card.querySelector('.name-input');
      const issuer = card.querySelector('.issuer-input');
      const year = card.querySelector('.year-input');

      name.value = entry.name || '';
      issuer.value = entry.issuer || '';
      year.value = entry.year || '';

      card.querySelector('.remove-entry-btn').addEventListener('click', () => {
        certifications.splice(index, 1);
        renderCertifications();
        updatePlainPreview();
      });

      [name, issuer, year].forEach((input) => {
        input.addEventListener('input', updatePlainPreview);
      });

      certBlocks.set(index, { name, issuer, year });
      certList.appendChild(card);
    });
  }

  function setViewMode(mode) {
    viewMode = mode;
    const isPlain = mode === 'plain';
    structuredView.hidden = isPlain;
    plainView.hidden = !isPlain;
    viewToggleBtn.textContent = isPlain ? 'Structured view' : 'Plain text';

    if (isPlain) {
      updatePlainPreview();
    }
  }

  viewToggleBtn.addEventListener('click', () => {
    setViewMode(viewMode === 'structured' ? 'plain' : 'structured');
  });

  container.querySelector('#add-experience-btn').addEventListener('click', () => {
    experience.push(blankExperience());
    renderExperience();
    updatePlainPreview();
  });

  container.querySelector('#add-education-btn').addEventListener('click', () => {
    education.push(blankEducation());
    renderEducation();
    updatePlainPreview();
  });

  container.querySelector('#add-cert-btn').addEventListener('click', () => {
    certifications.push(blankCertification());
    renderCertifications();
    updatePlainPreview();
  });

  const copyAllBtn = container.querySelector('#resume-copy-all-btn');
  attachCopyButton(copyAllBtn, () => renderResumePlainText(collectData(), ctx.getProfile()), {
    onCopied: () => flashButtonLabel(copyAllBtn, 'Copied!'),
    onError: (message) => ctx.showToast(message, 'error'),
  });

  container.querySelector('#resume-save-btn').addEventListener('click', async () => {
    errorEl.hidden = true;

    try {
      const payload = collectData();
      const result = await saveMasterResume(payload);
      ctx.setMasterResume(result.resume);
      ctx.showToast('Resume saved');
      updatePlainPreview();
    } catch (error) {
      errorEl.textContent = error.message || 'Failed to save resume';
      errorEl.hidden = false;
      ctx.showToast(error.message || 'Failed to save resume', 'error');
    }
  });

  async function downloadResumePdf(resumeId, filename) {
    const result = await buildResume({ resume_id: resumeId, format: 'pdf' });
    downloadBlob(result.blob, filename);
  }

  async function loadTailoredHistory() {
    try {
      const { resumes } = await fetchResumeHistory();
      tailoredResumes = (resumes || []).filter((resume) => !resume.is_master);
      latestTailoredResumeId = tailoredResumes[0]?.id || null;
      pdfBtn.disabled = !latestTailoredResumeId;

      tailoredHistoryList.innerHTML = '';

      if (!tailoredResumes.length) {
        tailoredHistoryList.innerHTML = '<p class="empty-state">No tailored versions yet. Use the Career tab to analyse a JD and apply to resume.</p>';
        return;
      }

      for (const resume of tailoredResumes) {
        const row = document.createElement('div');
        row.className = 'tailored-history-row';

        const label = resume.label
          || [resume.company_name, resume.role_title].filter(Boolean).join(' ')
          || 'Tailored resume';
        const when = new Date(resume.created_at).toLocaleString();

        row.innerHTML = `
          <div class="tailored-history-meta">
            <strong>${escapeHtml(label)}</strong>
            <span>${escapeHtml(when)}</span>
          </div>
          <div class="tailored-history-actions">
            <button type="button" class="btn btn-secondary tailored-view-btn">View diff</button>
            <button type="button" class="btn btn-secondary tailored-pdf-btn">Download PDF</button>
          </div>
        `;

        row.querySelector('.tailored-view-btn').addEventListener('click', () => {
          tailoredDiffTitle.textContent = `Diff vs master — ${label}`;
          tailoredDiffContent.innerHTML = renderTailoredDiffHtml(ctx.getMasterResume(), resume);
          tailoredDiffPanel.hidden = false;
        });

        row.querySelector('.tailored-pdf-btn').addEventListener('click', async () => {
          try {
            await downloadResumePdf(resume.id, `${label.replace(/\s+/g, '-').toLowerCase()}.pdf`);
            ctx.showToast('PDF downloaded');
          } catch (error) {
            ctx.showToast(error.message || 'Failed to download PDF', 'error');
          }
        });

        tailoredHistoryList.appendChild(row);
      }
    } catch (error) {
      tailoredHistoryList.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
    }
  }

  pdfBtn.addEventListener('click', async () => {
    if (!latestTailoredResumeId) {
      ctx.showToast('Build a tailored resume from the Career tab first', 'error');
      return;
    }

    pdfBtn.disabled = true;

    try {
      await downloadResumePdf(latestTailoredResumeId, 'tailored-resume.pdf');
      ctx.showToast('PDF downloaded');
    } catch (error) {
      ctx.showToast(error.message || 'Failed to download PDF', 'error');
    } finally {
      pdfBtn.disabled = !latestTailoredResumeId;
    }
  });

  container.querySelector('#resume-refresh-tailored-btn').addEventListener('click', loadTailoredHistory);
  container.querySelector('#tailored-diff-close-btn').addEventListener('click', () => {
    tailoredDiffPanel.hidden = true;
  });

  function populate(resume) {
    experience = (resume?.experience || []).map((entry) => ({
      company: entry.company || '',
      role: entry.role || '',
      start: entry.start || '',
      end: entry.end || '',
      bullets: entry.bullets?.length ? [...entry.bullets] : [''],
    }));

    education = (resume?.education || []).map((entry) => ({
      institution: entry.institution || '',
      degree: entry.degree || '',
      year: entry.year || '',
    }));

    certifications = (resume?.certifications || []).map((entry) => ({
      name: entry.name || '',
      issuer: entry.issuer || '',
      year: entry.year || '',
    }));

    renderExperience();
    renderEducation();
    renderCertifications();
    updatePlainPreview();
  }

  populate(ctx.getMasterResume());
  loadTailoredHistory();

  return {
    refresh(resume) {
      populate(resume);
      loadTailoredHistory();
    },
    onProfileUpdated() {
      updatePlainPreview();
    },
    onTailoredResumeBuilt(resume) {
      latestTailoredResumeId = resume?.id || latestTailoredResumeId;
      pdfBtn.disabled = !latestTailoredResumeId;
      loadTailoredHistory();
    },
  };
}
