class ResearchQueue {
  constructor(worker, { onPermanentFailure } = {}) {
    this.worker = worker;
    this.onPermanentFailure = onPermanentFailure;
    this.queue = [];
    this.running = false;
    this.currentJob = null;
    this.shuttingDown = false;
    this.maxAttempts = 2;
  }

  getQueueLength() {
    return this.queue.length + (this.currentJob ? 1 : 0);
  }

  addJob({ jobId, companyId, userId }) {
    if (this.shuttingDown) {
      throw new Error('Research queue is shutting down');
    }

    if (this.queue.some((j) => j.jobId === jobId) || this.currentJob?.jobId === jobId) {
      return;
    }

    this.queue.push({
      jobId,
      companyId,
      userId,
      attempts: 0,
    });

    this.processNext();
  }

  async processNext() {
    if (this.running || this.queue.length === 0) {
      return;
    }

    this.running = true;
    this.currentJob = this.queue.shift();

    const { jobId } = this.currentJob;

    try {
      await this.worker(jobId);
      this.currentJob = null;
      this.running = false;
      this.processNext();
    } catch (error) {
      this.currentJob.attempts += 1;

      if (this.currentJob.attempts < this.maxAttempts) {
        const delay = 2000 * (2 ** (this.currentJob.attempts - 1));
        console.error(
          `Research job ${jobId} failed (attempt ${this.currentJob.attempts}): ${error.message}. Retrying in ${delay}ms`,
        );

        const job = this.currentJob;
        this.currentJob = null;
        this.running = false;

        setTimeout(() => {
          this.queue.unshift(job);
          this.processNext();
        }, delay);
      } else {
        console.error(`Research job ${jobId} failed permanently: ${error.message}`);

        if (this.onPermanentFailure) {
          await this.onPermanentFailure(jobId, error);
        }

        this.currentJob = null;
        this.running = false;
        this.processNext();
      }
    }
  }

  async drain() {
    this.shuttingDown = true;

    while (this.queue.length > 0 || this.currentJob) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

module.exports = {
  ResearchQueue,
};
