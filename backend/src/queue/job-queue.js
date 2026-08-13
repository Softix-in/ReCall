const config = require('../config');

class JobQueue {
  constructor(worker, { onPermanentFailure } = {}) {
    this.worker = worker;
    this.onPermanentFailure = onPermanentFailure;
    this.queue = [];
    this.running = false;
    this.currentJob = null;
    this.shuttingDown = false;
    this.paused = false;
    this.inFlightUrls = new Set();
  }

  getQueueLength() {
    return this.queue.length + (this.currentJob ? 1 : 0);
  }

  isPaused() {
    return this.paused;
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this.processNext();
  }

  isUrlInFlight(url) {
    return this.inFlightUrls.has(url);
  }

  addJob({ itemId, url }) {
    if (this.shuttingDown) {
      throw new Error('Queue is shutting down');
    }

    this.inFlightUrls.add(url);
    this.queue.push({
      itemId,
      url,
      attempts: 0,
    });

    this.processNext();
  }

  async processNext() {
    if (this.paused || this.running || this.queue.length === 0) {
      return;
    }

    this.running = true;
    this.currentJob = this.queue.shift();

    const { itemId, url } = this.currentJob;

    try {
      await this.worker(itemId);
      this.inFlightUrls.delete(url);
      this.currentJob = null;
      this.running = false;
      this.processNext();
    } catch (error) {
      this.currentJob.attempts += 1;

      if (this.currentJob.attempts < config.JOB_MAX_ATTEMPTS) {
        const delay = config.JOB_BACKOFF_MS * (2 ** (this.currentJob.attempts - 1));
        console.error(
          `Job ${itemId} failed (attempt ${this.currentJob.attempts}/${config.JOB_MAX_ATTEMPTS}): ${error.message}. Retrying in ${delay}ms`
        );

        const job = this.currentJob;
        this.currentJob = null;
        this.running = false;

        setTimeout(() => {
          this.queue.unshift(job);
          this.processNext();
        }, delay);
      } else {
        console.error(`Job ${itemId} failed permanently: ${error.message}`);

        if (this.onPermanentFailure) {
          await this.onPermanentFailure(itemId, error);
        }

        this.inFlightUrls.delete(url);
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
  JobQueue,
};
