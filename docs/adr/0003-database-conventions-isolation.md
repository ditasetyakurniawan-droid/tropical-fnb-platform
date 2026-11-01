# ADR 0003: Konvensi Database PostgreSQL 18 & Isolasi Multi-Tenant

- **Status:** Diterima (Accepted)
- **Tanggal:** 24 Oktober 2026

## Keputusan

1. **Primary Key:** Menggunakan `UUID v7` bawaan PostgreSQL 18 (`uuidv7()`).
2. **Presisi Finansial:**
   - Mata uang: `NUMERIC(18, 2)`
   - Stok, gramasi resep, HPP per gram/ml: `NUMERIC(18, 4)`
   - Dilarang keras menggunakan tipe data `FLOAT` / `REAL`.
3. **Isolasi Multi-Tenant & Multi-Outlet:**
   Setiap tabel bisnis memiliki kolom `tenant_id` dan `outlet_id`.
   Relasi anak-ke-induk dilindungi oleh **Composite Foreign Key** `(tenant_id, id)` sehingga database menolak referensi data yang berbeda perusahaan.
4. **Audit Trail Append-Only:**
   Tabel `audit_logs` dilindungi trigger `forbid_mutation()` yang menolak operasi `UPDATE`, `DELETE`, dan `TRUNCATE`.
