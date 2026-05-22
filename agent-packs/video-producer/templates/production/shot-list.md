# Template — Shot list

Shot list sortable per scene. Format grid biar kamu bisa filter cepet — by scene, by shot type, atau by location. Bukan list shot keren, tapi list shot yang ada **alasan ceritanya**.

---

## Variables

- `{project_name}` — internal label
- `{script_ref}` — link / filename ke skrip (short-form, long-form, atau voiceover)
- `{shoot_date}` — tanggal shoot
- `{camera_kit}` — kamera utama + lensa rentang (mis. "Sony A7IV + 24-70mm + 50mm prime")
- `{aspect_ratio}` — 9:16 vertical, 16:9 horizontal, 1:1 square

---

## Template

```
SHOT LIST — {project_name}
Script: {script_ref}
Date: {shoot_date}
Kit: {camera_kit}
Aspect: {aspect_ratio}

────────────────────────────────────────────────────────────────────────────────
| # | Scene | Shot type | Camera move | Duration | Subject + action | Notes  |
────────────────────────────────────────────────────────────────────────────────
| 1 | <scene name>  | Wide       | Static       | 3s   | <subject doing X>      | <lighting, props, hint>          |
| 2 | <scene name>  | Medium     | Slow push    | 2s   | <subject hands close>  | <focus point, lens>              |
| 3 | <scene name>  | Close-up   | Static       | 1.5s | <face reaction>        | <eyeline, expression cue>        |
| 4 | <scene name>  | Insert     | Macro static | 1s   | <product detail>       | <reflection / texture note>      |
| 5 | <scene name>  | Wide       | Handheld dolly | 4s | <subject walks frame> | <speed, foot path on floor>      |
| 6 | <scene name>  | Medium     | Pan L→R      | 2.5s | <environment reveal>   | <horizon line, anchor object>    |
| 7 | <scene name>  | Close-up   | Tilt down    | 2s   | <hand → object>        | <continuity with shot 4>         |
| 8 | <scene name>  | Insert     | Static       | 1s   | <typing, writing>      | <screen content if visible>      |
────────────────────────────────────────────────────────────────────────────────

────────────────────────────────────────
LEGEND — shot type
────────────────────────────────────────
- Wide (WS)         — establish location, full body / full subject
- Medium (MS)       — waist-up, conversational shot
- Close-up (CU)     — face / hands / detail dari subject
- Extreme close-up  — eyes, lips, tiny detail
- Insert            — non-subject detail (product, screen, prop)
- POV               — from subject's eye-line
- Over-the-shoulder — dialog framing

────────────────────────────────────────
LEGEND — camera move
────────────────────────────────────────
- Static            — sticks atau tripod, no movement
- Pan               — horizontal sweep, axis fixed
- Tilt              — vertical sweep, axis fixed
- Push / Pull       — dolly in / out, axis on subject
- Tracking          — camera follows subject parallel
- Handheld          — organic shake, intentional vibe
- Gimbal smooth     — handheld feel, no shake
- Crane / Jib       — vertical rise / descend

────────────────────────────────────────
PRIORITY MARKER (tambahkan di kolom Notes kalau perlu)
────────────────────────────────────────
[MUST]      — kalau ini tidak terambil, scene gagal
[NICE]      — improve quality kalau waktu cukup
[FALLBACK]  — opsi kalau [MUST] gagal eksekusi

────────────────────────────────────────
COVERAGE CHECK (sebelum wrap)
────────────────────────────────────────
- Tiap scene minimal: 1 wide + 1 medium + 1 close-up (3-shot rule)
- B-roll budget: minimum 2× durasi target untuk safety di edit
- Audio: clean room tone 30 detik per lokasi
```

---

## Tone guide

- Shot list **dilayani skrip**, bukan sebaliknya. Kalau ada shot yang nggak melayani beat di skrip, coret. Volume bukan kualitas.
- Setiap baris harus jawab pertanyaan: "Kalau shot ini hilang, scene-nya berubah?" Kalau jawaban "nggak juga," potong.
- 3-shot rule (wide + medium + close-up per scene) adalah **floor**, bukan ceiling. Tambahin insert atau POV cuma kalau bikin narasi lebih tajam.
- Notes column bukan tempat puitis — taroh fakta yang editor butuhin: continuity hint, lens choice, lighting reference.
- [MUST] shots ditandai jelas. Kalau di hari shoot kamu kehabisan waktu, [MUST] yang diselamatkan, [NICE] yang dikorbankan.
- Producer's-eye discipline: kalau shot list lebih sibuk dari ceritanya, balikin dulu ke skrip dan tanya lagi — beat ini butuh shot baru atau cuma estetika?
- Banned: `basically`, `just`, `literally`, `honestly`, `kind of`, `pretty much`, `revolutionary`, `disrupt`, `10x`, `game-changer`, `next-level`.
- Zero exclamation mark di notes.
