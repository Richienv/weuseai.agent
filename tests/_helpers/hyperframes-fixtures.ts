// Synthetic HyperFrames inputs for tests.

import type {
  HyperFramesInput,
  HyperFramesScene,
} from '../../supabase/functions/_shared/render-providers/types.ts'

export function buildScene(overrides: Partial<HyperFramesScene> = {}): HyperFramesScene {
  return {
    scene_id: overrides.scene_id ?? 1,
    timestamp: overrides.timestamp ?? '0:00-0:03',
    visual_prompt:
      overrides.visual_prompt ??
      'POV close-up shot of phone screen showing low bank balance, soft natural light',
    motion_hint: overrides.motion_hint ?? 'slow zoom in',
    duration_sec: overrides.duration_sec ?? 3,
    audio_cue: overrides.audio_cue,
    transition_to_next: overrides.transition_to_next ?? 'cut',
  }
}

export function buildInput(overrides: Partial<HyperFramesInput> = {}): HyperFramesInput {
  const scenes = overrides.scenes ?? [
    buildScene({ scene_id: 1, duration_sec: 3, transition_to_next: 'cut' }),
    buildScene({ scene_id: 2, duration_sec: 5, transition_to_next: 'whip-pan' }),
    buildScene({ scene_id: 3, duration_sec: 2, transition_to_next: 'fade-out' }),
  ]
  const totalDur = scenes.reduce((s, sc) => s + sc.duration_sec, 0)
  return {
    version: 'hyperframes/1.0',
    metadata: {
      aspect_ratio: '9:16',
      target_renderer: 'runway',
      total_duration_sec: totalDur,
      style_direction: 'vlog',
      ...overrides.metadata,
    },
    scenes,
  }
}
