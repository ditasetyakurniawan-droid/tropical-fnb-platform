# 🌴 Panduan Standar & Best Practice Menjalankan Aplikasi di Lokal (Onboarding Developer)

Selamat datang di proyek **Tropical FnB Platform** (Tropical Steak House & Tropical Garden Resto)!  
Panduan ini dirancang sebagai acuan standar resmi bagi **Software Engineer, Fullstack Developer, QA Tester, dan DevOps Engineer** yang baru bergabung agar dapat melakukan setup, menjalankan (*spin-up*), menguji, serta mengembangkan aplikasi di mesin lokal (*homelab / workstation*) dengan **zero friction**.

---

## 📑 Daftar Isi
1. [Arsitektur Sistem & Port Matrix](#1-arsitektur-sistem--port-matrix)
2. [Prasyarat Lingkungan (Prerequisites)](#2-prasyarat-lingkungan-prerequisites)
3. [Quickstart 1-Klik (Rekomendasi Cepat)](#3-quickstart-1-klik-rekomendasi-cepat)
4. [Langkah Manual Step-by-Step](#4-langkah-manual-step-by-step)
   - [A. Konfigurasi Environment Variable (`.env`)](#a-konfigurasi-environment-variable-env)
   - [B. Database PostgreSQL & Migrasi](#b-database-postgresql--migrasi)
   - [C. Menjalankan Backend Go API](#c-menjalankan-backend-go-api)
   - [D. Menjalankan Frontend Vite React](#d-menjalankan-frontend-vite-react)
5. [Matriks Akun Login & Kredensial Default](#5-matriks-akun-login--kredensial-default)
6. [Testing & QA Audit Suite](#6-testing--qa-audit-suite)
7. [Aturan Standar Desain UI/UX (Ergonomic Contrast Guidelines)](#7-aturan-standar-desain-uiux-ergonomic-contrast-guidelines)
8. [Troubleshooting & Solusi Masalah Populer](#8-troubleshooting--solusi-masalah-populer)

---

## 1. Arsitektur Sistem & Port Matrix

Tropical FnB Platform berarsitektur monorepo modular:
- **Backend API**: Bahasa Go 1.23+ dengan Chi Router, Pgx Driver v5, Clean Architecture (Domain, Repository, Usecase, Handler).
- **Frontend SPA**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Vite 6.
- **Database Engine**: PostgreSQL 18 berjalan di Docker Container dengan isolasi multi-tenant data resto.

| Layanan / Komponen | Port Lokal | Endpoint / Healthcheck | Keterangan |
| :--- | :--- | :--- | :--- |
| **PostgreSQL 18** | `5432` | `127.0.0.1:5432` | Container Docker `tropical-fnb-postgres-1` |
| **Backend Go REST API** | `8080` | `http://127.0.0.1:8080/healthz` | Swagger: `/swagger/index.html` (opsional) |
| **Frontend React App** | `5173` | `http://127.0.0.1:5173/` | Dev Server Vite dengan Hot Module Reload (HMR) |

---

## 2. Prasyarat Lingkungan (Prerequisites)

Pastikan dependensi berikut terinstal di OS Linux / macOS / WSL2 Anda:
1. **Docker Engine & Docker Compose**: v24+ (`docker --version`)
2. **Go Programming Language**: v1.23+ (`go version`)
3. **Node.js & npm**: Node v20 LTS atau v22 (`node -v` & `npm -v`)
4. **Make**: GNU Make (`make --version`)
5. **Git**: (`git --version`)

---

## 3. Quickstart 1-Klik (Rekomendasi Cepat)

Kami telah menyediakan skrip automasi di root folder repositori untuk menyalakan dan mematikan seluruh ekosistem:

### 🚀 Menyalakan Seluruh Aplikasi:
```bash
./start.sh
```
Skrip ini secara otomatis akan:
1. Memeriksa ketersediaan Docker dan menjalankan container PostgreSQL (`make db-up`).
2. Menjalankan migrasi database skema F&B jika belum terpasang (`make migrate-up`).
3. Mengompilasi dan menyalakan Backend Go API di background pada port `8080`.
4. Menginstal npm packages jika belum ada dan menyalakan Vite Dev Server di background pada port `5173`.
5. Memberikan konfirmasi bahwa aplikasi siap dibuka di browser: `http://127.0.0.1:5173`.

### 🛑 Mematikan Seluruh Aplikasi:
```bash
./stop.sh
```
Skrip ini akan mematikan proses background API (port 8080) dan Frontend (port 5173) secara aman (*graceful shutdown*).

---

## 4. Langkah Manual Step-by-Step

Jika Anda ingin menjalankan atau men-*debug* service secara terpisah (misalnya saat memakai breakpoint IDE), ikuti langkah berikut:

### A. Konfigurasi Environment Variable (`.env`)
Salin atau buat file `.env` di root direktori proyek (`tropical-fnb-platform/.env`):
```env
# Database Credentials
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=fnb_user
DB_PASSWORD=fnb_secret
DB_NAME=tropical_fnb_db
DB_SSLMODE=disable

# Backend Config
PORT=8080
APP_ENV=development
JWT_SECRET=tropical-fnb-ultra-secure-jwt-secret-key-2026

# Outlets Context
DEFAULT_OUTLET_STEAK_ID=01a16ca4-770a-7f46-9216-79dd3612a375
DEFAULT_OUTLET_GARDEN_ID=01a16ca4-770a-7f46-9216-79dd3612a376
```

### B. Database PostgreSQL & Migrasi
1. **Jalankan PostgreSQL via Docker**:
   ```bash
   make db-up
   # Atau manual: docker compose up -d postgres
   ```
2. **Jalankan Migrasi Skema Database**:
   ```bash
   make migrate-up
   ```
3. **Memeriksa Status Container**:
   ```bash
   docker ps --filter "name=postgres"
   ```

### C. Menjalankan Backend Go API
1. Masuk ke direktori backend:
   ```bash
   cd backend
   ```
2. Pastikan file dependensi Go terunduh:
   ```bash
   go mod download
   ```
3. Jalankan server API:
   ```bash
   # Cara 1: Menggunakan Makefile dari root
   make run-api

   # Cara 2: Langsung dengan env dari backend/
   set -a && . ../.env && set +a && go run cmd/api/main.go
   ```
4. Verifikasi kesehatan API di terminal lain:
   ```bash
   curl -i http://127.0.0.1:8080/healthz
   # Respon yang diharapkan: HTTP/1.1 200 OK {"status":"UP"}
   ```

### D. Menjalankan Frontend Vite React
1. Masuk ke direktori frontend:
   ```bash
   cd frontend
   ```
2. Pasang dependensi jika belum:
   ```bash
   npm install
   ```
3. Jalankan server frontend:
   ```bash
   npm run dev -- --host 127.0.0.1
   ```
4. Buka browser Anda di `http://127.0.0.1:5173`.

---

## 5. Matriks Akun Login & Kredensial Default

Database lokal sudah di-seed dengan akun dan role operasional restoran lengkap. Anda dapat menggunakan akun di bawah ini untuk menguji berbagai modul:

| Role Pengguna | Username Login | Password | Akses Fitur Utama |
| :--- | :--- | :--- | :--- |
| **Owner / Direksi** | `owner` | `Password123!` | Akses penuh: Executive Analytics, Audit Opname, Multi-Resto ERP, Settings |
| **Manajer Steak House** | `manager_steak` | `Password123!` | Operasional & ERP outlet Steak House |
| **Manajer Garden Resto** | `manager_garden` | `Password123!` | Operasional & ERP outlet Garden Resto |
| **Supervisor Steak** | `spv_steak` | `Password123!` | Void approval, diskon manual, shift closing, transfer stok |
| **Supervisor Garden** | `spv_garden` | `Password123!` | Sama seperti di atas, untuk outlet Garden |
| **Kasir Steak House** | `kasir_steak` | `Password123!` | POS Kasir Steak, Dine-In / Takeaway, Split Bill, QRIS/Cash |
| **Kasir Garden Resto** | `kasir_garden` | `Password123!` | POS Kasir Garden, order & table management |

> Login memakai **username** (bukan email). `123456` adalah **PIN supervisor** (untuk persetujuan void/diskon), bukan password login.

---

## 6. Testing & QA Audit Suite

Sebelum melakukan PR (*Pull Request*) atau rilis, pastikan lulus seluruh pengujian:

1. **Frontend Unit & Component Testing (Vitest)**:
   ```bash
   cd frontend
   npm test -- --run
   ```
   *Target: 100% Pass (114+ unit tests).*

2. **Frontend TypeCheck & Production Build**:
   ```bash
   cd frontend
   npm run build
   ```
   *Target: 0 TypeScript errors.*

3. **Master End-to-End QA, Penetration Test & Security Audit**:
   ```bash
   python3 scratch/master_qa_pentest_audit.py
   ```
   *Memvalidasi integritas autentikasi JWT, proteksi SQL Injection, CSRF, IDOR pada modul Pengadaan (PO), Timbal-Balik Timbangan (Actual Scale), Blind Stock Opname, serta Mutasi Antar-Resto.*

---

## 7. Aturan Standar Desain UI/UX (Ergonomic Contrast Guidelines)

> [!IMPORTANT]
> **Aturan Wajib Tipografi & Kontras Permukaan (Human Ergonomics)**  
> Karena aplikasi ini berlatar belakang visual dinamis *Tropical 3D Canvas* (kayu panggangan steak dan nuansa tanaman tropis), ikuti aturan ketat ini:

1. **Hindari Glassmorphism Tipis pada Tabel Data**:
   - ❌ **Dilarang**: Menggunakan `glass-panel` transparan dengan latar < 90% opacity pada tabel data operasional (karena motif gelap arang/kayu di belakang akan tembus dan membuat baris terlihat kusam abu-abu kotor).
   - ✅ **Wajib**: Gunakan kontainer solid putih `bg-white` atau `bg-white/95` dengan border terdefinisi `border border-slate-200/90` dan shadow halus `shadow-sm`.

2. **Standar Kontras Warna Teks (WCAG AAA)**:
   - ❌ **Dilarang**: Menggunakan `text-slate-400` atau `text-gray-400` untuk teks keterangan penting atau label form pada latar putih (rasio kontras terlalu rendah ~2.8:1, menyiksa mata manusia).
   - ✅ **Judul & Nilai Kritis**: Gunakan `text-slate-900 font-black` atau `text-slate-900 font-bold`.
   - ✅ **Sublabel & Keterangan Form**: Gunakan `text-slate-700 font-bold` atau `text-slate-600 font-semibold`.
   - ✅ **Data Angka Monospace**: Gunakan `font-mono font-black text-slate-900` atau aksen tematik (`text-amber-900`, `text-emerald-800`).

3. **Pewarnaan Baris Belang (Zebra Striping)**:
   - Gunakan perpaduan yang sangat lembut dan nyaman: `odd:bg-white even:bg-slate-50/60 hover:bg-amber-50/40 border-b border-slate-100`.

---

## 8. Troubleshooting & Solusi Masalah Populer

### ❓ Port `8080` atau `5173` sudah terpakai (*Address already in use*):
```bash
# Periksa proses yang menyandera port
sudo lsof -i :8080
sudo lsof -i :5173

# Hentikan proses tersebut secara paksa:
fuser -k 8080/tcp
fuser -k 5173/tcp
```

### ❓ Error koneksi database (*Connection refused / dial tcp 127.0.0.1:5432*):
```bash
# Pastikan Docker daemon berjalan:
sudo systemctl status docker

# Nyalakan kembali container PostgreSQL:
docker compose up -d postgres
# Atau
make db-up
```

### ❓ Error TypeScript `Cannot find name 'XCircle'` atau modul missing:
```bash
cd frontend
npm install
npm run build
```

---
*Dokumen ini dikelola dan diperbarui oleh Tim Arsitektur & Engineering Tropical FnB Platform. Silakan buat PR jika ada pembaruan flow lokal.*
