const express = require('express');
const { createCapture } = require('../services/capture-service');
const { sendError, clientErrorMessage } = require('../utils/http-error');

function createCaptureRouter(queue) {
  const router = express.Router();

  router.post('/capture', handleCapture);
  router.post('/link', handleCapture);

  async function handleCapture(req, res) {
    try {
      const result = await createCapture(req.user.id, req.body, queue);
      res.status(201).json(result);
    } catch (error) {
      if (error.existingId) {
        res.status(error.status || 409).json({
          error: clientErrorMessage(error, 'Capture failed'),
          existingId: error.existingId,
        });
        return;
      }

      sendError(res, error, 'Capture failed');
    }
  }

  return router;
}

module.exports = {
  createCaptureRouter,
};
