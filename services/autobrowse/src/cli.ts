#!/usr/bin/env node
// Autobrowse CLI — capture / synthesize / iterate / graduate.
//
// Usage:
//   npm run cli -- capture    --skill-slug <id> --start-url <url> [--notes "..."]
//   npm run cli -- synthesize --skill-slug <id> [--display-name "..."]
//   npm run cli -- iterate    --skill-slug <id> [--param key=value ...]
//   npm run cli -- graduate   --skill-slug <id> --target <bundle-slug> [--tier pro+|starter+|studio]
//
// Pure command-routing layer. Heavy lifting in capture/, synthesize/,
// iterate/, graduate/ modules.

import { promises as fs } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { runCaptureSession } from './capture/index.ts'
import { synthesize } from './synthesize/index.ts'
import { replaySkill } from './iterate/replay.ts'
import { diffSpecs } from './iterate/diff.ts'
import { graduate } from './graduate/index.ts'
import {
  paths,
  ensureDirs,
  loadCaptures,
  writeSpec,
  readSpec,
  nextSessionIndex,
} from './lib/persistence.ts'

type Args = Record<string, string | string[] | true>

function parseArgs(argv: string[]): { command: string; args: Args } {
  const command = argv[0] ?? ''
  const args: Args = {}
  for (let i = 1; i < argv.length; i++) {
    const tok = argv[i]
    if (!tok.startsWith('--')) continue
    const key = tok.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      args[key] = true
    } else {
      // Multi-value: --param k=v --param k2=v2 etc.
      const existing = args[key]
      if (existing === undefined) {
        args[key] = next
      } else if (Array.isArray(existing)) {
        existing.push(next)
      } else {
        args[key] = [existing as string, next]
      }
      i++
    }
  }
  return { command, args }
}

function requireString(args: Args, key: string): string {
  const v = args[key]
  if (typeof v !== 'string') throw new Error(`--${key} required`)
  return v
}

function requireTier(args: Args): ('starter' | 'pro' | 'studio')[] {
  const t = (args['tier'] as string | undefined) ?? 'pro+'
  if (t === 'starter+') return ['starter', 'pro', 'studio']
  if (t === 'pro+') return ['pro', 'studio']
  if (t === 'studio') return ['studio']
  throw new Error(`--tier must be one of starter+, pro+, studio (got "${t}")`)
}

async function main(): Promise<void> {
  const { command, args } = parseArgs(process.argv.slice(2))

  if (!command || command === 'help' || args['help']) {
    printHelp()
    return
  }

  switch (command) {
    case 'capture': {
      const slug = requireString(args, 'skill-slug')
      const startUrl = requireString(args, 'start-url')
      const notes = typeof args['notes'] === 'string' ? args['notes'] : undefined
      const p = paths(slug)
      await ensureDirs(p)
      const idx = await nextSessionIndex(p, slug)
      console.log(`[capture] skill=${slug} session=${idx} url=${startUrl}`)
      console.log(`  → captures dir: ${p.capturesDir}`)
      console.log(`  → right-click any element to mark for extraction`)
      const result = await runCaptureSession({
        skillSlug: slug,
        startUrl,
        outputDir: p.capturesDir,
        sessionIdx: idx,
        notes,
      })
      console.log(
        `[capture] done. ${result.session.actions.length} actions recorded; saved ${result.sessionJsonPath}`,
      )
      return
    }

    case 'synthesize': {
      const slug = requireString(args, 'skill-slug')
      const displayName = typeof args['display-name'] === 'string' ? args['display-name'] : undefined
      const p = paths(slug)
      await ensureDirs(p)
      const sessions = await loadCaptures(p)
      if (sessions.length === 0) {
        throw new Error(`No captures found for skill "${slug}". Run \`autobrowse capture\` first.`)
      }
      const triggerPhrasesArg = args['trigger']
      const triggerPhrases = Array.isArray(triggerPhrasesArg)
        ? triggerPhrasesArg
        : typeof triggerPhrasesArg === 'string'
          ? [triggerPhrasesArg]
          : undefined
      const spec = synthesize(sessions, { displayName, triggerPhrases })
      await writeSpec(p.synthesizedSpec, spec)
      console.log(
        `[synthesize] skill=${slug} sessions=${sessions.length} → ${spec.steps.length} steps, ${spec.parameters.length} params, ${spec.output.length} outputs`,
      )
      console.log(`  → saved ${p.synthesizedSpec}`)
      return
    }

    case 'iterate': {
      const slug = requireString(args, 'skill-slug')
      const p = paths(slug)
      await ensureDirs(p)
      const fromPath = (await fileExists(p.iteratedSpec)) ? p.iteratedSpec : p.synthesizedSpec
      const beforeSpec = await readSpec(fromPath)
      const paramArgs = args['param']
      const params = parseParamArgs(Array.isArray(paramArgs) ? paramArgs : paramArgs ? [paramArgs as string] : [])
      console.log(`[iterate] skill=${slug} replaying ${beforeSpec.steps.length} steps`)
      const replay = await replaySkill(beforeSpec, { parameters: params, headless: !args['headed'] })
      console.log(
        `  → deterministic=${replay.deterministic}, ${replay.steps.filter((s) => s.ok).length}/${replay.steps.length} steps ok, ${replay.brokenSelectors.length} broken selectors`,
      )
      // Re-synthesize from captures to pick up any new captures the
      // founder added since last iterate; diff against the prior spec.
      const sessions = await loadCaptures(p)
      const after = synthesize(sessions, {
        displayName: beforeSpec.displayName,
        triggerPhrases: beforeSpec.triggerPhrases,
      })
      const diff = diffSpecs(beforeSpec, after)
      await writeSpec(p.iteratedSpec, after)
      console.log(
        `  → diff: ${diff.selectorChanges.length} selector changes, +${diff.parametersAdded.length}/-${diff.parametersRemoved.length} params, +${diff.outputAdded.length}/-${diff.outputRemoved.length} outputs`,
      )
      console.log(`  → saved ${p.iteratedSpec}`)
      return
    }

    case 'graduate': {
      const slug = requireString(args, 'skill-slug')
      const target = requireString(args, 'target')
      const tier = requireTier(args)
      const p = paths(slug)
      const specPath = (await fileExists(p.iteratedSpec)) ? p.iteratedSpec : p.synthesizedSpec
      const spec = await readSpec(specPath)
      const repoRoot = process.env.WEUSEAI_REPO_ROOT ?? process.cwd()
      const artifacts = graduate(spec, {
        targetBundleSlug: target,
        enabledForTiers: tier,
        repoRoot,
      })
      // Emit a local copy under graduated/ for inspection BEFORE writing
      // to agent-packs (founder reviews first).
      await ensureDirs(p)
      await fs.writeFile(p.graduatedSkillMd, artifacts.skillMdText, 'utf8')
      console.log(`[graduate] skill=${slug} target=${target} tier=${tier.join(',')}`)
      console.log(`  → preview: ${p.graduatedSkillMd}`)
      console.log(`  → would write to: ${artifacts.skillMdPath}`)
      console.log('')
      console.log('Manifest skill entry to merge into manifest.json:')
      console.log(JSON.stringify(artifacts.manifestSkillEntry, null, 2))
      console.log('')
      console.log(
        'Founder review checkpoint. Run with --commit to apply (NOT YET IMPLEMENTED in v0).',
      )
      return
    }

    default:
      console.error(`Unknown command: ${command}`)
      printHelp()
      process.exit(2)
  }
}

function printHelp(): void {
  console.log(`Autobrowse CLI

Commands:
  capture    --skill-slug <id> --start-url <url> [--notes "..."]
             Open Chromium, record a session. Right-click any element to
             mark for extraction.

  synthesize --skill-slug <id> [--display-name "..."] [--trigger "phrase" ...]
             Read all captures, emit SkillSpec candidate.

  iterate    --skill-slug <id> [--param key=value ...] [--headed]
             Replay the spec against fresh page; diff vs prior spec.

  graduate   --skill-slug <id> --target <bundle-slug> [--tier pro+|starter+|studio]
             Render SKILL.md + manifest entry. Founder-review checkpoint
             before agent-packs/ write.
`)
}

function parseParamArgs(arr: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const tok of arr) {
    const eq = tok.indexOf('=')
    if (eq <= 0) continue
    out[tok.slice(0, eq)] = tok.slice(eq + 1)
  }
  return out
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})

// Allow `dirname` import to be tree-shaken if unused in this entry; export
// nothing.
void dirname
void resolve
