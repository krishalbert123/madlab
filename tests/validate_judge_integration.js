'use strict';

const assert = require('assert');
const http = require('http');

let mode = 'success';
let providerPosts = 0;
let providerPolls = 0;
const receivedPayloads = [];
const providerJobs = new Map();
const providerRequests = [];

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
}

const provider = http.createServer((req, res) => {
  providerRequests.push({ method: req.method, url: req.url });
  assert.strictEqual(req.headers['x-auth-token'], 'mock-token');
  assert.strictEqual(req.headers['x-rapidapi-key'], 'mock-rapidapi-key');
  assert.strictEqual(req.headers['x-rapidapi-host'], 'mock-rapidapi-host');
  if (req.method === 'POST' && req.url.startsWith('/submissions')) {
    providerPosts++;
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      receivedPayloads.push(JSON.parse(raw));
      if (mode === 'disconnect') return res.destroy();
      if (mode === 'delayPost') {
        return setTimeout(() => {
          if (!res.destroyed) sendJson(res, 201, { token: 'late-token' });
        }, 200);
      }
      if (mode === 'post504') return sendJson(res, 504, { message: 'upstream gateway timed out' });
      if (mode === 'post429') return sendJson(res, 429, { message: 'rate limited' });
      if (mode === 'post400') return sendJson(res, 400, { message: 'invalid submission' });
      if (mode === 'post401') return sendJson(res, 401, { message: 'authentication required' });
      if (mode === 'post500') return sendJson(res, 500, { message: 'internal outage' });
      if (mode === 'invalidJson') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end('{not-json');
      }
      if (mode === 'missingToken') return sendJson(res, 201, { status: { id: 1 } });

      const token = `job-${providerPosts}`;
      providerJobs.set(token, { polls: 0 });
      return sendJson(res, 201, { token });
    });
    return;
  }

  const token = req.url.split('/')[2].split('?')[0];
  const job = providerJobs.get(token);
  if (!job) return sendJson(res, 404, { error: 'unknown token' });
  providerPolls++;
  job.polls++;

  if (job.polls === 1 && mode === 'poll429Once') {
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '0' });
    return res.end(JSON.stringify({ message: 'rate limited' }));
  }
  if (job.polls === 1 && mode === 'poll504Once') {
    return sendJson(res, 504, { message: 'temporary gateway timeout' });
  }
  if (job.polls === 1 && mode === 'poll500Once') {
    return sendJson(res, 500, { message: 'temporary provider outage' });
  }
  if (mode === 'pendingForever' || (mode === 'pollPending' && job.polls < 2)) {
    return sendJson(res, 200, { token, status: { id: 2, description: 'Processing' } });
  }
  if (mode === 'compileError') {
    return sendJson(res, 200, {
      token,
      status: { id: 6, description: 'Compilation Error' },
      compile_output: Buffer.from('syntax error').toString('base64')
    });
  }
  if (mode === 'runtimeError') {
    return sendJson(res, 200, {
      token,
      status: { id: 7, description: 'Runtime Error' },
      stderr: Buffer.from('crashed').toString('base64')
    });
  }
  return sendJson(res, 200, {
    token,
    status: { id: 3, description: 'Accepted' },
    stdout: Buffer.from(mode === 'unorderedResult' ? '["c","a","b"]' : 'Hello, World!\n').toString('base64'),
    time: 0.004,
    memory: 8192
  });
});

function requestJson(url, options) {
  return fetch(url, options).then(async (response) => ({
    status: response.status,
    headers: response.headers,
    body: await response.json()
  }));
}

async function startJob(appUrl, {
  stdin = '',
  expected = 'Hello, World!',
  headers = {},
  language = 'python',
  sourceCode = 'print("Hello, World!")',
  unordered = false
} = {}) {
  const response = await requestJson(`${appUrl}/api/judge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      sourceCode,
      language,
      tests: [{ stdin, expected, ...(unordered ? { unordered: true } : {}) }]
    })
  });
  assert.strictEqual(response.status, 202);
  assert.ok(response.body.executionId);
  return { executionId: response.body.executionId, requestId: response.body.requestId };
}

async function waitForJob(appUrl, executionId) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const response = await requestJson(`${appUrl}/api/judge?id=${encodeURIComponent(executionId)}`);
    assert.strictEqual(response.status, 200);
    if (response.body.state === 'completed' || response.body.state === 'failed') return response.body;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error(`Execution ${executionId} did not finish before the test deadline`);
}

async function run() {
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const providerUrl = `http://127.0.0.1:${provider.address().port}`;
  process.env.JUDGE0_BASE_URL = providerUrl;
  process.env.JUDGE0_REQUEST_TIMEOUT_MS = '75';
  process.env.CODEARENA_EXECUTION_TIMEOUT_MS = '1500';
  process.env.JUDGE0_AUTH_TOKEN = 'mock-token';
  process.env.JUDGE0_API_KEY = 'mock-rapidapi-key';
  process.env.JUDGE0_RAPIDAPI_HOST = 'mock-rapidapi-host';

  const { server } = require('../server');
  const originalConsoleLog = console.log;
  const judgeLogLines = [];
  console.log = (...args) => judgeLogLines.push(args.join(' '));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const appUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const initial = await startJob(appUrl, {
      stdin: 'sample input\n',
      sourceCode: '```python\nprint("Hello, World!")\n```'
    });
    const success = await waitForJob(appUrl, initial.executionId);
    assert.strictEqual(success.verdict, 'Accepted');
    assert.strictEqual(success.results[0].actual, 'Hello, World!\n');
    assert.strictEqual(success.results[0].time, 4);
    assert.strictEqual(success.results[0].memory, 8);
    assert.ok(initial.requestId);
    assert.strictEqual(Buffer.from(receivedPayloads.at(-1).source_code, 'base64').toString(), 'print("Hello, World!")');
    assert.strictEqual(Buffer.from(receivedPayloads.at(-1).stdin, 'base64').toString(), 'sample input\n');
    assert.strictEqual(receivedPayloads.at(-1).language_id, 71);
    assert.strictEqual(Buffer.from(receivedPayloads.at(-1).source_code, 'base64').toString(), 'print("Hello, World!")');
    assert.strictEqual(receivedPayloads.at(-1).base64_encoded, undefined);
    assert.ok(providerRequests.some((request) => request.method === 'POST' && request.url === '/submissions/?base64_encoded=true&wait=false'));
    assert.ok(providerRequests.some((request) => request.method === 'GET' && request.url.startsWith('/submissions/job-')));
    const cJob = await startJob(appUrl, {
      language: 'c',
      sourceCode: '#include <stdio.h>\nint main(void) { char input[32]; fgets(input, sizeof(input), stdin); printf("%s", input); return 0; }\n',
      stdin: 'stdin-check\n'
    });
    const cResult = await waitForJob(appUrl, cJob.executionId);
    assert.strictEqual(cResult.verdict, 'Accepted');
    assert.strictEqual(receivedPayloads.at(-1).language_id, 50);
    assert.strictEqual(Buffer.from(receivedPayloads.at(-1).stdin, 'base64').toString(), 'stdin-check\n');
    assert.match(Buffer.from(receivedPayloads.at(-1).source_code, 'base64').toString(), /int main/);
    const wrongAnswerJob = await startJob(appUrl, { expected: 'not the output' });
    const wrongAnswer = await waitForJob(appUrl, wrongAnswerJob.executionId);
    assert.strictEqual(wrongAnswer.verdict, 'Wrong Answer');
    assert.strictEqual(wrongAnswer.expected, 'not the output');
    mode = 'unorderedResult';
    const unorderedJob = await startJob(appUrl, {
      expected: '["a","b","c"]',
      unordered: true
    });
    const unorderedResult = await waitForJob(appUrl, unorderedJob.executionId);
    assert.strictEqual(unorderedResult.verdict, 'Accepted', 'unordered result collections are compared independent of outer ordering');

    mode = 'success';
    for (const [scenario, expectedCategory, expectedStatus] of [
      ['post504', 'provider_timeout', 504],
      ['post429', 'provider_rate_limited', 429],
      ['post400', 'provider_invalid_request', 400],
      ['post401', 'provider_authentication', 401],
      ['post500', 'provider_unavailable', 500],
      ['invalidJson', 'provider_invalid_response', 200],
      ['missingToken', 'provider_invalid_response', 201]
    ]) {
      mode = scenario;
      const job = await startJob(appUrl);
      const result = await waitForJob(appUrl, job.executionId);
      assert.strictEqual(result.verdict, 'Execution Error', scenario);
      assert.strictEqual(result.errorCategory, expectedCategory, scenario);
      if (expectedStatus) assert.strictEqual(result.providerHttpStatus, expectedStatus, scenario);
      if (result.results?.length) {
        assert.strictEqual(result.results.at(-1).pass, false);
        assert.strictEqual(result.results.at(-1).verdict, 'Execution Error');
      }
    }
    assert.ok(judgeLogLines.some((line) => line.includes('"providerHttpStatus":504')));
    assert.ok(judgeLogLines.every((line) => !line.includes('mock-token') &&
      !line.includes('mock-rapidapi-key') && !line.includes('mock-rapidapi-host') &&
      !line.includes('Hello, World!')));

    mode = 'delayPost';
    const beforeTimeoutPosts = providerPosts;
    const timeoutJob = await startJob(appUrl);
    const timeoutResult = await waitForJob(appUrl, timeoutJob.executionId);
    assert.strictEqual(timeoutResult.errorCategory, 'provider_timeout');
    assert.strictEqual(providerPosts, beforeTimeoutPosts + 1, 'timed out submissions are not blindly retried');

    mode = 'disconnect';
    const networkJob = await startJob(appUrl);
    const networkResult = await waitForJob(appUrl, networkJob.executionId);
    assert.strictEqual(networkResult.errorCategory, 'provider_network');

    mode = 'pollPending';
    const pollsBefore = providerPolls;
    const asyncJob = await startJob(appUrl);
    const asyncResult = await waitForJob(appUrl, asyncJob.executionId);
    assert.strictEqual(asyncResult.verdict, 'Accepted');
    assert.ok(providerPolls - pollsBefore >= 2, 'pending provider jobs are polled until completion');

    for (const transientPollMode of ['poll429Once', 'poll504Once', 'poll500Once']) {
      mode = transientPollMode;
      const postsBeforePollRetry = providerPosts;
      const retriesJob = await startJob(appUrl);
      const retriedResult = await waitForJob(appUrl, retriesJob.executionId);
      assert.strictEqual(retriedResult.verdict, 'Accepted', transientPollMode);
      assert.strictEqual(providerPosts, postsBeforePollRetry + 1, 'poll retries must not resubmit source code');
    }

    mode = 'pendingForever';
    const longJob = await startJob(appUrl);
    const longResult = await waitForJob(appUrl, longJob.executionId);
    assert.strictEqual(longResult.errorCategory, 'provider_execution_timeout');
    assert.strictEqual(longResult.verdict, 'Execution Error');

    mode = 'compileError';
    const compileJob = await startJob(appUrl);
    const compileResult = await waitForJob(appUrl, compileJob.executionId);
    assert.strictEqual(compileResult.verdict, 'Compilation Error');
    assert.strictEqual(compileResult.stderr, 'syntax error');

    mode = 'runtimeError';
    const runtimeJob = await startJob(appUrl);
    const runtimeResult = await waitForJob(appUrl, runtimeJob.executionId);
    assert.strictEqual(runtimeResult.verdict, 'Runtime Error');
    assert.strictEqual(runtimeResult.stderr, 'crashed');

    mode = 'success';
    const postsBeforeInvalid = providerPosts;
    const malformed = await requestJson(`${appUrl}/api/judge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceCode: 'x', language: 'python', tests: [{ stdin: 4, expected: 'x' }] })
    });
    assert.strictEqual(malformed.status, 400);
    assert.strictEqual(providerPosts, postsBeforeInvalid, 'malformed input is rejected before contacting Judge0');
    const malformedJson = await fetch(`${appUrl}/api/judge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{'
    });
    assert.strictEqual(malformedJson.status, 400);
    assert.strictEqual(providerPosts, postsBeforeInvalid, 'malformed JSON is rejected before contacting Judge0');

    const key = 'repeatable-test-key';
    const duplicateFirst = await startJob(appUrl, { headers: { 'Idempotency-Key': key } });
    await waitForJob(appUrl, duplicateFirst.executionId);
    const beforeDuplicatePost = providerPosts;
    const duplicateSecondResponse = await requestJson(`${appUrl}/api/judge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({
        sourceCode: 'print("Hello, World!")',
        language: 'python',
        tests: [{ stdin: '', expected: 'Hello, World!' }]
      })
    });
    assert.strictEqual(duplicateSecondResponse.status, 202);
    assert.strictEqual(duplicateSecondResponse.body.executionId, duplicateFirst.executionId);
    assert.strictEqual(providerPosts, beforeDuplicatePost, 'duplicate idempotency keys do not submit a second provider job');

    const staticResponse = await fetch(`${appUrl}/js/app.js`);
    assert.strictEqual(staticResponse.status, 200);
    assert.match(staticResponse.headers.get('cache-control'), /no-store/);
    assert.match(await staticResponse.text(), /CodeArena gateway returned HTTP 504/);

    originalConsoleLog('Validated Judge0 async integration, provider failures, timeouts, verdicts, and request validation');
  } finally {
    console.log = originalConsoleLog;
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => provider.close(resolve));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
