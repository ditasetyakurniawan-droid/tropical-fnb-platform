# Dokumentasi Tropical F&B Platform

Platform manajemen terpadu untuk bisnis F&B (Restoran Keluarga, Steak House, Multi-Outlet, dan SaaS Multi-Tenant).

## Struktur Project

```text
tropical-fnb-platform/
├── backend/            # Backend REST API & Migrasi Database (Golang 1.27 + pgx + Chi)
├── frontend/           # Back-Office ERP & POS WebApp (React 19 + TypeScript + Vite 8 + Tailwind v4)
├── deploy/helm/        # Helm Chart untuk deployment Kubernetes enterprise
├── docs/               # Blueprint spesifikasi produk & Architectural Decision Records (ADR)
├── docker-compose.yml  # Database lokal PostgreSQL 18
└── Makefile            # Single entrypoint untuk seluruh tugas developer & CI
```

## Quick Start (Lokal Development)

1. **Jalankan Database:**
   ```bash
   make env db-up
   ```
2. **Jalankan Migrasi Database:**
   ```bash
   make migrate-up
   ```
3. **Jalankan Backend API:**
   ```bash
   make run-api
   ```
4. **Jalankan Frontend Dev Server:**
   ```bash
   make fe-dev
   ```
   Aplikasi dapat diakses di `http://localhost:5173`.

5. **Jalankan Seluruh Quality Gate (CI Check):**
   ```bash
   make check
   ```

## Architectural Decision Records (ADR)
- [ADR 0001: Arsitektur Modular Monolith](adr/0001-architecture-modular-monolith.md)
- [ADR 0002: Frontend SPA, Capacitor, dan Runtime Config](adr/0002-frontend-spa-capacitor-runtime-config.md)
- [ADR 0003: Konvensi Database PostgreSQL 18 & Isolasi](adr/0003-database-conventions-isolation.md)
- [ADR 0004: Manajemen Konfigurasi & Helm Kubernetes](adr/0004-helm-kubernetes-configuration.md)
