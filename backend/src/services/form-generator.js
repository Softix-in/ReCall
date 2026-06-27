const profileDb = require('../db/profile');
const careerDb = require('../db/career');
const { LlmError, completeStructured, completeStreaming, streamCompletion } = require('./llm-client');

function ensureApiKey() {
  if (!profileDb.getFireworksApiKey()) {
    throw new LlmError('Fireworks API key is not configured', {
      code: 'missing_api_key',
      status: 400,
    });
  }
}

function loadContext(jdAnalysisId) {
  const profile = profileDb.getProfile();
  const projects = profileDb.listProjects();
  const jdAnalysis = jdAnalysisId ? careerDb.getJdAnalysisById(jdAnalysisId) : null;

  return { profile, projects, jdAnalysis };
}

function buildProfileContext({ profile, projects, jdAnalysis }) {
  const projectSummary = projects.map((project) => (
    `- ${project.name}: ${project.tagline || ''} (${(project.tech_stack || []).join(', ')})`
  )).join('\n');

  const jdBlock = jdAnalysis
    ? `
Target role: ${jdAnalysis.role_title || 'Unknown'}
Company: ${jdAnalysis.company_name || 'Unknown'}
Required skills: ${(jdAnalysis.required_skills || []).join(', ')}
ATS keywords: ${(jdAnalysis.ats_keywords || []).join(', ')}`
    : '';

  return `Candidate:
Name: ${profile.display_name || 'Unknown'}
Headline: ${profile.headline || ''}
Bio: ${profile.bio_short || ''}
Skills: ${(profile.skills || []).join(', ')}

Projects:
${projectSummary || 'None'}
${jdBlock}`;
}

async function generateBio({ tone = 'professional', word_limit = 80, jd_analysis_id: jdAnalysisId } = {}) {
  ensureApiKey();

  const context = loadContext(jdAnalysisId);
  const prompt = `Write a concise professional bio for this candidate.
Tone: ${tone}
Word limit: about ${word_limit} words
Use plain text only, no markdown.

${buildProfileContext(context)}

Return JSON: { "bio": "..." }`;

  const result = await completeStructured({
    prompt,
    schema: {
      type: 'object',
      properties: { bio: { type: 'string' } },
      required: ['bio'],
      additionalProperties: false,
    },
    schemaName: 'bio_generation',
    temperature: 0.5,
  });

  return { bio: result.bio?.trim() || '' };
}

async function generatePitch({ context: extraContext = '', word_limit = 120, jd_analysis_id: jdAnalysisId } = {}) {
  ensureApiKey();

  const context = loadContext(jdAnalysisId);
  const prompt = `Write a short networking pitch / elevator pitch for this candidate.
Word limit: about ${word_limit} words
Additional context: ${extraContext || 'None'}

${buildProfileContext(context)}

Return JSON: { "pitch": "..." }`;

  const result = await completeStructured({
    prompt,
    schema: {
      type: 'object',
      properties: { pitch: { type: 'string' } },
      required: ['pitch'],
      additionalProperties: false,
    },
    schemaName: 'pitch_generation',
    temperature: 0.55,
  });

  return { pitch: result.pitch?.trim() || '' };
}

async function generateCoverLetter({
  jd_analysis_id: jdAnalysisId,
  tone = 'professional',
  res,
}) {
  ensureApiKey();

  if (!jdAnalysisId) {
    throw new LlmError('jd_analysis_id is required', { code: 'validation_error', status: 400 });
  }

  const context = loadContext(jdAnalysisId);

  if (!context.jdAnalysis) {
    throw new LlmError('JD analysis not found', { code: 'not_found', status: 404 });
  }

  const prompt = `Write a compelling cover letter opening and body for this job application.
Tone: ${tone}
Length: 3-4 paragraphs.
Use the candidate's real projects and skills truthfully.
Do not invent employers or degrees.

${buildProfileContext(context)}

Job description excerpt:
${context.jdAnalysis.jd_text.slice(0, 3500)}`;

  await completeStreaming({
    messages: [{ role: 'user', content: prompt }],
    res,
    temperature: 0.55,
  });
}

async function generateCoverLetterText({
  jd_analysis_id: jdAnalysisId,
  tone = 'professional',
} = {}) {
  ensureApiKey();

  if (!jdAnalysisId) {
    throw new LlmError('jd_analysis_id is required', { code: 'validation_error', status: 400 });
  }

  const context = loadContext(jdAnalysisId);

  if (!context.jdAnalysis) {
    throw new LlmError('JD analysis not found', { code: 'not_found', status: 404 });
  }

  const prompt = `Write a compelling cover letter for this job application.
Tone: ${tone}
Length: 3-4 paragraphs.
Use the candidate's real projects and skills truthfully.
Do not invent employers or degrees.

${buildProfileContext(context)}

Job description excerpt:
${context.jdAnalysis.jd_text.slice(0, 3500)}`;

  const cover_letter = await streamCompletion({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.55,
  });

  return { cover_letter: cover_letter.trim() };
}

module.exports = {
  generateBio,
  generatePitch,
  generateCoverLetter,
  generateCoverLetterText,
};
