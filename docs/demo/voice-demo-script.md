# Voice demo script — Voice Starter (Phase B, native Hermes STT)

Status: 2026-06-02. Input-only voice. Customer ngomong, bot transkrip ke
teks, lalu jawab dalam teks plus deliverable. Tidak ada balasan suara (TTS
off this phase).

Value prop: "Ngomong tugas kamu, langsung dapat hasil."

---

## Apa yang sebenarnya jalan (penting sebelum rekam)

Hermes yang pegang koneksi Telegram langsung di VPS customer. Transkripsi
voice (STT) jalan PASIF begitu config `stt.enabled: true` plus `stt.provider`
ada di `~/.hermes/config.yaml`. Customer TIDAK perlu ketik `/voice on` untuk
input — perintah itu cuma untuk balasan suara (TTS), yang kita matikan.

Provider STT default: Groq Whisper (`whisper-large-v3-turbo`). Gratis, cepat,
dan bagus untuk Bahasa Indonesia. Key fleet-wide diset di provisioning env
(`VOICE_STT_GROQ_KEY`). Kalau key belum diset, voice config tetap ditulis,
tapi transkripsi belum aktif sampai key ada — chat teks tetap jalan normal.

### Yang Hermes tampilkan secara native (jangan janjikan string custom)

Item-item "demo polish" ini diatur Hermes, bukan kita. Kita tidak bisa ganti
stringnya tanpa fork Hermes (hard lock). Catat apa adanya saat rekam:

- Indikator "sedang dengar" / chat action saat STT jalan: native Hermes.
  Kita tidak inject string "Mendengar..." custom. Rekam apa yang Hermes
  tampilkan apa adanya.
- Echo transkripsi di chat ("I heard: ..."): perilaku native Hermes. Kalau
  Hermes menampilkannya, bagus untuk demo. Kalau tidak, kita tidak bisa
  tambah tanpa fork. Jangan janji teks konfirmasi custom.
- Pesan saat STT gagal: native Hermes. Kita tidak bisa atur kalimat persis
  seperti "Maaf suara kamu kurang jelas, tolong ketik aja". Verifikasi
  perilaku gagal native saat rekam, jangan over-promise.

Cost tracking per-customer: belum feasible. Hermes panggil provider STT
secara internal pakai fleet key kita, jadi pemakaian per-customer tidak
kelihatan di stack kita. Yang ada: total agregat di dashboard provider
(console.groq.com). Konstanta rate untuk estimasi nanti ada di
`services/provisioning/src/voice-rates.ts`. Jangan tampilkan angka
per-customer palsu di demo.

---

## Langkah founder (yang harus direkam)

Target durasi rekaman: ~45 detik dari voice pertama sampai PDF jadi.

1. Pastikan `VOICE_STT_GROQ_KEY` sudah diset di provisioning service (Fly
   secret). Tanpa ini STT belum aktif.
2. Provision satu customer test Voice Starter lewat
   `/admin/manual-provision`. Pilih tier Voice Starter, isi bot token test,
   tunggu sampai bot kirim halo "Setup beres".
3. (Kalau perlu) buka bot di Telegram, ketik `/start` sekali untuk sapaan
   kontak pertama. Untuk INPUT voice, `/voice on` tidak diperlukan — STT
   sudah pasif. Hanya ketik `/voice on` kalau kamu mau test balasan suara
   (di luar scope demo input-only).
4. Mulai rekam layar Telegram.

### Alur demo (sample command dari consult)

1. Founder kirim voice memo: "Buatin invoice untuk klien aku."
2. Bot transkrip (native STT) lalu balas dalam TEKS, minta detail —
   misalnya nama klien, item, jumlah, jatuh tempo.
3. Founder jawab detailnya lewat voice memo lagi: "Klien PT Maju Jaya, jasa
   desain, lima juta rupiah, jatuh tempo akhir bulan."
4. Bot transkrip, susun invoice, lalu kirim PDF invoice ke chat.
5. Selesai. Tutup rekaman saat PDF muncul.

Catatan: deliverable PDF datang dari persona Doc Expert / The Pro yang sudah
ada di Voice Starter (3 persona: the-pro, doc-expert, slide-master). Voice
cuma jalur input — pipeline pembuatan dokumen tidak berubah.

---

## Checklist pra-rekam

- [ ] `VOICE_STT_GROQ_KEY` terisi di provisioning env.
- [ ] Customer test Voice Starter sudah running (halo terkirim).
- [ ] Bot sudah paired (ketik `/start` jika bot belum pernah disapa).
- [ ] Mic HP bersih, ruangan tidak berisik (STT lebih akurat).
- [ ] Siap dua voice memo: perintah awal plus detail.
- [ ] Catat string native Hermes apa adanya (indikator, echo, pesan gagal) —
      jangan edit jadi string yang tidak kita kontrol.

## Kalau STT tidak transkrip

- Cek `~/.hermes/config.yaml` punya blok `stt:` dengan `enabled: true` dan
  `provider: "groq"`.
- Cek `~/.hermes/.env` punya `GROQ_API_KEY`. Kalau kosong, set
  `VOICE_STT_GROQ_KEY` di provisioning, lalu trigger refresh-env.
- Restart `hermes-gateway` di VPS biar config kebaca ulang.
