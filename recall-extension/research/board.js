import {
  getResearchCompany,
  getResearchStats,
  health,
  isAuthError,
  listResearchCompanies,
  reanalyzeResearchCompany,
  updateResearchCompany,
} from '../shared/api.js';
import { requireAuth } from '../shared/auth-gate.js';
import { mountAppShell } from '../shared/app-shell.js';

const $ = (selector) => document.querySelector(selector);

const state = {
  statusFilter: '',
  companies: [],
  counts: {},
  selectedId: null,
  detail: null,
};

function showToast(message, type = 'success') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = `toast visible ${type}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('visible'), 2800);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function setBanner(online, message) {
  const banner = $('#connection-banner');
  if (online) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  $('#connection-banner-text').textContent = message || 'Backend unreachable.';
}

function renderStats(counts = {}) {
  const entries = [
    ['Total', counts.total || 0],
    ['Processing', counts.processing || 0],
    ['Processed', counts.processed || 0],
    ['Needs review', counts.needs_review || 0],
    ['Shortlisted', counts.shortlisted || 0],
  ];

  $('#stats').innerHTML = entries
    .map(([label, value]) => `<span class="stat-chip"><strong>${value}</strong> ${label}</span>`)
    .join('');
}

function renderCompanyList() {
  const list = $('#company-list');

  if (!state.companies.length) {
    list.innerHTML = '<div class="empty">No researched startups yet. Open a YC company page and click Research.</div>';
    return;
  }

  list.innerHTML = '';

  for (const company of state.companies) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `company-row${company.id === state.selectedId ? ' active' : ''}`;
    btn.innerHTML = `
      <h3>${escapeHtml(company.name)}</h3>
      <p class="meta">${escapeHtml([company.yc_batch, company.yc_status, company.industry].filter(Boolean).join(' · '))}</p>
      <p class="desc">${escapeHtml(company.short_description || '')}</p>
      <span class="status-pill ${escapeHtml(company.status)}">${escapeHtml(company.status)}</span>
    `;
    btn.addEventListener('click', () => selectCompany(company.id));
    list.appendChild(btn);
  }
}

function scoreCards(analysis) {
  if (!analysis) return '';

  const scores = [
    ['Opportunity', analysis.opportunity_score],
    ['Personal fit', analysis.personal_fit_score],
    ['Demand', analysis.market_demand_score],
    ['Pain', analysis.problem_pain_score],
    ['Tech depth', analysis.technical_depth_score],
    ['Competition', analysis.competition_score],
    ['Buildability', analysis.buildability_score],
    ['Long-term', analysis.long_term_score],
  ].filter(([, value]) => value != null);

  if (!scores.length) return '';

  return `
    <div class="section">
      <h3>Scores</h3>
      <div class="score-grid">
        ${scores.map(([label, value]) => `
          <div class="score-card">
            <div class="label">${escapeHtml(label)}</div>
            <div class="value">${escapeHtml(value)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderDetail() {
  const pane = $('#detail-pane');
  const detail = state.detail;

  if (!detail?.company) {
    pane.innerHTML = '<div class="empty">Select a company to view research.</div>';
    return;
  }

  const { company, analysis, founders, news, pages, jobs, funding } = detail;
  const latestJob = jobs?.[0];

  pane.innerHTML = `
    <div class="detail-header">
      <h2>${escapeHtml(company.name)}</h2>
      <p class="meta">
        ${escapeHtml([company.yc_batch, company.yc_status, company.industry, company.location].filter(Boolean).join(' · '))}
        · <span class="status-pill ${escapeHtml(company.status)}">${escapeHtml(company.status)}</span>
      </p>
      ${company.short_description ? `<p style="margin-top:12px;color:var(--text-2)">${escapeHtml(company.short_description)}</p>` : ''}
      ${(company.tags || []).length ? `<div class="tag-row">${company.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    </div>

    <div class="detail-actions">
      ${company.yc_url ? `<a class="btn-link" href="${escapeHtml(company.yc_url)}" target="_blank" rel="noreferrer">YC profile</a>` : ''}
      ${company.website ? `<a class="btn-link" href="${escapeHtml(company.website)}" target="_blank" rel="noreferrer">Website</a>` : ''}
      <button type="button" data-action="shortlist">Shortlist</button>
      <button type="button" data-action="reject">Reject</button>
      <button type="button" data-action="reanalyze">Re-analyze</button>
    </div>

    ${company.user_note ? `<div class="section"><h3>Your note</h3><p>${escapeHtml(company.user_note)}</p></div>` : ''}

    ${company.funding_summary || company.revenue_notes || funding?.length ? `
      <div class="section">
        <h3>Funding & revenue</h3>
        ${company.funding_summary ? `<p><strong style="color:var(--text)">Summary:</strong> ${escapeHtml(company.funding_summary)}</p>` : ''}
        ${company.revenue_notes ? `<p style="margin-top:8px"><strong style="color:var(--text)">Revenue:</strong> ${escapeHtml(company.revenue_notes)}</p>` : ''}
        ${funding?.length ? `<ul style="margin-top:12px">${funding.map((r) => `
          <li>
            <strong style="color:var(--text)">${escapeHtml([r.round_name, r.amount].filter(Boolean).join(' · ') || 'Round')}</strong>
            ${r.announced_date ? ` · ${escapeHtml(r.announced_date)}` : ''}
            ${r.investors ? `<div style="margin-top:4px">Investors: ${escapeHtml(r.investors)}</div>` : ''}
            ${r.evidence_quote ? `<div style="margin-top:4px;color:var(--muted)">${escapeHtml(r.evidence_quote)}</div>` : ''}
            ${r.source_url ? `<div style="margin-top:4px"><a href="${escapeHtml(r.source_url)}" target="_blank" rel="noreferrer">${escapeHtml(r.source_title || 'Source')}</a>${r.confidence ? ` · confidence ${escapeHtml(r.confidence)}/10` : ''}</div>` : ''}
          </li>
        `).join('')}</ul>` : ''}
      </div>
    ` : ''}

    ${analysis ? `
      <div class="section">
        <h3>One-line</h3>
        <p>${escapeHtml(analysis.one_line_understanding || '—')}</p>
      </div>
      <div class="section">
        <h3>Problem</h3>
        <p>${escapeHtml(analysis.problem_statement || '—')}</p>
      </div>
      <div class="section">
        <h3>Customer</h3>
        <p>${escapeHtml(analysis.target_customer || '—')}</p>
      </div>
      <div class="section">
        <h3>Why now</h3>
        <p>${escapeHtml(analysis.why_now || '—')}</p>
      </div>
      <div class="section">
        <h3>Insight</h3>
        <p>${escapeHtml(analysis.insight_summary || '—')}</p>
      </div>
      <div class="section">
        <h3>Adjacent opportunities</h3>
        <p>${escapeHtml(analysis.adjacent_opportunities || '—')}</p>
      </div>
      <div class="section">
        <h3>AI / deep-tech</h3>
        <p>${escapeHtml(analysis.ai_or_deeptech_angle || '—')}</p>
      </div>
      <div class="section">
        <h3>Risks</h3>
        <p>${escapeHtml(analysis.risks || '—')}</p>
      </div>
      ${analysis.funding_notes || analysis.revenue_notes ? `
        <div class="section">
          <h3>Analysis notes on money</h3>
          ${analysis.funding_notes ? `<p>${escapeHtml(analysis.funding_notes)}</p>` : ''}
          ${analysis.revenue_notes ? `<p style="margin-top:8px">${escapeHtml(analysis.revenue_notes)}</p>` : ''}
        </div>
      ` : ''}
      ${scoreCards(analysis)}
    ` : '<div class="section"><h3>Analysis</h3><p>Still processing or awaiting AI key.</p></div>'}

    <div class="section">
      <h3>Founders (${founders?.length || 0})</h3>
      ${founders?.length ? `<ul>${founders.map((f) => `
        <li>
          <strong style="color:var(--text)">${escapeHtml(f.full_name)}</strong>
          ${f.company_role || f.current_role ? ` · ${escapeHtml(f.company_role || f.current_role)}` : ''}
          ${f.public_bio ? `<div style="margin-top:4px">${escapeHtml(f.public_bio)}</div>` : ''}
          ${f.education ? `<div style="margin-top:4px;color:var(--muted)">Education: ${escapeHtml(f.education)}</div>` : ''}
          ${f.previous_companies ? `<div style="margin-top:4px;color:var(--muted)">Previous: ${escapeHtml(f.previous_companies)}</div>` : ''}
          ${f.technical_background ? `<div style="margin-top:4px;color:var(--muted)">Tech: ${escapeHtml(f.technical_background)}</div>` : ''}
          <div style="margin-top:4px">
            ${f.linkedin_url ? `<a href="${escapeHtml(f.linkedin_url)}" target="_blank" rel="noreferrer">LinkedIn</a> ` : ''}
            ${f.twitter_url ? `<a href="${escapeHtml(f.twitter_url)}" target="_blank" rel="noreferrer">Twitter</a> ` : ''}
            ${f.github_url ? `<a href="${escapeHtml(f.github_url)}" target="_blank" rel="noreferrer">GitHub</a> ` : ''}
            ${f.personal_website ? `<a href="${escapeHtml(f.personal_website)}" target="_blank" rel="noreferrer">Site</a>` : ''}
          </div>
        </li>
      `).join('')}</ul>` : '<p>No founders captured.</p>'}
    </div>

    <div class="section">
      <h3>News & signals (${news?.length || 0})</h3>
      ${news?.length ? `<ul>${news.map((n) => `
        <li>
          <strong style="color:var(--text)">${escapeHtml(n.title)}</strong>
          ${n.news_type ? ` · ${escapeHtml(n.news_type)}` : ''}
          ${n.summary ? `<div style="margin-top:4px">${escapeHtml(n.summary)}</div>` : ''}
          ${n.key_signal ? `<div style="margin-top:4px;color:var(--muted)">${escapeHtml(n.key_signal)}</div>` : ''}
          ${n.url ? `<div style="margin-top:4px"><a href="${escapeHtml(n.url)}" target="_blank" rel="noreferrer">Open</a></div>` : ''}
        </li>
      `).join('')}</ul>` : '<p>No news rows yet.</p>'}
    </div>

    <div class="section">
      <h3>Crawled pages (${pages?.length || 0})</h3>
      ${pages?.length ? `<ul>${pages.map((p) => `
        <li>
          <strong style="color:var(--text)">${escapeHtml(p.page_type || 'page')}</strong>
          · <a href="${escapeHtml(p.url)}" target="_blank" rel="noreferrer">${escapeHtml(p.title || p.url)}</a>
        </li>
      `).join('')}</ul>` : '<p>No pages stored.</p>'}
    </div>

    ${latestJob ? `
      <div class="section">
        <h3>Latest job</h3>
        <p>${escapeHtml(latestJob.status)} · step ${escapeHtml(latestJob.progress?.step || '—')}
        ${latestJob.progress?.crawl_engine ? ` · ${escapeHtml(latestJob.progress.crawl_engine)}` : ''}
        ${latestJob.progress?.funding_rounds != null ? ` · ${escapeHtml(latestJob.progress.funding_rounds)} funding rounds` : ''}
        ${latestJob.error_message ? `<br><span style="color:var(--danger)">${escapeHtml(latestJob.error_message)}</span>` : ''}
        </p>
      </div>
    ` : ''}
  `;

  pane.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const action = button.dataset.action;
      button.disabled = true;
      try {
        if (action === 'shortlist') {
          await updateResearchCompany(company.id, { status: 'shortlisted' });
          showToast('Shortlisted');
        } else if (action === 'reject') {
          await updateResearchCompany(company.id, { status: 'rejected' });
          showToast('Rejected');
        } else if (action === 'reanalyze') {
          await reanalyzeResearchCompany(company.id);
          showToast('Re-analysis queued');
        }
        await loadCompanies();
        await selectCompany(company.id);
      } catch (error) {
        showToast(error.message, 'error');
        button.disabled = false;
      }
    });
  });
}

async function selectCompany(id) {
  state.selectedId = id;
  renderCompanyList();

  try {
    state.detail = await getResearchCompany(id);
    renderDetail();
  } catch (error) {
    $('#detail-pane').innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

async function loadCompanies() {
  const data = await listResearchCompanies({
    status: state.statusFilter || null,
    limit: 100,
  });

  state.companies = data.companies || [];
  state.counts = data.counts || {};
  renderStats(state.counts);
  renderCompanyList();
}

function bindEvents() {
  $('#refresh-btn').addEventListener('click', async () => {
    try {
      await loadCompanies();
      if (state.selectedId) await selectCompany(state.selectedId);
      showToast('Refreshed');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  document.querySelectorAll('#status-filters .filter-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      state.statusFilter = button.dataset.status || '';
      document.querySelectorAll('#status-filters .filter-btn').forEach((b) => {
        b.classList.toggle('active', b === button);
      });
      try {
        await loadCompanies();
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  });
}

async function start() {
  mountAppShell({ active: 'research' });

  if (!(await requireAuth())) return;

  bindEvents();

  try {
    await health();
    setBanner(true);
  } catch {
    setBanner(false);
  }

  try {
    await getResearchStats();
    await loadCompanies();
  } catch (error) {
    if (isAuthError(error)) return;
    $('#company-list').innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    showToast(error.message, 'error');
  }
}

start();
