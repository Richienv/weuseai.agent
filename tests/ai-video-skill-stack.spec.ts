import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import {
  compileStudioPrompt,
  detectStudioIdentity,
  parseSkillCompileInput,
  presentStudioSkillStack,
  STUDIO_SKILL_MODES,
} from '../api/_shared/ai-video-skill-stack.ts'
import {
  operatorPromptHasBannedToken,
  operatorPromptHasHeadings,
} from '../api/_shared/ai-video-operator.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const HEADED = [
  'SCENE A quiet alley walk at dusk.',
  'REFERENCES Face crops only.',
  'PHYSICS Weight in the steps.',
  'LIGHT Neon from the left.',
  'CAMERA Locked 9:16.',
  'TIMELINE Six seconds, one take.',
  'PERFORMANCE Off-lens.',
  'SOUND Rain only.',
  'LOCKS One person.',
].join('\n')

test('skill pack text is in the repo and 8MB anchors stayed out', () => {
  const readme = join(root, 'studio/skills/README.md')
  const contract = join(
    root,
    'studio/skills/01-core-routing/prompt-master-seedance2-5/references/prompt-contract.md',
  )
  const richie = join(
    root,
    'studio/skills/01-core-routing/prompt-master-seedance2-5/references/identity-richie.md',
  )
  assert.equal(existsSync(readme), true)
  assert.equal(existsSync(contract), true)
  assert.equal(existsSync(richie), true)
  assert.match(readFileSync(readme, 'utf8'), /SCENE, REFERENCES, PHYSICS/)
  assert.equal(existsSync(join(root, 'studio/skills/02-richie-cinematic-studio-v0.2.0/richie-persona/assets/richie_anchor.png')), false)
})

test('loose idea compiles to a Seedance-safe 9-heading contract', () => {
  const result = compileStudioPrompt(parseSkillCompileInput({
    idea: 'Richie jalan pelan di gang basah malam ini',
    skill_mode: 'one-take-locked',
    character_name: 'Richie · Adidas tee',
    duration_seconds: 6,
    ratio: '9:16',
  }))
  assert.equal(operatorPromptHasHeadings(result.prompt), true)
  assert.equal(operatorPromptHasBannedToken(result.prompt), false)
  assert.match(result.prompt, /Image 1 is the character sheet for Richie/)
  assert.match(result.prompt, /Never slim the midface/)
  assert.match(result.prompt, /174 cm/)
  assert.match(result.prompt, /One continuous shot, no cut/)
  assert.equal(result.identity, 'richie')
  assert.doesNotMatch(result.prompt, /higgsfield|cadence|<<<richie_/i)
})

test('UGC and cinematic modes do not blend', () => {
  const ugc = compileStudioPrompt(parseSkillCompileInput({
    idea: 'unboxing kecil di dapur, lampu jendela',
    skill_mode: 'ugc-iphone',
    character_name: 'Creator',
    duration_seconds: 10,
    ratio: '9:16',
  }))
  assert.match(ugc.prompt, /Filmed with iPhone/)
  assert.doesNotMatch(ugc.prompt, /ARRI|anamorphic|gimbal/i)
  assert.match(ugc.prompt, /after 8s/)
  const cine = compileStudioPrompt(parseSkillCompileInput({
    idea: 'man on a misty pitch, one slow breath',
    skill_mode: 'cinematic-reel',
    character_name: 'Richie',
    duration_seconds: 5,
    ratio: '16:9',
  }))
  assert.match(cine.prompt, /35mm grain/)
  assert.doesNotMatch(cine.prompt, /Filmed with iPhone/)
  assert.ok(cine.stillPrompt)
  assert.match(cine.stillPrompt ?? '', /frame 0/)
})

test('existing headings keep the scene and receive FACE LOCK', () => {
  const result = compileStudioPrompt(parseSkillCompileInput({
    prompt: HEADED,
    skill_mode: 'one-take-locked',
    character_name: 'Renita',
    has_still: true,
  }))
  assert.match(result.prompt, /quiet alley walk at dusk/i)
  assert.match(result.prompt, /Never slim the face/)
  assert.match(result.prompt, /153 cm/)
  assert.match(result.prompt, /Image 2 is the place only/)
  assert.match(result.prompt, /Donates zero face/)
  assert.equal(result.identity, 'renita')
})

test('duo identity adds the height gap and look-lock stills stay banned-token clean', () => {
  const result = compileStudioPrompt(parseSkillCompileInput({
    idea: 'Richie and Renita sit on a sofa and tease each other',
    skill_mode: 'narrative-block',
    output_kind: 'still',
    character_name: 'Richie',
    duration_seconds: 15,
    ratio: '9:16',
  }))
  assert.equal(result.identity, 'both')
  assert.match(result.prompt, /174 cm/)
  assert.match(result.prompt, /153 cm/)
  assert.match(result.prompt, /height gap/)
  assert.ok(result.stillPrompt)
  assert.match(result.stillPrompt ?? '', /LOOK-LOCK STILL/)
  assert.equal(operatorPromptHasBannedToken(result.stillPrompt ?? ''), false)
  assert.ok(result.warnings.some((row) => /Look-lock/.test(row)))
})

test('extra_ref_count binds @Image1 as the look still', () => {
  const result = compileStudioPrompt(parseSkillCompileInput({
    idea: 'ini Renita pakai baju pramugari kaya contoh @Image1',
    skill_mode: 'one-take-locked',
    extra_ref_count: 1,
  }))
  assert.match(result.prompt, /Image 1 \(@Image1\) is a reference still/)
  assert.match(result.prompt, /look example/)
  assert.equal(operatorPromptHasBannedToken(result.prompt), false)
})

test('compiler keeps a large extra-ref pack instead of clipping at 6', () => {
  const result = compileStudioPrompt(parseSkillCompileInput({
    idea: 'Richie walks the market with a paper bag and locked wardrobe',
    skill_mode: 'one-take-locked',
    character_name: 'Richie',
    extra_ref_count: 12,
  }))
  assert.match(result.prompt, /Image 13 \(@Image13\) is a reference still/)
  assert.equal(operatorPromptHasBannedToken(result.prompt), false)
})

test('compiler writes Video and Audio reference lines', () => {
  const result = compileStudioPrompt(parseSkillCompileInput({
    idea: 'Richie walks then the clip motion and the room tone stay locked',
    skill_mode: 'one-take-locked',
    character_name: 'Richie',
    extra_ref_count: 1,
    extra_video_count: 2,
    extra_audio_count: 1,
  }))
  assert.match(result.prompt, /Image 2 \(@Image2\) is a reference still/)
  assert.match(result.prompt, /Video 1 \(@Video1\) is motion, camera, and pacing only/)
  assert.match(result.prompt, /Video 2 \(@Video2\) is motion, camera, and pacing only/)
  assert.match(result.prompt, /Audio 1 \(@Audio1\) is voice, ambience, or music/)
  assert.equal(operatorPromptHasBannedToken(result.prompt), false)
})

test('folder extras become Image 3+ in REFERENCES', () => {
  const result = compileStudioPrompt(parseSkillCompileInput({
    idea: 'walk through the market with a paper bag',
    skill_mode: 'one-take-locked',
    character_name: 'Richie',
    has_still: true,
    ref_urls: ['https://example.com/sheet.webp'],
    ref_paths: ['operator/inbox/a/still.jpg', 'operator/inbox/b/bag.jpg'],
    ref_roles: ['reference_image', 'first_frame', 'reference_image'],
  }))
  assert.match(result.prompt, /Image 2 is the place only/)
  assert.match(result.prompt, /Image 3 \(@Image3\) is a reference still/)
  assert.match(result.prompt, /@Image3/)
})

test('parse rejects bad modes and tiny ideas', () => {
  assert.throws(() => parseSkillCompileInput({ idea: 'hi' }), /invalid_skill_idea/)
  assert.doesNotThrow(() => parseSkillCompileInput({ idea: `${'walk in rain tonight. '.repeat(900)}` }))
  assert.throws(() => parseSkillCompileInput({ idea: 'walk in rain tonight', skill_mode: 'higgsfield' }), /invalid_skill_mode/)
  assert.equal(detectStudioIdentity('Soul', 'no one named'), null)
  assert.equal(presentStudioSkillStack().modes.length, STUDIO_SKILL_MODES.length)
})
