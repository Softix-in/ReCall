function createProjectEmbedEnqueuer(projectEmbedQueue) {
  return function enqueueProjectEmbedding(projectId) {
    if (projectEmbedQueue && projectId) {
      projectEmbedQueue.addJob(projectId);
    }
  };
}

module.exports = {
  createProjectEmbedEnqueuer,
};
