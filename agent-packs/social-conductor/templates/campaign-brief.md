# Template — Campaign brief

> Dipakai `campaign-planner` saat customer mulai campaign baru dan butuh single-page brief sebelum plan multi-week disusun. Brief ini ringkas: goal, audience, key message, deliverables, KPI, timeline, budget. Satu halaman maksimum.

---

## Variables

| Variable | Wajib | Notes |
|---|---|---|
| `{campaign_name}` | ya | Nama internal, mis. "Launch Voice Locker v2 — Mei 2026" |
| `{goal}` | ya | Satu kalimat. Outcome konkret, bukan aktivitas |
| `{audience}` | ya | 1-2 kalimat. Siapa target, di mana mereka, apa yang lagi mereka cari |
| `{key_message}` | ya | Pesan tunggal yang harus terpasang di audience. 1 kalimat |
| `{deliverables[]}` | ya | 3-5 item. Tiap item: type × platform × count × due date |
| `{kpis[]}` | ya | 2-4 metric. Tiap metric: name + target value + measurement method |
| `{timeline}` | ya | Start date → end date. Plus milestones internal |
| `{budget}` | tidak | Optional. Kalau ada produksi cost (foto, video, ads), list di sini |
| `{voice_profile_ref}` | ya | Reference ke locked voice profile yang dipakai semua draft |

---

## Template

```
# Campaign brief — {campaign_name}

## Goal
{goal}

## Audience
{audience}

## Key message
{key_message}

## Deliverables
| # | Type | Platform | Count | Due |
|---|---|---|---|---|
| 1 | {type} | {platform} | {count} | {due} |
| 2 | {type} | {platform} | {count} | {due} |
| 3 | {type} | {platform} | {count} | {due} |
| 4 | {type} | {platform} | {count} | {due} |
| 5 | {type} | {platform} | {count} | {due} |

## KPI
| Metric | Target | Cara ukur |
|---|---|---|
| {metric_1} | {target_1} | {method_1} |
| {metric_2} | {target_2} | {method_2} |
| {metric_3} | {target_3} | {method_3} |

## Timeline
- Start: {start_date}
- End: {end_date}
- Milestone:
  - {milestone_1_date} — {milestone_1_label}
  - {milestone_2_date} — {milestone_2_label}

## Budget
{budget_or_none}

## Voice profile
Reference: {voice_profile_ref}

---

## Risks + mitigations
- {risk_1} → {mitigation_1}
- {risk_2} → {mitigation_2}
```

### Contoh terisi

```
# Campaign brief — Launch Voice Locker v2 — Mei 2026

## Goal
50 brand owner Indonesia trial Voice Locker v2 dalam 30 hari setelah launch.

## Audience
Solo brand owner + agency kecil (≤5 orang) di Jakarta, Bandung, Surabaya yang udah posting rutin tapi voice-nya inkonsisten. Mereka follow akun seperti @ngalamcreative, @kontenkita, dan baca thread X tentang branding.

## Key message
Voice brand kamu sudah ada di tulisan lama — Voice Locker ngebantu kunci pola itu jadi standar yang bertahan.

## Deliverables
| # | Type | Platform | Count | Due |
|---|---|---|---|---|
| 1 | Long-form post | LinkedIn | 4 | Sepanjang 4 minggu, satu per Senin |
| 2 | Caption + carousel | Instagram | 8 | 2 per minggu, Selasa + Jumat |
| 3 | Script video pendek | TikTok | 6 | Minggu 2-4, 2 per minggu |
| 4 | Thread | X | 3 | Minggu 1, 2, 4 (Kamis) |
| 5 | Email pengumuman | Newsletter | 2 | Day 1 launch + Day 14 mid-point |

## KPI
| Metric | Target | Cara ukur |
|---|---|---|
| Trial sign-up | 50 dalam 30 hari | Dashboard count, manual log harian |
| Engagement rate post launch | ≥4% across IG + LI | Sum likes + comments / reach per post |
| Voice-fit score average draft | ≥medium di 80% draft | voice-consistency-checker output |
| Save rate IG | ≥3% | IG insight per post, manual log mingguan |

## Timeline
- Start: 15 Mei 2026
- End: 15 Juni 2026
- Milestone:
  - 15 Mei — Tease post pertama (LinkedIn + IG)
  - 22 Mei — Reveal day, launch announcement cross-platform
  - 5 Juni — Mid-point review, adjust kalau KPI off-track
  - 15 Juni — Close, recap post + survey trial users

## Budget
Tidak ada paid ad budget. Produksi konten in-house. Tools yang dipakai: Voice Locker, content-calendar-builder, post-drafter — semua native.

## Voice profile
Reference: voice-profile-v2-locked-2026-05-12.json

---

## Risks + mitigations
- Voice profile belum benar-benar locked sebelum start → block start campaign, lock voice dulu minggu sebelum start
- Mid-point KPI off-track → switch konten ke objection-handling + testimonial, kurangi tease, naikkan reveal density
```

---

## Tone guide — Brief

- **Format:** satu halaman. Kalau brief jadi 2+ halaman, ada konteks yang lebih cocok di doc terpisah (research, persona, mood board)
- **Goal kalimat:** outcome konkret. "50 trial sign-up" bukan "tingkatkan awareness"
- **Audience:** specific. Lokasi + behavior + reference akun yang mereka follow. Bukan demografik umum
- **Key message:** satu kalimat. Kalau butuh dua kalimat, biasanya ada dua message — pecah ke campaign berbeda atau pilih satu
- **Deliverables tabel:** type + platform + count + due. Concrete, bukan "konten berkala"
- **KPI tabel:** metric + target + cara ukur. "Engagement rate ≥4%" bukan "tinggi". Cara ukur eksplisit supaya tidak debate post-campaign
- **Voice:** operational, no marketing fluff. Brief dibaca founder + tim, bukan audience eksternal
- **Punctuation:** zero exclamation marks. Em dash boleh untuk pivot
- **Banned di brief:** "amazing opportunity", "exciting launch", "massive impact" — feel pitch deck, bukan brief kerja
- **Risks section:** wajib ada. Kalau tidak ada risk, brief belum cukup spesifik
