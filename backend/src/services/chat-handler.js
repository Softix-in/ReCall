const profileDb = require('../db/profile');
const { analyzeJd } = require('./jd-analyzer');
const { generateBio, generatePitch, generateCoverLetterText } = require('./form-generator');
const { LlmError, completeWithTools } = require('./llm-client');

// Re-export tools from here for single import point
const PROFILE_TOOLS_LOCAL = [
  {
    type: 'function',
    function: {
      name: 'update_profile_field',
      description: 'Update a single field on the user profile such as bio, headline, or social URLs',
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: ['display_name', 'headline', 'github_url', 'linkedin_url', 'twitter_url', 'website_url', 'bio_short'],
          },
          value: { type: 'string' },
        },
        required: ['field', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_skills',
      description: 'Replace the full skills list',
      parameters: {
        type: 'object',
        properties: {
          skills: { type: 'array', items: { type: 'string' } },
        },
        required: ['skills'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_project',
      description: 'Add a new project to the profile',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          tagline: { type: 'string' },
          description: { type: 'string' },
          tech_stack: { type: 'array', items: { type: 'string' } },
          impact_bullets: { type: 'array', items: { type: 'string' } },
          github_url: { type: 'string' },
          live_url: { type: 'string' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_project',
      description: 'Update fields of an existing project by name or ID',
      parameters: {
        type: 'object',
        properties: {
          project_identifier: { type: 'string', description: 'Project name or UUID' },
          fields: {
            type: 'object',
            description: 'Key-value pairs of fields to update',
          },
        },
        required: ['project_identifier', 'fields'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_project',
      description: 'Delete a project by name or ID',
      parameters: {
        type: 'object',
        properties: {
          project_identifier: { type: 'string' },
        },
        required: ['project_identifier'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_jd',
      description: 'Run JD analysis on a job description text provided by the user',
      parameters: {
        type: 'object',
        properties: {
          jd_text: { type: 'string' },
          deep_mode: { type: 'boolean' },
        },
        required: ['jd_text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_text',
      description: 'Generate bio, elevator pitch, or cover letter opening',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['bio', 'pitch', 'cover_letter'] },
          context: { type: 'string' },
          jd_analysis_id: { type: 'string' },
          word_limit: { type: 'number' },
        },
        required: ['type'],
      },
    },
  },
];

function buildSystemPrompt(profile, projects) {
  return `You are a career assistant for ${profile.display_name || 'the user'}.

Profile summary:
- Headline: ${profile.headline || 'not set'}
- Skills: ${(profile.skills || []).join(', ') || 'none listed'}
- GitHub: ${profile.github_url || 'not set'}
- LinkedIn: ${profile.linkedin_url || 'not set'}
- Bio: ${profile.bio_short || 'not set'}

Projects (${projects.length} total):
${projects.map((project) => `- ${project.name}: ${project.tagline || project.description?.slice(0, 80) || ''}`).join('\n') || 'None'}

Help the user update their profile, manage projects, analyse job descriptions,
and generate ATS-friendly professional text. Confirm what you've done after each action.
Be concise and action-oriented.`;
}

async function findProject(userId, identifier) {
  const projects = await profileDb.listProjects(userId);
  const trimmed = identifier?.trim();

  if (!trimmed) {
    return null;
  }

  const byId = projects.find((project) => project.id === trimmed);
  if (byId) {
    return byId;
  }

  const lower = trimmed.toLowerCase();
  return projects.find((project) => project.name?.toLowerCase() === lower) || null;
}

function getRefreshTargets(toolName) {
  switch (toolName) {
    case 'update_profile_field':
    case 'update_skills':
    case 'generate_text':
      return ['identity'];
    case 'add_project':
    case 'update_project':
    case 'delete_project':
      return ['projects'];
    case 'analyze_jd':
      return ['career'];
    default:
      return [];
  }
}

async function executeTool(toolName, args, { userId, projectEmbedQueue } = {}) {
  switch (toolName) {
    case 'update_profile_field': {
      const profile = await profileDb.updateProfile(userId, { [args.field]: args.value });
      return { ok: true, profile };
    }

    case 'update_skills': {
      const profile = await profileDb.updateProfile(userId, { skills: args.skills || [] });
      return { ok: true, profile };
    }

    case 'add_project': {
      const name = args.name?.trim();
      if (!name) {
        return { ok: false, error: 'Project name is required' };
      }

      const project = await profileDb.createProject(userId, {
        name,
        tagline: args.tagline,
        description: args.description,
        tech_stack: args.tech_stack || [],
        impact_bullets: args.impact_bullets || [],
        github_url: args.github_url,
        live_url: args.live_url,
      });

      if (projectEmbedQueue) {
        projectEmbedQueue.addJob({ userId, projectId: project.id });
      }

      return { ok: true, project };
    }

    case 'update_project': {
      const project = await findProject(userId, args.project_identifier);

      if (!project) {
        return { ok: false, error: 'Project not found' };
      }

      const fields = { ...(args.fields || {}) };

      if (fields.name !== undefined && (typeof fields.name !== 'string' || !fields.name.trim())) {
        return { ok: false, error: 'name must be a non-empty string' };
      }

      const updated = await profileDb.updateProject(userId, project.id, fields);

      if (!updated) {
        return { ok: false, error: 'Failed to update project' };
      }

      if (projectEmbedQueue && profileDb.shouldReembedProject(userId, project, fields)) {
        projectEmbedQueue.addJob({ userId, projectId: project.id });
      }

      return { ok: true, project: updated };
    }

    case 'delete_project': {
      const project = await findProject(userId, args.project_identifier);

      if (!project) {
        return { ok: false, error: 'Project not found' };
      }

      const deleted = await profileDb.deleteProject(userId, project.id);
      return { ok: deleted, project_id: project.id };
    }

    case 'analyze_jd': {
      const settings = await profileDb.getAiModelSettings(userId);
      const analysis = await analyzeJd({
        userId,
        jdText: args.jd_text,
        streamBullets: false,
        deepMode: args.deep_mode === true || settings.deepAnalysisEnabled,
      });
      return { ok: true, analysis };
    }

    case 'generate_text': {
      if (args.type === 'bio') {
        const result = await generateBio({
          userId,
          tone: 'professional',
          word_limit: args.word_limit || 80,
          jd_analysis_id: args.jd_analysis_id,
        });
        const profile = await profileDb.updateProfile(userId, { bio_short: result.bio });
        return { ok: true, text: result.bio, profile };
      }

      if (args.type === 'pitch') {
        const result = await generatePitch({
          userId,
          context: args.context,
          word_limit: args.word_limit || 120,
          jd_analysis_id: args.jd_analysis_id,
        });
        return { ok: true, text: result.pitch };
      }

      if (args.type === 'cover_letter') {
        const result = await generateCoverLetterText({
          userId,
          jd_analysis_id: args.jd_analysis_id,
          tone: args.context || 'professional',
        });
        return { ok: true, text: result.cover_letter };
      }

      return { ok: false, error: `Unsupported text type: ${args.type}` };
    }

    default:
      return { ok: false, error: `Unknown tool: ${toolName}` };
  }
}

function parseToolArguments(raw) {
  if (!raw) {
    return {};
  }

  if (typeof raw === 'object') {
    return raw;
  }

  return JSON.parse(raw);
}

async function handleChat(messages, { userId, projectEmbedQueue } = {}) {
  if (!userId) {
    throw new LlmError('userId is required', { code: 'validation_error', status: 400 });
  }

  if (!(await profileDb.getFireworksApiKey(userId))) {
    throw new LlmError('Fireworks API key is not configured', {
      code: 'missing_api_key',
      status: 400,
    });
  }

  const profile = await profileDb.getProfile(userId);
  const projects = await profileDb.listProjects(userId);
  const actionsTaken = [];

  const conversation = [
    { role: 'system', content: buildSystemPrompt(profile, projects) },
    ...messages.filter((message) => message?.role && message?.content),
  ];

  const tools = PROFILE_TOOLS_LOCAL;
  let response = await completeWithTools({ userId, messages: conversation, tools });
  let assistantMessage = response.choices[0]?.message;

  for (let turn = 0; turn < 5; turn += 1) {
    const toolCalls = assistantMessage?.tool_calls || [];

    if (!toolCalls.length) {
      break;
    }

    conversation.push({
      role: 'assistant',
      content: assistantMessage.content || '',
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function?.name;
      let args = {};

      try {
        args = parseToolArguments(toolCall.function?.arguments);
      } catch (error) {
        const result = { ok: false, error: `Invalid tool arguments: ${error.message}` };
        conversation.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
        actionsTaken.push({
          tool: toolName,
          params: {},
          result,
          refresh: getRefreshTargets(toolName),
        });
        continue;
      }

      let result;

      try {
        result = await executeTool(toolName, args, { userId, projectEmbedQueue });
      } catch (error) {
        result = { ok: false, error: error.message };
      }

      conversation.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });

      actionsTaken.push({
        tool: toolName,
        params: args,
        result,
        refresh: getRefreshTargets(toolName),
      });
    }

    response = await completeWithTools({ userId, messages: conversation, tools });
    assistantMessage = response.choices[0]?.message;
  }

  const pendingToolCalls = assistantMessage?.tool_calls || [];
  const reply = pendingToolCalls.length
    ? 'I started your request but could not finish every action. Please try again or use the Profile tabs directly.'
    : (assistantMessage?.content?.trim() || 'Done. Let me know if you need anything else.');

  return { reply, actions_taken: actionsTaken };
}

module.exports = {
  PROFILE_TOOLS: PROFILE_TOOLS_LOCAL,
  buildSystemPrompt,
  handleChat,
  executeTool,
};
