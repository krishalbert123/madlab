'use strict';

const assert = require('assert');
const { server } = require('../server');

async function sendInput(runId, data) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/run/${runId}/input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data })
  });
  assert.strictEqual(response.status, 202);
}

async function runInteractive(sourceCode, language, promptInputs, allowFailure = false) {
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const start = await fetch(`${baseUrl}/api/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceCode, language })
  });
  assert.strictEqual(start.status, 202);
  const { runId } = await start.json();
  const eventsResponse = await fetch(`${baseUrl}/api/run/${runId}/events`);
  assert.strictEqual(eventsResponse.status, 200);

  const reader = eventsResponse.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let stdout = '';
  let stderr = '';
  let finished;
  const sent = new Set();
  const deadline = Date.now() + 20000;
  while (!finished && Date.now() < deadline) {
    const next = await Promise.race([
      reader.read(),
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error(`${language} interactive run timed out`)), Math.max(1, deadline - Date.now()));
        timer.unref();
      })
    ]);
    if (next.done) break;
    pending += decoder.decode(next.value, { stream: true });
    const blocks = pending.split('\n\n');
    pending = blocks.pop();
    for (const block of blocks) {
      const event = block.match(/^event: (.+)$/m)?.[1];
      const dataLine = block.match(/^data: (.+)$/m)?.[1];
      if (!event || !dataLine) continue;
      const payload = JSON.parse(dataLine);
      if (event === 'stdout') {
        stdout += payload.data;
        for (let index = 0; index < promptInputs.length; index++) {
          if (!sent.has(index) && stdout.includes(promptInputs[index].prompt)) {
            sent.add(index);
            await sendInput(runId, promptInputs[index].input);
          }
        }
      } else if (event === 'stderr') {
        stderr += payload.data;
      } else if (event === 'finished') {
        finished = payload;
      }
    }
  }
  await reader.cancel();
  assert.ok(finished, `${language} run should emit a finished event`);
  if (!allowFailure) {
    assert.strictEqual(finished.state, 'completed', stderr);
    assert.strictEqual(finished.exitCode, 0, stderr);
  }
  assert.strictEqual(sent.size, promptInputs.length, `${language} should receive input after each prompt`);
  return { stdout, stderr };
}

async function verifyStopControl() {
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const start = await fetch(`${baseUrl}/api/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceCode: 'import time\nprint("ready", flush=True)\ntime.sleep(60)\n', language: 'python' })
  });
  assert.strictEqual(start.status, 202);
  const { runId } = await start.json();
  const eventsResponse = await fetch(`${baseUrl}/api/run/${runId}/events`);
  const reader = eventsResponse.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let output = '';
  let finished;
  let requestedStop = false;
  const deadline = Date.now() + 10000;
  while (!finished && Date.now() < deadline) {
    const next = await reader.read();
    if (next.done) break;
    pending += decoder.decode(next.value, { stream: true });
    const blocks = pending.split('\n\n');
    pending = blocks.pop();
    for (const block of blocks) {
      const event = block.match(/^event: (.+)$/m)?.[1];
      const dataLine = block.match(/^data: (.+)$/m)?.[1];
      if (!event || !dataLine) continue;
      const payload = JSON.parse(dataLine);
      if (event === 'stdout') {
        output += payload.data;
        if (!requestedStop && output.includes('ready')) {
          requestedStop = true;
          const stop = await fetch(`${baseUrl}/api/run/${runId}/stop`, { method: 'POST' });
          assert.strictEqual(stop.status, 202);
        }
      } else if (event === 'finished') {
        finished = payload;
      }
    }
  }
  await reader.cancel();
  assert.ok(requestedStop, 'the running process should produce output before Stop is tested');
  assert.strictEqual(finished?.state, 'stopped');
}

async function main() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const python = await runInteractive(
      'name = input("Name? ")\nprint(f"Hello, {name}!")\n',
      'python',
      [{ prompt: 'Name? ', input: 'Ada\n' }]
    );
    assert.match(python.stdout, /Hello, Ada!/);

    const c = await runInteractive(
      '#include <stdio.h>\nint main(void) { char name[64], color[64]; printf("Name? "); fflush(stdout); if (scanf("%63s", name) != 1) return 1; int ch; while ((ch = getchar()) != 10 && ch != EOF) {} printf("Color? "); fflush(stdout); if (!fgets(color, sizeof(color), stdin)) return 2; printf("Hello %s, %s", name, color); return 0; }\n',
      'c',
      [{ prompt: 'Name? ', input: 'Ada\n' }, { prompt: 'Color? ', input: 'blue\n' }]
    );
    assert.match(c.stdout, /Hello Ada, blue/);

    const compileError = await runInteractive('int main(void) { this is not C; }\n', 'c', [], true);
    assert.match(compileError.stderr, /error:/i);

    const runtimeError = await runInteractive('raise RuntimeError("runtime-check")\n', 'python', [], true);
    assert.match(runtimeError.stderr, /runtime-check/);
    await verifyStopControl();

    console.log('Validated live stdin/stdout, Stop, compiler diagnostics, and runtime errors in Docker for Python and C');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
