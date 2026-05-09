# Deep Researcher

Riset topik kompleks dari ratusan sumber, sintesis jadi laporan siap pakai dengan citation lengkap. Mengejar evidence, bukan opini — setiap claim disandarkan source, setiap gap pengetahuan di-flag terbuka.

**Tier:** Pro, Studio.

---

## Apa yang kamu dapat

- **Deep research synthesis** — minimum 5 sumber primer per topic, prioritas paper akademik, laporan resmi, jurnalistik dengan track record. Aggregator + opinion piece di-tandai berbeda.
- **Citation footnote-style** — setiap claim ada nomor citation, lengkap URL atau DOI. Tidak generalisasi tanpa source.
- **Output structured** — TL;DR di atas, key findings dengan evidence per point, detail sub-section, sources lengkap di akhir.
- **Methodology note** — kalau ada perbedaan paradigma antar source, dia explicitly compare + jelaskan.
- **"[unverified]" tag** — claim yang tidak bisa di-verifikasi dengan source primer di-flag, tidak menyembunyikan ketidakpastian.

---

## Sample tasks

- "Riset adopsi fintech di UMKM Indonesia 2020-2024, fokus pinjaman online dan QRIS" — output 8-12 halaman, 15-25 source.
- "Compare regulatory landscape e-commerce: Indonesia vs Vietnam vs Filipina" — methodology note jelaskan beda framework.
- "Sintesis 12 paper academic ini tentang [topic] jadi 2-halaman executive summary" — paste paper PDF / link, dia compress.

---

## Skill list

| Skill | Tier | Penjelasan |
|---|---|---|
| `deep-research-synthesizer` | Pro+ | Multi-source riset + citation + structured output |
| `paper-summarizer` | Pro+ | Compress 10+ paper jadi exec summary |
| `methodology-comparator` | Pro+ | Bandingkan paradigma antar source / paper |

---

## Output format example

```markdown
# Adopsi Fintech UMKM Indonesia 2020-2024

## TL;DR

UMKM Indonesia adopsi fintech naik 4× dari 2020 (12%) ke 2024 (48%), dengan QRIS jadi
penetration tertinggi (76% UMKM tier-2 ke atas). Pinjaman online masih 23% adopsi karena
trust gap + interest rate yang bervariasi.[1][2]

## Key findings

### 1. QRIS dominan di urban, lambat di rural

Bank Indonesia melaporkan 42jt merchant QRIS terdaftar per Q3 2024.[3] Distribusi heavily
urban — tier-1 adoption 81%, tier-3 + rural 31%.[4]

### 2. Pinjaman online: trust gap signifikan

Survey OJK 2023 nunjukin 67% UMKM aware pinjaman online tapi cuma 23% pernah pakai. Reason
top-3: takut interest tinggi (51%), pengalaman buruk teman (28%), tidak ngerti proses (21%).[5]

[unverified] Anekdot dari beberapa interview pelaku usaha indikasi bunga efektif bisa naik
ke 60-80% pa untuk pinjaman <Rp 5jt — tapi ini belum tervalidasi dengan dataset agregat.[6]

## Sources

[1] Bank Indonesia. "Laporan QRIS Q3 2024." https://bi.go.id/laporan/qris-q3-2024
[2] OJK. "Statistik Fintech Lending 2024." https://ojk.go.id/...
[3] ...
```

---

## Limitasi

- **Bukan instant** — riset kompleks butuh 2-5 menit per round trip ke LLM kamu (multiple search + synthesize). Cost LLM proportional.
- **Source bias inherent** — agent prioritas paper akademik dan official data. Topic dengan source primer minimum (mis. niche industry intel) hasilnya thin.
- **Tidak akses paywall content** — paper akademik di-paywall di-skip kalau tidak ada open-access mirror. Kamu bisa paste full text manual.
- **Phase 1:** web search backend default. Phase 2 akan tambah specialized academic search (Semantic Scholar, Google Scholar).

---

## Kapan switch ke persona lain

- Kalau kamu butuh **artikel atau dokumen panjang siap publish (bukan riset)** → [Doc Expert](./doc-expert.md).
- Kalau kamu butuh **deck slide dari hasil riset** → [Slide Master](./slide-master.md).
- Kalau kamu butuh **briefing harian (current events, bukan deep research)** → [The Pro](./the-pro.md).
