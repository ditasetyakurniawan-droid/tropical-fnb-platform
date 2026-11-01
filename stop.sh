#!/usr/bin/env bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🛑 Menghentikan Layanan Tropical F&B Platform..."
pkill -f "$DIR/backend/bin/api" 2>/dev/null && echo "✔ Backend API dihentikan" || echo "Backend API sudah mati"
pkill -f "vite" 2>/dev/null && echo "✔ Frontend Vite dihentikan" || echo "Frontend Vite sudah mati"

echo "✅ Semua proses background telah dimatikan."
