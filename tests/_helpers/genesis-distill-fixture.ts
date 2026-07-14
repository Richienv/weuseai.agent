/**
 * Genesis-distill test fixture — a realistic raw sample blob plus a canned
 * distill LLM that returns the JSON the prod deepseek-chat call would, shaped
 * to PASS the brand/sanitizer gates (Bahasa "kamu", zero banned words, zero
 * exclamation marks). Mirrors the genesis-fixture pattern.
 */

import type { GenesisDistillLlm } from '../../supabase/functions/_shared/genesis-distill-handler.ts'

/** What a real-estate agent might forward: a listing caption + a chat. */
export const FIXTURE_SAMPLES = `Listing baru: Rumah BSD 3 kamar, 2,8M, sertifikat SHM, dekat AEON.
Hubungi saya untuk viewing akhir pekan ini.

Chat klien:
Klien: Pak, yang cluster Foresta masih ada?
Saya: Masih ada satu unit hadap selatan, saya kirim foto dan price list ya.
Klien: Boleh, sekalian simulasi KPR-nya.
Saya: Siap, saya buatkan simulasi cicilan 15 dan 20 tahun.`

export const FIXTURE_DISTILL_JSON = JSON.stringify({
  role: 'Agen properti yang menjual rumah di area BSD dan sekitarnya',
  daily_tasks:
    'Menyiapkan listing, membalas pertanyaan klien soal unit, dan membuat simulasi KPR',
  outputs: 'Caption listing, price list, simulasi cicilan KPR, jadwal viewing',
  tools: 'belum kelihatan',
  pain_points: 'Membalas pertanyaan klien yang berulang dan menyusun simulasi KPR manual',
  recommended_persona: 'social-conductor',
  expectations_paragraph:
    'Bantu aku siapkan caption listing, balas pertanyaan klien dengan rapi, dan susun simulasi KPR cepat.',
  voice_note: 'sopan dan ringkas, suka langsung ke poin',
  summary_bahasa:
    'Ini yang aku tangkap soal kamu: kamu agen properti di area BSD. Harianmu banyak di listing, balas klien, dan simulasi KPR. Aku bisa bantu rapikan semua itu.',
})

/** A canned distill LLM returning the fixture JSON (or an override). */
export function fixtureDistillLlm(override?: string): GenesisDistillLlm {
  return async () => override ?? FIXTURE_DISTILL_JSON
}
