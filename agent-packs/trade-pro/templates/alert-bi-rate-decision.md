# Template — Alert Bank Indonesia rate decision (RDG bulanan)

Alert dan framing template untuk keputusan suku bunga Bank Indonesia. Rapat Dewan Gubernur (RDG) BI biasanya digelar bulanan, dengan keputusan utama: BI 7-Day Reverse Repo Rate (BI-7DRR). Pakai template ini untuk pre-decision watchlist + post-decision recap yang bisa kamu pantau implikasinya ke equity, bond, dan IDR-pair posisi yang kamu pegang.

> **NOTE: BUKAN SARAN INVESTASI.** Template ini adalah kerangka analitis. Trade Pro tidak menempatkan trade, tidak memindahkan dana, dan tidak menjamin hasil. Keputusan dan eksekusi tetap di customer + broker masing-masing.

## Variables

- `{{rdg_date}}` — string, tanggal RDG dalam WIB (mis. "Rabu-Kamis, 21-22 Mei 2026")
- `{{decision_type}}` — string, jenis keputusan. "HOLD" / "HIKE — naik X bps" / "CUT — turun X bps". Kalau ini pre-decision template, isi "ALERT — pre-decision, market expectation: <hold/hike/cut>"
- `{{bi_7drr_level}}` — string, level BI-7DRR setelah keputusan. Kalau pre-decision, isi level saat ini + ekspektasi pasar (mis. "Saat ini 6.00%, ekspektasi konsensus hold di 6.00%"). Cek di bi.go.id menu "Suku Bunga Acuan"
- `{{deposit_facility_rate}}` — string, Deposit Facility rate (biasanya BI-7DRR - 100 bps)
- `{{lending_facility_rate}}` — string, Lending Facility rate (biasanya BI-7DRR + 100 bps)
- `{{rationale_summary}}` — string, 2-3 kalimat ringkasan rasional BI dari rilis resmi. Kalau pre-decision, ringkas faktor yang BI tracking (inflasi, IDR, capital flow, growth)
- `{{fed_spread_context}}` — string, konteks spread BI rate vs Fed Funds Rate. Mempengaruhi capital flow ke IDR-denominated asset. (Mis. "Fed di range 4.25-4.50%, BI di 6.00%, spread ~150-175 bps")
- `{{idr_implication}}` — string, framing implikasi keputusan ke IDR/USD pair (mis. "BI hold dengan dovish tone → IDR cenderung lemah di sesi Asia berikutnya kalau Fed tone hawkish")
- `{{equity_implication}}` — string, framing implikasi ke IHSG dan sektor sensitif rate (perbankan, properti, consumer rate-sensitive)
- `{{bond_implication}}` — string, framing implikasi ke SBN (Surat Berharga Negara) yield curve
- `{{watchlist_position_actions}}` — markdown bullet list, pertanyaan checklist untuk posisi yang kamu pegang. Bukan instruksi trade — pertanyaan yang harus kamu jawab sendiri (mis. "Posisi perbankan: thesis masih valid kalau rate turun 25 bps?")

## Template

# Alert RDG BI — {{rdg_date}}

**Keputusan:** {{decision_type}}

## Level rate

| Rate | Level |
|------|-------|
| BI 7-Day Reverse Repo Rate (BI-7DRR) | {{bi_7drr_level}} |
| Deposit Facility | {{deposit_facility_rate}} |
| Lending Facility | {{lending_facility_rate}} |

## Rasional BI

{{rationale_summary}}

## Konteks spread Fed

{{fed_spread_context}}

> Spread BI vs Fed adalah salah satu faktor utama yang mempengaruhi flow ke IDR-denominated asset. Spread menyempit (BI cut atau Fed hike) → tekanan ke IDR. Spread melebar → daya tarik carry trade ke IDR.

## Framing implikasi (bukan rekomendasi)

### IDR / USD

{{idr_implication}}

### Equity (IHSG + sektor rate-sensitif)

{{equity_implication}}

### Bond (SBN)

{{bond_implication}}

## Pertanyaan untuk posisi kamu

{{watchlist_position_actions}}

---

### Cara baca rilis BI

- **Rilis resmi:** bi.go.id, menu "Publikasi" → "Siaran Pers" pada hari RDG. Versi lengkap biasanya keluar 1-2 jam setelah penutupan rapat.
- **Press conference:** Gubernur BI biasanya konferensi pers pukul 14:00-15:00 WIB pada hari kedua RDG. Live di YouTube channel Bank Indonesia.
- **Catatan rapat:** notula RDG (Minutes of Meeting) di-publish beberapa minggu kemudian — granular insight ke voting dynamics + concern Dewan Gubernur.

### Konteks regulator + sumber

- **Bank Indonesia (BI)** — bank sentral. Mandat: stabilitas Rupiah (nilai tukar + inflasi) per UU No. 23/1999 tentang BI (sebagaimana telah diubah). Kebijakan suku bunga adalah instrumen utama.
- **OJK** — pengatur sektor keuangan (perbankan, pasar modal, asuransi). Kebijakan BI mempengaruhi cost of funds bank yang diatur OJK.
- **Kemenkeu / DJPPR** — penerbit SBN. Yield curve SBN merespons BI rate.

### Disiplin pakai alert ini

- Template ini bukan signal trade. Tidak ada "BI hike → short IHSG". Trade Pro surface keputusan + framing; kamu yang putuskan apakah thesis posisi kamu masih valid.
- Hold sebelum rilis kalau posisi sensitif. Volatility di 5-10 menit setelah press release biasanya tinggi; spread bid-ask melebar di market maker.
- Hindari over-react ke single decision. RDG bulanan, dan arah kebijakan biasanya signal-nya berlapis (forward guidance > satu keputusan).

### Catatan akhir

Trade Pro tidak menempatkan order berdasarkan keputusan BI, tidak mengakses akun broker kamu, dan tidak menjamin reaksi pasar sesuai framing di atas. Pasar adalah fungsi banyak variabel — BI rate hanya satu input. Eksekusi 100% di sisi kamu.

## Tone guide

Sober, analitis, central-bank-aware. Tidak ada "BI hike → IHSG pasti turun, jual sekarang" — itu rekomendasi + over-confidence di hubungan kompleks. Bahasa "framing" dan "implikasi" eksplisit menggunakan kata "cenderung" / "biasanya" / "tergantung konteks lainnya" — bukan kepastian. Pertanyaan untuk customer ditulis sebagai pertanyaan terbuka, bukan instruksi.
