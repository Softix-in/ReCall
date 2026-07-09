class ProjectEmbedQueue {
  constructor(worker) {
    this.worker = worker;
    this.queue = [];
    this.running = false;
    this.pending = new Set();
    this.shuttingDown = false;
  }

  jobKey({ userId, projectId }) {
    return `${userId}:${projectId}`;
  }

  addJob({ userId, projectId }) {
    if (this.shuttingDown || !userId || !projectId) {
      return;
    }

    const key = this.jobKey({ userId, projectId });

    if (this.pending.has(key)) {
      return;
    }

    this.pending.add(key);
    this.queue.push({ userId, projectId });
    this.processNext();
  }

  async processNext() {
    if (this.running || this.queue.length === 0) {
      return;
    }

    this.running = true;
    const job = this.queue.shift();

    try {
      await this.worker(job);
    } catch (error) {
      console.error(`Project embedding failed for ${job.projectId}: ${error.message}`);
    } finally {
      this.pending.delete(this.jobKey(job));
      this.running = false;
      this.processNext();
    }
  }

  async drain() {
    this.shuttingDown = true;

    while (this.queue.length > 0 || this.running) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

module.exports = {
  ProjectEmbedQueue,
};
