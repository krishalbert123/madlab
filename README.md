# CodeArena + Flutter Scaffold

This workspace contains:

- A browser-based CodeArena web app extracted into modular files:
  - `index.html`
  - `css/style.css`
  - `js/questions.js`
  - `js/app.js`
- A Flutter app scaffold under `flutter_app/` for a native mobile experience.

## Web app

CodeArena needs its Node judging proxy to run submissions safely. It is a static frontend plus a backend proxy to a Judge0-compatible service.

```bash
cd /workspaces/madlab
export JUDGE0_BASE_URL=https://your-judge0-host.example.com
# RapidAPI credentials only when required by your Judge0 provider:
export JUDGE0_API_KEY=your-key
export JUDGE0_RAPIDAPI_HOST=your-judge0-host.example.com
node server.js
```

Then open http://localhost:8000.

Required configuration:

- `JUDGE0_BASE_URL`: base URL for a Judge0-compatible API. The proxy never judges without it.
- `JUDGE0_API_KEY` and `JUDGE0_RAPIDAPI_HOST`: optional provider credentials. Credentials stay server-side and must never be placed in frontend JavaScript.
- `JUDGE0_AUTH_TOKEN`: optional `X-Auth-Token` credential for Judge0 instances configured with Judge0's built-in authentication.
- `JUDGE0_LANGUAGE_IDS`: optional JSON object overriding language IDs, for example `{"python":71,"javascript":63,"java":62,"cpp":54,"c":50}`.
- `CODEARENA_TIME_LIMIT_MS`: optional wall/cpu limit in milliseconds; defaults to 2000.
- `JUDGE0_REQUEST_TIMEOUT_MS`: per-provider HTTP request timeout; defaults to 10000.
- `CODEARENA_EXECUTION_TIMEOUT_MS`: maximum time to wait for a Judge0 job to finish; defaults to 30000.
- `CODEARENA_JOB_RETENTION_MS`: how long completed execution results remain available for polling; defaults to 300000.
- `CODEARENA_RUN_TIMEOUT_MS`: maximum runtime for an interactive Run session; defaults to 30000.
- `CODEARENA_SANDBOX_IMAGE`: Docker image for interactive runs; defaults to `madlab-runner:latest`.
- `CODEARENA_DOCKER_BIN`: optional path to the Docker CLI; defaults to `docker`.

For local standalone startup, you may place these variables in a workspace `.env` file. The server loads `.env` but never overrides variables already exported in the process. Add `.env` to `.gitignore` and never commit credentials. Exported variables or platform environment settings take precedence in hosted deployments. Restart the Node server after changing `.env` or process environment variables; redeploy or restart hosted instances after changing deployment environment settings.

The `/api/judge` endpoint immediately returns an execution ID. The browser polls the app for that job's status, while the backend submits to Judge0 with `wait=false` and polls Judge0's documented `/submissions/{token}` endpoint. Safe status-poll GET requests receive at most two bounded retries for transient rate-limit, server, timeout, and network errors; submission POST requests are never automatically retried because Judge0 may already have accepted them. HTML, JavaScript, and CSS are served with no-cache headers to prevent an old synchronous frontend from continuing to issue stale judge requests. Output comparison trims outer whitespace and trailing horizontal whitespace on each line. Submit relies on Judge0's execution sandbox; interactive Run uses the isolated Docker runner described below.

Run uses a separate interactive session backend because Judge0 submissions accept stdin only when the job is created. It starts a fresh Docker container for each run and streams stdout/stderr to the browser while forwarding input lines to that same process. Build the runner image once before enabling Run:

```bash
docker build -f Dockerfile.runner -t madlab-runner:latest .
```

The Docker daemon must be available to the backend. Interactive containers have no network, a read-only root filesystem and source mount, a non-root user, dropped capabilities, the default seccomp profile, memory/CPU/PID/file limits, and a bounded wall-clock runtime. The provided runner supports Python 3, C, C++, JavaScript, and Java. If Docker is not available or the image has not been built, Run reports the runner error and does not fall back to executing code on the app host. The shell page remains a simulated shell for shell utilities; running supported source files (`python3 file.py`, `node file.js`, `gcc file.c`, `g++ file.cpp`, or `run file`) uses the isolated runner. Submit remains a separate Judge0 test-case evaluation.

Judge request logs are structured JSON. Match the `requestId` returned in the `X-Request-ID` response header or execution response. A `providerHttpStatus: 504` log indicates Judge0 returned 504; an application response log shows the status the Node server returned. If a browser receives 504 but there is no matching request log or `X-Request-ID`, inspect the hosting/reverse-proxy logs: that 504 was generated before it reached or after it left this Node process. Logs omit source code, stdin, and credentials.

Judge0 integration details and provider-specific authentication options are documented at [Judge0 CE API docs](https://ce.judge0.com/docs). This workspace has no configured live provider URL or credentials by default; the values in `.env.example` are placeholders. Do not use the placeholder host as a real provider.

Execution job state currently lives in the Node process memory. Run one app instance for this implementation; before using multiple replicas or a serverless deployment, move the job/status store to shared infrastructure (for example, Redis) so a poll is routed to the instance holding the job.

Authentication is handled server-side with hashed passwords and signed session cookies. Copy `.env.example` to `.env` and fill in your own values before running the app. Never commit your `.env` file or real credentials.

The mocked Judge0 tests need no provider credentials. The interactive runner integration test requires a reachable Docker daemon and the `madlab-runner:latest` image built as shown above.

```bash
node tests/validate_debugging_questions.js
node tests/validate_problem_bank.js
node tests/validate_judge_proxy.js
node tests/validate_judge_integration.js
node tests/validate_interactive_runner.js
```

The 100 `PROBLEMS` entries are not yet a fully verified judge bank. Their test cases are sent to the submitted program verbatim as stdin, but several problem statements and starter templates describe function-style inputs without defining a consistent stdin parser or solution harness. Some sample cases have been made concrete, but the remaining test data must be standardized and each expected result independently checked before claiming all 100 problems are judge-ready. A Judge0 verdict only verifies the exact source, stdin, and expected output that were submitted; the metadata audit does not verify every algorithm or answer.

In the problem editor and compiler, Run opens a live terminal with line-based stdin, streamed stdout/stderr, and Stop/Clear controls. In the shell page, `python3 file.py`, `node file.js`, `gcc file.c`, `g++ file.cpp`, or `run file` starts the same isolated runner; shell utilities remain simulated. Submit remains independent: it executes the declared test cases through Judge0 and reports actual verdicts.

## Flutter app

The Flutter project is scaffolded in `flutter_app/` but this environment currently does not have Flutter installed or available on PATH, so it could not be executed here. The app is laid out as a standard Flutter project and is ready to run on a machine with the Flutter SDK installed.

```bash
cd /workspaces/madlab/flutter_app
flutter pub get
flutter run
```

## Notes

- The original single-file web implementation was preserved as a starting point and then split into separate HTML/CSS/JS files.
- The browser app intentionally keeps the original functionality and UX while being easier to maintain.
- The Flutter app is a starter implementation based on the same CodeArena concept and can be expanded into a full feature set once the SDK is available.
