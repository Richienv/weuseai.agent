# Reply Pattern Library

> Reference yang dipakai `engagement-log-tracker` saat draft reply. Pattern per situasi + voice rules.

---

## Pattern: Appreciative

**When:** Generic praise, "nice post", thumbs-up reactions, emoji-only.

**Template (BI):**
- "Makasih udah baca, [first_name]. Senang bisa kepake."
- "Apresiasi banget, [first_name]. Semoga ada yang bisa diaplikasikan."
- "Thanks udah mampir. Kalau ada topik lain yang mau dibahas, kasih tahu."

**Voice rules:**
- Short (1-2 sentence)
- Use first name kalau visible di handle
- Avoid generic "thanks!" with exclamation

---

## Pattern: Clarifying

**When:** Question without enough context. Need follow-up info.

**Template (BI):**
- "Pertanyaan menarik. Bisa kasih tahu konteks lebih: [specific dimension that's missing]?"
- "Aku ingin jawab tepat — [specific dimension] kamu kira-kira gimana?"
- "Sebelum jawab, satu hal yang aku perlu tahu: [dimension]?"

**Voice rules:**
- Acknowledge interest before asking back
- One specific clarifying question (not multi-part)
- Avoid "could you elaborate" (too formal / corporate)

---

## Pattern: Redirect-to-DM

**When:** Sensitive topic, private detail, business inquiry that needs back-and-forth.

**Template (BI):**
- "Ini lebih nyaman kita lanjut di DM. Aku tunggu DM kamu, atau aku bisa DM kamu duluan kalau lebih cepat."
- "Detail-nya lebih panjang dari fit di komen. Aku DM kamu langsung, ya."
- "Karena ada angka spesifik, lebih aman di DM. Mau aku DM kamu atau kamu DM aku duluan?"

**Voice rules:**
- Clear next step (who DMs whom)
- Don't ghost the public comment — show willingness to help
- Avoid "send me an email" (high friction, low response rate)

---

## Pattern: Educational-elaboration

**When:** Question with depth, deserves substantive answer publicly (helps others reading).

**Template (BI):**
- "Pertanyaan bagus. [2-3 sentence answer covering core]. Tapi caveat: [1 nuance]. Mau aku detail lebih di post terpisah?"
- "Topik ini sebenarnya lebih dalem dari yang bisa muat di komen. Singkatnya: [1 sentence summary]. Kalau mau aku breakdown, kasih tahu — bisa jadi konten."

**Voice rules:**
- Provide value, don't just ping back
- Tease deeper content as next post (calendar feeder)
- Cap at ~250 char (longer = redirect to DM or new post)

---

## Pattern: Disagreement (graceful)

**When:** Customer / commenter pushed back on your point. Need to hold ground without escalation.

**Template (BI):**
- "Fair point — di kasus [X] memang bisa beda. Yang aku ngomong tadi lebih cocok untuk [Y context]. Konteks kamu yang mana?"
- "Aku liat ini dari angle [X]. Kamu liatnya dari [Y]. Dua-duanya valid. Mungkin cara cek-nya: [actionable test]."
- "Setuju [partial agreement]. Bagian yang aku tetep yakin: [core point]. Di kasus kamu [variant], pendekatan-nya bisa shift."

**Voice rules:**
- Acknowledge their angle first (no defense-mode)
- Anchor your point with specificity, not abstract opinion
- Avoid "actually..." opener (sounds dismissive)

---

## Pattern: Escalation Flag (no draft)

**When:** Complaint serius, political topic, sensitive personal disclosure, anything customer should personally handle.

**Action:** Status = `escalated`, no `draft_reply`. Surface to customer dengan:

> "Entry ini aku flag escalation:
> - **Source:** [@handle, platform]
> - **Type:** [complaint / political / sensitive]
> - **Reason:** [1-sentence why this needs your personal touch]
> - **Suggestion:** [respond fast / offline / via private channel / not at all]
>
> Aku ngga draft response — kamu yang putuskan."

---

## Pattern: Spam / Skip

**When:** Generic spam, low-quality, duplicate handles posting same thing.

**Action:** Status = `skipped`, no draft. No surface to customer (silent skip).

If customer asks "kenapa ada yang ngga di-draft?", surface skip log:
> "5 entries hari ini aku skip — semua spam-pattern (handle baru tanpa konteks, comment generic, posting same thing di multiple post)."

---

## Pattern: Brand-deal inquiry

**When:** Brand reaches out, business deal vibe.

**Template (BI):**
- "Terima kasih reach out. Detail kerja sama dan rate aku kirim via email. DM aku alamat email yang bisa dipake."
- "Senang ada interest. Aku biasanya handle proposal kerja sama via [email/specific channel]. Boleh tau detail awal-nya?"

**Voice rules:**
- Don't price-quote in public comment
- Move to async channel (email > DM > comment)
- Polite but business-mode

---

## Universal voice rules (all patterns)

Per CLAUDE.md + voice-locker profile:
- BI primary
- `kamu` form
- Zero exclamation in body, max 1 per reply
- Banned words enforced
- Length: 1-3 sentence (comment), longer OK in DM
- Emoji per voice profile policy

---

## Pattern selection logic (skill-side)

`engagement-log-tracker` selects pattern based on entry's:
1. `priority` (high → educational-elaboration or redirect-to-DM)
2. `type` (mention from brand → brand-deal-inquiry)
3. Content sentiment (negative → disagreement-graceful or escalation)
4. Question marks present → clarifying or educational
5. Default: appreciative

Pattern can be manually overridden by customer ("balas ini pakai pattern educational, bukan appreciative").
