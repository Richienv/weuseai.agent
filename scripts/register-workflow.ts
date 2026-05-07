#!/usr/bin/env tsx
/**
 * Workflow registration helper — Phase 2E-1.5 (Hermes-native).
 *
 * Architecture pivot 2026-05-08: dropped OpenAI embedding pipeline.
 * Hermes does intent matching natively via SKILL.md "Kapan dipakai"
 * sections on the customer's VPS. The workflows table is now a pure
 * audit/catalog reference; workflow-execute looks up by id (or slug)
 * to validate the customer's tier + parameter schema.
 *
 * Usage:
 *   SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *   tsx scripts/register-workflow.ts [slug]
 *
 * Without args: register all 3 pilot workflows.
 * With slug: register only that one.
 *
 * Idempotent: UPSERTs by slug.
 */

import { createClient } from '@supabase/supabase-js'

type WorkflowSeed = {
  slug: string
  name_id: string
  description_id: string
  agent_slugs: string[]
  category: 'booking' | 'scraping' | 'generation' | 'analysis' | 'automation' | 'template'
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
//
// Architecture pivot: parameters_schema now expects a `script` field
// (the LLM-generated JSON) for the handler to validate. Hermes generates
// locally on the VPS; handler is a pure validator + canonicalizer.

const TIKTOK_SCRIPT_BUILDER: WorkflowSeed = {
  slug: 'tiktok-script-builder',
  name_id: 'Script TikTok',
  description_id:
    'Validasi schema script TikTok atau Reels yang sudah di-generate Hermes (hook, body, CTA, visual scenes, sound, hashtags).',
  agent_slugs: ['video-producer'],
  category: 'generation',
  parameters_schema: {
    type: 'object',
    required: ['script'],
    properties: {
      script: { type: 'object' },
      topic: { type: 'string', maxLength: 200 },
      length: { type: 'integer', enum: [15, 30, 60, 90] },
      audience: {
        type: 'string',
        enum: ['gen-z', 'millennial', 'general'],
      },
      platform: {
        type: 'string',
        enum: ['tiktok', 'reels', 'shorts'],
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

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env')
    process.exit(1)
  }

  const filterSlug = process.argv[2]
  const seedsToProcess = filterSlug
    ? PILOTS.filter((p) => p.slug === filterSlug)
    : PILOTS
  if (seedsToProcess.length === 0) {
    console.error(
      `No matching seed for slug "${filterSlug}". Available: ${PILOTS.map((p) => p.slug).join(', ')}`,
    )
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  for (const seed of seedsToProcess) {
    console.log(`\n→ Registering "${seed.slug}"`)

    const { data, error } = await supabase
      .from('workflows')
      .upsert(
        {
          slug: seed.slug,
          name_id: seed.name_id,
          description_id: seed.description_id,
          agent_slugs: seed.agent_slugs,
          category: seed.category,
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
