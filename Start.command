#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  npm install
fi

npm --prefix server install
node server/index.js &

npm run dev -- --host 127.0.0.1 --port 5177
