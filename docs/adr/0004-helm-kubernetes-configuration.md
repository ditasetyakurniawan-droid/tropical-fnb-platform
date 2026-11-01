# ADR 0004: Manajemen Konfigurasi & Deployment Helm Kubernetes

- **Status:** Diterima (Accepted)
- **Tanggal:** 24 Oktober 2026

## Keputusan

1. Backend Go murni membaca konfigurasi via `os.Getenv` tanpa membaca file `.env` di container.
2. Validasi konfigurasi bersifat *fail-fast* dan mengumpulkan seluruh error sekaligus.
3. Seluruh konfigurasi dan secret diorkestrasi via Helm Chart (`deploy/helm/tropical-fnb`).
4. Migrasi skema database dijalankan sebagai Helm pre-install / pre-upgrade hook Job menggunakan binary `migrate up`.
