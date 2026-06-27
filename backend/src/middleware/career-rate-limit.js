const rateLimit = require('express-rate-limit');

function rateLimitHandler(routeName) {
  return (req, res) => {
    const retryAfterSeconds = req.rateLimit?.resetTime
      ? Math.max(1, Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000))
      : 3600;

    res.status(429).json({
      error: 'rate_limit_exceeded',
      message: `Too many ${routeName} requests — try again in ${retryAfterSeconds} seconds`,
      retry_after_seconds: retryAfterSeconds,
    });
  };
}

const analyzeJdLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('JD analysis'),
});

const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('chat'),
});

const buildResumeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('resume build'),
});

module.exports = {
  analyzeJdLimiter,
  chatLimiter,
  buildResumeLimiter,
};
