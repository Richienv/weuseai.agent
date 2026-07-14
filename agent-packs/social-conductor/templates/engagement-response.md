# Template — Engagement response (comment / DM)

> Dipakai `engagement-log-tracker` saat customer dapat comment atau DM dan butuh reply siap copy-paste. Lima tone variant: helpful, curious, playful, firm, redirect-to-DM. Maksimal 3 baris per variant supaya feel natural di reply chain.

---

## Variables

| Variable | Wajib | Notes |
|---|---|---|
| `{commenter_name}` | tidak | First name kalau ada. Tanpa @ handle |
| `{their_point}` | ya | Inti comment atau DM customer baca dulu sebelum draft |
| `{your_position}` | ya | Sikap kamu — agree / clarify / decline / redirect |
| `{detail}` | tidak | Optional, satu detail spesifik yang ngebantu reply jadi tidak generic |

---

## Template

### Variant 1 — Helpful (default untuk pertanyaan teknis atau how-to)

**Kapan dipakai:** komen tanya cara kerja, minta clarification, atau butuh resource pointer.

```
{commenter_name}, {detail_specific_to_question}.

Coba {actionable_step_or_resource}. Kalau masih stuck, kasih tahu di sini atau DM.
```

Contoh terisi:
```
Rini, voice profile butuh minimum 20 sample writing — bukan post jadi, tapi draft mentah yang biasa kamu tulis.

Coba kumpulin caption lama dari 3 bulan terakhir dulu. Kalau kurang dari 20, kita extend ke DM lama atau email draft.
```

---

### Variant 2 — Curious (default untuk komen yang menawarkan POV berbeda)

**Kapan dipakai:** komen yang challenge ide kamu dengan argumen, atau commenter share pengalaman beda.

```
Ini menarik — {part_kamu_setuju_atau_butuh_dalami}.

Penasaran, {clarifying_question}?
```

Contoh terisi:
```
Ini menarik — pengalaman kamu di brand FMCG memang beda dengan agency kecil.

Penasaran, di skala 50+ tim, voice locker masih dijaga via single profile atau ada split per sub-brand?
```

---

### Variant 3 — Playful (default untuk komen positive atau audience reguler)

**Kapan dipakai:** komen apresiatif, joke ringan, atau audience yang sudah engage berulang. Pakai hemat — jangan playful ke komen serius.

```
Wah, {acknowledge_their_point_with_warmth}.

{follow_up_observation_atau_question}.
```

Contoh terisi:
```
Wah, "voice drift" itu istilah yang pas. Aku curi ya untuk thread berikutnya.

Kamu pernah lihat drift terjadi pelan-pelan atau biasanya muncul tiba-tiba setelah tim baru masuk?
```

---

### Variant 4 — Firm (default untuk pushback yang butuh standing-ground)

**Kapan dipakai:** komen yang misinterpret post kamu, atau argue dengan asumsi salah. Bukan untuk trolls — escalate trolls per case ke customer.

```
{commenter_name}, beda dari yang kamu baca — {clarify_actual_position}.

{specific_evidence_or_reframe}. Mau dilanjut, atau cukup di sini?
```

Contoh terisi:
```
Adit, beda dari yang kamu baca — voice locker bukan template caption.

Locker adalah profile yang kunci pola: register, sentence length, signature phrase. Template berlaku per post; locker berlaku per brand. Mau dilanjut, atau cukup di sini?
```

---

### Variant 5 — Redirect to DM (default untuk komen sensitif atau perlu detail panjang)

**Kapan dipakai:** komen yang minta pricing, butuh detail klien spesifik, complain yang sensitif, atau detail teknis panjang yang tidak cocok di komen publik.

```
Bagian ini lebih enak di-DM, {commenter_name} — {brief_reason}.

Aku follow up via DM ya, atau kamu DM duluan kalau mau.
```

Contoh terisi:
```
Bagian ini lebih enak di-DM, Rini — pricing tergantung scope dan ukuran tim kamu.

Aku follow up via DM ya, atau kamu DM duluan kalau mau.
```

---

## Tone guide — Response

- **3 baris max per variant:** kalau butuh lebih panjang, redirect ke DM (variant 5)
- **Semua variant kalimat pertama berbeda:** helpful opens dengan nama + clarification. Curious opens dengan "Ini menarik". Playful opens dengan "Wah" + acknowledge. Firm opens dengan nama + correction. Redirect opens dengan "Bagian ini lebih enak di-DM"
- **`kamu` konsisten:** tidak switch ke "kalian" / "Anda" / "lo"
- **Zero exclamation marks** di semua variant
- **Banned di reply:** "Hi kak", "Wahaha", "LOL", "Btw", "Anyway" — feel filler atau over-casual
- **Jangan auto-defensive:** firm variant tetap kalem, factual. Bukan emosi balik
- **Playful pakai hemat:** kalau commenter serius atau topic sensitif, default ke helpful atau curious. Playful disalahgunakan = brand feel tidak respect
- **Redirect ke DM bukan dismissal:** kasih alasan singkat kenapa DM lebih cocok (pricing, detail klien, sensitivity). Bukan brush-off
- **Hindari emoji di reply kecuali voice profile zero-emoji = no:** kalau profile boleh emoji, max 1 di variant playful saja. Variant lain default zero
- **Trolls + political:** tidak ada variant untuk ini. Default: escalate per case ke customer, jangan auto-draft

---

## Validation rules (skill-side)

- Variant yang dipilih harus match konteks. Helpful ke komen pricing → redirect ke DM. Playful ke komen complaint → switch ke firm atau curious
- Tiap reply ≤3 baris. Lebih dari itu, force redirect ke DM
- Kalau commenter pakai @handle ke akun lain, jangan tag balik kecuali commenter eksplisit tag — risiko pull-in pihak ketiga
- Skor voice-fit reply ke locked voice profile sebelum kirim. Reply skor low = re-draft, jangan kirim apa adanya
