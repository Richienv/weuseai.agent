# Earnings Summary Format

> Reference yang dipakai `earnings-summarizer`. Struktur tetap ringkasan laporan keuangan emiten.

---

## Bagian ringkasan

Urutan tetap:

1. **Header** — nama emiten, ticker, periode laporan (mis. Q3 2025), tanggal rilis, jenis laporan (quarterly / annual).
2. **Key metrics** — revenue, EBITDA, net income, EPS. Tiap metrik disertai delta YoY dan QoQ.
3. **Surprises vs konsensus** — bandingkan hasil aktual dengan ekspektasi analis kalau datanya tersedia. Tandai beat / miss / in-line.
4. **Catatan auditor** — flag kalau ada qualified opinion, going-concern note, atau temuan material.
5. **Guidance change** — kalau manajemen revisi outlook ke atas atau ke bawah, sebut eksplisit dengan angkanya.
6. **Source line** — laporan resmi yang dipakai (annual / quarterly filing), tanggal akses.

---

## Aturan format

- Semua angka dari laporan resmi emiten — annual report atau quarterly filing. Bukan dari reporting pihak ketiga.
- Mata uang ikut laporan (Rupiah untuk emiten IDX). Sebut satuan jelas (juta / miliar / triliun).
- Delta selalu disertai arah dan persentase.
- Kalau sebuah metrik tidak tersedia di laporan, tandai "[tidak dilaporkan]" — tidak ditebak.
- Konsensus analis ditandai sebagai estimasi pihak ketiga, bukan fakta.

---

## Contoh isi

> Ringkasan earnings BBNI — Q3 2025 (rilis [tanggal]):
> - Revenue: Rp 18.2 T (+8.1% YoY, +2.3% QoQ)
> - EBITDA: Rp 9.4 T (+6.5% YoY)
> - Net income: Rp 5.1 T (+11.2% YoY) — beat konsensus Rp 4.8 T
> - EPS: Rp 273 (+11.0% YoY)
> - Catatan auditor: unqualified, tidak ada temuan material.
> - Guidance: manajemen naikkan target full-year loan growth dari 9-11% jadi 10-12%.
> - Source: BBNI Q3 2025 financial statement, diakses [tanggal].

---

## Catatan

Ringkasan ini ekstraksi data dari laporan resmi, bukan rekomendasi beli / jual. Setiap output yang menyentuh recommendation wajib disertai disclaimer "Aku bukan financial advisor. Ini info, bukan rekomendasi."
