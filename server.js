'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawn } = require('child_process');

function loadLocalEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

loadLocalEnv();

const PORT = Number(process.env.PORT || 8000);
const JUDGE0_BASE_URL = (process.env.JUDGE0_BASE_URL || '').replace(/\/$/, '');
const TIME_LIMIT_MS = Number(process.env.CODEARENA_TIME_LIMIT_MS || 2000);
const MAX_SOURCE_BYTES = 128 * 1024;
const MAX_STDIN_BYTES = 64 * 1024;
const MAX_OUTPUT_BYTES = 256 * 1024;
const JUDGE0_REQUEST_TIMEOUT_MS = Number(process.env.JUDGE0_REQUEST_TIMEOUT_MS || 10000);
const CODEARENA_EXECUTION_TIMEOUT_MS = Number(process.env.CODEARENA_EXECUTION_TIMEOUT_MS || 30000);
const CODEARENA_JOB_RETENTION_MS = Number(process.env.CODEARENA_JOB_RETENTION_MS || 300000);
const configuredRunTimeoutMs = Number(process.env.CODEARENA_RUN_TIMEOUT_MS || 30000);
const CODEARENA_RUN_TIMEOUT_MS = Number.isFinite(configuredRunTimeoutMs)
  ? Math.max(1000, Math.min(configuredRunTimeoutMs, 120000))
  : 30000;
const CODEARENA_SANDBOX_IMAGE = process.env.CODEARENA_SANDBOX_IMAGE || 'madlab-runner:latest';
const CODEARENA_DOCKER_BIN = process.env.CODEARENA_DOCKER_BIN || 'docker';
const MAX_INTERACTIVE_SESSIONS = 3;
const MAX_INTERACTIVE_OUTPUT_BYTES = 256 * 1024;
const MAX_INTERACTIVE_INPUT_BYTES = 256 * 1024;
const AUTH_STATE_PATH = path.join(__dirname, '.data', 'auth.json');
const AUTH_SESSION_TTL_MS = Number(process.env.CODEARENA_AUTH_TTL_MS || 24 * 60 * 60 * 1000);
const AUTH_SESSION_SECRET = process.env.CODEARENA_SESSION_SECRET || 'change-this-session-secret';

const DEFAULT_LANGUAGE_IDS = { python: 71, javascript: 63, java: 62, cpp: 54, c: 50 };
const executionJobs = new Map();
const idempotentExecutions = new Map();
const interactiveSessions = new Map();
let configuredLanguageIds = DEFAULT_LANGUAGE_IDS;
try {
  if (process.env.JUDGE0_LANGUAGE_IDS) configuredLanguageIds = { ...DEFAULT_LANGUAGE_IDS, ...JSON.parse(process.env.JUDGE0_LANGUAGE_IDS) };
} catch (error) {
  console.error('Invalid JUDGE0_LANGUAGE_IDS JSON:', error.message);
}

function ensureAuthStore() {
  const dir = path.dirname(AUTH_STATE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(AUTH_STATE_PATH)) {
    fs.writeFileSync(AUTH_STATE_PATH, JSON.stringify({ users: [], sessions: [] }, null, 2));
  }
}

function loadAuthState() {
  ensureAuthStore();
  try {
    const raw = fs.readFileSync(AUTH_STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : []
    };
  } catch (error) {
    console.warn('[auth] Could not read auth storage; falling back to a fresh state.', error.message);
    return { users: [], sessions: [] };
  }
}

const AUTH_STATE = loadAuthState();

function persistAuthState() {
  ensureAuthStore();
  fs.writeFileSync(AUTH_STATE_PATH, JSON.stringify(AUTH_STATE, null, 2));
}

function sanitizeUser(user) {
  if (!user) return null;
  const { id, username, email, joinedAt, createdAt } = user;
  return { id, username, email, joinedAt: joinedAt || createdAt || new Date().toISOString() };
}

function derivePasswordHash(password, salt) {
  const buf = crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512');
  return buf.toString('hex');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${derivePasswordHash(password, salt)}`;
}

function verifyPassword(password, storedValue) {
  if (typeof storedValue !== 'string' || !storedValue.includes(':')) return false;
  const [salt, hash] = storedValue.split(':');
  if (!salt || !hash) return false;
  try {
    const candidate = derivePasswordHash(password, salt);
    return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
  } catch (error) {
    return false;
  }
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function parseCookies(header) {
  const out = {};
  for (const raw of (header || '').split(';')) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf('=');
    const key = index >= 0 ? trimmed.slice(0, index) : trimmed;
    const value = index >= 0 ? trimmed.slice(index + 1) : '';
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function applySessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', `codearena_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(AUTH_SESSION_TTL_MS / 1000)}${secure ? '; Secure' : ''}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'codearena_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

function getCurrentUser(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.codearena_session;
  if (!token) return null;
  const session = AUTH_STATE.sessions.find((entry) => entry.token === token && entry.expiresAt > Date.now());
  if (!session) return null;
  const user = AUTH_STATE.users.find((entry) => entry.id === session.userId);
  return user ? sanitizeUser(user) : null;
}

function ensureUniqueField(users, field, value) {
  return users.every((user) => String(user[field]).toLowerCase() !== String(value).trim().toLowerCase());
}

function authResponse(res, status, payload, sessionToken) {
  if (sessionToken) applySessionCookie(res, sessionToken);
  sendJson(res, status, payload);
}

function normalizeOutput(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim().replace(/[ \t]+$/gm, '');
}

function cleanSourceCode(value) {
  const source = String(value || '');
  const match = source.match(/^\s*```[A-Za-z0-9_+#.-]*[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/);
  return match ? match[1] : source;
}

function streamRunEvent(session, event, payload) {
  const record = { id: ++session.eventId, event, payload };
  session.events.push(record);
  for (const response of session.clients) {
    response.write(`id: ${record.id}\nevent: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  }
}

function finishInteractiveSession(session, result) {
  if (session.finished) return;
  session.finished = true;
  clearTimeout(session.timeout);
  clearTimeout(session.forceStop);
  streamRunEvent(session, 'finished', result);
  for (const response of session.clients) response.end();
  session.clients.clear();
  if (session.tempDir && session.tempDir.startsWith(os.tmpdir())) {
    fs.rmSync(session.tempDir, { recursive: true, force: true });
  }
  console.log(JSON.stringify({
    service: 'interactive_run',
    runId: session.id,
    language: session.language,
    startedAt: session.startedAt,
    durationMs: Date.now() - session.startedAtMs,
    state: result.state,
    exitCode: result.exitCode ?? null
  }));
  const cleanupTimer = setTimeout(() => interactiveSessions.delete(session.id), CODEARENA_JOB_RETENTION_MS);
  cleanupTimer.unref();
}

function stopInteractiveSession(session, reason = 'stopped') {
  if (session.finished || session.stopReason) return;
  session.stopReason = reason;
  streamRunEvent(session, 'status', { state: 'stopping' });
  session.forceStop = setTimeout(() => {
    const killer = spawn(CODEARENA_DOCKER_BIN, ['kill', session.containerName], { stdio: 'ignore' });
    killer.on('error', () => {});
    if (session.process && !session.process.killed) session.process.kill('SIGTERM');
  }, 2000);
  session.forceStop.unref();
  const requestStop = (attempt) => {
    if (session.finished) return;
    const stopper = spawn(CODEARENA_DOCKER_BIN, ['stop', '--time', '1', session.containerName], { stdio: 'ignore' });
    let spawnFailed = false;
    stopper.on('error', () => {
      spawnFailed = true;
      if (attempt < 4) setTimeout(() => requestStop(attempt + 1), 150 * attempt).unref();
      else appendInteractiveOutput(session, 'stderr', 'Could not contact Docker to stop this run; the container has its own runtime limit.\n');
    });
    stopper.on('close', (code) => {
      if (session.finished || spawnFailed || code === 0) return;
      if (attempt < 4) setTimeout(() => requestStop(attempt + 1), 150 * attempt).unref();
      else appendInteractiveOutput(session, 'stderr', 'Could not stop the Docker container; the container has its own runtime limit.\n');
    });
  };
  requestStop(1);
}

function appendInteractiveOutput(session, stream, chunk) {
  if (session.finished) return;
  const text = String(chunk);
  const remaining = MAX_INTERACTIVE_OUTPUT_BYTES - session.outputBytes;
  const bytes = Buffer.from(text);
  if (bytes.length > remaining) {
    if (remaining > 0) {
      const clipped = bytes.subarray(0, remaining).toString('utf8');
      session.outputBytes += Buffer.byteLength(clipped);
      streamRunEvent(session, stream, { data: clipped });
    }
    streamRunEvent(session, 'stderr', { data: '\n[Output limit reached; stopping this run.]\n' });
    stopInteractiveSession(session, 'output_limit');
    return;
  }
  session.outputBytes += bytes.length;
  streamRunEvent(session, stream, { data: text });
}

function createInteractiveSession(sourceCode, language) {
  const id = crypto.randomUUID();
  const containerName = `madlab-run-${id}`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'madlab-run-'));
  const sourceFiles = { python: 'main.py', c: 'main.c', cpp: 'main.cpp', javascript: 'main.js', java: 'Main.java' };
  try {
    fs.chmodSync(tempDir, 0o755);
    fs.writeFileSync(path.join(tempDir, sourceFiles[language]), sourceCode, { mode: 0o644 });
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }

  const session = {
    id,
    language,
    containerName,
    tempDir,
    startedAtMs: Date.now(),
    startedAt: new Date().toISOString(),
    process: null,
    clients: new Set(),
    events: [],
    eventId: 0,
    outputBytes: 0,
    inputBytes: 0,
    stopReason: null,
    finished: false,
    timeout: null
  };
  interactiveSessions.set(id, session);

  const runnerArgs = {
    python: ['python'],
    c: ['c'],
    cpp: ['cpp'],
    javascript: ['javascript'],
    java: ['java']
  }[language];
  const args = [
    'run', '--rm', '--init', '--interactive',
    '--name', containerName,
    '--network', 'none',
    '--read-only',
    '--memory', '128m',
    '--memory-swap', '128m',
    '--cpus', '0.5',
    '--pids-limit', '32',
    '--user', '65534:65534',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--ulimit', 'nofile=64:64',
    '--ulimit', 'fsize=16777216:16777216',
    '--tmpfs', '/tmp:rw,exec,nosuid,nodev,size=32m,mode=1777',
    '--mount', `type=bind,source=${tempDir},target=/workspace,readonly`,
    '--workdir', '/workspace',
    '--env', `CODEARENA_RUN_TIMEOUT_SECONDS=${Math.max(1, Math.ceil(CODEARENA_RUN_TIMEOUT_MS / 1000))}`,
    CODEARENA_SANDBOX_IMAGE,
    ...runnerArgs
  ];

  streamRunEvent(session, 'status', { state: 'starting' });
  console.log(JSON.stringify({
    service: 'interactive_run',
    runId: session.id,
    language: session.language,
    startedAt: session.startedAt,
    state: 'starting'
  }));
  const child = spawn(CODEARENA_DOCKER_BIN, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  session.process = child;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => appendInteractiveOutput(session, 'stdout', chunk));
  child.stderr.on('data', (chunk) => appendInteractiveOutput(session, 'stderr', chunk));
  child.on('error', (error) => {
    appendInteractiveOutput(session, 'stderr', `Could not start the isolated runner: ${error.message}\n`);
    finishInteractiveSession(session, { state: 'failed', reason: 'runner_unavailable' });
  });
  child.on('close', (code, signal) => {
    const reason = session.stopReason || (code === 0 ? 'completed' : code === 125 ? 'runner_error' : 'program_error');
    finishInteractiveSession(session, { state: reason, exitCode: code, signal });
  });
  session.timeout = setTimeout(() => stopInteractiveSession(session, 'timeout'), CODEARENA_RUN_TIMEOUT_MS);
  session.timeout.unref();
  streamRunEvent(session, 'status', { state: 'running' });
  return session;
}

function outputsEqual(actual, expected, { unorderedTopLevelArray = false } = {}) {
  const actualText = normalizeOutput(actual);
  const expectedText = normalizeOutput(expected);
  function equalJsonValues(left, right) {
    if (typeof left === 'number' && typeof right === 'number') {
      return Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(right));
    }
    if (Array.isArray(left) || Array.isArray(right)) {
      return Array.isArray(left) && Array.isArray(right) &&
        left.length === right.length &&
        left.every((value, index) => equalJsonValues(value, right[index]));
    }
    if (left && right && typeof left === 'object' && typeof right === 'object') {
      const leftKeys = Object.keys(left).sort();
      const rightKeys = Object.keys(right).sort();
      return leftKeys.length === rightKeys.length &&
        leftKeys.every((key, index) => key === rightKeys[index] && equalJsonValues(left[key], right[key]));
    }
    return left === right;
  }
  try {
    const actualValue = JSON.parse(actualText);
    const expectedValue = JSON.parse(expectedText);
    if (unorderedTopLevelArray && Array.isArray(actualValue) && Array.isArray(expectedValue)) {
      if (actualValue.length !== expectedValue.length) return false;
      const unmatched = actualValue.slice();
      for (const expectedItem of expectedValue) {
        const matchIndex = unmatched.findIndex((actualItem) => equalJsonValues(actualItem, expectedItem));
        if (matchIndex === -1) return false;
        unmatched.splice(matchIndex, 1);
      }
      return true;
    }
    return equalJsonValues(actualValue, expectedValue);
  } catch (_) {
    return actualText === expectedText;
  }
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readJson(req, limit = 512 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > limit) { reject(new Error('Request body too large')); req.destroy(); return; }
      body += chunk;
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (error) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function validateJudge0BaseUrl() {
  if (!JUDGE0_BASE_URL) throw new Error('JUDGE0_BASE_URL is not configured');
  let url;
  try { url = new URL(JUDGE0_BASE_URL); } catch (_) { throw new Error('JUDGE0_BASE_URL is malformed; it must be an absolute http(s) URL'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('JUDGE0_BASE_URL must use http or https');
  if (!url.hostname || url.hostname.endsWith('.example') || url.hostname.endsWith('.example.com') ||
      url.username || url.password || url.search || url.hash) {
    throw new Error('JUDGE0_BASE_URL is still using a placeholder host');
  }
  return url.toString().replace(/\/$/, '');
}

class ProviderError extends Error {
  constructor(category, message, httpStatus = null, retryAfterMs = null) {
    super(message);
    this.name = 'ProviderError';
    this.category = category;
    this.httpStatus = httpStatus;
    this.retryAfterMs = retryAfterMs;
  }
}

function logJudgeEvent(event) {
  console.log(JSON.stringify({ service: 'judge', provider: 'Judge0', ...event }));
}

function providerErrorCategory(status) {
  if (status === 401 || status === 403) return 'provider_authentication';
  if (status === 400 || status === 404 || status === 422) return 'provider_invalid_request';
  if (status === 429) return 'provider_rate_limited';
  if (status === 504) return 'provider_timeout';
  if (status >= 500) return 'provider_unavailable';
  return 'provider_rejected';
}

function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 2000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(Math.max(0, date - Date.now()), 2000) : null;
}

async function judge0Request(url, options = {}, context = {}) {
  const headers = { ...(options.headers || {}) };
  if (process.env.JUDGE0_API_KEY) headers['X-RapidAPI-Key'] = process.env.JUDGE0_API_KEY;
  if (process.env.JUDGE0_RAPIDAPI_HOST) headers['X-RapidAPI-Host'] = process.env.JUDGE0_RAPIDAPI_HOST;
  if (process.env.JUDGE0_AUTH_TOKEN) headers['X-Auth-Token'] = process.env.JUDGE0_AUTH_TOKEN;
  const controller = new AbortController();
  const requestTimeoutMs = context.deadline
    ? Math.max(1, Math.min(JUDGE0_REQUEST_TIMEOUT_MS, context.deadline - Date.now()))
    : JUDGE0_REQUEST_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { ...options, headers, signal: controller.signal });
    const text = await response.text();
    logJudgeEvent({
      requestId: context.requestId,
      language: context.language,
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      providerHttpStatus: response.status,
      category: response.ok ? 'provider_response' : providerErrorCategory(response.status),
      outcome: response.ok ? 'response_received' : 'provider_rejected'
    });

    if (!response.ok) {
      throw new ProviderError(
        providerErrorCategory(response.status),
        response.status === 401 || response.status === 403
          ? 'Judge0 rejected its authentication credentials.'
          : response.status === 429
            ? 'Judge0 rate limit reached. Try again later.'
            : response.status === 504
              ? 'Judge0 timed out while processing the request.'
              : response.status >= 500
                ? 'Judge0 is temporarily unavailable.'
                : 'Judge0 rejected the execution request.',
            response.status,
            parseRetryAfter(response.headers.get('retry-after'))
      );
    }
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      throw new ProviderError('provider_invalid_response', 'Judge0 returned an invalid JSON response.', response.status);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new ProviderError('provider_invalid_response', 'Judge0 returned an invalid response payload.', response.status);
    }
    return { data, httpStatus: response.status };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const timedOut = error.name === 'AbortError';
    const cause = error.cause && typeof error.cause === 'object' ? error.cause : null;
    const code = cause && cause.code ? cause.code : (error.code || (timedOut ? 'ETIMEDOUT' : 'NETWORK_ERROR'));
    const category = timedOut && context.deadline && Date.now() >= context.deadline
      ? 'provider_execution_timeout'
      : timedOut ? 'provider_timeout' : 'provider_network';
    logJudgeEvent({
      requestId: context.requestId,
      language: context.language,
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      providerHttpStatus: null,
      category,
      outcome: 'transport_error'
    });
    throw new ProviderError(category, category === 'provider_execution_timeout'
      ? 'Judge0 job did not finish before the configured execution deadline.'
      : timedOut
        ? 'Timed out waiting for Judge0 to respond. The execution may have been accepted; it was not resubmitted.'
      : `Could not connect to Judge0 (${code}).`);
  } finally {
    clearTimeout(timer);
  }
}

async function judge0Poll(url, context) {
  const maxAttempts = 3;
  for (let attempt = 0; ; attempt++) {
    try {
      return await judge0Request(url, { method: 'GET' }, context);
    } catch (error) {
      const retryable = error instanceof ProviderError &&
        ['provider_rate_limited', 'provider_timeout', 'provider_unavailable', 'provider_network'].includes(error.category);
      if (!retryable || attempt + 1 >= maxAttempts) throw error;

      const backoffMs = error.retryAfterMs ?? Math.min(200 * (2 ** attempt), 800);
      if (context.deadline && Date.now() + backoffMs >= context.deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
}

function decode64(value) {
  if (!value) return '';
  return Buffer.from(value, 'base64').toString('utf8');
}

function classify(result) {
  const statusId = Number(result.status && result.status.id);
  if (statusId === 6) return { verdict: 'Compilation Error', stderr: decode64(result.compile_output) || decode64(result.stderr) || 'Compilation failed.' };
  if (statusId === 5) return { verdict: 'Time Limit Exceeded', stderr: 'Program exceeded the execution time limit.' };
  if (statusId === 3) return { verdict: 'Accepted', stderr: decode64(result.stderr) };
  if (statusId === 4) return { verdict: 'Wrong Answer', stderr: decode64(result.stderr) };
  if (/memory limit/i.test((result.status && result.status.description) || '')) return { verdict: 'Memory Limit Exceeded', stderr: result.status.description };
  if (statusId >= 7 && statusId <= 12) return { verdict: 'Runtime Error', stderr: decode64(result.stderr) || (result.status && result.status.description) || 'The program crashed.' };
  if (statusId === 13) return { verdict: 'Judge Error', stderr: (result.status && result.status.description) || 'Judge0 encountered an internal error.' };
  return { verdict: 'Execution Error', stderr: (result.status && result.status.description) || 'Judge0 could not execute this submission.' };
}

async function executeTest(sourceCode, language, stdin, context) {
  const languageId = configuredLanguageIds[language];
  if (!languageId) throw new Error(`Unsupported language: ${language}`);
  validateJudge0BaseUrl();

  const payload = {
    source_code: Buffer.from(sourceCode).toString('base64'),
    language_id: Number(languageId),
    stdin: Buffer.from(stdin).toString('base64'),
    cpu_time_limit: TIME_LIMIT_MS / 1000,
    wall_time_limit: Math.max(2, TIME_LIMIT_MS / 1000 + 1),
    memory_limit: 256000,
    max_file_size: 2048,
  };
  const deadline = context.deadline || Date.now() + CODEARENA_EXECUTION_TIMEOUT_MS;
  if (Date.now() >= deadline) {
    throw new ProviderError('provider_execution_timeout', 'Execution exceeded the configured job deadline.');
  }
  const baseUrl = validateJudge0BaseUrl();
  const submitted = await judge0Request(`${baseUrl}/submissions/?base64_encoded=true&wait=false`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  }, { ...context, deadline });
  const token = submitted.data.token;
  if (typeof token !== 'string' || !token) {
    throw new ProviderError('provider_invalid_response', 'Judge0 did not return a submission token.', submitted.httpStatus);
  }

  let delayMs = 250;
  let result;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, deadline - Date.now())));
    if (Date.now() >= deadline) break;
    const polled = await judge0Poll(`${baseUrl}/submissions/${encodeURIComponent(token)}?base64_encoded=true`, { ...context, deadline });
    result = polled.data;
    const statusId = Number(result.status && result.status.id);
    if (statusId !== 1 && statusId !== 2) break;
    delayMs = Math.min(delayMs * 2, 1500);
  }
  if (!result || Number(result.status && result.status.id) === 1 || Number(result.status && result.status.id) === 2) {
    throw new ProviderError('provider_execution_timeout', 'Judge0 job did not finish before the configured execution deadline.');
  }

  const classified = classify(result);
  const output = {
    ...classified,
    stdout: decode64(result.stdout)
  };
  if (result.time !== null && result.time !== undefined && result.time !== '' && Number.isFinite(Number(result.time))) {
    output.time = Math.round(Number(result.time) * 1000);
  }
  if (result.memory !== null && result.memory !== undefined && result.memory !== '' && Number.isFinite(Number(result.memory))) {
    output.memory = Math.round(Number(result.memory) / 1024);
  }
  return {
    ...output
  };
}

async function handleAuth(req, res, pathname) {
  if (pathname === '/api/auth/me') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
    const user = getCurrentUser(req);
    return sendJson(res, user ? 200 : 401, { authenticated: !!user, user: user ? sanitizeUser(user) : null });
  }
  if (pathname === '/api/auth/logout') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies.codearena_session;
    if (token) {
      AUTH_STATE.sessions = AUTH_STATE.sessions.filter((session) => session.token !== token);
      persistAuthState();
    }
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true, message: 'Logged out successfully.' });
  }
  if (pathname !== '/api/auth/register' && pathname !== '/api/auth/login') {
    return sendJson(res, 404, { error: 'Not found' });
  }

  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  let body;
  try { body = await readJson(req); } catch (error) { return sendJson(res, 400, { error: error.message }); }
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (pathname === '/api/auth/register') {
    if (!username || !email || !password) return sendJson(res, 400, { error: 'Username, email, and password are required.' });
    if (password.length < 8) return sendJson(res, 400, { error: 'Password must be at least 8 characters long.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { error: 'Please provide a valid email address.' });
    if (!ensureUniqueField(AUTH_STATE.users, 'username', username) || !ensureUniqueField(AUTH_STATE.users, 'email', email)) {
      return sendJson(res, 409, { error: 'An account with that username or email already exists.' });
    }

    const newUser = {
      id: crypto.randomUUID(),
      username,
      email,
      passwordHash: hashPassword(password),
      joinedAt: new Date().toISOString()
    };
    AUTH_STATE.users.push(newUser);
    const sessionToken = generateToken();
    AUTH_STATE.sessions.push({ token: sessionToken, userId: newUser.id, expiresAt: Date.now() + AUTH_SESSION_TTL_MS });
    persistAuthState();
    return authResponse(res, 201, { ok: true, user: sanitizeUser(newUser) }, sessionToken);
  }

  if (!email && !username) return sendJson(res, 400, { error: 'Provide either a username or email and password.' });
  const account = AUTH_STATE.users.find((candidate) => {
    const matchesUsername = candidate.username.toLowerCase() === String(email || username).trim().toLowerCase();
    const matchesEmail = candidate.email.toLowerCase() === String(email || username).trim().toLowerCase();
    return matchesUsername || matchesEmail;
  });
  if (!account || !verifyPassword(password, account.passwordHash)) return sendJson(res, 401, { error: 'Incorrect username/email or password.' });

  const sessionToken = generateToken();
  AUTH_STATE.sessions = AUTH_STATE.sessions.filter((session) => session.userId !== account.id);
  AUTH_STATE.sessions.push({ token: sessionToken, userId: account.id, expiresAt: Date.now() + AUTH_SESSION_TTL_MS });
  persistAuthState();
  return authResponse(res, 200, { ok: true, user: sanitizeUser(account) }, sessionToken);
}

function handleRunEvents(req, res, session) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  for (const record of session.events) {
    res.write(`id: ${record.id}\nevent: ${record.event}\ndata: ${JSON.stringify(record.payload)}\n\n`);
  }
  if (session.finished) return res.end();
  session.clients.add(res);
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 15000);
  res.on('close', () => {
    clearInterval(heartbeat);
    session.clients.delete(res);
  });
}

async function handleInteractiveRun(req, res, pathname) {
  if (pathname === '/api/run' && req.method === 'POST') {
    let body;
    try { body = await readJson(req); } catch (error) { return sendJson(res, 400, { error: error.message }); }
    const sourceCode = typeof body.sourceCode === 'string' ? cleanSourceCode(body.sourceCode) : '';
    const language = typeof body.language === 'string' ? body.language : '';
    if (!sourceCode.trim()) return sendJson(res, 400, { error: 'Source code is empty.' });
    if (Buffer.byteLength(sourceCode) > MAX_SOURCE_BYTES) return sendJson(res, 400, { error: 'Source code is too large.' });
    if (!['python', 'c', 'cpp', 'javascript', 'java'].includes(language)) {
      return sendJson(res, 400, { error: 'Interactive runs support Python 3, C, C++, JavaScript, and Java.' });
    }
    const activeSessions = [...interactiveSessions.values()].filter((session) => !session.finished).length;
    if (activeSessions >= MAX_INTERACTIVE_SESSIONS) {
      return sendJson(res, 429, { error: 'The isolated runner is at capacity. Stop a running program and try again.' });
    }
    try {
      const session = createInteractiveSession(sourceCode, language);
      return sendJson(res, 202, { runId: session.id, state: 'starting' });
    } catch (error) {
      console.error('[run] Could not create isolated execution session:', error.message);
      return sendJson(res, 503, { error: 'Could not create an isolated execution session. Check the Docker runner configuration.' });
    }
  }

  const match = pathname.match(/^\/api\/run\/([a-f0-9-]+)\/(events|input|stop)$/i);
  if (!match) return sendJson(res, 404, { error: 'Not found' });
  const session = interactiveSessions.get(match[1]);
  if (!session) return sendJson(res, 404, { error: 'Run session not found or expired.' });

  if (match[2] === 'events' && req.method === 'GET') return handleRunEvents(req, res, session);
  if (match[2] === 'input' && req.method === 'POST') {
    let body;
    try { body = await readJson(req, MAX_STDIN_BYTES + 1024); } catch (error) { return sendJson(res, 400, { error: error.message }); }
    if (typeof body.data !== 'string') return sendJson(res, 400, { error: 'Input data must be a string.' });
    if (Buffer.byteLength(body.data) > MAX_STDIN_BYTES) return sendJson(res, 400, { error: 'Input chunk is too large.' });
    const inputBytes = Buffer.byteLength(body.data);
    if (session.inputBytes + inputBytes > MAX_INTERACTIVE_INPUT_BYTES) {
      return sendJson(res, 413, { error: 'The input limit for this run session has been reached.' });
    }
    if (session.finished || !session.process || session.process.stdin.destroyed) {
      return sendJson(res, 409, { error: 'The program is no longer waiting for input.' });
    }
    session.inputBytes += inputBytes;
    session.process.stdin.write(body.data, (error) => {
      if (error) console.error(`[run] Failed to forward stdin for session ${session.id}:`, error.message);
    });
    return sendJson(res, 202, { accepted: true });
  }
  if (match[2] === 'stop' && req.method === 'POST') {
    stopInteractiveSession(session);
    return sendJson(res, 202, { state: session.finished ? 'finished' : 'stopping' });
  }
  return sendJson(res, 405, { error: 'Method not allowed' });
}

async function handleApi(req, res, pathname) {
  if (pathname.startsWith('/api/auth/')) return handleAuth(req, res, pathname);
  if (pathname === '/api/run' || pathname.startsWith('/api/run/')) return handleInteractiveRun(req, res, pathname);
  if (pathname === '/api/judge' && req.method === 'GET') {
    const id = new URL(req.url, 'http://localhost').searchParams.get('id');
    const job = id && executionJobs.get(id);
    if (!job) return sendJson(res, 404, { error: 'Execution job not found or expired.' });
    if (job.createdAt + CODEARENA_JOB_RETENTION_MS < Date.now()) {
      executionJobs.delete(id);
      return sendJson(res, 404, { error: 'Execution job not found or expired.' });
    }
    return sendJson(res, 200, {
      executionId: job.id,
      requestId: job.requestId,
      state: job.state,
      ...(job.result || {})
    });
  }
  if (req.method !== 'POST' || pathname !== '/api/judge') return sendJson(res, 404, { error: 'Not found' });
  let body;
  try { body = await readJson(req); } catch (error) { return sendJson(res, 400, { error: error.message }); }
  const sourceCode = typeof body.sourceCode === 'string' ? cleanSourceCode(body.sourceCode) : '';
  const language = typeof body.language === 'string' ? body.language : '';
  const tests = Array.isArray(body.tests) ? body.tests : [];
  if (!sourceCode.trim()) return sendJson(res, 400, { error: 'Source code is empty' });
  if (Buffer.byteLength(sourceCode) > MAX_SOURCE_BYTES) return sendJson(res, 400, { error: 'Source code is too large' });
  if (!configuredLanguageIds[language]) return sendJson(res, 400, { error: `Unsupported language: ${language}`, verdict: 'Unsupported Language' });
  if (!JUDGE0_BASE_URL) return sendJson(res, 503, { error: 'Execution service is not configured. Set JUDGE0_BASE_URL.', verdict: 'Execution Error' });
  try { validateJudge0BaseUrl(); } catch (error) { return sendJson(res, 503, { error: error.message, verdict: 'Execution Error' }); }
  if (!tests.length) return sendJson(res, 400, { error: 'No executable test cases are available for this problem.', verdict: 'Execution Error' });
  if (tests.length > 100) return sendJson(res, 400, { error: 'A maximum of 100 test cases is allowed.', verdict: 'Execution Error' });
  for (const test of tests) {
    if (!test || typeof test.stdin !== 'string' || typeof test.expected !== 'string' ||
      (test.unordered !== undefined && typeof test.unordered !== 'boolean')) {
      return sendJson(res, 400, { error: 'Each test case must include string stdin and expected values.', verdict: 'Execution Error' });
    }
    if (Buffer.byteLength(test.stdin) > MAX_STDIN_BYTES) return sendJson(res, 400, { error: 'Test input is too large', verdict: 'Execution Error' });
  }

  const requestId = res.getHeader('X-Request-ID');
  const idempotencyKey = req.headers['idempotency-key'];
  if (typeof idempotencyKey === 'string') {
    const existingId = idempotentExecutions.get(idempotencyKey);
    const existingJob = existingId && executionJobs.get(existingId);
    if (existingJob) {
      return sendJson(res, 202, { executionId: existingJob.id, requestId: existingJob.requestId, state: existingJob.state });
    }
  }

  const now = Date.now();
  for (const [id, job] of executionJobs) {
    if (job.createdAt + CODEARENA_JOB_RETENTION_MS < now) executionJobs.delete(id);
  }
  for (const [key, id] of idempotentExecutions) {
    if (!executionJobs.has(id)) idempotentExecutions.delete(key);
  }

  const id = crypto.randomUUID();
  const job = {
    id,
    requestId,
    language,
    tests,
    sourceCode,
    createdAt: now,
    state: 'queued',
    result: null
  };
  executionJobs.set(id, job);
  if (typeof idempotencyKey === 'string' && idempotencyKey.length <= 128) {
    idempotentExecutions.set(idempotencyKey, id);
  }
  logJudgeEvent({
    requestId,
    executionId: id,
    language,
    startedAt: new Date(now).toISOString(),
    durationMs: 0,
    providerHttpStatus: null,
    category: 'execution_accepted',
    outcome: 'queued'
  });
  setImmediate(() => runExecutionJob(job));
  return sendJson(res, 202, { executionId: id, requestId, state: job.state });
}

async function runExecutionJob(job) {
  job.state = 'running';
  const results = [];
  let result;
  const deadline = Date.now() + CODEARENA_EXECUTION_TIMEOUT_MS;
  try {
    for (let index = 0; index < job.tests.length; index++) {
      const test = job.tests[index];
      const execution = await executeTest(job.sourceCode, job.language, test.stdin, {
        requestId: job.requestId,
        language: job.language,
        deadline
      });
      if (execution.verdict !== 'Accepted') {
        results.push({
          caseNumber: index + 1,
          pass: false,
          expected: test.expected === '__RUN_ONLY__' ? '' : test.expected,
          actual: execution.stdout.slice(0, MAX_OUTPUT_BYTES),
          stderr: (execution.stderr || '').slice(0, MAX_OUTPUT_BYTES),
          verdict: execution.verdict,
          ...('time' in execution ? { time: execution.time } : {}),
          ...('memory' in execution ? { memory: execution.memory } : {})
        });
        result = {
          verdict: execution.verdict,
          caseNumber: index + 1,
          expected: test.expected === '__RUN_ONLY__' ? '' : test.expected,
          actual: execution.stdout.slice(0, MAX_OUTPUT_BYTES),
          stderr: (execution.stderr || '').slice(0, MAX_OUTPUT_BYTES),
          ...('time' in execution ? { time: execution.time } : {}),
          ...('memory' in execution ? { memory: execution.memory } : {}),
          results
        };
        break;
      }

      const pass = test.expected === '__RUN_ONLY__' || outputsEqual(execution.stdout, test.expected, {
        unorderedTopLevelArray: test.unordered === true
      });
      results.push({
        caseNumber: index + 1,
        pass,
        expected: test.expected === '__RUN_ONLY__' ? '' : test.expected,
        actual: execution.stdout.slice(0, MAX_OUTPUT_BYTES),
        ...('time' in execution ? { time: execution.time } : {}),
        ...('memory' in execution ? { memory: execution.memory } : {})
      });
      if (!pass) {
        result = {
          verdict: 'Wrong Answer',
          caseNumber: index + 1,
          expected: test.expected,
          actual: execution.stdout.slice(0, MAX_OUTPUT_BYTES),
          stderr: '',
          ...('time' in execution ? { time: execution.time } : {}),
          ...('memory' in execution ? { memory: execution.memory } : {}),
          results
        };
        break;
      }
    }
    if (!result) result = { verdict: 'Accepted', results };
    job.state = 'completed';
  } catch (error) {
    const category = error instanceof ProviderError ? error.category : 'judge_internal_error';
    result = {
      verdict: 'Execution Error',
      error: error instanceof ProviderError ? error.message : 'An internal judging error occurred.',
      errorCategory: category,
      ...(error instanceof ProviderError && error.httpStatus ? { providerHttpStatus: error.httpStatus } : {}),
      results
    };
    job.state = 'failed';
  }
  job.result = result;
  logJudgeEvent({
    requestId: job.requestId,
    executionId: job.id,
    language: job.language,
    startedAt: new Date(job.createdAt).toISOString(),
    durationMs: Date.now() - job.createdAt,
    providerHttpStatus: result.providerHttpStatus || null,
    category: result.errorCategory || result.verdict.toLowerCase().replaceAll(' ', '_'),
    outcome: job.state
  });
  job.sourceCode = '';
  job.tests = [];
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    const requestId = crypto.randomUUID();
    const requestStartedAt = Date.now();
    res.setHeader('X-Request-ID', requestId);
    if (url.pathname === '/api/judge') {
      res.on('finish', () => logJudgeEvent({
        requestId,
        startedAt: new Date(requestStartedAt).toISOString(),
        durationMs: Date.now() - requestStartedAt,
        providerHttpStatus: null,
        category: 'application_response',
        outcome: `http_${res.statusCode}`
      }));
    }
    return handleApi(req, res, url.pathname);
  }
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const root = __dirname;
  const filePath = path.resolve(root, `.${requested}`);
  if (!filePath.startsWith(root + path.sep) && filePath !== path.join(root, 'index.html')) return sendJson(res, 403, { error: 'Forbidden' });
  fs.readFile(filePath, (error, data) => {
    if (error) return sendJson(res, 404, { error: 'Not found' });
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
    res.writeHead(200, {
      'Content-Type': types[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
    res.end(data);
  });
});

if (require.main === module) server.listen(PORT, () => {
  const configured = Boolean(process.env.JUDGE0_BASE_URL);
  console.log(`CodeArena listening on http://localhost:${PORT}`);
  console.log(`[judge] JUDGE0_BASE_URL=${configured ? '<configured>' : '<missing>'} API_KEY=${process.env.JUDGE0_API_KEY ? '<configured>' : '<missing>'} RAPIDAPI_HOST=${process.env.JUDGE0_RAPIDAPI_HOST ? '<configured>' : '<missing>'} AUTH_TOKEN=${process.env.JUDGE0_AUTH_TOKEN ? '<configured>' : '<missing>'}`);
});

module.exports = { server, normalizeOutput, outputsEqual, cleanSourceCode, classify };
