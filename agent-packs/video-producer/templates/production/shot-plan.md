# Template — Shoot plan (full production)

Full shoot plan untuk multi-lokasi atau multi-hari. Bukan checklist gear, tapi **runbook produksi** — lokasi, urutan shoot, crew, jadwal per hari, dan kontinjensi kalau ada yang gagal di lapangan.

---

## Variables

- `{project_name}` — internal label
- `{shoot_window}` — rentang tanggal (mis. "2026-06-03 sampai 2026-06-05")
- `{director}` — kamu atau nama
- `{producer}` — penanggung jawab logistik di lapangan
- `{location_count}` — jumlah lokasi
- `{day_count}` — total hari shoot

---

## Template

```
SHOOT PLAN — {project_name}
Window: {shoot_window} ({day_count} hari)
Director: {director}
Producer: {producer}
Locations: {location_count}

────────────────────────────────────────
LOCATIONS
────────────────────────────────────────
LOC-1: <nama lokasi>
  Address: <alamat singkat, atau pin gmaps>
  Access: <permit, jam buka, contact person, password parkir>
  Power: <colokan tersedia / butuh genset>
  Lighting: <natural / butuh kontrol / golden hour windows>
  Sound: <ruang quiet / butuh blanket / risk noise>
  Scenes shot here: <list scene id>

LOC-2: <ulang struktur LOC-1>
LOC-3: <ulang struktur LOC-1>

────────────────────────────────────────
SHOOT ORDER (cross-location optimization)
────────────────────────────────────────
Logic: <kenapa urutan ini — biasanya untuk minimize travel, atau ngejar light>

DAY 1   {shoot_window day 1}
  06:00  Crew call + breakfast      @ {producer}'s base
  07:00  Travel to LOC-1
  07:30  Setup LOC-1                — gear unload, light test
  08:00  Scene 1 (wide + medium)    — golden hour window
  09:30  Scene 2 (interior)         — switch to indoor light
  11:00  Scene 3 (B-roll batch)     — environment, hands, details
  12:00  Lunch break
  13:00  Wrap LOC-1, travel LOC-2
  14:00  Setup LOC-2
  14:30  Scene 4
  16:00  Scene 5
  17:30  Wrap day 1
  18:00  Backup all cards → 2× drives, log on tracker

DAY 2   {shoot_window day 2}
  [ulang struktur DAY 1]

────────────────────────────────────────
GEAR LIST
────────────────────────────────────────
Camera & lenses
- <body 1 + lens kit>
- <body 2 backup (kalau ada)>
- Memory cards: <jumlah + capacity>
- Batteries: <jumlah + charger>

Audio
- <shotgun / lav / handheld>
- Recorder: <model>
- Wind protection: <deadcat, blimp>
- Headphone monitor

Lighting
- <key, fill, rim setup>
- Modifiers: <softbox, bounce, diffusion>
- Stands + sandbags
- Power: <extension, gaffer tape, power strip>

Support
- Tripod / monopod
- Gimbal (kalau pakai)
- Slider / dolly (kalau pakai)
- Backup HD untuk on-set offload

Misc
- Talent release forms
- Location permit copy
- Continuity reference (lookbook, mood board)
- First aid kit
- Snacks + water

────────────────────────────────────────
CREW
────────────────────────────────────────
| Role            | Name      | Contact         | Call time | Wrap time |
|-----------------|-----------|-----------------|-----------|-----------|
| Director        | {director}|                 |           |           |
| Producer        | {producer}|                 |           |           |
| DP / Camera op  |           |                 |           |           |
| Sound op        |           |                 |           |           |
| Talent 1        |           |                 |           |           |
| Talent 2        |           |                 |           |           |
| PA              |           |                 |           |           |

────────────────────────────────────────
CONTINGENCIES
────────────────────────────────────────
Rain at outdoor location
  → Move to {indoor backup location} OR reshoot day {N}
  → Trigger: forecast >70% precip 12h before call time

Talent late / no-show
  → Producer calls 30 min sebelum call time
  → Backup: shoot B-roll first, hold talent scenes sampai mereka tiba
  → No-show >2 hours: reschedule, document for invoice adjustment

Gear failure
  → Camera body: switch to backup body, log timestamp
  → Audio recorder: scratch track dari camera mic, plan ADR if needed
  → Light: shoot under available light + flag in continuity log

Location lost (permit revoked, owner cancels)
  → Backup location pre-scouted: <name, contact>
  → Reshoot affected scenes day {N}

Card / data loss
  → 2× backup mandatory before wrap each day
  → If 1 card corrupt: salvage attempt + reshoot affected scenes
  → If both lost: full reshoot of that day

────────────────────────────────────────
WRAP CHECKLIST (each day)
────────────────────────────────────────
- [ ] All cards offloaded to 2 drives
- [ ] Continuity log updated (what shot, where, take number)
- [ ] Gear inventory check (nothing left on location)
- [ ] Location restored (props moved, trash cleared)
- [ ] Talent release forms signed
- [ ] Producer logs costs (fuel, food, talent fee, location fee)
- [ ] Next day call time confirmed via group chat
```

---

## Tone guide

- Shoot plan adalah **dokumen lapangan**, bukan dokumen rapat. Hari shoot, kamu baca ini sambil grogi. Tulis biar mudah baca dalam 10 detik per section.
- Urutan shoot **bukan urutan skrip**. Urutkan berdasarkan lokasi, light, talent availability — bukan urutan cerita.
- Gear list: kalau ragu bawa atau nggak, **bawa**. Tapi gear list jangan jadi alasan over-produce — lihat skrip dulu, baru gear.
- Contingency wajib ada minimal 4: cuaca, talent, gear, lokasi. Kalau cuma "yaudah liat besok," shoot plan-nya belum siap.
- Producer-actor-director boleh sama orang di production kecil. Tapi role-nya tetap dipisah di plan — pemikiran beda.
- Producer's-eye discipline: kalau gear list dan crew lebih panjang dari skrip, balikin dulu ke skrip. Cerita dulu, produksi belakangan.
- Banned: `basically`, `just`, `literally`, `honestly`, `kind of`, `pretty much`, `revolutionary`, `disrupt`, `10x`, `game-changer`, `next-level`.
- Zero exclamation mark di notes lapangan.
