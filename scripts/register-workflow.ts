#!/usr/bin/env tsx
/**
 * Workflow registration helper — Phase 2E-1.
 *
 * Run once per workflow seeding (manually for the 3 pilots; CI for batch
 * additions). Reads a workflow definition from the in-script PILOTS
 * array, embeds the intent_phrases via OpenAI, and UPSERTs the row into
 * the `workflows` table.
 *
 * Usage:
 *   SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *   OPENAI_EMBED_API_KEY=sk-...
 *   tsx scripts/register-workflow.ts [slug]
 *
 * Without args: register all pilot workflows.
 * With slug: register only that one (e.g. `tsx scripts/register-workflow.ts invoice-generator`).
 *
 * Idempotent: UPSERTs by slug. Safe to re-run; updates existing rows in
 * place (including re-embedding intent_phrases if they changed).
 */

import { createClient } from '@supabase/supabase-js'

import { embedText } from '../supabase/functions/_shared/embedding.ts'

type WorkflowSeed = {
  slug: string
  name_id: string
  description_id: string
  agent_slugs: string[]
  category: 'booking' | 'scraping' | 'generation' | 'analysis' | 'automation' | 'template'
  intent_phrases: string[]
  parameters_schema: Record<string, unknown>
  execution_type: 'edge-function' | 'hermes-skill' | 'composite' | 'external-api'
  handler_ref: string
  output_type: 'file' | 'text' | 'json' | 'side-effect'
  tier: 'starter' | 'pro' | 'studio'
  version: number
}

// ─── Pilot 1: invoice-generator ─────────────────────────────────────────

const INVOICE_GENERATOR: WorkflowSeed = {
  slug: 'invoice-generator',
  name_id: 'Generator Invoice',
  description_id: 'Bikin invoice HTML dari list item dan info klien — siap kirim atau cetak.',
  agent_slugs: ['doc-expert', 'business-director'],
  category: 'template',
  intent_phrases: [
    'bikin invoice untuk client',
    'tagihan untuk klien',
    'buat invoice untuk pembayaran',
    'generate invoice',
    'siapkan invoice',
    'tagihan bulan ini untuk',
    'invoice template',
    'bikin tagihan',
  ],
  parameters_schema: {
    type: 'object',
    required: ['client_name', 'items'],
    properties: {
      client_name: { type: 'string', minLength: 1, maxLength: 200 },
      client_address: { type: 'string', maxLength: 500 },
      items: {
        type: 'array',
        minItems: 1,
        maxItems: 50,
        items: {
          type: 'object',
          required: ['description', 'qty', 'unit_price'],
          properties: {
            description: { type: 'string', minLength: 1, maxLength: 200 },
            qty: { type: 'number', minimum: 0 },
            unit_price: { type: 'number', minimum: 0 },
          },
        },
      },
      tax_rate: { type: 'number', minimum: 0, maximum: 1, default: 0.11 },
      due_date: { type: 'string', format: 'date' },
      currency: { type: 'string', enum: ['IDR', 'USD'], default: 'IDR' },
    },
  },
  execution_type: 'edge-function',
  handler_ref: 'edge-fn:invoice-generator-handler',
  output_type: 'file',
  tier: 'starter',
  version: 1,
}

// ─── Pilot 2: daily-briefing-builder ────────────────────────────────────

const DAILY_BRIEFING_BUILDER: WorkflowSeed = {
  slug: 'daily-briefing-builder',
  name_id: 'Briefing Pagi',
  description_id:
    'Rangkum kalender, email penting, dan headline berita pagi jadi satu briefing markdown.',
  agent_slugs: ['the-pro'],
  category: 'analysis',
  intent_phrases: [
    'briefing pagi',
    'kasih ringkasan hari ini',
    'summary hari ini',
    'apa yang penting hari ini',
    'rangkum kalender pagi ini',
    'executive summary harian',
    'recap hari ini',
    'apa agenda hari ini',
  ],
  parameters_schema: {
    type: 'object',
    properties: {
      date: { type: 'string', format: 'date' },
      sources: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['calendar', 'email', 'news'],
        },
      },
    },
  },
  execution_type: 'edge-function',
  handler_ref: 'edge-fn:daily-briefing-handler',
  output_type: 'text',
  tier: 'starter',
  version: 1,
}

// ─── Pilot 3: tiktok-script-builder ─────────────────────────────────────

const TIKTOK_SCRIPT_BUILDER: WorkflowSeed = {
  slug: 'tiktok-script-builder',
  name_id: 'Script TikTok',
  description_id:
    'Generate script TikTok atau Reels lengkap dengan hook, body, CTA, visual scenes, sound, dan hashtag.',
  agent_slugs: ['video-producer'],
  category: 'generation',
  intent_phrases: [
    'bikin script TikTok',
    'script Reels',
    'scriptin video pendek',
    'ide konten TikTok',
    'buat hook video',
    'rencana TikTok harian',
    'draft Reels 30 detik',
    'bikin script video pendek',
  ],
  parameters_schema: {
    type: 'object',
    required: ['topic'],
    properties: {
      topic: { type: 'string', minLength: 3, maxLength: 200 },
      length: { type: 'integer', enum: [15, 30, 60, 90], default: 30 },
      audience: {
        type: 'string',
        enum: ['gen-z', 'millennial', 'general'],
        default: 'general',
      },
      platform: {
        type: 'string',
        enum: ['tiktok', 'reels', 'shorts'],
        default: 'tiktok',
      },
    },
  },
  execution_type: 'edge-function',
  handler_ref: 'edge-fn:tiktok-script-handler',
  output_type: 'json',
  tier: 'pro',
  version: 1,
}

const PILOTS: WorkflowSeed[] = [
  INVOICE_GENERATOR,
  DAILY_BRIEFING_BUILDER,
  TIKTOK_SCRIPT_BUILDER,
]

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const OPENAI_KEY = process.env.OPENAI_EMBED_API_KEY

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env')
    process.exit(1)
  }
  if (!OPENAI_KEY) {
    console.error('Missing OPENAI_EMBED_API_KEY env. Set the Supabase secret + export locally.')
    process.exit(1)
  }

  const filterSlug = process.argv[2]
  const seedsToProcess = filterSlug
    ? PILOTS.filter((p) => p.slug === filterSlug)
    : PILOTS
  if (seedsToProcess.length === 0) {
    console.error(`No matching seed for slug "${filterSlug}". Available: ${PILOTS.map((p) => p.slug).join(', ')}`)
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  for (const seed of seedsToProcess) {
    console.log(`\n→ Registering "${seed.slug}"`)
    console.log(`   Embedding ${seed.intent_phrases.length} intent phrases...`)

    const phraseText = seed.intent_phrases.join('. ')
    const embedResult = await embedText(phraseText, OPENAI_KEY)
    if (!embedResult.ok) {
      console.error(`   ✗ Embed failed: ${embedResult.reason} ${embedResult.detail ?? ''}`)
      process.exit(1)
    }
    console.log(`   ✓ Embedded (${embedResult.result.usage.total_tokens} tokens)`)

    // UPSERT — idempotent by slug.
    const vectorLiteral = '[' + embedResult.result.embedding.join(',') + ']'
    const { data, error } = await supabase
      .from('workflows')
      .upsert(
        {
          slug: seed.slug,
          name_id: seed.name_id,
          description_id: seed.description_id,
          agent_slugs: seed.agent_slugs,
          category: seed.category,
          intent_phrases: seed.intent_phrases,
          intent_embedding: vectorLiteral,
          parameters_schema: seed.parameters_schema,
          execution_type: seed.execution_type,
          handler_ref: seed.handler_ref,
          output_type: seed.output_type,
          tier: seed.tier,
          version: seed.version,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'slug' },
      )
      .select('id, slug')
      .single()

    if (error) {
      console.error(`   ✗ Upsert failed: ${error.message}`)
      process.exit(1)
    }
    console.log(`   ✓ Registered ${data.slug} (id=${data.id})`)
  }

  console.log('\nDone.')
}

main().catch((e) => {
  console.error('Fatal:', e instanceof Error ? e.stack : e)
  process.exit(1)
})
