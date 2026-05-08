# Campaign Plan Template

> Reference yang dipakai `campaign-planner`. Phase structure + week-by-week framework.

---

## Standard 4-week campaign structure

### Phase 1 — Tease (Week 1)
**Goal:** Build curiosity, prime audience.
**Cadence:** Reduced — 2-3 posts.
**Content patterns:**
- Hint posts ("something coming next week")
- Behind-scenes ("hint of what I'm building")
- Pain-resonance ("anyone else struggle with [thing]?")

**Engagement triggers:**
- Respond to every "what is it?" / "kapan?" comment
- Save handles dari interaksi tinggi untuk Phase 2 personal ping

**KPI hook:** Track follower growth, comment count baseline.

---

### Phase 2 — Reveal (Week 2)
**Goal:** Announce, demo, drive first action (sign-up, click, message).
**Cadence:** Heavy — daily mixed format.
**Content patterns:**
- Launch announcement (clear, specific CTA)
- Demo / walkthrough video
- Personal story behind product/series
- First testimonial / beta user shoutout

**Engagement triggers:**
- DM yang signal serious interest segera
- Pin top comment dengan FAQ-answer
- Share to story / repost feature jika ada UGC

**KPI hook:** Sign-up / click count daily. Compare to Phase 1 baseline.

---

### Phase 3 — Reinforce (Week 3)
**Goal:** Sustain momentum, address objections, build trust.
**Cadence:** Standard 4-5 posts.
**Content patterns:**
- Customer testimonial / case study
- FAQ-answer compilation (address common objections)
- "Lessons from week 1" reflection (transparency builds trust)
- Behind-scenes update (progress, learnings)

**Engagement triggers:**
- Respond to objection-comment dengan specific data
- Surface UGC ke story kalau ada
- Personal DM ke top engagers

**KPI hook:** Trial-to-paid conversion. Engagement rate per post.

---

### Phase 4 — Close (Week 4)
**Goal:** Drive final action, celebrate, set up next.
**Cadence:** Burst then taper.
**Content patterns:**
- Urgency / window-closing post (kalau time-bound)
- Gratitude post (thank early adopters)
- Recap post (what worked, what's next)
- Bridge to next initiative

**Engagement triggers:**
- DM thank-you ke purchasers
- Public shoutout ke biggest supporters (with permission)

**KPI hook:** Total campaign result vs target. Survey/feedback collection.

---

## Variant patterns

### Product launch (4 weeks default)
Above structure as-is.

### Content series (4-12 weeks)
- Phase 1: Series intro post + first 2 episode tease
- Phase 2-N: Episode releases (1-2 per week)
- Phase Final: Series recap + next-direction tease
**KPI:** Series subscriber count, completion rate.

### Seasonal push (2-4 weeks)
- Phase 1: Seasonal hook (Lebaran, Harbolnas, Year-End)
- Phase 2: Heavy posting during peak (e.g., 9.9, 11.11, 12.12)
- Phase 3: Wind-down + thank-you
**KPI:** Sales spike during event window.

### Brand build (8-12 weeks)
- Long arc, lower intensity
- Theme weeks with consistent formats
- Audience-grow focus, not conversion
**KPI:** Follower quality (engagement rate, niche-fit).

### Audience grow (4-6 weeks)
- High output (daily+)
- Content-led growth: educational anchors, niche-deep posts
- Cross-platform amplification (TikTok → IG → blog)
**KPI:** Net new followers, qualified audience signal (comment quality).

---

## Pre-stage outputs (per campaign)

`campaign-planner` produces:

1. **Calendar entries** — all slots planned, persisted via content-calendar-builder DB
2. **Draft skeletons** — placeholder drafts per slot, voice-fit-checked
3. **Engagement-trigger list** — when to respond to what, e.g., "respond to all 'tertarik' comments within 4h"
4. **KPI logging schema** — what customer manually logs daily during campaign
5. **Risk list** — what could go wrong (e.g., "if Phase 2 launch flat, shift to objection-handling content")

---

## Campaign closing review

After campaign ends, surface:
- KPI achievement vs target
- Best-performing post (per platform)
- Worst-performing post (per platform) + hypothesis why
- Audience growth (net new, churn signal)
- Voice fit average (drift detected during campaign?)
- Recommendation: repeat structure / adjust / abandon for future

---

## Hard limits

- Campaign-planner produces plans + drafts; **does not auto-post**
- KPI hooks rely on customer manual logging — bukan platform API pull
- No paid ad strategy planning (organic only)
- Giveaway / contest campaigns flagged for legal review (UU PDP, kontes regulasi)
