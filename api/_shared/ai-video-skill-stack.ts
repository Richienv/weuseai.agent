import {
  AI_VIDEO_OPERATOR_HEADINGS,
  AI_VIDEO_OPERATOR_MAX_AUDIO_REFS,
  AI_VIDEO_OPERATOR_MAX_IMAGE_REFS,
  AI_VIDEO_OPERATOR_MAX_VIDEO_REFS,
  AI_VIDEO_OPERATOR_PROMPT_MAX,
  isAiVideoOperatorRatio,
  operatorPromptHasHeadings,
  sanitizeOperatorPrompt,
  type AiVideoOperatorRatio,
  type AiVideoOperatorResolution,
} from './ai-video-operator.js'

export const STUDIO_SKILL_MODE_IDS = [
  'one-take-locked',
  'ugc-iphone',
  'cinematic-reel',
  'narrative-block',
  'coverage-montage',
] as const

export type StudioSkillModeId = (typeof STUDIO_SKILL_MODE_IDS)[number]
export type StudioOutputKind = 'video' | 'still'
export type StudioIdentityKey = 'richie' | 'renita' | 'both'

export type StudioSkillMode = {
  id: StudioSkillModeId
  label: string
  hint: string
  defaultDurationSeconds: number
  defaultRatio: AiVideoOperatorRatio
  defaultResolution: AiVideoOperatorResolution
}

export type CompileStudioInput = {
  idea: string
  mode: StudioSkillModeId
  kind: StudioOutputKind
  characterName: string | null
  hasStill: boolean
  extraRefCount: number
  extraVideoCount: number
  extraAudioCount: number
  durationSeconds: number
  ratio: AiVideoOperatorRatio
  generateAudio: boolean
}

export type CompileStudioResult = {
  prompt: string
  stillPrompt: string | null
  mode: StudioSkillModeId
  kind: StudioOutputKind
  ratio: AiVideoOperatorRatio
  durationSeconds: number
  resolution: AiVideoOperatorResolution
  identity: StudioIdentityKey | null
  warnings: string[]
}

const MODE_SET = new Set<string>(STUDIO_SKILL_MODE_IDS)

export const STUDIO_SKILL_MODES: readonly StudioSkillMode[] = [
  {
    id: 'one-take-locked',
    label: 'Satu take',
    hint: 'Satu shot kontinu. Kamera dipaku. 5–8 detik.',
    defaultDurationSeconds: 6,
    defaultRatio: '9:16',
    defaultResolution: '720p',
  },
  {
    id: 'ugc-iphone',
    label: 'UGC iPhone',
    hint: 'HP di tangan. Cahaya jendela. Bukan gimbal.',
    defaultDurationSeconds: 10,
    defaultRatio: '9:16',
    defaultResolution: '720p',
  },
  {
    id: 'cinematic-reel',
    label: 'Reel sinematik',
    hint: 'Satu gerak lensa. Grain. Satu klip, bukan film jadi.',
    defaultDurationSeconds: 5,
    defaultRatio: '16:9',
    defaultResolution: '720p',
  },
  {
    id: 'narrative-block',
    label: 'Blok narasi',
    hint: 'Satu blok 15 detik. Maksimal empat beat.',
    defaultDurationSeconds: 15,
    defaultRatio: '9:16',
    defaultResolution: '720p',
  },
  {
    id: 'coverage-montage',
    label: 'Montase',
    hint: 'Sumber edit, bukan film jadi. Satu generate per angle.',
    defaultDurationSeconds: 15,
    defaultRatio: '16:9',
    defaultResolution: '720p',
  },
]

const RICHIE_FACE_LOCK = `Image 1 CLOSE-UP, FRONT, and SIDE panels — Richie, 100%, from the character sheet. Not a generic handsome East-Asian lead. Not a K-drama plate. Not the actor in any scene screenshot.

Richie, 24, East Asian, 174 cm, 68 kg, lean-athletic.

ANTI-BEAUTIFY (the model will try these — forbid them):
Never slim the midface. Never lengthen the skull into a long oval idol.
Never V-line the jaw. Never gaunt the cheeks. Never thin or sharpen the
nose. Never enlarge the eyes into bright idol eyes. Never drop the sleepy
lid into a wide-awake K-drama stare. Never turn a laugh into a different
person. Never porcelain / beauty-filter skin. Never hide all the hair
under a beanie.

Skull: medium-width, slightly SHORT and FULL — not long-narrow. Real
fullness beside the mouth. Cheeks are not flat and not round-apple like a
child. Not a square K-drama jaw.

Forehead: medium. Natural hairline with a small center peak, not receding.

Hair: KEY LOCK whenever it is visible. Jet black. HIGH volume and lift on
the crown and front. Swept back and slightly to HIS left. Textured, not
gel-slick. Shorter sides, short nape, short sideburns. Profile is tall on
the top. A beanie may sit on the crown but black hair must still show at
the forehead and temples. Never long bangs over the eyes, never a slick
side-part, never a bowl.

Brows: dark, medium-thick, gentle low arch, close to the eyes.

Eyes: KEY LOCK. Dark brown. Medium-small. Slightly sleepy / heavy upper
lid. Low crease. Not large bright idol eyes. Outer corners level.

Nose: KEY LOCK. Wider and more rounded than a model nose. Visible alae
from the front. Modest bridge. Rounded, not-sharp tip. Do not thin it.

Mouth: medium width. Soft Cupid's bow. Lower lip slightly fuller. Real
smile is SMALL and mostly closed, corners up a little — same skull as the
sheet CLOSE-UP. A laugh cannot change the nose or eye size.

Jaw / chin: medium tapered jaw, rounded corners. Chin medium and rounded.
Not a block, not pointed.

Ears: empty. No AirPods, no piercings, no jewelry.

Skin: real unretouched skin. Pores. Oil sheen on nose and forehead. Peach
fuzz / faint stubble. Small moles including near the left eye / cheek.
Not porcelain.

Body: 174 cm, 68 kg, lean-athletic. Never stretch into a taller idol.`

const RENITA_FACE_LOCK = `Image 1 CLOSE-UP, FRONT, and SIDE panels — Renita, 100%, from the character sheet. Not a generic pretty East-Asian lead. Not a K-beauty plate. Not the actress in any scene screenshot.

Renita, mid-20s, Southeast Asian, 153 cm, petite.

ANTI-BEAUTIFY (the model will try these — forbid them):
Never slim the face. Never lengthen it into an oval. Never thin the
nose. Never enlarge the eyes into idol eyes. Never V-line the jaw.
Never cool the hair to dark chocolate. Never add tight Hollywood
S-waves. Never porcelain skin.

Skull: SHORT and WIDE. Round. Apple cheeks are the dominant volume.
Face length is short. Cheeks stay full at rest. Not oval, not gaunt,
not a long-narrow idol face.

Forehead: medium, often with hair falling into it. Not a high exposed
studio forehead.

Hair: long, past collarbone. Warm chestnut / auburn-brown — copper in
sun, not jet black, not cool dark chocolate. Mostly STRAIGHT with light
body, not uniform S-waves. Center-to-soft part. Face-framing pieces.
A beanie may hide the crown; color and length at the shoulders stay.

Brows: medium, slightly straight-to-soft arch, close to the eyes.

Eyes: dark brown. Medium. Rounder than almond. Slightly heavy upper
lid. Inner corners soft. When she smiles the cheeks push the lower
lids into a crescent. Not large doll eyes.

Nose: KEY LOCK. Shorter and wider than a model nose. Rounded, slightly
bulbous tip. Visible alae from the front. Low-medium bridge. Do not
thin it.

Mouth: medium-wide. Full lips. Soft Cupid's bow. Real small
closed-mouth smile; cheeks rise. Not a sculpted lipstick mouth.

Jaw / chin: soft round jaw. Short small-medium chin. Not angular.
Not a pointed chin.

Ears: small silver hoop earrings. No AirPods. No glasses unless asked.

Skin: real unretouched skin. Pores. Natural cheek flush / oil. Not porcelain.

Body: 153 cm petite. Never stretch her into a tall model.

Never: Japanese-film-lead face, K-beauty cousin, AirPods, mirrored face.`

const SHARED_LOCKS = [
  'No logo, subtitle, watermark, readable shop name, or extra product.',
  'Scene stills donate zero face. Identity refs donate zero architecture.',
  'No look at lens unless the brief is an explicit POV into a partner.',
  'No morph, no extra fingers, no fused hands, no plastic or waxy skin.',
]

export function isStudioSkillMode(value: unknown): value is StudioSkillModeId {
  return typeof value === 'string' && MODE_SET.has(value)
}

export function studioSkillMode(id: StudioSkillModeId): StudioSkillMode {
  return STUDIO_SKILL_MODES.find((row) => row.id === id) ?? STUDIO_SKILL_MODES[0]
}

export function detectStudioIdentity(
  characterName: string | null,
  idea: string,
): StudioIdentityKey | null {
  const hay = `${characterName ?? ''} ${idea}`.toLowerCase()
  const richie = /\brichie\b/.test(hay)
  const renita = /\brenita\b/.test(hay)
  if (richie && renita) return 'both'
  if (richie) return 'richie'
  if (renita) return 'renita'
  return null
}

export function presentStudioSkillStack() {
  return {
    modes: STUDIO_SKILL_MODES,
    identities: [
      { key: 'richie', label: 'Richie', height_cm: 174 },
      { key: 'renita', label: 'Renita', height_cm: 153 },
    ],
  }
}

function countFromBody(body: Record<string, unknown>, key: string, fallback: number, max: number): number {
  const raw = body[key]
  if (typeof raw === 'number' && Number.isInteger(raw)) return Math.max(0, Math.min(max, raw))
  return Math.max(0, Math.min(max, fallback))
}

function extraRefCountFromBody(
  body: Record<string, unknown>,
  characterName: string | null,
  hasStill: boolean,
): number {
  const reserved = (characterName ? 1 : 0) + (hasStill ? 1 : 0)
  const maxExtra = Math.max(0, AI_VIDEO_OPERATOR_MAX_IMAGE_REFS - reserved)
  const roles = Array.isArray(body.ref_roles) ? body.ref_roles.filter((role) => role === 'reference_image') : []
  const fallback = roles.length
    ? roles.length
    : Math.max(0, (Array.isArray(body.ref_paths) ? body.ref_paths.length : 0)
      + (Array.isArray(body.ref_urls) ? body.ref_urls.length : 0)
      - reserved)
  return countFromBody(body, 'extra_ref_count', fallback, maxExtra)
}

export function parseSkillCompileInput(body: Record<string, unknown>): CompileStudioInput {
  const idea = sanitizeOperatorPrompt(
    typeof body.idea === 'string'
      ? body.idea
      : typeof body.prompt === 'string'
        ? body.prompt
        : '',
  )
  if (idea.length < 8) throw new Error('invalid_skill_idea')
  if (idea.length > AI_VIDEO_OPERATOR_PROMPT_MAX) throw new Error('invalid_operator_prompt_long')
  const mode = body.skill_mode == null || body.skill_mode === ''
    ? 'one-take-locked'
    : body.skill_mode
  if (!isStudioSkillMode(mode)) throw new Error('invalid_skill_mode')
  const kind: StudioOutputKind = body.output_kind === 'still' ? 'still' : 'video'
  const characterName = typeof body.character_name === 'string' && body.character_name.trim()
    ? body.character_name.trim().slice(0, 60)
    : null
  const spec = studioSkillMode(mode)
  const ratio = isAiVideoOperatorRatio(body.ratio) ? body.ratio : spec.defaultRatio
  const durationRaw = body.duration_seconds
  const durationSeconds = typeof durationRaw === 'number' && Number.isInteger(durationRaw)
    ? durationRaw
    : spec.defaultDurationSeconds
  if (durationSeconds < 4 || durationSeconds > 30) throw new Error('invalid_operator_duration')
  return {
    idea,
    mode,
    kind,
    characterName,
    hasStill: body.has_still === true,
    extraRefCount: extraRefCountFromBody(body, characterName, body.has_still === true),
    extraVideoCount: countFromBody(
      body,
      'extra_video_count',
      Array.isArray(body.ref_roles) ? body.ref_roles.filter((role) => role === 'reference_video').length : 0,
      AI_VIDEO_OPERATOR_MAX_VIDEO_REFS,
    ),
    extraAudioCount: countFromBody(
      body,
      'extra_audio_count',
      Array.isArray(body.ref_roles) ? body.ref_roles.filter((role) => role === 'reference_audio').length : 0,
      AI_VIDEO_OPERATOR_MAX_AUDIO_REFS,
    ),
    durationSeconds,
    ratio,
    generateAudio: body.generate_audio === true,
  }
}

export function compileStudioPrompt(input: CompileStudioInput): CompileStudioResult {
  const spec = studioSkillMode(input.mode)
  const identity = detectStudioIdentity(input.characterName, input.idea)
  const warnings = collectWarnings(input)
  const sections = operatorPromptHasHeadings(input.idea)
    ? lockExistingSections(input, identity)
    : buildSections(input, identity)
  const prompt = sanitizeOperatorPrompt(joinSections(sections))
  if (!operatorPromptHasHeadings(prompt)) throw new Error('operator_prompt_headings')
  if (prompt.length > AI_VIDEO_OPERATOR_PROMPT_MAX) throw new Error('invalid_operator_prompt_long')
  const rawStill = input.kind === 'still' || input.mode === 'cinematic-reel'
    ? compileLookLockStill(input, identity)
    : null
  const stillPrompt = rawStill ? sanitizeOperatorPrompt(rawStill) : null
  return {
    prompt,
    stillPrompt,
    mode: input.mode,
    kind: input.kind,
    ratio: input.ratio,
    durationSeconds: input.durationSeconds,
    resolution: spec.defaultResolution,
    identity,
    warnings,
  }
}

export function presentCompileResult(result: CompileStudioResult) {
  return {
    prompt: result.prompt,
    still_prompt: result.stillPrompt,
    skill_mode: result.mode,
    output_kind: result.kind,
    ratio: result.ratio,
    duration_seconds: result.durationSeconds,
    resolution: result.resolution,
    identity: result.identity,
    warnings: result.warnings,
  }
}

function collectWarnings(input: CompileStudioInput): string[] {
  const warnings: string[] = []
  if (input.mode === 'coverage-montage') {
    warnings.push('Montase tetap satu generate. Pecah angle jadi job terpisah kalau mau coverage.')
  }
  if (input.mode === 'narrative-block' && input.durationSeconds > 15) {
    warnings.push('Blok narasi di atas 15 detik rawan drift. Pertahankan satu job per blok.')
  }
  if (input.mode === 'ugc-iphone' && /arri|anamorphic|gimbal|teal-orange/i.test(input.idea)) {
    warnings.push('UGC dan bahasa sinema saling bunuh. Compiler memegang look iPhone.')
  }
  if (input.mode === 'cinematic-reel' && /iphone|ugc|amateur/i.test(input.idea)) {
    warnings.push('Reel sinematik menahan look iPhone. Ganti mode ke UGC kalau mau HP.')
  }
  if (input.kind === 'still') {
    warnings.push('Look-lock still dikunci dulu. Generate video adalah job terpisah.')
  }
  return warnings
}

function buildReferences(
  characterName: string | null,
  hasStill: boolean,
  identity: StudioIdentityKey | null,
  extraRefCount = 0,
  extraVideoCount = 0,
  extraAudioCount = 0,
): string {
  const lines: string[] = []
  let next = 1
  if (characterName) {
    lines.push(
      `Image 1 is the character sheet for ${characterName}: FRONT, SIDE, BACK, CLOSE-UP panels on one plate.`,
    )
    lines.push(
      'Face lock to the CLOSE-UP panel. Match hair, skin, and build from the sheet. Do not invent a second person.',
    )
    next = 2
  } else {
    lines.push('No external character sheet. Do not invent a named face.')
  }
  if (hasStill) {
    lines.push(
      `Image ${next} is the place only. Keep that scene. Never take a face from Image ${next}. Composition / wardrobe / light / camera only. Donates zero face.`,
    )
    next += 1
  }
  for (let i = 0; i < extraRefCount; i += 1) {
    const n = next + i
    lines.push(
      `Image ${n} (@Image${n}) is a reference still. If the brief names @Image${n}, that photo is the look example. Keep wardrobe, object, and place. Never take a face from Image ${n}.`,
    )
  }
  for (let i = 0; i < extraVideoCount; i += 1) {
    const n = i + 1
    lines.push(
      `Video ${n} (@Video${n}) is motion, camera, and pacing only. Keep that move. Do not invent a second person from the clip.`,
    )
  }
  for (let i = 0; i < extraAudioCount; i += 1) {
    const n = i + 1
    lines.push(
      `Audio ${n} (@Audio${n}) is voice, ambience, or music. Match that timbre. Do not invent a second speaker.`,
    )
  }
  if (identity === 'richie' || identity === 'both') lines.push(RICHIE_FACE_LOCK)
  if (identity === 'renita' || identity === 'both') {
    lines.push(identity === 'both' ? RENITA_FACE_LOCK.replace(/Image 1 /g, 'Image 1 or Image 2 ') : RENITA_FACE_LOCK)
  }
  if (identity === 'both') {
    lines.push('She is 153 cm. He is 174 cm. The height gap is obvious in every two-shot. Her crown sits near his collarbone.')
  }
  if (identity === 'richie' || identity === 'both') {
    lines.push('Face, skull, hair 100% as Image 1 CLOSE-UP. Do not beautify.')
  }
  if (identity === 'renita' || identity === 'both') {
    lines.push('Face 100% as the sheet CLOSE-UP. Do not beautify. Do not slim. Nose width and cheek fullness stay.')
  }
  return lines.join('\n')
}

function modeSceneLead(mode: StudioSkillModeId, ratio: AiVideoOperatorRatio, seconds: number): string {
  switch (mode) {
    case 'ugc-iphone':
      return `Filmed with iPhone, handheld slight bounce, ${ratio}, ${seconds}s. One continuous shot, no cut.`
    case 'cinematic-reel':
      return `One continuous ${seconds}s take, ${ratio}. Motion and atmosphere only if a start frame exists. No cut.`
    case 'narrative-block':
      return `[NARRATIVE] One linked ${seconds}s block, ${ratio}. At most four timed beats. One continuous shot, no cut.`
    case 'coverage-montage':
      return `[COVERAGE] Source coverage for an edit, not the finished film, ${ratio}, ${seconds}s. Editor selects ranges.`
    default:
      return `One continuous shot, no cut. ${ratio}, ${seconds}s, real time.`
  }
}

function modeCamera(mode: StudioSkillModeId, ratio: AiVideoOperatorRatio, seconds: number): string {
  switch (mode) {
    case 'ugc-iphone':
      return `${seconds}s, ${ratio}. iPhone 15 Pro, 26mm, 24fps, natural HDR, handheld imperfections, autofocus breathing, subtle compression. Chest-to-eye height. Phone handheld only. No studio rig.`
    case 'cinematic-reel':
      return `${seconds}s, ${ratio}. Photoreal live-action. Shallow depth of field, 35mm grain, halation. One motivated move only — a short push or a locked hold. No orbit, no rack, no speed ramp.`
    case 'narrative-block':
      return `${seconds}s, ${ratio}. One motivated move or a motivated hold. Height and eyeline stay. No orbit.`
    case 'coverage-montage':
      return `${seconds}s, ${ratio}. Stable coverage. Distinct editorial options inside one take, not a finished cut.`
    default:
      return `${seconds}s, ${ratio}. Fixed camera. Handheld breath only. No shake, no sway, no push, no pull, no zoom, no rack. Name the room corner, height, and what stays in frame.`
  }
}

function modeLight(mode: StudioSkillModeId): string {
  if (mode === 'ugc-iphone') {
    return 'Soft window light from the left, natural indoor lighting, no harsh highlights. One practical, constant. Change is occlusion, not a lamp cue.'
  }
  if (mode === 'cinematic-reel') {
    return 'One motivated practical, constant. No glowing orb, no halo, no unmotivated rim beam. Brightness changes only when a body walks through a zone.'
  }
  return 'One practical source, constant from frame 1 to last. Night or day named. Change is occlusion or travel through a zone — never a lamp cue.'
}

function modePhysics(mode: StudioSkillModeId): string {
  if (mode === 'ugc-iphone') {
    return 'Weight in the product hold and walking bounce. Hands keep five fingers. Cloth follows the body. No extra limbs.'
  }
  return 'Hard object truth. Weight, contact, cloth lag. Two-sided objects keep both faces. Scale uses a named height if a person is in frame. No morph, no float.'
}

function modePerformance(mode: StudioSkillModeId, generateAudio: boolean): string {
  if (mode === 'ugc-iphone') {
    return generateAudio
      ? 'Casual creator talk. Fillers and pauses allowed. Action while speaking. Never a polished ad read. Never look at lens unless it is a talking-head brief.'
      : 'Casual body, quiet face. Automatic daily motion plus one micro-accent. Never look at lens. Closed mouth unless speech is requested.'
  }
  return 'Automatic daily motion plus one micro-accent. Never look at lens. Never extra business. Never slow motion. Closed mouth unless speech is requested.'
}

function modeSound(mode: StudioSkillModeId, generateAudio: boolean): string {
  if (generateAudio && mode === 'ugc-iphone') {
    return 'Native room speech, short and speakable. Room tone. No score. No subtitles.'
  }
  if (generateAudio) {
    return 'Diegetic speech only if the brief asks. Room tone. No score. No subtitles.'
  }
  return 'Diegetic only, in the order they happen. Room tone allowed. No score. No dialogue. No subtitles.'
}

function modeLocks(input: CompileStudioInput, identity: StudioIdentityKey | null): string {
  const locks: string[] = []
  if (identity === 'richie' || identity === 'both') {
    locks.push('Richie FACE LOCK from Image 1 CLOSE-UP. Anti-beautify. Empty ears. Black hair volume at forehead and temples even under a beanie. Small closed-mouth smile, never a K-idol grin.')
  }
  if (identity === 'renita' || identity === 'both') {
    locks.push('Renita FACE LOCK from the sheet CLOSE-UP. Anti-beautify. 153 cm. Warm auburn hair. Silver hoops. No AirPods.')
  }
  if (identity === 'both') {
    locks.push('Height gap stays visible: he 174 cm, she 153 cm. Her crown near his collarbone.')
  }
  if (input.characterName && !identity) {
    locks.push(`Face lock to the Image 1 CLOSE-UP panel for ${input.characterName}. Do not invent a cousin.`)
  }
  if (input.hasStill) locks.push('The scene still donates place, wardrobe silhouette, light, and camera only. Zero face.')
  if (input.mode === 'ugc-iphone') {
    locks.push('Filmed with iPhone look: visible pores, slight unevenness, no filter quality, handheld bounce. No studio softbox.')
    if (input.durationSeconds >= 8) {
      locks.push('If a product is named, it enters after 8s. Person first.')
    }
  }
  if (input.mode === 'cinematic-reel') {
    locks.push('Same person, same facial features, same hairstyle. No identity drift. Film grain and low saturation. One move only.')
  }
  locks.push(`Camera machine + ${input.durationSeconds}s + real time + the mode lock.`)
  locks.push(...SHARED_LOCKS)
  return locks.slice(0, 8).map((line, index) => `${index + 1} ${line}`).join('\n')
}

function modeTimeline(input: CompileStudioInput): string {
  const s = input.durationSeconds
  if (input.mode === 'ugc-iphone' && s >= 8) {
    return [
      `0.0–3.0s: person in a real room, mid-thought hook, no product name yet.`,
      `3.0–${Math.max(8, s - 2)}.0s: one clear hand or body action.`,
      `${Math.max(8, s - 2)}.0–${s}.0s: settle. Product may appear only after 8s if the brief names one.`,
    ].join('\n')
  }
  if (input.mode === 'narrative-block') {
    const q = s / 4
    return [
      `0.0–${q.toFixed(1)}s: setup in the named room.`,
      `${q.toFixed(1)}–${(q * 2).toFixed(1)}s: small conflict or task.`,
      `${(q * 2).toFixed(1)}–${(q * 3).toFixed(1)}s: one physical interaction.`,
      `${(q * 3).toFixed(1)}–${s}.0s: reversal or hold.`,
    ].join('\n')
  }
  if (s <= 5) {
    return `0.0–1.0s: settle into the frame.\n1.0–${(s - 1).toFixed(1)}s: the one job of the shot.\n${(s - 1).toFixed(1)}–${s}.0s: hold.`
  }
  return `0.0–1.5s: settle into the frame.\n1.5–${(s - 1).toFixed(1)}s: the one job of the shot, visible contact or travel.\n${(s - 1).toFixed(1)}–${s}.0s: hold. No second plot.`
}

function stripUserFiller(idea: string): string {
  return idea
    .replace(/\b(ultra\s+)?cinematic\b/gi, '')
    .replace(/\b(stunning|epic|atmospheric|photorealistic)\b/gi, '')
    .replace(/\bmake it more realistic\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function sceneFromIdea(input: CompileStudioInput): string {
  const lead = modeSceneLead(input.mode, input.ratio, input.durationSeconds)
  if (operatorPromptHasHeadings(input.idea)) {
    const existing = splitSections(input.idea)?.SCENE ?? ''
    return joinUniqueParagraph(lead, existing)
  }
  const body = stripUserFiller(input.idea)
  const subject = input.characterName
    ? `Only ${input.characterName} is in frame unless the brief names a second person.`
    : 'Only the named subject is in frame.'
  const premise = /[.!?]$/.test(body) ? body : `${body}.`
  return `${lead} ${premise} ${subject}`.replace(/\s{2,}/g, ' ').trim()
}

function buildSections(
  input: CompileStudioInput,
  identity: StudioIdentityKey | null,
): Record<(typeof AI_VIDEO_OPERATOR_HEADINGS)[number], string> {
  return {
    SCENE: sceneFromIdea(input),
    REFERENCES: buildReferences(
      input.characterName,
      input.hasStill,
      identity,
      input.extraRefCount || 0,
      input.extraVideoCount || 0,
      input.extraAudioCount || 0,
    ),
    PHYSICS: modePhysics(input.mode),
    LIGHT: modeLight(input.mode),
    CAMERA: modeCamera(input.mode, input.ratio, input.durationSeconds),
    TIMELINE: modeTimeline(input),
    PERFORMANCE: modePerformance(input.mode, input.generateAudio),
    SOUND: modeSound(input.mode, input.generateAudio),
    LOCKS: modeLocks(input, identity),
  }
}

function lockExistingSections(
  input: CompileStudioInput,
  identity: StudioIdentityKey | null,
): Record<(typeof AI_VIDEO_OPERATOR_HEADINGS)[number], string> {
  const current = splitSections(input.idea)
  if (!current) return buildSections(input, identity)
  const built = buildSections(input, identity)
  return {
    SCENE: joinUniqueParagraph(modeSceneLead(input.mode, input.ratio, input.durationSeconds), current.SCENE),
    REFERENCES: built.REFERENCES,
    PHYSICS: current.PHYSICS.trim() || built.PHYSICS,
    LIGHT: joinUniqueParagraph(modeLight(input.mode), current.LIGHT),
    CAMERA: joinUniqueParagraph(modeCamera(input.mode, input.ratio, input.durationSeconds), current.CAMERA),
    TIMELINE: current.TIMELINE.trim() || built.TIMELINE,
    PERFORMANCE: joinUniqueParagraph(modePerformance(input.mode, input.generateAudio), current.PERFORMANCE),
    SOUND: joinUniqueParagraph(modeSound(input.mode, input.generateAudio), current.SOUND),
    LOCKS: mergeLocks(current.LOCKS, built.LOCKS),
  }
}

function compileLookLockStill(
  input: CompileStudioInput,
  identity: StudioIdentityKey | null,
): string {
  const subject = input.characterName ?? 'the named subject'
  const frame = operatorPromptHasHeadings(input.idea)
    ? (splitSections(input.idea)?.SCENE ?? input.idea)
    : stripUserFiller(input.idea)
  const identityBlock = [
    identity === 'richie' || identity === 'both' ? RICHIE_FACE_LOCK : '',
    identity === 'renita' || identity === 'both' ? RENITA_FACE_LOCK : '',
    identity === 'both'
      ? 'She is 153 cm. He is 174 cm. The height gap is obvious.'
      : '',
  ].filter(Boolean).join('\n\n')
  return [
    'LOOK-LOCK STILL',
    `This is frame 0 of the take. Mid-action, not a posed catalog picture. One lamp on face, cloth, and ground. ${subject} is mid-verb. Seedance must start exactly here.`,
    '',
    'IDENTITY',
    identityBlock || `Face lock to the Image 1 CLOSE-UP panel for ${subject}. Do not beautify.`,
    '',
    'FRAME',
    `${frame} Mid-step or mid-reach. Slight motion softness on the unfinished part. Not both-feet-planted studio hero.`,
    '',
    'LIGHT',
    'One practical source. Same lamp on face and world. No beauty fill. No glowing orb.',
    '',
    'CAMERA',
    `${input.ratio}, locked. Eyes sharp if a face is in frame. 50–85mm feel, not a distorted selfie wide.`,
    '',
    'SKIN',
    'Matte skin with microrelief, visible pores, moles, slight sweat and shine in the T-zone, unretouched, no beauty filter.',
    '',
    'LOCKS',
    '1 Face from the character sheet CLOSE-UP only.',
    '2 Mid-action, not a pose.',
    '3 One lamp.',
    '4 Anti-beautify. No slim midface, no idol eyes, no porcelain skin.',
    '5 No logo, subtitle, watermark, or readable shop name.',
  ].join('\n')
}

function splitSections(
  prompt: string,
): Record<(typeof AI_VIDEO_OPERATOR_HEADINGS)[number], string> | null {
  if (!operatorPromptHasHeadings(prompt)) return null
  const found = AI_VIDEO_OPERATOR_HEADINGS.map((heading) => ({
    heading,
    start: prompt.indexOf(heading),
  }))
  if (found.some((row) => row.start < 0)) return null
  const ordered = [...found].sort((a, b) => a.start - b.start)
  const out = {} as Record<(typeof AI_VIDEO_OPERATOR_HEADINGS)[number], string>
  for (let i = 0; i < ordered.length; i += 1) {
    const row = ordered[i]
    const next = ordered[i + 1]
    const body = prompt.slice(row.start + row.heading.length, next ? next.start : prompt.length)
    out[row.heading] = body.replace(/^\s*:?\s*/, '').trim()
  }
  return out
}

function joinSections(
  sections: Record<(typeof AI_VIDEO_OPERATOR_HEADINGS)[number], string>,
): string {
  return AI_VIDEO_OPERATOR_HEADINGS
    .map((heading) => `${heading}\n${sections[heading].trim()}`)
    .join('\n\n')
}

function joinUniqueParagraph(lead: string, existing: string): string {
  const body = existing.trim()
  if (!body) return lead
  if (body.toLowerCase().includes(lead.slice(0, 24).toLowerCase())) return body
  return `${lead} ${body}`.replace(/\s{2,}/g, ' ').trim()
}

function mergeLocks(existing: string, compiled: string): string {
  const lines = [...existing.split('\n'), ...compiled.split('\n')]
    .map((line) => line.replace(/^\d+\s+/, '').trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const unique: string[] = []
  for (const line of lines) {
    const key = line.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(line)
  }
  return unique.slice(0, 8).map((line, index) => `${index + 1} ${line}`).join('\n')
}
