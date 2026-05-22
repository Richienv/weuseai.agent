# Template — Exit plan

Rencana exit yang wajib diisi **sebelum** entry — bukan setelah. Tiga jenis exit: profit target, stop-loss, dan time-stop. Plus rencana scaling-out kalau posisi dibagi. Tujuannya supaya keputusan keluar sudah ada di kepala saat market bergerak, bukan diimprovisasi panik.

## Variables

- `{{instrument}}` — string, ticker atau pair
- `{{direction}}` — string, "long" atau "short"
- `{{entry_price}}` — string, harga rencana entry dengan satuan
- `{{stop_loss_price}}` — string, harga stop-loss invalidasi thesis dengan satuan. Wajib di-set, bukan ditunda
- `{{stop_reason}}` — string, alasan stop di harga itu dalam 1 kalimat (mis. "Di bawah support harian 9.700 — thesis breakout batal kalau ditembus")
- `{{target_1_price}}` — string, harga target profit pertama dengan satuan
- `{{target_1_action}}` — string, aksi di target 1 (mis. "Cut 50% posisi, geser stop ke break-even untuk sisanya")
- `{{target_2_price}}` — string, harga target profit kedua (opsional, isi "—" kalau cuma satu target)
- `{{target_2_action}}` — string, aksi di target 2 (opsional, isi "—" kalau tidak dipakai)
- `{{time_stop}}` — string, durasi maksimum posisi dipegang kalau tidak ada gerakan (mis. "5 hari trading", "48 jam"). Time-stop melindungi dari posisi yang stuck dan menyerap kapital tanpa hasil
- `{{scaling_out_plan}}` — markdown bullet list, rencana keluar bertahap kalau posisi akan dibagi (mis. "30% di target 1, 40% di target 2, 30% trailing stop")
- `{{rr_ratio}}` — string, rasio reward-to-risk (mis. "1:2.5", "1:1.8"). Dihitung sebagai jarak ke target_1 dibagi jarak ke stop_loss

## Template

# Exit plan — {{instrument}} ({{direction}})

**Entry rencana:** {{entry_price}}

## Stop-loss

- Harga: **{{stop_loss_price}}**
- Alasan: {{stop_reason}}

## Profit target

- **Target 1:** {{target_1_price}} → {{target_1_action}}
- **Target 2:** {{target_2_price}} → {{target_2_action}}

## Time-stop

Maksimum dipegang: **{{time_stop}}**.

Kalau setelah durasi ini posisi belum mendekati target dan belum kena stop, exit di harga pasar. Posisi yang stuck mengikat kapital + perhatian tanpa membayar.

## Scaling-out

{{scaling_out_plan}}

## Reward / risk

R:R = **{{rr_ratio}}**

---

*Plan ini diisi sebelum entry. Kalau plan belum lengkap, posisi tidak dibuka. Geser stop ke arah loss (loosening) tidak diperbolehkan saat trade berjalan — itu tanda thesis sudah batal, exit dulu.*

## Tone guide

Tegas, pre-commitment. Bahasa menekankan "sebelum entry" dan "tidak diperbolehkan" untuk geser stop ke loss — ini disiplin Trade Pro yang membedakan dari trader yang revise stop saat panik. Setiap target di-tag dengan aksi konkret, bukan cuma harga (mis. "cut 50%, geser stop ke BE" — bukan cuma "TP1"). Time-stop diframe sebagai melindungi kapital + perhatian, bukan sebagai batas waktu arbitrer. Tidak ada "diamond hands", "hodl no matter what", "average down jelek-jeleknya" — Trade Pro respek thesis invalidation.
