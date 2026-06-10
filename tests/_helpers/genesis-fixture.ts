/**
 * Persona Genesis test fixture — a realistic canned 3-stage LLM output for
 * a marketing-manager profile, written to PASS the quality gate (Bahasa
 * "kamu" register, zero banned words, zero exclamation marks, substance
 * minimums). Shared by the generator unit tests and the Phase F chain
 * harness so "the pipeline works" is asserted against content shaped like
 * real DeepSeek output.
 */

import type { GenesisProfile, LlmComplete } from '../../supabase/functions/_shared/persona-genesis-generator.ts'

export const FIXTURE_PROFILE: GenesisProfile = {
  role: 'Marketing manager di startup F&B di Bandung',
  daily_tasks:
    'Bikin kalender konten Instagram dan TikTok, brief desainer, rekap performa ads mingguan, koordinasi dengan tim sales soal promo',
  outputs: 'Kalender konten, caption, brief kreatif, laporan performa mingguan untuk founder',
  tools: 'Canva, Meta Ads Manager, Google Sheets, Notion',
  pain_points:
    'Rekap performa mingguan makan waktu setengah hari, dan sering kehabisan ide caption yang fresh',
}

const SOUL_MD = `# About me

I am Konten Komandan, a specialist agent built for {customer_name} as part of weuseai.agent. Spesialisasiku: operasional marketing harian untuk brand F&B — kalender konten, caption, brief kreatif, dan rekap performa yang biasanya makan setengah hari kamu.

# How I communicate

Bahasa Indonesia, pakai "kamu". Ringkas, satu ide per kalimat. Istilah marketing (CTR, CPM, reach) tetap bahasa Inggris.

# Who I serve

Name: {customer_name}
Time zone: Asia/Jakarta (WIB, UTC+7).

# What this customer expects from me

{user_expectations_verbatim}

# What I do

- Aku susun kalender konten mingguan untuk Instagram dan TikTok dari tema yang kamu kasih.
- Aku draft caption dalam suara brand kamu — kamu tinggal kurasi, bukan mulai dari nol.
- Aku bantu rekap performa mingguan jadi laporan yang siap dikirim ke founder, dari angka yang kamu tempel.
- Aku siapkan brief kreatif untuk desainer dari ide kasar kamu.
- Aku ingat promo dan kampanye yang sedang jalan, dan ingatkan deadline asetnya.

# How I behave

- Sapa kamu pakai nama saat natural.
- Kalau data performa belum kamu kasih, aku minta — aku tidak mengarang angka.
- Satu pertanyaan klarifikasi saat ragu, bukan menebak.

# Hard limits

- Tidak pernah share API key, password, atau data kamu ke pihak ketiga.
- Tidak melakukan transaksi atau commit uang tanpa konfirmasi eksplisit dalam sesi.
- Tidak mengarang fakta atau angka performa. Kalau aku tidak tahu, aku bilang tidak tahu.

# When my customer first messages me

Sapa hangat dan singkat, sebut nama {first_name} kalau natural. Sebutkan kamu sekarang spesialis operasional marketing F&B mereka — siap bantu kalender konten, caption, dan rekap performa. Tanya mau mulai dari mana hari ini.
`

const SKILL_IDS = [
  'kalender-konten-mingguan',
  'caption-draft',
  'brief-kreatif',
  'rekap-performa-mingguan',
  'ide-konten-bank',
  'promo-tracker',
  'kompetitor-watch',
] as const

function skillMd(id: string, purpose: string, templateRef?: string): string {
  return `# ${id} — Hermes skill

## Kapan dipakai

Customer minta bantuan terkait: ${purpose}. Juga saat mereka menyebut topiknya secara natural dalam percakapan.

## Yang harus diekstrak dari pesan customer

| Field | Wajib | Catatan |
|---|---|---|
| konteks | ya | Detail yang customer kasih — tema, periode, atau data mentah |
| periode | tidak | Default: minggu berjalan (Asia/Jakarta) |

## Yang dilakukan

1. Pahami konteks dari pesan customer dan percakapan sebelumnya.
${templateRef ? `2. Baca template di /var/lib/weuseai/bundle/custom-<cid>/<version>/templates/${templateRef} kalau tersedia, lalu isi dengan data customer.\n3. Susun hasilnya dalam Bahasa Indonesia, format Telegram yang rapi.` : '2. Susun hasilnya dalam Bahasa Indonesia, format Telegram yang rapi.'}
${templateRef ? '4' : '3'}. Tutup dengan satu pertanyaan lanjutan yang relevan.

## Contoh interaksi

Customer: "${purpose} dong"
Kamu: balas dengan hasil yang diminta, ringkas dan siap pakai, tanpa preamble panjang.
`
}

const TEMPLATES: Array<{ id: string; kind: string; content: string }> = [
  {
    id: 'kalender-konten-mingguan.md',
    kind: 'document',
    content: `# Kalender Konten Mingguan — {periode}

| Hari | Platform | Pilar konten | Hook | Format | CTA |
|---|---|---|---|---|---|
| Senin | Instagram | {pilar_1} | {hook_1} | Reels | {cta_1} |
| Rabu | TikTok | {pilar_2} | {hook_2} | Video | {cta_2} |
| Jumat | Instagram | {pilar_3} | {hook_3} | Carousel | {cta_3} |

Catatan produksi: {catatan}
`,
  },
  {
    id: 'caption-bank.md',
    kind: 'document',
    content: `# Caption — {tema}

Versi A (storytelling): {caption_a}

Versi B (langsung ke promo): {caption_b}

Versi C (pertanyaan ke audiens): {caption_c}

Hashtag set: {hashtags}
`,
  },
  {
    id: 'brief-kreatif.md',
    kind: 'document',
    content: `# Brief Kreatif — {nama_aset}

- Tujuan: {tujuan}
- Pesan utama: {pesan_utama}
- Format dan ukuran: {format}
- Referensi visual: {referensi}
- Deadline: {deadline}
- Catatan brand: warna dan tone mengikuti brand guideline yang sudah kamu pegang.
`,
  },
  {
    id: 'laporan-performa-mingguan.md',
    kind: 'briefing',
    content: `# Laporan Performa Mingguan — {periode}

## Ringkasan untuk founder
{ringkasan_3_kalimat}

## Angka utama
| Metrik | Minggu ini | Minggu lalu | Catatan |
|---|---|---|---|
| Reach | {reach} | {reach_prev} | {catatan_reach} |
| CTR ads | {ctr} | {ctr_prev} | {catatan_ctr} |
| Penjualan dari promo | {sales} | {sales_prev} | {catatan_sales} |

## Rekomendasi minggu depan
{rekomendasi}
`,
  },
  {
    id: 'promo-checklist.md',
    kind: 'checklist',
    content: `# Checklist Promo — {nama_promo}

- [ ] Mekanik promo final dan disetujui {pihak}
- [ ] Aset feed + story siap H-3
- [ ] Caption terjadwal H-1
- [ ] Tim sales sudah dapat briefing
- [ ] Reminder evaluasi H+3
`,
  },
]

export function fixturePlanResponse(): string {
  return JSON.stringify({
    persona_name: 'Konten Komandan',
    specialty_id: 'Operasional marketing harian untuk brand F&B — konten, caption, dan rekap performa.',
    soul_md: SOUL_MD,
    skill_plan: SKILL_IDS.map((id, i) => ({
      id,
      purpose_id: `Bantu customer dengan ${id.replaceAll('-', ' ')}`,
      kind: i === 3 ? 'playbook' : 'skill',
    })),
    template_plan: TEMPLATES.map((t) => ({
      id: t.id,
      kind: t.kind,
      purpose_id: `Kerangka ${t.id.replace('.md', '').replaceAll('-', ' ')}`,
    })),
  })
}

export function fixtureSkillsResponse(): string {
  const templateBySkill: Record<string, string | undefined> = {
    'kalender-konten-mingguan': 'kalender-konten-mingguan.md',
    'caption-draft': 'caption-bank.md',
    'brief-kreatif': 'brief-kreatif.md',
    'rekap-performa-mingguan': 'laporan-performa-mingguan.md',
    'promo-tracker': 'promo-checklist.md',
  }
  return JSON.stringify({
    shell_skill_md: `# Konten Komandan — persona khusus kamu

## Apa ini

Persona spesialis operasional marketing F&B yang dibuat khusus untuk kamu lewat Persona Genesis. Kemampuan utamanya: kalender konten mingguan, draft caption, brief kreatif, rekap performa mingguan, bank ide konten, tracking promo, dan pantauan kompetitor.

## Cara pakai

Sebut saja kebutuhan kamu secara natural — "bikinin kalender konten minggu depan", "draft caption buat promo kopi susu" — atau panggil skill spesifiknya langsung.
`,
    skills: SKILL_IDS.map((id) => ({
      id,
      description_id: `Bantu customer dengan ${id.replaceAll('-', ' ')} dalam Bahasa Indonesia.`,
      skill_md: skillMd(id, id.replaceAll('-', ' '), templateBySkill[id]),
      templates_used: templateBySkill[id] ? [templateBySkill[id]] : [],
    })),
  })
}

export function fixtureTemplatesResponse(): string {
  return JSON.stringify({
    templates: TEMPLATES.map((t) => ({
      id: t.id,
      kind: t.kind,
      description_id: `Kerangka siap isi untuk ${t.id.replace('.md', '').replaceAll('-', ' ')}.`,
      content: t.content,
    })),
  })
}

/** A canned LlmComplete that returns the three staged fixture responses. */
export function fixtureLlm(overrides: Partial<Record<'plan' | 'skills' | 'templates', string>> = {}): LlmComplete {
  return async ({ stage }) => {
    if (stage === 'plan') return overrides.plan ?? fixturePlanResponse()
    if (stage === 'skills') return overrides.skills ?? fixtureSkillsResponse()
    return overrides.templates ?? fixtureTemplatesResponse()
  }
}
