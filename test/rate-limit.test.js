const test = require("node:test");
const assert = require("node:assert/strict");
const { createRateLimiter } = require("../src/middleware/rate-limit");

function call(middleware, ip) {
  const headers = {};
  const res = {
    setHeader(name, value) { headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let nextCalled = false;
  middleware({ ip, headers: {}, socket: {} }, res, () => { nextCalled = true; });
  return { res, headers, nextCalled };
}

test("allows requests within the configured quota and blocks excess requests", () => {
  let now = 1000;
  const limit = createRateLimiter({ windowMs: 60000, max: 2, now: () => now });
  assert.equal(call(limit, "10.0.0.1").nextCalled, true);
  const second = call(limit, "10.0.0.1");
  assert.equal(second.nextCalled, true);
  assert.equal(second.headers["RateLimit-Remaining"], "0");
  const third = call(limit, "10.0.0.1");
  assert.equal(third.nextCalled, false);
  assert.equal(third.res.statusCode, 429);
  assert.equal(third.res.body.error.code, "RATE_LIMIT_EXCEEDED");
  assert.equal(third.headers["Retry-After"], "60");

  now += 60001;
  assert.equal(call(limit, "10.0.0.1").nextCalled, true);
});

test("tracks separate client IPs independently", () => {
  const limit = createRateLimiter({ windowMs: 60000, max: 1, now: () => 1000 });
  assert.equal(call(limit, "10.0.0.1").nextCalled, true);
  assert.equal(call(limit, "10.0.0.1").res.statusCode, 429);
  assert.equal(call(limit, "10.0.0.2").nextCalled, true);
});
