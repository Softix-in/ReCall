const express = require('express');
const { createCapture } = require('../services/capture-service');

function createCaptureRouter(queue) {
  const router = express.Router();

  function handleCapture(req, res) {
    try {
      const result = createCapture(req.body, queue);
      res.status(201).json(result);
    } catch (error) {
      const status = error.status || 500;
      res.status(status).json({
        error: error.message,
        existingId: error.existingId,
      });
    }
  }

  router.post('/capture', handleCapture);
  router.post('/link', handleCapture);

  return router;
}

module.exports = {
  createCaptureRouter,
};
