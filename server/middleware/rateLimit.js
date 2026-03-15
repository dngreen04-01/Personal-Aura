function createRateLimit(maxRequests, windowMs) {
  const clients = new Map();

  // Clean up expired entries every 5 minutes
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of clients) {
      if (now - entry.windowStart > windowMs) {
        clients.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  cleanup.unref(); // Don't keep process alive for cleanup

  return (req, res, next) => {
    const uid = req.user?.uid;
    if (!uid) return next(); // Skip if no auth (shouldn't happen after authMiddleware)

    const now = Date.now();
    const entry = clients.get(uid);

    if (!entry || now - entry.windowStart > windowMs) {
      clients.set(uid, { count: 1, windowStart: now });
      return next();
    }

    entry.count++;

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryable: true,
        retryAfter,
      });
    }

    next();
  };
}

module.exports = { createRateLimit };
