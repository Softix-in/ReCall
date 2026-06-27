import {
  analyzeJd,
  buildResume,
  getJdAnalysis,
  listJdAnalyses,
  updateProfileAiSettings,
} from '../../shared/api.js';
import { escapeHtml } from '../profile-utils.js';
import { renderDiffBlock } from '../components/diff-viewer.js';

const STAGE_LABELS = {
  extracting: 'Extracting skills…',
  scoring: 'Scoring your projects…',
  rewriting: 'Rewriting bullets…',
  cached: 'Loaded cached analysis…',
  fallback: 'Using keyword-only fallback…',
};

export function mountCareerTab(container, ctx) {
  container.innerHTML = `
    <section class="panel-card">
      <div class="panel-card-header">
        <h2>Career</h2>
        <button type="button" class="text-btn" id="career-refresh-history-btn">Refresh history</button>
      </div>

      <div class="api-key-panel" id="career-api-key-panel" hidden>
        <p class="inline-hint">Add your Fireworks API key to enable JD analysis. Get one at <a href="https://fireworks.ai" target="_blank" rel="noreferrer">fireworks.ai</a>.</p>
        <div class="field-grid two-col">
          <input type="password" id="career-api-key-input" class="text-input" placeholder="Fireworks API key" autocomplete="off" />
          <button type="button" class="btn btn-secondary" id="career-save-api-key-btn">Save API key</button>
        </div>
        <p class="inline-error" id="career-api-key-error" hidden></p>
      </div>

      <div class="field-block">
        <label class="field-label" for="career-jd-input">Job description</label>
        <textarea id="career-jd-input" class="text-area jd-textarea" rows="10" placeholder="Paste the full job description here…"></textarea>
      </div>

      <div class="career-actions">
        <button type="button" class="btn btn-primary" id="career-analyze-btn">Analyse JD →</button>
        <span class="progress-label" id="career-progress-label" hidden></span>
      </div>

      <p class="inline-error" id="career-error" hidden></p>
      <p class="warning-banner" id="career-fallback-banner" hidden>
        Keyword-only analysis (no Fireworks API key or LLM unavailable). Bullet rewrites are disabled — add your API key in Settings for full AI features.
      </p>

      <div id="career-results" class="career-results" hidden>
        <div class="career-section">
          <h3>Extracted info</h3>
          <div id="career-meta" class="career-meta"></div>
          <div id="career-keyword-groups" class="keyword-groups"></div>
        </div>

        <div class="career-section">
          <h3>Your projects (ranked by match)</h3>
          <div id="career-project-ranking" class="project-ranking"></div>
        </div>

        <div class="career-section">
          <h3>Tailored bullets</h3>
          <div id="career-diff-list" class="diff-list"></div>
        </div>

        <div class="career-section" id="career-resume-actions" hidden>
          <h3>Full tailored resume</h3>
          <div class="career-actions">
            <button type="button" class="btn btn-primary" id="career-apply-resume-btn">Apply to resume</button>
            <button type="button" class="btn btn-secondary" id="career-copy-plain-btn">Copy plain text</button>
            <button type="button" class="btn btn-secondary" id="career-download-pdf-btn">Download PDF</button>
          </div>
        </div>
      </div>

      <div class="career-section history-section">
        <h3>Past analyses</h3>
        <div id="career-history-list" class="history-list"></div>
      </div>
    </section>
  `;

  const apiKeyPanel = container.querySelector('#career-api-key-panel');
  const apiKeyInput = container.querySelector('#career-api-key-input');
  const apiKeyError = container.querySelector('#career-api-key-error');
  const jdInput = container.querySelector('#career-jd-input');
  const analyzeBtn = container.querySelector('#career-analyze-btn');
  const progressLabel = container.querySelector('#career-progress-label');
  const errorEl = container.querySelector('#career-error');
  const fallbackBanner = container.querySelector('#career-fallback-banner');
  const resultsEl = container.querySelector('#career-results');
  const metaEl = container.querySelector('#career-meta');
  const keywordGroupsEl = container.querySelector('#career-keyword-groups');
  const rankingEl = container.querySelector('#career-project-ranking');
  const diffListEl = container.querySelector('#career-diff-list');
  const historyListEl = container.querySelector('#career-history-list');
  const resumeActionsEl = container.querySelector('#career-resume-actions');
  const applyResumeBtn = container.querySelector('#career-apply-resume-btn');
  const copyPlainBtn = container.querySelector('#career-copy-plain-btn');
  const downloadPdfBtn = container.querySelector('#career-download-pdf-btn');

  const diffBlocks = new Map();
  const streamBuffers = new Map();
  let currentAnalysis = null;
  let lastBuiltResumeId = null;

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function getSelectedProjectIds() {
    return (currentAnalysis?.ranked_projects || []).slice(0, 5).map((project) => project.id);
  }

  function updateApiKeyPanel() {
    const profile = ctx.getProfile();
    const needsKey = !profile?.has_fireworks_api_key;
    apiKeyPanel.hidden = !needsKey;
  }

  function setProgress(stage) {
    if (!stage) {
      progressLabel.hidden = true;
      progressLabel.textContent = '';
      return;
    }

    progressLabel.hidden = false;
    progressLabel.textContent = STAGE_LABELS[stage] || stage;
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

  function renderKeywordGroup(label, items, className) {
    if (!items?.length) {
      return '';
    }

    const chips = items.map((item) => `<span class="keyword-chip ${className}">${escapeHtml(item)}</span>`).join('');
    return `
      <div class="keyword-group">
        <span class="keyword-group-label">${escapeHtml(label)}</span>
        <div class="keyword-chip-row">${chips}</div>
      </div>
    `;
  }

  function renderAnalysis(analysis) {
    currentAnalysis = analysis;
    resultsEl.hidden = false;
    resumeActionsEl.hidden = false;
    fallbackBanner.hidden = !analysis.keyword_only;

    metaEl.innerHTML = `
      <p><strong>Role:</strong> ${escapeHtml(analysis.role_title || 'Unknown role')}${analysis.company_name ? ` · ${escapeHtml(analysis.company_name)}` : ''}</p>
      <p><strong>Seniority:</strong> ${escapeHtml(analysis.seniority_level || 'unknown')}</p>
    `;

    keywordGroupsEl.innerHTML = [
      renderKeywordGroup('Required', analysis.required_skills, 'required'),
      renderKeywordGroup('Preferred', analysis.preferred_skills, 'preferred'),
      renderKeywordGroup('ATS keywords', analysis.ats_keywords || analysis.extracted_keywords, 'ats'),
    ].join('');

    const ranked = analysis.ranked_projects || [];

    if (ranked.length === 0) {
      rankingEl.innerHTML = '<p class="empty-state">Add projects in the Projects tab to get relevance rankings.</p>';
    } else {
      rankingEl.innerHTML = ranked.map((project, index) => {
        const percent = Math.round((project.score || 0) * 100);
        const width = Math.max(percent, 4);
        return `
          <div class="rank-row">
            <div class="rank-label">
              <span>${index + 1}. ${escapeHtml(project.name)}</span>
              <span>${percent}%</span>
            </div>
            <div class="rank-bar"><span style="width:${width}%"></span></div>
          </div>
        `;
      }).join('');
    }

    diffListEl.innerHTML = '';
    diffBlocks.clear();
    streamBuffers.clear();

    if (ranked.length === 0) {
      diffListEl.innerHTML = '<p class="empty-state">No projects available for bullet rewriting.</p>';
      return;
    }

    for (const project of ranked.slice(0, 5)) {
      const block = renderDiffBlock({
        projectName: project.name,
        originals: project.original_bullets || [],
        tailored: project.tailored_bullets || [],
      });

      diffBlocks.set(project.id, block);
      diffListEl.appendChild(block.element);
    }
  }

  async function loadHistory() {
    try {
      const { analyses } = await listJdAnalyses();
      historyListEl.innerHTML = '';

      if (!analyses?.length) {
        historyListEl.innerHTML = '<p class="empty-state">No past analyses yet.</p>';
        return;
      }

      for (const entry of analyses) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'history-row';
        const title = entry.role_title || 'Untitled role';
        const company = entry.company_name ? ` · ${entry.company_name}` : '';
        const when = new Date(entry.created_at).toLocaleString();
        row.innerHTML = `<strong>${escapeHtml(title)}</strong>${escapeHtml(company)}<span>${escapeHtml(when)}</span>`;
        row.addEventListener('click', async () => {
          try {
            const { analysis } = await getJdAnalysis(entry.id);
            jdInput.value = analysis.jd_text || '';
            renderAnalysis(analysis);
            setError(null);
          } catch (error) {
            setError(error.message || 'Failed to load analysis');
          }
        });
        historyListEl.appendChild(row);
      }
    } catch (error) {
      historyListEl.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
    }
  }

  function handleStreamEvent(event) {
    if (event.type === 'progress') {
      setProgress(event.stage);
      return;
    }

    if (event.type === 'analysis') {
      renderAnalysis(event.analysis);
      return;
    }

    if (event.type === 'bullet_start') {
      streamBuffers.set(event.project_id, '');
      const block = diffBlocks.get(event.project_id);
      block?.setStreamingText('');
      return;
    }

    if (event.type === 'bullet_token') {
      const next = `${streamBuffers.get(event.project_id) || ''}${event.text || ''}`;
      streamBuffers.set(event.project_id, next);
      const block = diffBlocks.get(event.project_id);
      block?.setStreamingText(next);
      return;
    }

    if (event.type === 'bullet_end') {
      const block = diffBlocks.get(event.project_id);
      block?.setTailoredBullets(event.bullets || []);
      streamBuffers.delete(event.project_id);
      return;
    }

    if (event.type === 'done') {
      setProgress(null);
      renderAnalysis(event.analysis);
      loadHistory();
    }
  }

  function isRateLimitError(error) {
    const code = error.code || error.data?.code || error.data?.error;
    return code === 'rate_limit_exceeded' || error.status === 429;
  }

  function isApiKeyError(error) {
    const code = error.code || error.data?.code || error.data?.error;
    return code === 'missing_api_key' || code === 'invalid_api_key';
  }

  container.querySelector('#career-save-api-key-btn').addEventListener('click', async () => {
    apiKeyError.hidden = true;
    const fireworks_api_key = apiKeyInput.value.trim();

    if (!fireworks_api_key) {
      apiKeyError.textContent = 'Enter a Fireworks API key';
      apiKeyError.hidden = false;
      return;
    }

    try {
      const result = await updateProfileAiSettings({ fireworks_api_key });
      ctx.setProfile(result.user_profile);
      apiKeyInput.value = '';
      updateApiKeyPanel();
      ctx.showToast('Fireworks API key saved');
    } catch (error) {
      apiKeyError.textContent = error.message || 'Failed to save API key';
      apiKeyError.hidden = false;
    }
  });

  analyzeBtn.addEventListener('click', async () => {
    const jdText = jdInput.value.trim();
    setError(null);

    if (!jdText) {
      setError('Paste a job description first');
      return;
    }

    if (ctx.getProjects().length === 0) {
      setError('Add at least one project in the Projects tab for meaningful rankings.');
      return;
    }

    analyzeBtn.disabled = true;
    setProgress('extracting');

    try {
      await analyzeJd(jdText, {
        streamBullets: true,
        onEvent: handleStreamEvent,
      });
    } catch (error) {
      setProgress(null);

      if (isApiKeyError(error)) {
        updateApiKeyPanel();
        const isInvalid = (error.code || error.data?.error) === 'invalid_api_key';
        setError(isInvalid
          ? 'Invalid Fireworks API key. Update it below or in Settings.'
          : 'Fireworks API key required. Add your key below or in Settings.');
      } else if (isRateLimitError(error)) {
        setError(error.data?.message || error.message || 'Too many requests — try again later');
      } else {
        setError(error.message || 'JD analysis failed');
      }

      ctx.showToast(error.message || 'JD analysis failed', 'error');
    } finally {
      analyzeBtn.disabled = false;
      setProgress(null);
    }
  });

  container.querySelector('#career-refresh-history-btn').addEventListener('click', loadHistory);

  applyResumeBtn.addEventListener('click', async () => {
    if (!currentAnalysis?.id) {
      setError('Run a JD analysis first');
      return;
    }

    applyResumeBtn.disabled = true;
    setError(null);

    try {
      const result = await buildResume({
        jd_analysis_id: currentAnalysis.id,
        selected_project_ids: getSelectedProjectIds(),
        format: 'json',
      });
      lastBuiltResumeId = result.resume_id;
      ctx.showToast('Tailored resume saved');
      ctx.onTailoredResumeBuilt?.(result.resume);
    } catch (error) {
      setError(error.message || 'Failed to build tailored resume');
      ctx.showToast(error.message || 'Failed to build tailored resume', 'error');
    } finally {
      applyResumeBtn.disabled = false;
    }
  });

  copyPlainBtn.addEventListener('click', async () => {
    if (!currentAnalysis?.id) {
      setError('Run a JD analysis first');
      return;
    }

    copyPlainBtn.disabled = true;
    setError(null);

    try {
      const payload = lastBuiltResumeId
        ? { resume_id: lastBuiltResumeId, format: 'text' }
        : {
          jd_analysis_id: currentAnalysis.id,
          selected_project_ids: getSelectedProjectIds(),
          format: 'text',
        };

      const result = await buildResume(payload);

      if (!lastBuiltResumeId) {
        lastBuiltResumeId = result.resume_id;
      }

      await navigator.clipboard.writeText(result.plain_text || '');
      ctx.showToast('Plain text copied');
    } catch (error) {
      setError(error.message || 'Failed to copy plain text');
      ctx.showToast(error.message || 'Failed to copy plain text', 'error');
    } finally {
      copyPlainBtn.disabled = false;
    }
  });

  downloadPdfBtn.addEventListener('click', async () => {
    if (!currentAnalysis?.id) {
      setError('Run a JD analysis first');
      return;
    }

    downloadPdfBtn.disabled = true;
    setError(null);

    try {
      const payload = lastBuiltResumeId
        ? { resume_id: lastBuiltResumeId, format: 'pdf' }
        : {
          jd_analysis_id: currentAnalysis.id,
          selected_project_ids: getSelectedProjectIds(),
          format: 'pdf',
        };

      const result = await buildResume(payload);

      if (!lastBuiltResumeId) {
        lastBuiltResumeId = result.resume_id;
      }

      const label = currentAnalysis.role_title || 'resume';
      downloadBlob(result.blob, `${label.replace(/\s+/g, '-').toLowerCase()}.pdf`);
      ctx.showToast('PDF downloaded');
    } catch (error) {
      setError(error.message || 'Failed to download PDF');
      ctx.showToast(error.message || 'Failed to download PDF', 'error');
    } finally {
      downloadPdfBtn.disabled = false;
    }
  });

  updateApiKeyPanel();
  loadHistory();

  return {
    refresh() {
      updateApiKeyPanel();
      loadHistory();
    },
  };
}
