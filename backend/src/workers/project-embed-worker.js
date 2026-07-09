const profileDb = require('../db/profile');
const embedClient = require('../services/embed-client');

async function embedProject({ userId, projectId }) {
  const project = await profileDb.getProjectById(userId, projectId);

  if (!project) {
    return;
  }

  const text = profileDb.buildProjectEmbedText(userId, project);

  if (!text) {
    await profileDb.updateProjectEmbedding(userId, projectId, null);
    return;
  }

  const embedding = await embedClient.embedText(text);
  await profileDb.updateProjectEmbedding(userId, projectId, embedding);
}

module.exports = {
  embedProject,
};
