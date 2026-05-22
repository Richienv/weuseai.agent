# Template — Weekly recap

Dipakai Jumat sore atau Minggu malam untuk menutup minggu yang lewat. Audiens: customer sendiri, dipakai untuk reset sebelum minggu baru.

## Variables

- `{{first_name}}` — string, nama panggilan customer
- `{{week_label}}` — string, label minggu (mis. "Minggu 19 — 12-18 Mei 2026")
- `{{done_items}}` — markdown bullet list, hal yang selesai minggu ini (4-7 item idealnya)
- `{{slipped_items}}` — markdown bullet list, hal yang seharusnya selesai tapi tertunda, dengan satu baris alasan singkat per item
- `{{commitment_1}}` — string, komitmen utama minggu depan
- `{{commitment_2}}` — string, komitmen kedua
- `{{commitment_3}}` — string, komitmen ketiga
- `{{drop_item}}` — string, satu hal yang sengaja di-drop minggu depan, dengan alasan singkat
- `{{closing_note}}` — string opsional, satu kalimat observasi tenang soal pola minggu ini (mis. "Tiga dari lima meeting baru jadi setelah Selasa — mungkin Senin masih ruang untuk deep work.")

## Template

# Recap mingguan — {{week_label}}

Halo {{first_name}}, ini ringkasan minggu yang lewat.

## Yang selesai

{{done_items}}

## Yang slip

{{slipped_items}}

## Tiga komitmen minggu depan

1. {{commitment_1}}
2. {{commitment_2}}
3. {{commitment_3}}

## Yang sengaja di-drop

{{drop_item}}

---

{{closing_note}}

## Tone guide

Reflektif tapi tidak menggurui. Akui hal yang slip tanpa menyalahkan — fokus pada apa yang berikutnya, bukan pembenaran. Tiga komitmen ditulis sebagai pernyataan, bukan harapan ("Selesaikan draft proposal Maju" bukan "Coba selesaikan draft"). Drop item ditulis dengan tenang, tanpa rasa bersalah.
