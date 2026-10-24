const test = require("node:test");
const assert = require("node:assert/strict");
const { protectBoardgameMutations } = require("../src/middleware/staff-routes");

function run(method, originalUrl) {
  const req = { method, originalUrl, headers: {} };
  const res = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  let nextCalled = false;
  protectBoardgameMutations(req, res, () => { nextCalled = true; });
  return { req, res, nextCalled };
}

test("customer review submission remains public", () => {
  assert.equal(run("POST", "/api/v1/boardgames/1/reviews").nextCalled, true);
  assert.equal(run("GET", "/api/v1/boardgames").nextCalled, true);
});

test("catalog mutations require staff authentication", () => {
  for (const [method, path] of [
    ["POST", "/api/v1/boardgames"],
    ["PATCH", "/api/v1/boardgames/1"],
    ["DELETE", "/api/v1/boardgames/1"],
  ]) {
    const result = run(method, path);
    assert.equal(result.nextCalled, false);
    assert.equal(result.res.statusCode, 401);
  }
});
