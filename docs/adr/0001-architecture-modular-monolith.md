# ADR 0001: Arsitektur Modular Monolith (Microservice-Ready)

- **Status:** Diterima (Accepted)
- **Tanggal:** 24 Oktober 2026
- **Konteks:** Sistem ERP + POS F&B untuk Tropical Group Temanggung (Steak House & Garden Resto) dan multi-tenant ke depan.

## Keputusan

Sistem dibangun menggunakan arsitektur **Modular Monolith** di dalam satu repository (Monorepo), bukan *Microservices* terpisah di awal.

## Alasan & Rationale

1. **Integritas Finansial & Transaksi ACID:**
   Operasional F&B membutuhkan konsistensi data yang sangat ketat: saat pesanan dibayar di kasir, pemotongan stok bahan baku di gudang (`inventory`), pencatatan HPP/COGS (`recipe_hpp`), dan pencatatan kas/jurnal (`finance`) harus dieksekusi dalam **1 Transaksi Database ACID** yang atomik. Dalam arsitektur microservices, koordinasi transaksi lintas service membutuhkan protokol terdistribusi (2PC/Saga) yang kompleks dan rawan selisih data.
2. **Kesiapan Pemisahan Microservice (Microservice-Ready Boundary):**
   Setiap modul bisnis diisolasi di dalam `backend/internal/modules/<nama_modul>` dengan 4 lapisan:
   - `domain/` (Struct data & kontrak interface)
   - `usecase/` (Logika bisnis & orkestrasi transaksi)
   - `repository/` (Query SQL khusus tabel modul itu saja)
   - `handler/` (HTTP REST handler)
   
   **Aturan Batas Domain:** Modul dilarang melakukan JOIN SQL ke tabel modul lain atau meng-import paket internal modul lain secara langsung. Komunikasi lintas modul wajib melalui interface kontrak. Jika suatu saat modul seperti `inventory` atau `pos` ingin diekstrak menjadi microservice tersendiri, modul tersebut dapat dipindahkan langsung tanpa mengubah logika usecase.
