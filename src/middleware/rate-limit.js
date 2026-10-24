function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 1000, now = Date.now } = {}) {
  const clients = new Map();

  return function rateLimit(req, res, next) {
    const timestamp = now();
    const key = req.ip || req.socket?.remoteAddress || "unknown";
    let entry = clients.get(key);
    if (!entry || entry.resetAt <= timestamp) {
      entry = { count: 0, resetAt: timestamp + windowMs };
      clients.set(key, entry);
    }
    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
    if (entry.count > max) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - timestamp) / 1000))));
      return res.status(429).json({ error: { code: "RATE_LIMIT_EXCEEDED", message: "ส่งคำขอถี่เกินไป กรุณาลองใหม่ภายหลัง" } });
    }

    // Bound stale client entries during unusually high-cardinality traffic.
    if (clients.size > 10000) {
      for (const [clientKey, client] of clients) if (client.resetAt <= timestamp) clients.delete(clientKey);
    }
    return next();
  };
}

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const max = Number(process.env.RATE_LIMIT_MAX) || 1000;
const apiRateLimit = createRateLimiter({ windowMs, max });

module.exports = { apiRateLimit, createRateLimiter };
