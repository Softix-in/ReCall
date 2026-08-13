function looksInternal(message) {
  return /sql|postgres|econn|enotfound|stack|at Object\.|node_modules|password|api[_-]?key|secret/i.test(
    String(message || ''),
  );
}

function clientErrorMessage(error, fallback = 'Request failed') {
  const status = Number(error?.status) || 500;
  const message = error?.message || fallback;

  if (status >= 500 || looksInternal(message)) {
    return fallback;
  }

  return message;
}

function sendError(res, error, fallback = 'Request failed') {
  const status = Number(error?.status) || 500;
  const body = { error: clientErrorMessage(error, fallback) };

  if (error?.code && status < 500) {
    body.code = error.code;
  }

  if (status >= 500) {
    console.error(fallback, error);
  }

  res.status(status).json(body);
}

module.exports = {
  clientErrorMessage,
  sendError,
};
