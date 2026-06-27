const profileDb = require('../db/profile');
const embedClient = require('../services/embed-client');

async function embedProject(projectId) {
  const project = profileDb.getProjectById(projectId);

  if (!project) {
    return;
  }

  const text = profileDb.buildProjectEmbedText(project);

  if (!text) {
    profileDb.updateProjectEmbedding(projectId, null);
    return;
  }

  const embedding = await embedClient.embedText(text);
  profileDb.updateProjectEmbedding(projectId, embedding);
}

module.exports = {
  embedProject,
};
