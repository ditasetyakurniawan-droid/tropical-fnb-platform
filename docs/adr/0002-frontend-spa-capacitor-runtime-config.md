# ADR 0002: Frontend SPA (React 19 + Vite 8), Capacitor, dan Runtime Config

- **Status:** Diterima (Accepted)
- **Tanggal:** 24 Oktober 2026

## Keputusan

1. Menggunakan **React 19 + TypeScript + Vite 8** sebagai Single Page Application (SPA), bukan Next.js (SSR).
2. Membungkus layar Kasir/POS untuk perangkat iPad & Android menggunakan **Capacitor v8**.
3. Menggunakan **Runtime Environment Injection (`window.__APP_CONFIG__`)** via entrypoint script Nginx container, bukan build-time baked environment variables.

## Alasan & Rationale

1. **Kompatibilitas Native iPad (Bluetooth Printer):**
   Safari di iPadOS memblokir Web Bluetooth API. Capacitor memungkinkan akses Bluetooth native lewat plugin `@capacitor-community/bluetooth-le`.
2. **Kesesuaian dengan Capacitor & Offline POS:**
   Capacitor membutuhkan aset statis SPA murni (`index.html` + JS/CSS). Next.js SSR membutuhkan server Node.js dan dynamic routes-nya sering bermasalah di webview mobile lokal.
3. **Konfigurasi Helm Tanpa Rebuild Image:**
   Di Kubernetes, URL API backend disuntikkan melalui `values.yaml` Helm. Dengan script entrypoint `40-runtime-config.sh` yang menulis `config.js` saat container Nginx dinyalakan, Docker image frontend yang sama dapat di-deploy ke environment development, staging, maupun production tanpa perlu proses build ulang.
