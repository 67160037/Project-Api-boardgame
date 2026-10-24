const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePlayerFilters } = require('../src/middleware/player-filters');
const { requestContext } = require('../src/middleware/request-context');
const { notFound, errorHandler } = require('../src/middleware/http-errors');

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name] = value; },
  };
}

test('parses optional player filters as positive integers', () => {
  const req = { query: { minPlayers: '2', maxPlayers: '6' } };
  let nextCalled = false;
  parsePlayerFilters(req, responseRecorder(), () => { nextCalled = true; });
  assert.deepEqual(req.playerFilters, { minPlayers: 2, maxPlayers: 6 });
  assert.equal(nextCalled, true);
});

test('rejects malformed, non-positive, and fractional player filters', () => {
  for (const value of ['abc', '0', '-2', '1.5']) {
    const res = responseRecorder();
    parsePlayerFilters({ query: { minPlayers: value } }, res, () => assert.fail('next should not run'));
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  }
});

test('rejects repeated player-filter query parameters', () => {
  const res = responseRecorder();
  parsePlayerFilters({ query: { minPlayers: ['2', '4'] } }, res, () => assert.fail('next should not run'));
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('rejects a minimum greater than the maximum', () => {
  const res = responseRecorder();
  parsePlayerFilters({ query: { minPlayers: '7', maxPlayers: '4' } }, res, () => assert.fail('next should not run'));
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error.message, /minPlayers/);
});

test('adds a unique request ID to the request and response', () => {
  const req = {}; const res = responseRecorder(); let nextCalled = false;
  requestContext(req, res, () => { nextCalled = true; });
  assert.match(req.id, /^[0-9a-f-]{36}$/i);
  assert.equal(res.headers['X-Request-ID'], req.id);
  assert.equal(nextCalled, true);
});

test('returns the standard JSON shape for missing routes', () => {
  const res = responseRecorder();
  notFound({}, res);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: { code: 'ROUTE_NOT_FOUND', message: 'ไม่พบเส้นทางที่ร้องขอ' } });
});

test('normalizes client errors with the standard JSON shape', () => {
  const res = responseRecorder();
  errorHandler({ status: 400, type: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ถูกต้อง' }, { id: 'test-request-id' }, res, assert.fail);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: { code: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ถูกต้อง' } });
});
