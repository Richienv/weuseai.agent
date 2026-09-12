import { AI_VIDEO_OPERATOR_HEADINGS, type AiVideoOperatorRatio } from './ai-video-operator.js'
import type { StudioSkillModeId } from './ai-video-skill-stack.js'

export type AiVideoExampleKind = 'video' | 'still'

export type AiVideoExample = {
  id: string
  title: string
  tags: string[]
  kind: AiVideoExampleKind
  ratio: AiVideoOperatorRatio
  durationSeconds: number
  clip: string | null
  thumb: string
  prompt: string | null
  canGenerate: boolean
  skillMode?: StudioSkillModeId
}

function seedancePrompt(parts: Record<(typeof AI_VIDEO_OPERATOR_HEADINGS)[number], string>): string {
  return AI_VIDEO_OPERATOR_HEADINGS.map((heading) => `${heading}\n${parts[heading]}`).join('\n\n')
}

const LOCKS = 'One subject unless named. No logo, subtitle, watermark, readable shop name, or extra product. Faces stay as the attached refs.'

export const AI_VIDEO_EXAMPLE_CATALOG: readonly AiVideoExample[] = [
  {
    id: 'show-explore', title: 'Utama', tags: ['genre', 'wide', 'travel'], kind: 'video',
    ratio: '21:9', durationSeconds: 6, canGenerate: true, skillMode: 'one-take-locked',
    clip: '/assets/ads/hf/show-explore.mp4', thumb: '/assets/ads/hf/thumb-explore.jpg',
    prompt: seedancePrompt({
      SCENE: 'Wide travel plate. One person at a real overlook. Sky, ground, and scale stay locked. One continuous take.',
      REFERENCES: 'Image 1 is FACE LOCK. Image 2 is wardrobe and body. Do not invent a second person.',
      PHYSICS: 'Wind on jacket and hair. Weight in the stance. Distant haze, not fog soup.',
      LIGHT: 'Late-day sun from camera right. Hard edges on the ridge. Soft fill from open sky.',
      CAMERA: '21:9, locked wide, 35mm equivalent. Horizon level. No orbit.',
      TIMELINE: '0-6s hold, then a two-step walk into the frame and stop.',
      PERFORMANCE: 'Quiet look across the land. No look at lens. Closed mouth.',
      SOUND: 'Wind and distant traffic only.',
      LOCKS,
    }),
  },
  {
    id: 'show-219', title: 'Scene', tags: ['genre', 'wide', 'scene'], kind: 'video',
    ratio: '21:9', durationSeconds: 6, canGenerate: true, skillMode: 'one-take-locked',
    clip: '/assets/ads/hf/show-219.mp4', thumb: '/assets/ads/hf/thumb-219.jpg',
    prompt: seedancePrompt({
      SCENE: 'Ultra-wide lived-in place. Architecture, ground, and weather stay physical. One person crosses the frame.',
      REFERENCES: 'Attached face crops are FACE LOCK. Location still donates place only, never a new face.',
      PHYSICS: 'Footfalls on real ground. Cloth lag. No floating extras.',
      LIGHT: 'Motivated practicals and sky. No beauty fill.',
      CAMERA: '21:9 locked wide. Eye-level. No crane.',
      TIMELINE: '0-6s walk from frame left, pause mid-frame, continue out.',
      PERFORMANCE: 'Task-focused. No smile at camera.',
      SOUND: 'Room tone and footsteps only.',
      LOCKS,
    }),
  },
  {
    id: 'show-reels', title: 'Action', tags: ['genre', 'reels', 'action'], kind: 'video',
    ratio: '9:16', durationSeconds: 6, canGenerate: true, skillMode: 'one-take-locked',
    clip: '/assets/ads/show-reels.mp4', thumb: '/assets/ads/thumb-reels.jpg',
    prompt: seedancePrompt({
      SCENE: 'Vertical action beat in one location. Fast entry, one clear move, clean hold.',
      REFERENCES: 'Face crops first. Wardrobe sheet second. No generated beauty face.',
      PHYSICS: 'Real momentum. Hair and cloth follow the move. No slow-mo.',
      LIGHT: 'Hard available light. No studio beauty ring.',
      CAMERA: '9:16, handheld-stable, chest height. One push-in if the move needs it.',
      TIMELINE: '0-1s entry. 1-4s action. 4-6s hold.',
      PERFORMANCE: 'Committed body, quiet face. No look at lens.',
      SOUND: 'Ambient only.',
      LOCKS,
    }),
  },
  {
    id: 'show-4k', title: 'Camera', tags: ['genre', 'camera'], kind: 'video',
    ratio: '16:9', durationSeconds: 6, canGenerate: true, skillMode: 'cinematic-reel',
    clip: '/assets/ads/hf/show-4k.mp4', thumb: '/assets/ads/hf/thumb-4k.jpg',
    prompt: seedancePrompt({
      SCENE: 'Camera-forward product of motion. The lens move is the subject. Place stays still.',
      REFERENCES: 'Face lock from attached stills. Environment from the gold thumb only as place.',
      PHYSICS: 'Parallax on near objects. No morph. No warp on walls.',
      LIGHT: 'Continuous daylight. Highlights stay put.',
      CAMERA: '16:9, slow lateral track, 50mm. Horizon locked.',
      TIMELINE: '0-6s one continuous track. No cut.',
      PERFORMANCE: 'Still body, eyes off lens.',
      SOUND: 'Soft outdoor bed only.',
      LOCKS,
    }),
  },
  {
    id: 'show-movie', title: 'Fight', tags: ['genre', 'fight', 'movie'], kind: 'video',
    ratio: '16:9', durationSeconds: 6, canGenerate: true, skillMode: 'cinematic-reel',
    clip: '/assets/ads/hf/show-movie.mp4', thumb: '/assets/ads/hf/thumb-movie.jpg',
    prompt: seedancePrompt({
      SCENE: 'Close-quarters fight beat. Two bodies, one alley or room. Contact reads, no blood spray.',
      REFERENCES: 'Named faces from attached refs only. Wardrobe locked to the sheets.',
      PHYSICS: 'Weight on hits. Feet plant. Cloth snap. No wire-fu float.',
      LIGHT: 'Hard side key. Deep shadows. Practicals only.',
      CAMERA: '16:9, 35mm, locked or one short push. No orbit.',
      TIMELINE: '0-2s approach. 2-5s two hits. 5-6s hold.',
      PERFORMANCE: 'Tense faces. No look at lens. No grin.',
      SOUND: 'Body hits and room tone. No score.',
      LOCKS,
    }),
  },
  {
    id: 'show-lock', title: 'Chase', tags: ['genre', 'chase'], kind: 'video',
    ratio: '16:9', durationSeconds: 6, canGenerate: true, skillMode: 'cinematic-reel',
    clip: '/assets/ads/hf/show-lock.mp4', thumb: '/assets/ads/hf/thumb-lock.jpg',
    prompt: seedancePrompt({
      SCENE: 'Chase through one street. Runner in front, pursuer behind. Same block the whole take.',
      REFERENCES: 'FACE LOCK from attached crops. Street from location still only.',
      PHYSICS: 'Real running gait. Arms pump. Dust at the feet.',
      LIGHT: 'Available street light. No beauty fill.',
      CAMERA: '16:9, chase cam behind at chest height. Stable, not shaky-cam chaos.',
      TIMELINE: '0-6s continuous run, one glance back at 4s.',
      PERFORMANCE: 'Breathing hard. Eyes forward except the glance.',
      SOUND: 'Footsteps and traffic. No score.',
      LOCKS,
    }),
  },
  {
    id: 'show-foto', title: 'B-roll', tags: ['genre', 'broll'], kind: 'video',
    ratio: '9:16', durationSeconds: 6, canGenerate: true, skillMode: 'one-take-locked',
    clip: '/assets/ads/show-foto.mp4', thumb: '/assets/ads/thumb-foto.jpg',
    prompt: seedancePrompt({
      SCENE: 'Quiet hands-and-place B-roll. Object, light, and table stay the same.',
      REFERENCES: 'If a person appears, attached face crops are FACE LOCK. Else no face.',
      PHYSICS: 'Small real motions only. Steam, dust, or fabric shift.',
      LIGHT: 'Window key. Soft falloff. No extra lights.',
      CAMERA: '9:16 locked off. Macro-adjacent but not medical close.',
      TIMELINE: '0-6s one hold with one hand move.',
      PERFORMANCE: 'Hands only, or a still face off-lens.',
      SOUND: 'Room tone.',
      LOCKS,
    }),
  },
  {
    id: 'show-cat', title: 'Acting', tags: ['genre', 'acting'], kind: 'video',
    ratio: '9:16', durationSeconds: 6, canGenerate: true, skillMode: 'one-take-locked',
    clip: '/assets/ads/show-cat.mp4', thumb: '/assets/ads/thumb-iklan.jpg',
    prompt: seedancePrompt({
      SCENE: 'One actor, one beat, one room. The acting is a small change in the face, not a speech.',
      REFERENCES: 'Attached selfies are FACE LOCK. Wardrobe from the sheet.',
      PHYSICS: 'Blink, breath, micro-weight shift. No morph.',
      LIGHT: 'Soft window. Catchlight in both eyes. No beauty blur.',
      CAMERA: '9:16, 50mm, locked. Eyes sit in the upper third.',
      TIMELINE: '0-6s listen, then a small reaction at 4s.',
      PERFORMANCE: 'Off-lens eyeline. Closed mouth unless the brief asks for one word.',
      SOUND: 'Room tone. No score.',
      LOCKS,
    }),
  },
  {
    id: 'show-cinema', title: 'Vlog', tags: ['genre', 'cinema', 'vlog'], kind: 'video',
    ratio: '16:9', durationSeconds: 6, canGenerate: true, skillMode: 'cinematic-reel',
    clip: '/assets/ads/hf/show-cinema.mp4', thumb: '/assets/ads/hf/thumb-cinema.jpg',
    prompt: seedancePrompt({
      SCENE: 'Long-take walk through a real interior or street. Cinema grade, not selfie-vlog shake.',
      REFERENCES: 'FACE LOCK from attached crops. Place from location still.',
      PHYSICS: 'Walk cycle is even. Background parallax is real.',
      LIGHT: 'Motivated practicals. No overlay grade shift mid-take.',
      CAMERA: '16:9, 35mm, slow follow. Horizon level.',
      TIMELINE: '0-6s one walk, one pause at a door or corner.',
      PERFORMANCE: 'Eyes explore the place. No look at lens.',
      SOUND: 'Footsteps and room.',
      LOCKS,
    }),
  },
  {
    id: 'show-music', title: 'Music', tags: ['genre', 'music'], kind: 'video',
    ratio: '16:9', durationSeconds: 6, canGenerate: true, skillMode: 'cinematic-reel',
    clip: '/assets/ads/hf/show-music.mp4', thumb: '/assets/ads/hf/thumb-music.jpg',
    prompt: seedancePrompt({
      SCENE: 'Performance plate. One musician or dancer, one stage or room. Body keeps time.',
      REFERENCES: 'FACE LOCK from attached refs. Instrument or wardrobe from the still.',
      PHYSICS: 'Hands and cloth follow the beat. No extra limbs.',
      LIGHT: 'Stage key and backlight. No random color strobes.',
      CAMERA: '16:9 locked or one slow push. 35mm.',
      TIMELINE: '0-6s continuous performance. No cut on the beat.',
      PERFORMANCE: 'In-character, off-lens. Mouth may move if singing is requested.',
      SOUND: 'Ambient room. Do not invent a scored track.',
      LOCKS,
    }),
  },
  {
    id: 'show-product', title: 'Produk', tags: ['genre', 'product', 'iklan'], kind: 'video',
    ratio: '16:9', durationSeconds: 6, canGenerate: true, skillMode: 'ugc-iphone',
    clip: '/assets/ads/hf/show-product.mp4', thumb: '/assets/ads/hf/thumb-product.jpg',
    prompt: seedancePrompt({
      SCENE: 'Product hero on a real table. Hands enter, prove the object, hold the last frame.',
      REFERENCES: 'Product still is object lock. Person face only if attached.',
      PHYSICS: 'Reflections and weight are real. No extra logo.',
      LIGHT: 'Soft top and one warm practical. Speculars stay still.',
      CAMERA: '16:9, 50mm, locked. Caption-safe edges.',
      TIMELINE: '0-2s empty hero. 2-5s hands. 5-6s hold.',
      PERFORMANCE: 'Hands only unless a face ref is attached.',
      SOUND: 'Soft table contact.',
      LOCKS,
    }),
  },
  {
    id: 'show-portrait', title: 'Portrait', tags: ['genre', 'portrait'], kind: 'video',
    ratio: '9:16', durationSeconds: 6, canGenerate: true, skillMode: 'one-take-locked',
    clip: '/assets/ads/hf/show-portrait.mp4', thumb: '/assets/ads/hf/thumb-portrait.jpg',
    prompt: seedancePrompt({
      SCENE: 'Still portrait that breathes. Head-and-shoulders. Background simple.',
      REFERENCES: 'Attached selfies are FACE LOCK. Do not beautify the nose, eyes, or skin.',
      PHYSICS: 'Blink and breath only. Hair may move in a light draft.',
      LIGHT: 'Window key, soft shadow. No beauty blur.',
      CAMERA: '9:16, 85mm equivalent, locked. Eyes sharp.',
      TIMELINE: '0-6s hold. One blink around 3s.',
      PERFORMANCE: 'Off-lens. Small closed-mouth rest face.',
      SOUND: 'Room tone.',
      LOCKS,
    }),
  },
  {
    id: 'show-impact', title: 'Poster', tags: ['genre', 'poster', 'impact'], kind: 'video',
    ratio: '16:9', durationSeconds: 6, canGenerate: true, skillMode: 'one-take-locked',
    clip: '/assets/ads/hf/show-impact.mp4', thumb: '/assets/ads/hf/thumb-impact.jpg',
    prompt: seedancePrompt({
      SCENE: 'Poster-grade still that starts to live. Same composition the whole take. No new objects.',
      REFERENCES: 'Subject from attached still. Empty air at the edges stays empty for later type.',
      PHYSICS: 'Dust, cloth, or light shift only. Geometry locked.',
      LIGHT: 'The still’s light continues. No new source.',
      CAMERA: '16:9 locked. No push.',
      TIMELINE: '0-6s hold with one micro-move.',
      PERFORMANCE: 'Frozen pose, live eyes if a face is present.',
      SOUND: 'Ambient only.',
      LOCKS,
    }),
  },
  {
    id: 'clip-1', title: 'Kantor', tags: ['clip', 'office'], kind: 'video',
    ratio: '9:16', durationSeconds: 6, canGenerate: true, skillMode: 'one-take-locked',
    clip: '/assets/ads/hf/clip-1.mp4', thumb: '/assets/ads/hf/thumb-clip-1.jpg',
    prompt: seedancePrompt({
      SCENE: 'Office desk, daytime. One person sits, works, looks up once.',
      REFERENCES: 'FACE LOCK from attached crops. Office from the gold thumb as place only.',
      PHYSICS: 'Chair roll, keyboard, paper. No extra coworkers.',
      LIGHT: 'Overhead office plus window. Fluorescent-real, not glam.',
      CAMERA: '9:16 locked across the desk.',
      TIMELINE: '0-4s work. 4-6s look up past camera.',
      PERFORMANCE: 'Focused, then a short listen. No look at lens.',
      SOUND: 'HVAC and keys.',
      LOCKS,
    }),
  },
  {
    id: 'clip-2', title: 'Diner', tags: ['clip', 'diner'], kind: 'video',
    ratio: '9:16', durationSeconds: 6, canGenerate: true, skillMode: 'one-take-locked',
    clip: '/assets/ads/hf/clip-2.mp4', thumb: '/assets/ads/hf/thumb-clip-2.jpg',
    prompt: seedancePrompt({
      SCENE: 'Diner booth. One person, coffee, window. Night or late afternoon outside.',
      REFERENCES: 'FACE LOCK from attached crops. Booth from the gold thumb.',
      PHYSICS: 'Steam from the cup. Condensation on glass. Weight in the seat.',
      LIGHT: 'Warm pendant and cool window. Mixed color is allowed.',
      CAMERA: '9:16 locked across the table.',
      TIMELINE: '0-6s sip, then look out the window.',
      PERFORMANCE: 'Quiet. Off-lens.',
      SOUND: 'Diner murmur.',
      LOCKS,
    }),
  },
  {
    id: 'clip-3', title: 'Baju', tags: ['clip', 'wardrobe'], kind: 'video',
    ratio: '9:16', durationSeconds: 6, canGenerate: true, skillMode: 'one-take-locked',
    clip: '/assets/ads/hf/clip-3.mp4', thumb: '/assets/ads/hf/thumb-clip-3.jpg',
    prompt: seedancePrompt({
      SCENE: 'Wardrobe proof. One person turns so front, three-quarter, and cloth read.',
      REFERENCES: 'FACE LOCK from selfies. Wardrobe from the sheet stills.',
      PHYSICS: 'Cloth hang and turn. No outfit change mid-take.',
      LIGHT: 'Even daylight or soft studio. No beauty blur.',
      CAMERA: '9:16 locked full-body. Feet in frame.',
      TIMELINE: '0-6s slow turn, stop at three-quarter.',
      PERFORMANCE: 'Neutral face. Off-lens.',
      SOUND: 'Room tone.',
      LOCKS,
    }),
  },
  {
    id: 'show-look3', title: 'Story', tags: ['story', 'identity'], kind: 'video',
    ratio: '9:16', durationSeconds: 6, canGenerate: true, skillMode: 'one-take-locked',
    clip: '/assets/ads/show-look3.mp4', thumb: '/assets/ads/thumb-look3.jpg',
    prompt: seedancePrompt({
      SCENE: 'Identity-locked story beat. Same face, new place. One action only.',
      REFERENCES: 'Customer or named-face crops first. Sheet stills for body. Place still last.',
      PHYSICS: 'Body proportions stay. Height gap stays if two people are supplied.',
      LIGHT: 'Match the place still. No glamour grade.',
      CAMERA: '9:16 locked unless the brief asks for a walk.',
      TIMELINE: '0-6s one action and a hold.',
      PERFORMANCE: 'In-character, off-lens.',
      SOUND: 'Ambient.',
      LOCKS,
    }),
  },
  {
    id: 't1-21-9', title: 'Scene', tags: ['made', 'wide', 'story'], kind: 'video',
    ratio: '21:9', durationSeconds: 10, canGenerate: true, skillMode: 'one-take-locked',
    clip: '/assets/ads/made/t1-21-9.mp4', thumb: '/assets/ads/made/t1-21-9.jpg',
    prompt: seedancePrompt({
      SCENE: 'Inside the cab of a small Japanese village bus. A young woman in a pink tee and white chef hat holds a soft-serve cone at the wheel, phone mounted on the dash. Wooden houses line the street ahead. One continuous take.',
      REFERENCES: 'Image 1 is FACE LOCK. Image 2 is wardrobe and body. Do not invent a second person in the cab.',
      PHYSICS: 'The bus idles with a gentle rock. The cone stays solid, one slow taste, no melting jumps.',
      LIGHT: 'Late-morning sun through the windshield from camera left. Soft bounce off the dash.',
      CAMERA: '21:9 locked from the rear of the cab, 28mm equivalent. Windshield fills the frame. No orbit.',
      TIMELINE: '0-4s she watches the road and tastes the cone. 4-8s a glance at the phone on the dash. 8-10s back to the road with a small smile.',
      PERFORMANCE: 'Relaxed, off-lens. Closed-mouth smile.',
      SOUND: 'Idle engine, distant birds.',
      LOCKS,
    }),
  },
  {
    id: 'r1-21-9', title: 'Action', tags: ['made', 'wide', 'drama'], kind: 'video',
    ratio: '21:9', durationSeconds: 15, canGenerate: true, skillMode: 'one-take-locked',
    clip: '/assets/ads/made/r1-21-9.mp4', thumb: '/assets/ads/made/r1-21-9.jpg',
    prompt: seedancePrompt({
      SCENE: 'Snow slope at a small ski resort. A young woman in a purple gingham snow jacket and gray beanie faces a figure in an orange parka seen over the shoulder. A tearful talk. One continuous take.',
      REFERENCES: 'Image 1 is FACE LOCK. Image 2 is wardrobe and body. The orange parka stays back-to-camera.',
      PHYSICS: 'Breath fogs in the cold. Mittens press together at her chest. Loose hair moves in light wind.',
      LIGHT: 'Overcast snow bounce, soft and even. No hard shadows.',
      CAMERA: '21:9 over-the-shoulder medium, 50mm equivalent. Locked. No orbit.',
      TIMELINE: '0-6s she listens, eyes wet. 6-11s one short reply. 11-15s she looks down at her mittens and back up.',
      PERFORMANCE: 'Held-back tears, small jaw tremble. Off-lens.',
      SOUND: 'Wind over snow, distant lift hum.',
      LOCKS,
    }),
  },
  {
    id: 'w1-21-9', title: 'Fight', tags: ['made', 'wide', 'scifi'], kind: 'video',
    ratio: '21:9', durationSeconds: 15, canGenerate: true, skillMode: 'one-take-locked',
    clip: '/assets/ads/made/w1-21-9.mp4', thumb: '/assets/ads/made/w1-21-9.jpg',
    prompt: seedancePrompt({
      SCENE: 'A man floats inside a glowing cyan tank in a dark lab, orange suit, electrode pads and wires on his chest, hair fanned in the water. One continuous take.',
      REFERENCES: 'Image 1 is FACE LOCK. Image 2 is suit and body. No second person.',
      PHYSICS: 'Hair and wires drift with the water. Small bubbles rise. The waterline stays inside the tank.',
      LIGHT: 'Cyan glow from inside the tank, dim gray lab above. One practical rim along the tank edge.',
      CAMERA: '21:9 top-down from above the tank, 35mm equivalent. Locked. No orbit.',
      TIMELINE: '0-5s still, eyes closed. 5-8s eyes snap open, cheeks puff. 8-15s he grips the tank edges and pushes toward the surface.',
      PERFORMANCE: 'Startled, wide eyes, off-lens.',
      SOUND: 'Muffled water, low lab hum.',
      LOCKS,
    }),
  },
  {
    id: 'z1-21-9', title: 'Camera', tags: ['made', 'wide', 'chase'], kind: 'video',
    ratio: '21:9', durationSeconds: 20, canGenerate: true, skillMode: 'one-take-locked',
    clip: '/assets/ads/made/z1-21-9.mp4', thumb: '/assets/ads/made/z1-21-9.jpg',
    prompt: seedancePrompt({
      SCENE: 'Narrow market alley with closed shutters, wet asphalt, stacked orange crates. A woman in a cream sweater runs toward camera; a man in a navy cardigan chases a few steps behind. One continuous take.',
      REFERENCES: 'Image 1 is FACE LOCK for the woman. Image 2 is FACE LOCK for the man. Image 3 is wardrobe. No third person.',
      PHYSICS: 'Real footfalls on wet asphalt. Weight in the run, the sweater bounces. The crates stay put.',
      LIGHT: 'Flat overcast daylight down the alley. No neon.',
      CAMERA: '21:9 handheld tracking backward ahead of the woman, 35mm equivalent. Mild shake, no whip pans.',
      TIMELINE: '0-8s she runs past the crates. 8-14s he closes the gap and calls once. 14-20s she glances back and keeps running out of frame.',
      PERFORMANCE: 'Urgent but controlled, off-lens.',
      SOUND: 'Footfalls, one shutter rattle, alley wind.',
      LOCKS,
    }),
  },
  still('look-sheet-tee', 'Sheet tee', '/assets/ads/look-sheet-tee.jpg', ['sheet']),
  still('look-sheet-chef', 'Sheet chef', '/assets/ads/look-sheet-chef.jpg', ['sheet']),
  still('look-sheet-suit', 'Sheet suit', '/assets/ads/look-sheet-suit.jpg', ['sheet']),
  still('look-sheet-jade', 'Sheet jade', '/assets/ads/look-sheet-jade.jpg', ['sheet']),
  still('look-char-richie', 'Richie', '/assets/ads/look-char-richie.jpg', ['face']),
  still('look-char-renita', 'Renita', '/assets/ads/look-char-renita.jpg', ['face']),
  still('look-char-kimono', 'Kimono', '/assets/ads/look-char-kimono.jpg', ['face']),
  still('look-char-studio', 'Studio', '/assets/ads/look-char-studio.jpg', ['face']),
]

function still(id: string, title: string, thumb: string, tags: string[]): AiVideoExample {
  return {
    id, title, tags, kind: 'still', ratio: '1:1', durationSeconds: 6,
    clip: null, thumb, prompt: null, canGenerate: false,
  }
}

export function listAiVideoExamples(): readonly AiVideoExample[] {
  return AI_VIDEO_EXAMPLE_CATALOG
}

export function getAiVideoExample(id: string): AiVideoExample | null {
  return AI_VIDEO_EXAMPLE_CATALOG.find((row) => row.id === id) ?? null
}

export function landingShowcaseVideos(): readonly string[] {
  return AI_VIDEO_EXAMPLE_CATALOG.filter((row) => row.kind === 'video' && row.clip).map((row) => row.clip as string)
}
