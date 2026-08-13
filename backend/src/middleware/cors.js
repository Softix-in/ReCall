const { corsMiddleware } = require('./security');

function createCorsMiddleware() {
  return corsMiddleware;
}

module.exports = {
  createCorsMiddleware,
};
