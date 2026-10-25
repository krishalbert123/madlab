#!/bin/sh
set -eu

ulimit -t 25
ulimit -f 16384

case "${1:-}" in
  python)
    exec timeout --signal=TERM --kill-after=2s "${CODEARENA_RUN_TIMEOUT_SECONDS:-30}s" python3 -u /workspace/main.py
    ;;
  c)
    exec timeout --signal=TERM --kill-after=2s "${CODEARENA_RUN_TIMEOUT_SECONDS:-30}s" sh -c 'gcc -std=c11 -O2 -pipe /workspace/main.c -o /tmp/program && exec stdbuf -o0 -e0 /tmp/program'
    ;;
  cpp)
    exec timeout --signal=TERM --kill-after=2s "${CODEARENA_RUN_TIMEOUT_SECONDS:-30}s" sh -c 'g++ -std=c++17 -O2 -pipe /workspace/main.cpp -o /tmp/program && exec stdbuf -o0 -e0 /tmp/program'
    ;;
  javascript)
    exec timeout --signal=TERM --kill-after=2s "${CODEARENA_RUN_TIMEOUT_SECONDS:-30}s" node /workspace/main.js
    ;;
  java)
    exec timeout --signal=TERM --kill-after=2s "${CODEARENA_RUN_TIMEOUT_SECONDS:-30}s" sh -c 'javac -d /tmp /workspace/Main.java && exec java -cp /tmp Main'
    ;;
  *)
    echo "Unsupported interactive language." >&2
    exit 64
    ;;
esac
