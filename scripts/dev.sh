#!/bin/sh
# Arranca o backend (nodemon, porta 3000) e o frontend (Vite, porta 5173) no mesmo contentor.
# Se um dos dois terminar, o contentor termina também.
set -e

cd /app/backend
npx nodemon --legacy-watch --ignore '*.json' --ignore 'private/*' server.js &
BACKEND_PID=$!

cd /app/frontend
npx vite --host 0.0.0.0 --port 5173 &
FRONTEND_PID=$!

trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0' INT TERM

while kill -0 $BACKEND_PID 2>/dev/null && kill -0 $FRONTEND_PID 2>/dev/null; do
  sleep 2
done
echo "Um dos processos terminou; a parar o contentor."
kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
exit 1
