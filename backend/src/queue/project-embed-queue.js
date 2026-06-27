class ProjectEmbedQueue {
  constructor(worker) {
    this.worker = worker;
    this.queue = [];
    this.running = false;
    this.pending = new Set();
    this.shuttingDown = false;
  }

  addJob(projectId) {
    if (this.shuttingDown || !projectId) {
      return;
    }

    if (this.pending.has(projectId)) {
      return;
    }

    this.pending.add(projectId);
    this.queue.push(projectId);
    this.processNext();
  }

  async processNext() {
    if (this.running || this.queue.length === 0) {
      return;
    }

    this.running = true;
    const projectId = this.queue.shift();

    try {
      await this.worker(projectId);
    } catch (error) {
      console.error(`Project embedding failed for ${projectId}: ${error.message}`);
    } finally {
      this.pending.delete(projectId);
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
