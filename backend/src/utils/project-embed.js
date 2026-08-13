function createProjectEmbedEnqueuer(projectEmbedQueue) {
  return function enqueueProjectEmbedding(userId, projectId) {
    if (projectEmbedQueue && userId && projectId) {
      projectEmbedQueue.addJob({ userId, projectId });
    }
  };
}

module.exports = {
  createProjectEmbedEnqueuer,
};
