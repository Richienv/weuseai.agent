// Build the ffmpeg filter_complex argument for a sequence of mp4
// scenes joined by HyperFrames transitions.
//
// HyperFrames transition vocabulary → ffmpeg primitives:
//   cut         → bare concat (no transition filter)
//   match-cut   → bare concat (semantic, not a visual blend)
//   whip-pan    → xfade type=hblur, duration 0.3s
//   dissolve    → xfade type=fade, duration 0.5s
//   fade-out    → fade filter on the final scene's output
//
// Pure logic — no I/O. Returns the filter_complex string that the
// ffmpeg command line will use. Tests assert the string shape, not
// the rendered output (real ffmpeg run is integration-only, gated by
// WEUSEAI_HYPERFRAMES_LIVE=1 env).

export type StitchTransition =
  | 'cut'
  | 'match-cut'
  | 'whip-pan'
  | 'dissolve'
  | 'fade-out'

export type SceneInput = {
  /** 0-indexed position in the input list. */
  idx: number
  /** Path to the mp4 file. */
  path: string
  /** Duration in seconds. */
  duration: number
  /** Transition into the NEXT scene. The last scene's transition is
   *  applied to the output as a final-fade if it's 'fade-out'. */
  transitionToNext: StitchTransition
}

/** Build the ffmpeg argv (excluding the leading 'ffmpeg' binary). */
export function buildFfmpegArgv(opts: {
  scenes: SceneInput[]
  outputPath: string
}): string[] {
  if (opts.scenes.length === 0) {
    throw new Error('buildFfmpegArgv: at least one scene required')
  }

  // Naive concat is sufficient when ALL transitions are 'cut' or
  // 'match-cut' — no visual blend needed. Fast path for the common case.
  const allBareCuts = opts.scenes.slice(0, -1).every((s) =>
    s.transitionToNext === 'cut' || s.transitionToNext === 'match-cut',
  ) && opts.scenes[opts.scenes.length - 1].transitionToNext !== 'fade-out'

  if (allBareCuts) {
    return buildBareConcatArgv(opts)
  }

  return buildXFadeArgv(opts)
}

/** Bare concat path: -f concat -i list.txt -c copy out.mp4.
 *  We use the inline alternative (multiple -i + concat filter) to avoid
 *  needing a temp file for the concat list. */
function buildBareConcatArgv(opts: { scenes: SceneInput[]; outputPath: string }): string[] {
  const argv: string[] = ['-y']
  for (const s of opts.scenes) {
    argv.push('-i', s.path)
  }
  // filter_complex: concat=n=N:v=1:a=1
  const filter = opts.scenes
    .map((_, i) => `[${i}:v:0][${i}:a:0]`)
    .join('') +
    `concat=n=${opts.scenes.length}:v=1:a=1[v][a]`
  argv.push('-filter_complex', filter)
  argv.push('-map', '[v]', '-map', '[a]')
  argv.push('-c:v', 'libx264', '-preset', 'fast', '-c:a', 'aac')
  argv.push(opts.outputPath)
  return argv
}

/** xfade path: chain xfade filters with cumulative offsets. */
function buildXFadeArgv(opts: { scenes: SceneInput[]; outputPath: string }): string[] {
  const argv: string[] = ['-y']
  for (const s of opts.scenes) {
    argv.push('-i', s.path)
  }

  const parts: string[] = []
  let prevLabel = '0:v'
  let cumulativeOffset = 0
  for (let i = 0; i < opts.scenes.length - 1; i++) {
    const cur = opts.scenes[i]
    const next = i + 1
    const xfadeKind = transitionToXfade(cur.transitionToNext)
    const xfadeDur = transitionDuration(cur.transitionToNext)
    cumulativeOffset += cur.duration - xfadeDur
    const outLabel = i === opts.scenes.length - 2 ? 'vout' : `v${next}`
    parts.push(
      `[${prevLabel}][${next}:v]xfade=transition=${xfadeKind}:duration=${xfadeDur}:offset=${cumulativeOffset.toFixed(2)}[${outLabel}]`,
    )
    prevLabel = outLabel
  }

  // Audio: simple acrossfade or concat. We use concat for simplicity
  // since cross-fading audio per transition is rarely needed for
  // social-short content (voiceovers usually carry across scenes).
  const audioParts = opts.scenes
    .map((_, i) => `[${i}:a:0]`)
    .join('')
  parts.push(`${audioParts}concat=n=${opts.scenes.length}:v=0:a=1[aout]`)

  // Apply final fade-out if requested by the LAST scene's transition.
  let finalVideoLabel = 'vout'
  const lastScene = opts.scenes[opts.scenes.length - 1]
  if (lastScene.transitionToNext === 'fade-out') {
    const totalDur = opts.scenes.reduce((sum, s, i) => {
      const offsetReduction =
        i < opts.scenes.length - 1 ? transitionDuration(s.transitionToNext) : 0
      return sum + s.duration - offsetReduction
    }, 0)
    const fadeStart = Math.max(0, totalDur - 0.5)
    parts.push(`[vout]fade=t=out:st=${fadeStart.toFixed(2)}:d=0.5[vfade]`)
    finalVideoLabel = 'vfade'
  }

  argv.push('-filter_complex', parts.join(';'))
  argv.push('-map', `[${finalVideoLabel}]`, '-map', '[aout]')
  argv.push('-c:v', 'libx264', '-preset', 'fast', '-c:a', 'aac')
  argv.push(opts.outputPath)
  return argv
}

function transitionToXfade(t: StitchTransition): string {
  switch (t) {
    case 'cut':
    case 'match-cut':
      return 'fade'   // Used only when at least one other transition is non-cut
    case 'whip-pan':
      return 'hblur'
    case 'dissolve':
      return 'fade'
    case 'fade-out':
      return 'fadeblack'
  }
}

function transitionDuration(t: StitchTransition): number {
  switch (t) {
    case 'cut':
    case 'match-cut':
      return 0.05  // Tiny fade for ffmpeg numerical stability
    case 'whip-pan':
      return 0.3
    case 'dissolve':
      return 0.5
    case 'fade-out':
      return 0.5
  }
}
