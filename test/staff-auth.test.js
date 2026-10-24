const test = require("node:test");
const assert = require("node:assert/strict");
const { requireStaff, setSession, COOKIE_NAME, createAccessToken, verifyAccessToken } = require("../src/middleware/staff-auth");
const { hashPassword, verifyPassword } = require("../src/services/passwords");

const originalSecret = process.env.AUTH_SECRET;
test.before(() => { process.env.AUTH_SECRET = "test-auth-secret-that-is-long-enough-123456"; });
test.after(() => {
  if (originalSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalSecret;
});

test("sets an HttpOnly session cookie that authenticates the staff user", () => {
  let cookie;
  const response = { cookie: (name, value, options) => { cookie = { name, value, options }; } };
  setSession(response, { id: 7, username: "staff01" });
  assert.equal(cookie.name, COOKIE_NAME);
  assert.equal(cookie.options.httpOnly, true);
  assert.equal(cookie.options.sameSite, "strict");

  const req = { headers: { cookie: `${cookie.name}=${cookie.value}` } };
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  let called = false;
  requireStaff(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.deepEqual(req.staff, { id: 7, username: "staff01", exp: req.staff.exp });
  assert.ok(req.staff.exp > Math.floor(Date.now() / 1000));
});

test("rejects a missing or modified session cookie", () => {
  for (const cookie of [undefined, `${COOKIE_NAME}=invalid.signature`]) {
    const req = { headers: { cookie } };
    const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    let called = false;
    requireStaff(req, res, () => { called = true; });
    assert.equal(called, false);
    assert.equal(res.code, 401);
    assert.equal(res.body.error.code, "AUTH_REQUIRED");
  }
});

test("accepts valid JWT bearer authorization and rejects invalid bearer tokens", () => {
  const token = createAccessToken({ id: 12, username: "jwtstaff" });
  const authorized = { headers: { authorization: `Bearer ${token}` } };
  let called = false;
  requireStaff(authorized, {}, () => { called = true; });
  assert.equal(called, true);
  assert.equal(authorized.staff.id, 12);
  assert.equal(authorized.staff.username, "jwtstaff");

  assert.equal(verifyAccessToken(createAccessToken({ id: 12, username: "jwtstaff" }, 1), 28801), null);
  for (const authorization of [`Bearer ${token}.x`, "Basic invalid", "Bearer expired.token.value"]) {
    const req = { headers: { authorization } };
    const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    requireStaff(req, res, () => assert.fail("invalid token must not authenticate"));
    assert.equal(res.code, 401);
  }
});

test("hashes passwords and verifies only the matching password", async () => {
  const stored = await hashPassword("correct horse battery");
  assert.notEqual(stored, "correct horse battery");
  assert.equal(await verifyPassword("correct horse battery", stored), true);
  assert.equal(await verifyPassword("wrong password", stored), false);
});
