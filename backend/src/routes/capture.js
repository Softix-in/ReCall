const express = require('express');
const { createCapture } = require('../services/capture-service');

function createCaptureRouter(queue) {
  const router = express.Router();

  router.post('/capture', handleCapture);
  router.post('/link', handleCapture);

  async function handleCapture(req, res) {
    try {
      const result = await createCapture(req.user.id, req.body, queue);
      res.status(201).json(result);
    } catch (error) {
      const status = error.status || 500;
      res.status(status).json({
        error: error.message,
        existingId: error.existingId,
      });
    }
  }

  return router;
}

module.exports = {
  createCaptureRouter,
};
