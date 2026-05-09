// File-system layout helpers — where Autobrowse stores intermediate
// artifacts (captures, synthesized specs, iterated specs, graduated
// SKILL.md) on the founder's machine.
//
// Default base dir: ~/.weuseai/autobrowse/<skill-slug>/
//   captures/<skill-slug>-<idx>.session.json
//   captures/<skill-slug>-<idx>.trace.zip
//   synthesized/<skill-slug>.spec.json
//   iterated/<skill-slug>.spec.json    (overwritten each iterate round)
//   graduated/<skill-slug>.SKILL.md    (mirrored to agent-packs/...)
//
// All paths returned are absolute. Caller is responsible for mkdir + read/write.

import { homedir } from 'node:os'
import { join } from 'node:path'
import { promises as fs } from 'node:fs'

import type { CaptureSession, SkillSpec } from '../types.ts'

export type AutobrowsePaths = {
  baseDir: string
  capturesDir: string
  synthesizedDir: string
  iteratedDir: string
  graduatedDir: string
  capturesGlob: string
  synthesizedSpec: string
  iteratedSpec: string
  graduatedSkillMd: string
}

export function paths(skillSlug: string, baseOverride?: string): AutobrowsePaths {
  const base = baseOverride ?? join(homedir(), '.weuseai', 'autobrowse', skillSlug)
  return {
    baseDir: base,
    capturesDir: join(base, 'captures'),
    synthesizedDir: join(base, 'synthesized'),
    iteratedDir: join(base, 'iterated'),
    graduatedDir: join(base, 'graduated'),
    capturesGlob: join(base, 'captures', `${skillSlug}-*.session.json`),
    synthesizedSpec: join(base, 'synthesized', `${skillSlug}.spec.json`),
    iteratedSpec: join(base, 'iterated', `${skillSlug}.spec.json`),
    graduatedSkillMd: join(base, 'graduated', `${skillSlug}.SKILL.md`),
  }
}

export async function ensureDirs(p: AutobrowsePaths): Promise<void> {
  await fs.mkdir(p.capturesDir, { recursive: true })
  await fs.mkdir(p.synthesizedDir, { recursive: true })
  await fs.mkdir(p.iteratedDir, { recursive: true })
  await fs.mkdir(p.graduatedDir, { recursive: true })
}

/**
 * Read all *.session.json files in capturesDir (in lexicographic order),
 * parse them, return CaptureSession[].
 */
export async function loadCaptures(p: AutobrowsePaths): Promise<CaptureSession[]> {
  const entries = await fs.readdir(p.capturesDir).catch(() => [])
  const matches = entries
    .filter((f) => f.endsWith('.session.json'))
    .sort((a, b) => a.localeCompare(b))
  const sessions: CaptureSession[] = []
  for (const name of matches) {
    const path = join(p.capturesDir, name)
    const text = await fs.readFile(path, 'utf8')
    sessions.push(JSON.parse(text) as CaptureSession)
  }
  return sessions
}

export async function writeSpec(path: string, spec: SkillSpec): Promise<void> {
  await fs.writeFile(path, JSON.stringify(spec, null, 2), 'utf8')
}

export async function readSpec(path: string): Promise<SkillSpec> {
  const text = await fs.readFile(path, 'utf8')
  return JSON.parse(text) as SkillSpec
}

/** Pick the next session index by scanning capturesDir. */
export async function nextSessionIndex(p: AutobrowsePaths, skillSlug: string): Promise<number> {
  const entries = await fs.readdir(p.capturesDir).catch(() => [])
  const re = new RegExp(`^${escapeRegex(skillSlug)}-(\\d+)\\.session\\.json$`)
  let max = 0
  for (const f of entries) {
    const m = f.match(re)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n > max) max = n
    }
  }
  return max + 1
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
