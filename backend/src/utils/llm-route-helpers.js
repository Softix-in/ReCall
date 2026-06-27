const { LlmError } = require('../services/llm-client');

function handleLlmError(res, error) {
  if (error instanceof LlmError) {
    const body = { code: error.code };

    if (error.code === 'invalid_api_key') {
      body.error = 'invalid_api_key';
    } else if (error.code === 'missing_api_key') {
      body.error = 'missing_api_key';
    } else {
      body.error = error.message;
    }

    res.status(error.status || 500).json(body);
    return true;
  }

  return false;
}

function sendAnalyzeError(res, error, streamBullets) {
  const payload = error instanceof LlmError
    ? {
      type: 'error',
      error: error.code === 'invalid_api_key' ? 'invalid_api_key'
        : error.code === 'missing_api_key' ? 'missing_api_key'
          : error.code || 'llm_error',
      message: error.message,
    }
    : { type: 'error', error: 'server_error', message: error.message };

  if (streamBullets && res.headersSent) {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    res.end();
    return true;
  }

  return false;
}

module.exports = {
  handleLlmError,
  sendAnalyzeError,
};
