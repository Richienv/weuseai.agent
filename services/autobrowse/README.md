# @weuseai/autobrowse

Autobrowse harness — capture/synthesize/iterate/graduate customer browser interactions into Hermes skills.

> **Founder-side only.** This package runs on your Mac Mini control plane (or any dev machine) for the skill graduation pipeline. It is **never** deployed to a customer VPS — the bundle is too heavy (~150MB Chromium) and skills exit the harness as plain SKILL.md text that Hermes consumes natively.

## License posture

Playwright `^1.49.0` (Apache-2.0). Phase 4 spec originally locked Lightpanda (Q1=A "MIT bundle directly"); Day 1 verification on 2026-05-10 found Lightpanda is AGPL-3.0, not MIT. Switched to Playwright to preserve Q1's intent (free + bundled, no license cost) without the AGPL §13 network-clause propagation risk. See `docs/plans/2026-05-09-phase-4-spec.md` Q1 entry for the full rationale.

## First-run setup

```bash
cd services/autobrowse
npm install            # at monorepo root, installs playwright via workspaces
npm run playwright:install   # one-time Chromium runtime download (~150MB to ~/Library/Caches/ms-playwright)
```

After that, `npm run cli -- --help` from this directory.

## CLI surface (Phase 4-1 v0)

```
autobrowse capture    --site <domain> --skill-slug <id> [--rounds 5]
                      Open Chromium, watch what you do, save trace + DOM
                      snapshots + extracted-data points.

autobrowse synthesize --skill-slug <id>
                      Read all captures for a skill, normalize selectors,
                      parameterize variable inputs, emit a SkillSpec
                      candidate (intermediate JSON).

autobrowse iterate    --skill-slug <id>
                      Replay the candidate against a fresh page; diff
                      the extracted data; flag drift; suggest selector
                      repairs.

autobrowse graduate   --skill-slug <id> --target <agent-pack-slug>
                      Emit SKILL.md + manifest.json patch into
                      agent-packs/<target>/skills/<id>/.
```

## Pipeline overview

```
capture (Playwright tracing.start + DOM snapshots)
  ↓
synthesize (selector ranking + parameterization)
  ↓
iterate (replay + diff + repair, ≥2 rounds)
  ↓
graduate (emit Hermes-shaped SKILL.md + manifest entry)
```

Each stage's output is a versioned JSON artifact under `~/.weuseai/autobrowse/<skill-slug>/`:

```
captures/<session-N>.trace.zip      # Playwright tracing artifact
captures/<session-N>.dom.json       # DOM snapshots per timestamp
captures/<session-N>.actions.jsonl  # User interactions log
synthesized/<skill-slug>.spec.json  # SkillSpec candidate
iterated/<skill-slug>.spec.json     # SkillSpec post-iteration
graduated/<skill-slug>.SKILL.md     # Final skill file (mirrored to agent-packs/...)
```

## Why Playwright (not Lightpanda / Puppeteer / Crawlee)

- **Apache-2.0** — clean license propagation; matches our TS stack default.
- **Stable selector heuristics** — `page.locator()` ranks by `data-testid` > `role+name` > `text` > `id` > CSS path. This is exactly what the synthesizer needs.
- **Tracing API** — `tracing.start({ snapshots: true })` captures DOM at every action, which is the input the synthesizer consumes.
- **Mature** — Microsoft-backed, used by VS Code's UI test suite. No Phase 5 surprise risk.

Lightpanda's lighter footprint (~40MB vs ~150MB) doesn't matter because the harness runs founder-side only. Crawlee was considered (also Apache-2.0) but it's a higher-level scraper framework; Playwright is the right abstraction layer for our capture-first pipeline.

## Skill graduation contract

A graduated SKILL.md follows the Hermes skill pattern (per Persona v2):

- `# <skill-id>` heading with bundle + tier + handler-ref.
- `## Kapan dipakai` (trigger phrases).
- `## Yang harus diekstrak` (input fields table).
- `## Yang dilakukan` (the mechanical steps — SQL pseudocode for replay sequence).
- `## Output` (persona-voice wrapper template).
- `## Decline` (out-of-scope cases).
- `## Failure handling` (error recovery flows).

The graduate engine emits this from the SkillSpec, with founder-review checkpoints at each section.

## Testing

```bash
npm test
```

Unit tests cover pure-logic paths (selector ranking, schema validation, SKILL.md emission, iterate diff). End-to-end tests against real sites are gated behind `WEUSEAI_AUTOBROWSE_LIVE=1` env to avoid hammering Indonesian sites in CI.

## Status

Phase 4-1 (Day 1-2) — capture + synthesize + iterate + graduate skeleton + 30+ unit tests. First real-site graduation (Tokopedia) is Phase 4-3 Day 4.
