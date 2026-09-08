export type AiVideoPromptCategory =
  | 'ugc-product-ad'
  | 'cinematic-product'
  | 'consistent-character'
  | 'image-to-video'
  | 'storyboard-sequence'
  | 'reels-broll'

export type AiVideoRatio = '9:16' | '16:9' | '1:1' | 'adaptive'

export type AiVideoPromptStrategy = {
  id: AiVideoPromptCategory
  version: 1
  systemInstruction: string
  requiredInputs: string[]
  defaultRatio: AiVideoRatio
  defaultDurationSeconds: number
  generateAudio: boolean
}

const BASE_RULES = [
  'Return one JSON object only: category, title, prompt, ratio, durationSeconds, generateAudio.',
  'Write production-ready visual direction with subject, action, environment, lighting, lens, camera movement, timing, and continuity.',
  'Preserve exact product labels and identity traits supplied by the customer. Never invent brand claims.',
  'Use one clear action per shot and physically plausible movement. Avoid empty quality adjectives.',
  'Do not include model names, API keys, callback URLs, or safety-bypass instructions.',
].join(' ')

export const AI_VIDEO_PROMPT_CATALOG: readonly AiVideoPromptStrategy[] = [
  {
    id: 'ugc-product-ad', version: 1, requiredInputs: ['product', 'audience', 'hook'],
    defaultRatio: '9:16', defaultDurationSeconds: 6, generateAudio: false,
    systemInstruction: `${BASE_RULES} Build a believable handheld UGC ad with an immediate visual hook, natural interaction, product proof, and a clean closing product moment.`,
  },
  {
    id: 'cinematic-product', version: 1, requiredInputs: ['product', 'mood'],
    defaultRatio: '9:16', defaultDurationSeconds: 6, generateAudio: false,
    systemInstruction: `${BASE_RULES} Build a restrained cinematic product reveal using motivated light, macro detail, realistic reflections, and a deliberate hero frame.`,
  },
  {
    id: 'consistent-character', version: 1, requiredInputs: ['character_reference', 'scene'],
    defaultRatio: '9:16', defaultDurationSeconds: 6, generateAudio: false,
    systemInstruction: `${BASE_RULES} Lock face structure, age, hair, body proportions, wardrobe, and distinguishing traits from the reference. Change only requested action, framing, and location.`,
  },
  {
    id: 'image-to-video', version: 1, requiredInputs: ['keyframe', 'motion'],
    defaultRatio: 'adaptive', defaultDurationSeconds: 5, generateAudio: false,
    systemInstruction: `${BASE_RULES} Animate the keyframe with subtle parallax, continuous lighting, stable geometry, controlled subject motion, and no unwanted object morphing.`,
  },
  {
    id: 'storyboard-sequence', version: 1, requiredInputs: ['story', 'ending_beat'],
    defaultRatio: '16:9', defaultDurationSeconds: 10, generateAudio: false,
    systemInstruction: `${BASE_RULES} Convert the story into a concise sequence with shot purpose, eyeline and directional continuity, motivated transitions, and a clear final beat.`,
  },
  {
    id: 'reels-broll', version: 1, requiredInputs: ['topic', 'tone'],
    defaultRatio: '9:16', defaultDurationSeconds: 6, generateAudio: false,
    systemInstruction: `${BASE_RULES} Create vertical B-roll with a fast visual entry, three purposeful actions, human-scale camera placement, and caption-safe negative space for voiceover editing.`,
  },
] as const

export function getAiVideoPromptStrategy(category: AiVideoPromptCategory): AiVideoPromptStrategy {
  const strategy = AI_VIDEO_PROMPT_CATALOG.find((entry) => entry.id === category)
  if (!strategy) throw new Error('unknown_ai_video_prompt_category')
  return strategy
}

export function inferAiVideoPromptCategory(brief: string, hasImage: boolean): AiVideoPromptCategory {
  const normalized = brief.toLowerCase()
  if (/character|karakter|wajah|face|consistent/.test(normalized)) return 'consistent-character'
  if (/story|cerita|storyboard|sequence|scene/.test(normalized)) return 'storyboard-sequence'
  if (/ugc|testimoni|testimonial|iklan|ad\b/.test(normalized)) return 'ugc-product-ad'
  if (/b-?roll|reels|voice ?over|vo\b/.test(normalized)) return 'reels-broll'
  if (hasImage && /produk|product|reveal|cinematic|premium/.test(normalized)) return 'cinematic-product'
  return hasImage ? 'image-to-video' : 'reels-broll'
}
