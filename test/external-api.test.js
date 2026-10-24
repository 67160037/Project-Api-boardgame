const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

let server;
let mode = 'ok';
let attempts = 0;
let checkHoliday;

before(async () => {
  server = http.createServer((req, res) => {
    attempts++;
    res.setHeader('Content-Type', 'application/json');
    if (mode === 'ok') return res.end(JSON.stringify([{ date: '2026-12-10', localName: 'วันรัฐธรรมนูญ' }]));
    if (mode === 'flaky' && attempts < 3) { res.statusCode = 503; return res.end('{}'); }
    if (mode === 'error') { res.statusCode = 500; return res.end('{}'); }
    return res.end('[]');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.HOLIDAY_API_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.EXTERNAL_TIMEOUT_MS = '500';
  process.env.EXTERNAL_MAX_RETRIES = '2';
  process.env.EXTERNAL_RETRY_DELAY_MS = '1';
  ({ checkHoliday } = require('../src/services/external-api'));
});

after(async () => new Promise((resolve) => server.close(resolve)));

test('returns holiday data when upstream responds successfully', async () => {
  mode = 'ok'; attempts = 0;
  const result = await checkHoliday('2026-12-10');
  assert.equal(result.checked, true);
  assert.equal(result.is_holiday, true);
  assert.equal(result.holiday_name, 'วันรัฐธรรมนูญ');
  assert.equal(result.attempts, 1);
});

test('skips the upstream request for an invalid date', async () => {
  attempts = 0;
  const result = await checkHoliday('10/12/2026');
  assert.equal(result.checked, false);
  assert.equal(result.source, 'skipped');
  assert.equal(attempts, 0);
});

test('retries transient 503 errors and recovers', async () => {
  mode = 'flaky'; attempts = 0;
  const result = await checkHoliday('2026-12-10');
  assert.equal(result.checked, true);
  assert.equal(result.attempts, 3);
  assert.equal(attempts, 3);
});

test('falls back after retryable upstream failures', async () => {
  mode = 'error'; attempts = 0;
  const result = await checkHoliday('2026-12-10');
  assert.equal(result.checked, false);
  assert.equal(result.source, 'fallback');
  assert.equal(attempts, 3);
});
