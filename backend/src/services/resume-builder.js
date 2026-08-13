const fs = require('fs');
const path = require('path');
const profileDb = require('../db/profile');
const careerDb = require('../db/career');
const { LlmError, completeStructured } = require('./llm-client');

const TAILORED_RESUME_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    experience: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          company: { type: 'string' },
          role: { type: 'string' },
          start: { type: 'string' },
          end: { type: 'string' },
          bullets: { type: 'array', items: { type: 'string' } },
        },
        required: ['company', 'role', 'bullets'],
      },
    },
    skills_section: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'experience', 'skills_section'],
  additionalProperties: false,
};

const RESUME_TEMPLATE_PATH = path.join(__dirname, '../templates/resume.html');

async function ensureApiKey(userId) {
  if (!(await profileDb.getFireworksApiKey(userId))) {
    throw new LlmError('Fireworks API key is not configured', {
      code: 'missing_api_key',
      status: 400,
    });
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function atsSafeText(value) {
  return String(value || '')
    .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, '-')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
}

function normalizeResumeRecord(resume) {
  if (!resume) {
    return null;
  }

  return {
    id: resume.id,
    version: resume.version,
    is_master: resume.is_master,
    label: resume.label,
    summary: resume.summary || '',
    skills_section: resume.skills_section || [],
    experience: resume.experience || [],
    education: resume.education || [],
    certifications: resume.certifications || [],
    jd_analysis_id: resume.jd_analysis_id,
    created_at: resume.created_at,
  };
}

function buildTailoringPrompt({ profile, masterResume, jdAnalysis, projects }) {
  const projectBlocks = projects.map((project) => {
    const tailored = jdAnalysis.tailored_bullets?.[project.id] || project.impact_bullets || [];
    return `
Project: ${project.name}
Tagline: ${project.tagline || ''}
Tech: ${(project.tech_stack || []).join(', ')}
Tailored bullets:
${tailored.map((bullet) => `- ${bullet}`).join('\n')}`;
  }).join('\n');

  return `Create an ATS-optimized resume tailored for this job.

Candidate profile:
- Name: ${profile.display_name || 'Unknown'}
- Headline: ${profile.headline || ''}
- Bio: ${profile.bio_short || ''}
- Skills: ${(profile.skills || []).join(', ')}

Target role: ${jdAnalysis.role_title || 'Unknown'}
Company: ${jdAnalysis.company_name || 'Unknown'}
Seniority: ${jdAnalysis.seniority_level || 'unknown'}
Required skills: ${(jdAnalysis.required_skills || []).join(', ')}
ATS keywords: ${(jdAnalysis.ats_keywords || []).join(', ')}

Master work experience (preserve factual dates/companies; rewrite bullets for ATS):
${JSON.stringify(masterResume.experience || [], null, 2)}

Selected projects to include as project experience entries (use tailored bullets):
${projectBlocks}

Return JSON with:
- summary: 2-3 sentence ATS professional summary using relevant keywords truthfully
- experience: merged work experience from master (rewritten bullets) plus one entry per selected project
- skills_section: prioritized skill list for this role (strings only)`;
}

function mergeProjectExperience(llmExperience, projects, jdAnalysis) {
  const existingKeys = new Set(
    (llmExperience || []).map((entry) => `${entry.company}|${entry.role}`.toLowerCase()),
  );

  const projectEntries = projects.map((project) => {
    const bullets = jdAnalysis.tailored_bullets?.[project.id]
      || project.impact_bullets
      || [];

    return {
      company: project.name,
      role: project.tagline || 'Project',
      start: project.start_date || '',
      end: project.end_date || 'Present',
      bullets,
      is_project: true,
    };
  });

  const merged = [...(llmExperience || [])];

  for (const entry of projectEntries) {
    const key = `${entry.company}|${entry.role}`.toLowerCase();
    if (!existingKeys.has(key)) {
      merged.push(entry);
      existingKeys.add(key);
    }
  }

  return merged;
}

function buildResumeLabel(jdAnalysis) {
  const company = jdAnalysis.company_name && jdAnalysis.company_name !== 'unknown'
    ? jdAnalysis.company_name
    : 'Tailored';
  const role = jdAnalysis.role_title || 'Role';
  return `${company} ${role}`;
}

async function buildTailoredResume({
  userId,
  jd_analysis_id: jdAnalysisId,
  selected_project_ids: selectedProjectIds = [],
}) {
  await ensureApiKey(userId);

  const jdAnalysis = await careerDb.getJdAnalysisById(userId, jdAnalysisId);
  if (!jdAnalysis) {
    throw new LlmError('JD analysis not found', { code: 'not_found', status: 404 });
  }

  const masterResume = await careerDb.getMasterResume(userId);
  const profile = await profileDb.getProfile(userId);
  const allProjects = await profileDb.listProjects(userId);
  const order = selectedProjectIds.length
    ? selectedProjectIds
    : (jdAnalysis.suggested_project_order || []);

  if (selectedProjectIds.length) {
    const existingIds = new Set(allProjects.map((project) => project.id));
    const unknownId = selectedProjectIds.find((id) => !existingIds.has(id));

    if (unknownId) {
      throw new LlmError(`Unknown project id: ${unknownId}`, { code: 'validation_error', status: 400 });
    }
  }

  const projects = order
    .map((id) => allProjects.find((project) => project.id === id))
    .filter(Boolean);

  const llmResult = await completeStructured({
    userId,
    prompt: buildTailoringPrompt({
      profile,
      masterResume: masterResume || { experience: [], education: [], certifications: [] },
      jdAnalysis,
      projects,
    }),
    schema: TAILORED_RESUME_SCHEMA,
    schemaName: 'tailored_resume',
  });

  const experience = mergeProjectExperience(llmResult.experience, projects, jdAnalysis);
  const education = masterResume?.education || [];
  const certifications = masterResume?.certifications || [];

  const saved = await careerDb.createTailoredResume(userId, {
    label: buildResumeLabel(jdAnalysis),
    jd_analysis_id: jdAnalysisId,
    summary: llmResult.summary || '',
    skills_section: llmResult.skills_section || [],
    experience,
    education,
    certifications,
  });

  return {
    resume: normalizeResumeRecord(saved),
    json: {
      summary: llmResult.summary,
      experience,
      skills_section: llmResult.skills_section,
      education,
      certifications,
    },
    profile,
  };
}

function renderPlainText(profile, resume) {
  const lines = [];

  if (profile?.display_name) {
    lines.push(atsSafeText(profile.display_name.toUpperCase()));
  }

  if (profile?.headline) {
    lines.push(atsSafeText(profile.headline));
  }

  const contact = [
    profile?.github_url,
    profile?.linkedin_url,
    profile?.twitter_url,
    profile?.website_url,
  ].filter(Boolean).map(atsSafeText);

  if (contact.length) {
    lines.push(contact.join(' | '));
  }

  if (resume.summary) {
    lines.push('');
    lines.push('SUMMARY');
    lines.push(atsSafeText(resume.summary));
  }

  const skills = resume.skills_section?.length
    ? resume.skills_section
    : (profile?.skills || []);

  if (skills.length) {
    lines.push('');
    lines.push('SKILLS');
    lines.push(atsSafeText(skills.join(', ')));
  }

  if (resume.experience?.length) {
    lines.push('');
    lines.push('EXPERIENCE');

    for (const entry of resume.experience) {
      lines.push('');
      lines.push(atsSafeText(`${entry.role || 'Role'} - ${entry.company || 'Company'}`));
      if (entry.start || entry.end) {
        lines.push(atsSafeText(`${entry.start || ''} - ${entry.end || 'Present'}`.trim()));
      }

      for (const bullet of entry.bullets || []) {
        if (bullet?.trim()) {
          lines.push(`- ${atsSafeText(bullet.trim())}`);
        }
      }
    }
  }

  if (resume.education?.length) {
    lines.push('');
    lines.push('EDUCATION');

    for (const entry of resume.education) {
      lines.push(atsSafeText(
        `${entry.degree || 'Degree'}, ${entry.institution || 'Institution'}${entry.year ? ` (${entry.year})` : ''}`,
      ));
    }
  }

  if (resume.certifications?.length) {
    lines.push('');
    lines.push('CERTIFICATIONS');

    for (const entry of resume.certifications) {
      lines.push(atsSafeText(
        `${entry.name || 'Certification'}${entry.issuer ? ` - ${entry.issuer}` : ''}${entry.year ? ` (${entry.year})` : ''}`,
      ));
    }
  }

  return lines.join('\n').trim();
}

function renderList(items) {
  if (!items?.length) {
    return '';
  }

  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderExperienceSection(experience) {
  if (!experience?.length) {
    return '';
  }

  const entries = experience.map((entry) => `
    <div class="entry">
      <div class="entry-header">
        <span>${escapeHtml(entry.role || 'Role')} — ${escapeHtml(entry.company || 'Company')}</span>
        <span>${escapeHtml([entry.start, entry.end || 'Present'].filter(Boolean).join(' – '))}</span>
      </div>
      ${renderList(entry.bullets)}
    </div>
  `).join('');

  return `<div class="section"><div class="section-title">Experience</div>${entries}</div>`;
}

function renderEducationSection(education) {
  if (!education?.length) {
    return '';
  }

  const lines = education.map((entry) => `
    <div class="edu-line">${escapeHtml(entry.degree || 'Degree')}, ${escapeHtml(entry.institution || 'Institution')}${entry.year ? ` (${escapeHtml(entry.year)})` : ''}</div>
  `).join('');

  return `<div class="section"><div class="section-title">Education</div>${lines}</div>`;
}

function renderCertificationsSection(certifications) {
  if (!certifications?.length) {
    return '';
  }

  const lines = certifications.map((entry) => `
    <div class="cert-line">${escapeHtml(entry.name || 'Certification')}${entry.issuer ? ` — ${escapeHtml(entry.issuer)}` : ''}${entry.year ? ` (${escapeHtml(entry.year)})` : ''}</div>
  `).join('');

  return `<div class="section"><div class="section-title">Certifications</div>${lines}</div>`;
}

function renderHtml(profile, resume) {
  const template = fs.readFileSync(RESUME_TEMPLATE_PATH, 'utf8');
  const contact = [
    profile?.github_url,
    profile?.linkedin_url,
    profile?.twitter_url,
    profile?.website_url,
  ].filter(Boolean).map(escapeHtml).join(' · ');

  const skills = resume.skills_section?.length
    ? resume.skills_section
    : (profile?.skills || []);

  const summarySection = resume.summary
    ? `<div class="section"><div class="section-title">Summary</div><div class="summary">${escapeHtml(resume.summary)}</div></div>`
    : '';

  const skillsSection = skills.length
    ? `<div class="section"><div class="section-title">Skills</div><div class="skills">${escapeHtml(skills.join(', '))}</div></div>`
    : '';

  return template
    .replace('{{DISPLAY_NAME}}', escapeHtml(profile?.display_name || 'Resume'))
    .replace('{{HEADLINE}}', escapeHtml(profile?.headline || ''))
    .replace('{{CONTACT}}', contact)
    .replace('{{SUMMARY_SECTION}}', summarySection)
    .replace('{{SKILLS_SECTION}}', skillsSection)
    .replace('{{EXPERIENCE_SECTION}}', renderExperienceSection(resume.experience))
    .replace('{{EDUCATION_SECTION}}', renderEducationSection(resume.education))
    .replace('{{CERTIFICATIONS_SECTION}}', renderCertificationsSection(resume.certifications));
}

async function renderPdf(html) {
  let puppeteer;

  try {
    puppeteer = require('puppeteer');
  } catch {
    throw new LlmError('PDF generation requires puppeteer', { code: 'pdf_unavailable', status: 503 });
  }

  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
    });
  } finally {
    await browser.close();
  }
}

async function exportResume({ userId, resume_id: resumeId, format = 'json' }) {
  const resume = normalizeResumeRecord(await careerDb.getResumeById(userId, resumeId));

  if (!resume) {
    throw new LlmError('Resume not found', { code: 'not_found', status: 404 });
  }

  const profile = await profileDb.getProfile(userId);
  const plain_text = renderPlainText(profile, resume);
  const html = renderHtml(profile, resume);

  if (format === 'text') {
    return { resume_id: resumeId, resume, plain_text };
  }

  if (format === 'pdf') {
    const pdf = await renderPdf(html);
    return { resume_id: resumeId, resume, plain_text, pdf, html };
  }

  return {
    resume_id: resumeId,
    resume,
    json: {
      summary: resume.summary,
      experience: resume.experience,
      skills_section: resume.skills_section,
      education: resume.education,
      certifications: resume.certifications,
    },
    plain_text,
    html,
  };
}

async function buildOrExportResume(input) {
  const format = input.format || 'json';
  const userId = input.userId;

  if (!userId) {
    throw new LlmError('userId is required', { code: 'validation_error', status: 400 });
  }

  if (input.resume_id && !input.jd_analysis_id) {
    return exportResume({ userId, resume_id: input.resume_id, format });
  }

  const built = await buildTailoredResume({ ...input, userId });
  const exported = await exportResume({ userId, resume_id: built.resume.id, format });

  return {
    ...exported,
    json: built.json,
  };
}

module.exports = {
  TAILORED_RESUME_SCHEMA,
  buildTailoredResume,
  exportResume,
  buildOrExportResume,
  renderPlainText,
  renderHtml,
  renderPdf,
  normalizeResumeRecord,
  atsSafeText,
};
