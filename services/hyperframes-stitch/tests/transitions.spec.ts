/**
 * hyperframes-stitch transitions tests — pure ffmpeg argv builder.
 *
 * Asserts the argv shape; does NOT spawn ffmpeg. Live stitch tests
 * are gated by WEUSEAI_HYPERFRAMES_LIVE=1.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildFfmpegArgv } from '../src/transitions.ts'

test('rejects empty scene list', () => {
  assert.throws(
    () => buildFfmpegArgv({ scenes: [], outputPath: 'out.mp4' }),
    /at least one scene required/,
  )
})

test('all-cut fast path: bare concat (no xfade)', () => {
  const argv = buildFfmpegArgv({
    scenes: [
      { idx: 0, path: 'a.mp4', duration: 3, transitionToNext: 'cut' },
      { idx: 1, path: 'b.mp4', duration: 5, transitionToNext: 'match-cut' },
      { idx: 2, path: 'c.mp4', duration: 2, transitionToNext: 'cut' },
    ],
    outputPath: 'out.mp4',
  })
  // Expected fast-path:
  //  ffmpeg -y -i a.mp4 -i b.mp4 -i c.mp4
  //    -filter_complex "[0:v:0][0:a:0][1:v:0][1:a:0][2:v:0][2:a:0]concat=n=3:v=1:a=1[v][a]"
  //    -map [v] -map [a] -c:v libx264 -preset fast -c:a aac out.mp4
  assert.equal(argv[0], '-y')
  assert.deepEqual(argv.slice(1, 7), ['-i', 'a.mp4', '-i', 'b.mp4', '-i', 'c.mp4'])
  const filterIdx = argv.indexOf('-filter_complex')
  assert.ok(filterIdx > 0)
  const filter = argv[filterIdx + 1]
  assert.match(filter, /\[0:v:0\]\[0:a:0\]\[1:v:0\]\[1:a:0\]\[2:v:0\]\[2:a:0\]concat=n=3:v=1:a=1\[v\]\[a\]/)
  assert.equal(argv[argv.length - 1], 'out.mp4')
  // No xfade in fast path
  assert.equal(argv.some((a) => a.includes('xfade')), false)
})

test('xfade path triggered when whip-pan present', () => {
  const argv = buildFfmpegArgv({
    scenes: [
      { idx: 0, path: 'a.mp4', duration: 3, transitionToNext: 'whip-pan' },
      { idx: 1, path: 'b.mp4', duration: 5, transitionToNext: 'cut' },
    ],
    outputPath: 'out.mp4',
  })
  const filter = argv[argv.indexOf('-filter_complex') + 1]
  assert.match(filter, /xfade=transition=hblur/)
  assert.match(filter, /duration=0.3/)
})

test('xfade path: dissolve transitions', () => {
  const argv = buildFfmpegArgv({
    scenes: [
      { idx: 0, path: 'a.mp4', duration: 4, transitionToNext: 'dissolve' },
      { idx: 1, path: 'b.mp4', duration: 4, transitionToNext: 'cut' },
    ],
    outputPath: 'out.mp4',
  })
  const filter = argv[argv.indexOf('-filter_complex') + 1]
  assert.match(filter, /xfade=transition=fade/)
  assert.match(filter, /duration=0.5/)
})

test('xfade path: cumulative offsets correct', () => {
  // Scene 1: 5s, dissolve (0.5s) → next offset = 5 - 0.5 = 4.5
  // Scene 2: 5s, cut (treated as 0.05s in xfade chain) → next offset = 4.5 + 5 - 0.05 = 9.45
  const argv = buildFfmpegArgv({
    scenes: [
      { idx: 0, path: 'a.mp4', duration: 5, transitionToNext: 'dissolve' },
      { idx: 1, path: 'b.mp4', duration: 5, transitionToNext: 'cut' },
      { idx: 2, path: 'c.mp4', duration: 3, transitionToNext: 'cut' },
    ],
    outputPath: 'out.mp4',
  })
  const filter = argv[argv.indexOf('-filter_complex') + 1]
  // First xfade offset = 4.5
  assert.match(filter, /offset=4\.50/)
  // Second xfade offset = 9.45
  assert.match(filter, /offset=9\.45/)
})

test('fade-out final scene: appends fade filter on output', () => {
  const argv = buildFfmpegArgv({
    scenes: [
      { idx: 0, path: 'a.mp4', duration: 3, transitionToNext: 'whip-pan' },
      { idx: 1, path: 'b.mp4', duration: 4, transitionToNext: 'fade-out' },
    ],
    outputPath: 'out.mp4',
  })
  const filter = argv[argv.indexOf('-filter_complex') + 1]
  assert.match(filter, /\[vout\]fade=t=out/)
  // Final mapped video label is vfade (not vout) when fade-out present
  const mapIdx = argv.indexOf('-map')
  assert.equal(argv[mapIdx + 1], '[vfade]')
})

test('output codec defaults to libx264 + aac', () => {
  const argv = buildFfmpegArgv({
    scenes: [{ idx: 0, path: 'a.mp4', duration: 3, transitionToNext: 'cut' }],
    outputPath: 'out.mp4',
  })
  assert.ok(argv.includes('-c:v'))
  assert.equal(argv[argv.indexOf('-c:v') + 1], 'libx264')
  assert.ok(argv.includes('-c:a'))
  assert.equal(argv[argv.indexOf('-c:a') + 1], 'aac')
})

test('xfade path: audio concat included', () => {
  const argv = buildFfmpegArgv({
    scenes: [
      { idx: 0, path: 'a.mp4', duration: 3, transitionToNext: 'dissolve' },
      { idx: 1, path: 'b.mp4', duration: 5, transitionToNext: 'cut' },
    ],
    outputPath: 'out.mp4',
  })
  const filter = argv[argv.indexOf('-filter_complex') + 1]
  assert.match(filter, /\[0:a:0\]\[1:a:0\]concat=n=2:v=0:a=1\[aout\]/)
  // Audio map points to [aout]
  const aoutMapIdx = argv.findIndex((v, i) => argv[i - 1] === '-map' && v === '[aout]')
  assert.ok(aoutMapIdx >= 0)
})

test('output path is the last argv item', () => {
  const argv = buildFfmpegArgv({
    scenes: [{ idx: 0, path: 'a.mp4', duration: 3, transitionToNext: 'cut' }],
    outputPath: '/tmp/output.mp4',
  })
  assert.equal(argv[argv.length - 1], '/tmp/output.mp4')
})

test('no -y flag missing (overwrite enabled)', () => {
  const argv = buildFfmpegArgv({
    scenes: [{ idx: 0, path: 'a.mp4', duration: 3, transitionToNext: 'cut' }],
    outputPath: 'out.mp4',
  })
  assert.equal(argv[0], '-y')
})
