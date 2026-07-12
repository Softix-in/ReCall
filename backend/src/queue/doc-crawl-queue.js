class DocCrawlQueue {
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

  addJob({ jobId, userId }) {
    if (this.shuttingDown) {
      throw new Error('Doc crawl queue is shutting down');
    }

    if (this.queue.some((j) => j.jobId === jobId) || this.currentJob?.jobId === jobId) {
      return;
    }

    this.queue.push({
      jobId,
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
          `Doc crawl job ${jobId} failed (attempt ${this.currentJob.attempts}): ${error.message}. Retrying in ${delay}ms`,
        );

        const job = this.currentJob;
        this.currentJob = null;
        this.running = false;

        setTimeout(() => {
          this.queue.unshift(job);
          this.processNext();
        }, delay);
      } else {
        console.error(`Doc crawl job ${jobId} failed permanently: ${error.message}`);
        const job = this.currentJob;
        this.currentJob = null;
        this.running = false;

        if (this.onPermanentFailure) {
          await this.onPermanentFailure(jobId, error);
        }

        this.processNext();
      }
    }
  }

  async drain() {
    this.shuttingDown = true;

    while (this.running || this.queue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

module.exports = {
  DocCrawlQueue,
};
