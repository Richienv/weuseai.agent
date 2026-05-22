# Template — Pre-launch checklist

Daftar item yang harus dicek sebelum kamu promote site dari preview ke production. Setiap item punya status RAG — hijau (siap), kuning (perlu cek), merah (blocker). Dipakai berbarengan dengan playbook `site-launch` di Langkah 5 atau di luar playbook sebagai self-audit.

## Variables

- `{site_url_preview}` — URL preview yang sedang dicek.
- `{site_url_production}` — URL production target (kalau custom domain sudah dipilih).
- `{custom_domain}` — domain custom kalau ada (contoh: "bisnisku.com"); kosongkan kalau pakai subdomain Vercel.
- `{owner_name}` — nama pemilik site untuk catatan kontak.
- `{check_date}` — tanggal cek (YYYY-MM-DD).
- `{analytics_provider}` — provider analytics yang dipakai (Plausible, Vercel Analytics, atau GA).

## Template

```markdown
# Pre-launch checklist — {site_url_production}

**Pemilik:** {owner_name}
**Tanggal cek:** {check_date}
**Preview URL:** {site_url_preview}
**Target production:** {site_url_production}

Status legend: 🟢 siap · 🟡 perlu cek · 🔴 blocker

## Domain & DNS

| # | Item | Status | Catatan |
|---|---|---|---|
| 1 | Domain `{custom_domain}` sudah terdaftar atas nama pemilik | 🟢 / 🟡 / 🔴 |  |
| 2 | DNS record (A / CNAME) menunjuk ke Vercel | 🟢 / 🟡 / 🔴 |  |
| 3 | SSL aktif dan certificate valid (https://) | 🟢 / 🟡 / 🔴 |  |
| 4 | Redirect www → apex (atau sebaliknya) konsisten | 🟢 / 🟡 / 🔴 |  |

## SEO basics

| # | Item | Status | Catatan |
|---|---|---|---|
| 5 | `<title>` tiap halaman unik dan deskriptif, 50-60 karakter | 🟢 / 🟡 / 🔴 |  |
| 6 | `<meta name="description">` tiap halaman, 140-160 karakter | 🟢 / 🟡 / 🔴 |  |
| 7 | Heading hierarchy benar (satu H1 per halaman, H2 berurutan) | 🟢 / 🟡 / 🔴 |  |
| 8 | `sitemap.xml` ada di root dan terdaftar di search console | 🟢 / 🟡 / 🔴 |  |
| 9 | `robots.txt` tidak memblokir halaman publik | 🟢 / 🟡 / 🔴 |  |

## Social sharing

| # | Item | Status | Catatan |
|---|---|---|---|
| 10 | `og:image` (1200×630 px) ada dan terbaca saat di-share | 🟢 / 🟡 / 🔴 |  |
| 11 | `og:title` dan `og:description` diisi per halaman | 🟢 / 🟡 / 🔴 |  |
| 12 | Twitter card metadata (`twitter:card` `summary_large_image`) | 🟢 / 🟡 / 🔴 |  |
| 13 | Favicon 32×32 dan 192×192 ada | 🟢 / 🟡 / 🔴 |  |

## Analytics & forms

| # | Item | Status | Catatan |
|---|---|---|---|
| 14 | Analytics terpasang ({analytics_provider}) dan firing di production | 🟢 / 🟡 / 🔴 |  |
| 15 | Form kontak terkirim ke email pemilik (test submit nyata) | 🟢 / 🟡 / 🔴 |  |
| 16 | Tombol CTA mengarah ke URL yang benar (cek tiap tombol) | 🟢 / 🟡 / 🔴 |  |
| 17 | WhatsApp CTA pakai nomor `+62...` dengan format `wa.me/` benar | 🟢 / 🟡 / 🔴 |  |

## Legal & policy

| # | Item | Status | Catatan |
|---|---|---|---|
| 18 | Halaman Privacy Policy ada dan tertaut di footer | 🟢 / 🟡 / 🔴 |  |
| 19 | Halaman Terms / Syarat ada kalau ada e-commerce atau subscription | 🟢 / 🟡 / 🔴 |  |
| 20 | Kontak pemilik (email atau alamat) tertulis di halaman Contact | 🟢 / 🟡 / 🔴 |  |

## Performance & accessibility

| # | Item | Status | Catatan |
|---|---|---|---|
| 21 | Lighthouse score Performance ≥ 80 (mobile) | 🟢 / 🟡 / 🔴 |  |
| 22 | Gambar pakai `loading="lazy"` di bawah fold | 🟢 / 🟡 / 🔴 |  |
| 23 | Kontras teks ≥ 4.5:1 untuk body, ≥ 3:1 untuk heading | 🟢 / 🟡 / 🔴 |  |
| 24 | Tap target minimum 44×44 px di mobile | 🟢 / 🟡 / 🔴 |  |

## Blocker summary

Item yang masih 🔴: {list_blocker_items_or_none}
Item yang masih 🟡 dan akan dikejar setelah launch: {list_amber_items_or_none}

## Sign-off

- [ ] Semua item 🔴 sudah jadi 🟢 sebelum promote ke production.
- [ ] Item 🟡 punya catatan tindak lanjut dan owner.
- [ ] Pemilik site sudah review checklist ini.

Tanda tangan: {owner_name}, {check_date}
```

Aturan praktis: kalau ada satu item 🔴, jangan promote. Kalau ada banyak 🟡, putuskan mana yang harus jadi 🟢 dulu — list 24 ini bukan untuk dikejar sekaligus.

## Tone guide

- Bahasa Indonesia, kamu form.
- Status: pakai tepat 3 level. Jangan tambah "🟢 dengan catatan" — itu sama dengan 🟡.
- Catatan kolom: kalimat pendek tindakan, bukan deskripsi masalah. "DNS record CNAME masih menunjuk ke server lama, pindahkan ke Vercel" bukan "DNS belum benar".
- Blocker summary: sebut nomor item dan kondisi konkret, jangan rangkuman umum.
- Sign-off: nama dan tanggal, tidak inisial. Audit trail butuh konteks lengkap.
- Zero exclamation marks.
