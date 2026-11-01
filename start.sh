#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=================================================="
echo "🌴 Starting Tropical F&B Platform (Full Stack) 🌴"
echo "=================================================="

# 1. Start Database
echo "▶ 1. Memeriksa & Menjalankan PostgreSQL..."
docker compose up -d --wait postgres

# 2. Run Migrations (if needed)
echo "▶ 2. Memastikan Migrasi Database Terupdate..."
export PATH=$PATH:/usr/local/go/bin
cd "$DIR/backend"
go run ./cmd/migrate up

# 3. Build & Run Backend API in background
echo "▶ 3. Menjalankan Backend Go API (Port 8080)..."
cd "$DIR"
set -a
. "$DIR/.env"
set +a

# Kill existing API if running
pkill -f "$DIR/backend/bin/api" 2>/dev/null || true
"$DIR/backend/bin/api" > "$DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "   Backend berjalan dengan PID: $BACKEND_PID (Log: backend.log)"

# 4. Run Frontend in background
echo "▶ 4. Menjalankan Frontend Vite (Port 5173)..."
cd "$DIR/frontend"
npx vite --host 127.0.0.1 > "$DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "   Frontend berjalan dengan PID: $FRONTEND_PID (Log: frontend.log)"

echo "=================================================="
echo "✅ Aplikasi Berhasil Dijalankan!"
echo "   🌐 Frontend : http://127.0.0.1:5173"
echo "   🔌 Backend  : http://127.0.0.1:8080"
echo "=================================================="
