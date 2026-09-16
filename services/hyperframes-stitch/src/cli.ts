#!/usr/bin/env node
// hyperframes-stitch CLI — concat per-scene mp4 chunks via local
// ffmpeg, applying transitions per the storyboard recipe.
//
// Usage:
//   hyperframes-stitch \
//     --scenes scene1.mp4,scene2.mp4,scene3.mp4 \
//     --transitions cut,whip-pan,fade-out \
//     --durations 3.0,5.0,2.0 \
//     --out merged.mp4
//
// Or, the recommended pattern: pipe the render-handler's response
// JSON in via --recipe-json (it carries the transitions + durations):
//
//   hyperframes-stitch \
//     --scenes scene1.mp4,scene2.mp4,scene3.mp4 \
//     --recipe-json /tmp/render-response.json \
//     --out merged.mp4
//
// Requires: ffmpeg in PATH. Install via:
//   macOS:  brew install ffmpeg
//   Linux:  apt install ffmpeg

import { promises as fs } from 'node:fs'
import { spawn } from 'node:child_process'

import { buildFfmpegArgv, type StitchTransition } from './transitions.ts'

type Args = Record<string, string | true>

function parseArgs(argv: string[]): Args {
  const out: Args = {}
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]
    if (!tok.startsWith('--')) continue
    const key = tok.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      out[key] = true
    } else {
      out[key] = next
      i++
    }
  }
  return out
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (args['help'] || !args['scenes']) {
    printHelp()
    return
  }

  const scenePaths = String(args['scenes']).split(',').map((s) => s.trim())
  if (scenePaths.length === 0) throw new Error('--scenes must have at least one path')

  let transitions: StitchTransition[] = []
  let durations: number[] = []

  if (args['recipe-json']) {
    // Recipe path: parse the render-handler response.
    const recipeText = await fs.readFile(String(args['recipe-json']), 'utf8')
    const recipe = JSON.parse(recipeText) as {
      stitch_recipe?: {
        transitions: { scene_id: number; transition: StitchTransition }[]
        total_duration_sec: number
      }
      jobs?: { scene: { scene_id: number; duration_sec: number } }[]
    }
    if (!recipe.stitch_recipe || !recipe.jobs) {
      throw new Error('--recipe-json missing stitch_recipe or jobs[]')
    }
    // Sort transitions + durations by scene_id, matching the order
    // of --scenes (caller responsible for matching scene order).
    transitions = recipe.stitch_recipe.transitions.map((t) => t.transition)
    durations = recipe.jobs.map((j) => j.scene.duration_sec)
  } else {
    transitions = String(args['transitions'] ?? '')
      .split(',')
      .map((t) => t.trim() as StitchTransition)
    durations = String(args['durations'] ?? '')
      .split(',')
      .map((d) => parseFloat(d.trim()))
  }

  if (transitions.length !== scenePaths.length) {
    throw new Error(
      `--transitions count (${transitions.length}) must match --scenes count (${scenePaths.length})`,
    )
  }
  if (durations.length !== scenePaths.length) {
    throw new Error(
      `--durations count (${durations.length}) must match --scenes count (${scenePaths.length})`,
    )
  }

  const outputPath = String(args['out'] ?? 'merged.mp4')

  const argv = buildFfmpegArgv({
    scenes: scenePaths.map((path, idx) => ({
      idx,
      path,
      duration: durations[idx],
      transitionToNext: transitions[idx],
    })),
    outputPath,
  })

  console.log(`[hyperframes-stitch] ffmpeg ${argv.join(' ')}`)
  await runFfmpeg(argv)
  console.log(`[hyperframes-stitch] done. wrote ${outputPath}`)
}

function runFfmpeg(argv: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', argv, { stdio: 'inherit' })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited with code ${code}`))
    })
  })
}

function printHelp(): void {
  console.log(`hyperframes-stitch — concatenate per-scene mp4s with transitions

Usage:
  hyperframes-stitch --scenes a.mp4,b.mp4,c.mp4 --transitions cut,whip-pan,fade-out --durations 3,5,2 --out merged.mp4

Or with a recipe JSON from /functions/v1/hyperframes-render:
  hyperframes-stitch --scenes a.mp4,b.mp4 --recipe-json render-response.json --out merged.mp4

Requires ffmpeg in PATH (apt install ffmpeg / brew install ffmpeg).
`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
