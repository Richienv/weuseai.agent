# Template — Engagement reply comment Bahasa (TikTok / IG Indonesia)

> Dipakai `engagement-log-tracker` saat reply ke comment di TikTok / IG akun Indonesia. Bahasa Indonesia first. Tiga register variant: super-casual ("Makasih ya kak"), professional-friendly ("Terima kasih atas masukan kamu"), defusing-criticism ("Saya ngerti maksudmu, mari saya jelaskan"). Pilih register sesuai post + komen + audience.

---

## Variables

| Variable | Wajib | Notes |
|---|---|---|
| `{commenter_name}` | tidak | First name kalau ada di profile. Tanpa @ handle |
| `{their_comment}` | ya | Quote singkat dari komen mereka, untuk acknowledge specific |
| `{response_substance}` | ya | Inti balasan kamu — info, apresiasi, klarifikasi |
| `{register}` | ya | `super_casual` / `professional_friendly` / `defusing_criticism` |
| `{platform}` | ya | `tiktok` / `instagram` — affect register default (TikTok lean casual) |

---

## Template

### Variant 1 — Super-casual (TikTok / IG audience anak muda, komen positif)

```
{opening_warmth}, {commenter_name}.

{response_substance_line_1}.

{closing_warmth_optional}.
```

**Kapan dipakai:**
- Komen apresiatif singkat ("keren banget", "berguna nih", "save dulu")
- Audience anak muda Indonesia (TikTok dominan, IG reels)
- Topik ringan / lifestyle / entertainment

**Opening warmth options:** "Makasih ya", "Wah seneng denger ini", "Eh terima kasih", "Hahaha bener banget"
**Closing warmth options:** "Semangat ya", "Stay tuned ya", "Cek video berikutnya kak", "Save aja kalau berguna"

### Variant 2 — Professional-friendly (LinkedIn / IG audience profesional, komen substantif)

```
Terima kasih, {commenter_name}. {acknowledge_their_point}.

{response_substance_paragraph}.

{invitation_to_continue_optional}.
```

**Kapan dipakai:**
- Komen substantif yang share pengalaman atau pertanyaan thoughtful
- Audience profesional Indonesia (LinkedIn, IG B2B)
- Topik bisnis / kepemimpinan / industry insight

**Acknowledge options:** "Pengamatan kamu menarik", "Pertanyaan kamu valid", "Saya sependapat dengan poin ini", "Konteks yang kamu sebut penting"

### Variant 3 — Defusing-criticism (semua platform, komen kritik / pushback / misunderstanding)

```
{empathy_acknowledgment}, {commenter_name}.

{clarification_or_position_paragraph}.

{invitation_to_continue_dialogue}.
```

**Kapan dipakai:**
- Komen kritik yang sah (bukan troll) — audience misunderstand atau punya pengalaman berbeda
- Pushback yang butuh klarifikasi tanpa eskalasi
- Komen complaint yang butuh handled publicly (bukan auto-redirect ke DM)

**Empathy acknowledgment options:**
- "Saya ngerti maksudmu" (defuse tension)
- "Poin kamu valid" (validate first)
- "Masuk akal kalau kamu lihatnya dari sudut itu" (perspective-taking)
- "Terima kasih udah berani share concern ini" (appreciate the input)

**Invitation to continue:**
- "Kalau ada konteks lain yang aku belum tangkep, kasih tahu ya"
- "Aku open untuk lanjut diskusi kalau masih ada yang kurang clear"
- "Boleh kita lanjut di DM kalau perlu detail lebih"

---

## Contoh terisi

### Variant 1 — Super-casual

**Konteks:** TikTok food review, komen "wah jadi pengen cobain"

```
Makasih ya, kak.

Wartegnya buka jam 9 pagi sampe 9 malam, lokasi Tebet Timur. Cobain sambel terasinya, paling juara.

Stay tuned ya, minggu depan review tempat baru lagi.
```

### Variant 2 — Professional-friendly

**Konteks:** LinkedIn post tentang strategi marketing UMKM, komen pertanyaan substantif tentang channel mix

```
Terima kasih, Rini. Pengamatan kamu menarik — channel mix memang sangat tergantung product category dan margin structure.

Untuk UMKM dengan margin 25-35%, biasanya kombinasi WhatsApp Business (organic) + Instagram organic + paid TikTok Shop yang paling sustainable. Paid Meta ads jadi pilihan kalau LTV pelanggan sudah teruji, biasanya setelah 6 bulan operasi.

Boleh kita lanjut diskusi kalau ada konteks spesifik di industri kamu.
```

### Variant 3 — Defusing-criticism

**Konteks:** IG post tentang strategi konten, komen pushback "aduh saran ini ga work buat semua brand, sok tau"

```
Saya ngerti maksudmu, kak. Memang setiap brand punya konteks beda — yang work di FMCG belum tentu cocok di B2B services.

Saran di post ini lebih relevan buat brand consumer dengan audience aktif di IG. Buat B2B atau niche brand, framework-nya beda. Lain kali aku akan tambah konteks di hook supaya scope lebih jelas.

Kalau ada konteks brand kamu yang spesifik, boleh share — aku belajar juga dari case kamu.
```

---

## Reference packet — register cues untuk pilih variant

### Sinyal komen → register decision

| Sinyal komen | Register pilihan | Alasan |
|---|---|---|
| "wah keren", "save dulu", "berguna" | super-casual | apresiatif singkat — warmth lebih penting dari substansi |
| Pertanyaan teknis substantif | professional-friendly | butuh jawab serius tapi welcoming |
| "menurut saya", "pengalaman saya" + thoughtful | professional-friendly | substantive engagement deserves substantive reply |
| Kritik dengan argumen valid | defusing-criticism | acknowledge first, klarifikasi second |
| "sok tau", "gak setuju", emotional pushback | defusing-criticism | de-escalate dengan empathy, bukan defend |
| Pertanyaan pricing / personal detail | redirect-to-DM (lihat `engagement-response.md`) | bukan template ini — pakai variant 5 di engagement-response.md |
| Troll, harassment, off-topic | jangan auto-reply — escalate ke customer | template ini tidak handle troll |

### Platform default register

- **TikTok:** default super-casual (audience expect conversational). Switch ke professional-friendly kalau komen substantif
- **Instagram feed:** default professional-friendly. Switch ke super-casual untuk reels atau audience anak muda
- **LinkedIn:** default professional-friendly. Super-casual jarang cocok (off-tone untuk LinkedIn-id)

### Sapaan Indonesia per audience

| Audience | Sapaan default | Notes |
|---|---|---|
| Audience umum, mixed-age | "kak" | netral, work cross-gender |
| Audience profesional | first name (Rini, Andi) | bukan "Bapak / Ibu" (terlalu formal) |
| Audience akademik / senior | "Mbak / Mas" + first name | sopan tanpa kaku |
| Audience anak muda TikTok | "kak" / "min" / no sapaan | casual register |

---

## Tone guide — reply Indonesia

- **Bahasa Indonesia first:** semua variant default BI. English mixing terbatas untuk technical term yang umum
- **Sapaan tergantung audience:** "kak" default casual, first name default profesional, "Mbak/Mas" untuk audience senior
- **Acknowledge specific:** quote singkat atau referensi ke poin commenter — bukan generic "thanks"
- **Hindari over-defensive:** variant 3 (defusing) tetap kalem, factual. Bukan emosi balik
- **Hindari fake-positivity:** "Wahaha betul banget" terus-menerus = robotic. Variasi opening warmth
- **Reply ≤3 baris:** kalau butuh panjang, redirect ke DM (pakai `engagement-response.md` variant 5)
- **Zero exclamation marks** di semua variant — calm-premium register
- **Trolls + political:** tidak ada variant. Default: escalate per case, jangan auto-draft

---

## BANNED di reply Indonesia (jangan pakai sama sekali)

- `basically`, `just`, `literally`, `honestly`, `kind of`, `pretty much`, `revolutionary`, `disrupt`, `10x`, `game-changer`, `next-level`
- Exclamation marks (zero, termasuk variant super-casual)
- "Hi guys", "Hi everyone" (impersonal, off-tone)
- "LOL", "Wahaha", "Hehe" berlebih (filler, terbaca robotic)
- "Anyway", "Btw", "FYI" (filler English shortcut)
- "Anda" untuk audience individual (kaku — pakai "kamu")
- "Lo / Gue" untuk audience profesional (kasual)
- Auto-defensive ke kritik ("Maksudnya gimana? Coba dijelasin yang lebih spesifik dong")
- Sarcasm / passive-aggressive di defusing variant

---

## Validation rules (skill-side)

- Register harus match komen + platform default (auto-flag mismatch)
- Reply ≤3 baris. Lebih dari itu, force redirect ke DM
- Sapaan tergantung audience profile (cek commenter profile sebelum draft)
- Opening warmth wajib variasi (track 10 reply terakhir, hindari repetisi opening)
- Zero exclamation marks (auto-strip)
- Voice-fit score terhadap locked profile sebelum kirim
- Kalau komen detect troll / harassment keyword → escalate, jangan auto-draft
