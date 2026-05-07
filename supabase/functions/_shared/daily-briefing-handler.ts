// daily-briefing-builder handler — Phase 2E-1 pilot 2.
//
// Spec: docs/plans/2026-05-07-workflow-library-foundation-spec.md
//   "daily-briefing-builder (The Pro) — aggregation pattern"
//
// Pulls structured data from connected sources (calendar, email, news),
// composes a markdown briefing in Bahasa Indonesia. The Pro's voice is
// applied at the agent layer — this handler returns a formatter-style
// summary the agent wraps with greeting + closer.
//
// Phase 2E-1: real MCP integration is deferred. Calendar + email pulled
// from mock fixtures (templates/mocks/{calendar,gmail}/{scenario}.json).
// News uses the same path Hermes already calls (DAILY_NEWS_SKILL_MD).
// Phase 2C-2 swaps mock adapters for real MCPs without changing this
// handler's interface.

// ─── input + output shapes ──────────────────────────────────────────────

export const DAILY_BRIEFING_SOURCES = ['calendar', 'email', 'news'] as const
export type DailyBriefingSource = typeof DAILY_BRIEFING_SOURCES[number]

export type DailyBriefingInput = {
  /** YYYY-MM-DD; defaults to today (Asia/Jakarta) at the entrypoint. */
  date?: string
  /** Defaults applied at handler entry: ['calendar', 'email', 'news']. */
  sources?: DailyBriefingSource[]
}

export type DailyBriefingResult = {
  format: 'markdown'
  text: string
  date: string
  sources_loaded: DailyBriefingSource[]
  warnings: string[]
}

// ─── injected source readers ────────────────────────────────────────────

export type CalendarEvent = {
  id: string
  summary: string
  start: { dateTime: string }
  end: { dateTime: string }
  attendees?: Array<{ email: string }>
  location?: string
  type?: string
}

export type EmailMessage = {
  id: string
  from: string
  subject: string
  snippet: string
  received_at: string
  importance?: 'important' | 'noise' | 'follow_up'
  thread_id?: string
}

export type NewsHeadline = {
  source: string  // 'detik' | 'kompas' | 'cnbc'
  title: string
  url: string
  summary: string  // 1-2 sentences
}

export type DailyBriefingDeps = {
  /** Returns events for the requested date, or null when source unavailable. */
  readCalendar: (date: string) => Promise<CalendarEvent[] | null>
  /** Returns emails received on the requested date, or null when unavailable. */
  readEmail: (date: string) => Promise<EmailMessage[] | null>
  /** Returns news headlines for the date, or null when unavailable. */
  readNews: (date: string) => Promise<NewsHeadline[] | null>
}

// ─── handler ────────────────────────────────────────────────────────────

const DEFAULT_SOURCES: DailyBriefingSource[] = ['calendar', 'email', 'news']

export async function buildDailyBriefing(
  input: DailyBriefingInput,
  deps: DailyBriefingDeps,
  /** Override for tests; production uses today (Asia/Jakarta). */
  fallbackDate: () => string,
): Promise<DailyBriefingResult> {
  const date = input.date ?? fallbackDate()
  const sources = input.sources ?? DEFAULT_SOURCES

  // Validate sources are recognized; unknown ones become warnings.
  const requested = new Set(sources)
  const validSources: DailyBriefingSource[] = []
  const warnings: string[] = []
  for (const s of requested) {
    if ((DAILY_BRIEFING_SOURCES as readonly string[]).includes(s)) {
      validSources.push(s as DailyBriefingSource)
    } else {
      warnings.push(`Unknown source "${s}" ignored.`)
    }
  }

  const sectionParts: string[] = []
  const loaded: DailyBriefingSource[] = []

  if (validSources.includes('calendar')) {
    const events = await deps.readCalendar(date)
    if (events === null) {
      warnings.push('Calendar tidak terhubung; bagian kalender dilewati.')
    } else {
      loaded.push('calendar')
      sectionParts.push(formatCalendarSection(events, date))
    }
  }

  if (validSources.includes('email')) {
    const emails = await deps.readEmail(date)
    if (emails === null) {
      warnings.push('Email tidak terhubung; bagian email dilewati.')
    } else {
      loaded.push('email')
      sectionParts.push(formatEmailSection(emails))
    }
  }

  if (validSources.includes('news')) {
    const headlines = await deps.readNews(date)
    if (headlines === null) {
      warnings.push('Sumber berita tidak tersedia; bagian berita dilewati.')
    } else {
      loaded.push('news')
      sectionParts.push(formatNewsSection(headlines))
    }
  }

  const text =
    `# Briefing pagi — ${formatIndonesianDate(date)}\n\n` +
    sectionParts.join('\n\n')

  return {
    format: 'markdown',
    text,
    date,
    sources_loaded: loaded,
    warnings,
  }
}

// ─── section formatters ────────────────────────────────────────────────

function formatCalendarSection(events: CalendarEvent[], date: string): string {
  if (events.length === 0) {
    return '## Kalender\n\nTidak ada agenda hari ini. Hari kosong, gunakan untuk deep work atau istirahat.'
  }

  // Filter events to the requested date (defensive — fixtures may include
  // adjacent days).
  const onDate = events.filter((e) => isOnDate(e.start.dateTime, date))
  if (onDate.length === 0) {
    return '## Kalender\n\nTidak ada agenda hari ini.'
  }

  const lines = onDate.map((e) => {
    const time = formatTimeRange(e.start.dateTime, e.end.dateTime)
    const loc = e.location ? ` · ${e.location}` : ''
    const attendees = (e.attendees ?? []).length
    const withWho = attendees > 0 ? ` (${attendees} attendee${attendees > 1 ? 's' : ''})` : ''
    return `- **${time}** — ${e.summary}${loc}${withWho}`
  })
  return `## Kalender\n\n${lines.join('\n')}`
}

function formatEmailSection(emails: EmailMessage[]): string {
  if (emails.length === 0) {
    return '## Email\n\nInbox bersih. Tidak ada email baru sejak briefing terakhir.'
  }

  const important = emails.filter((e) => e.importance === 'important')
  const followUp = emails.filter((e) => e.importance === 'follow_up')
  const noise = emails.filter((e) => e.importance === 'noise')
  const uncategorized = emails.filter((e) => !e.importance)

  const buckets: string[] = []

  if (important.length > 0) {
    const lines = important.map((e) => `- **${e.subject}** — ${e.from}\n  ${e.snippet}`)
    buckets.push(`### Penting (${important.length})\n${lines.join('\n')}`)
  }

  if (followUp.length > 0) {
    const lines = followUp.map((e) => `- **${e.subject}** — ${e.from}\n  ${e.snippet}`)
    buckets.push(`### Follow-up (${followUp.length})\n${lines.join('\n')}`)
  }

  if (uncategorized.length > 0) {
    const lines = uncategorized.map((e) => `- ${e.subject} — ${e.from}`)
    buckets.push(`### Belum dikategorikan (${uncategorized.length})\n${lines.join('\n')}`)
  }

  if (noise.length > 0) {
    buckets.push(`### Noise (${noise.length})\nNewsletter, promo, otomatis. Aman dilewati.`)
  }

  return `## Email\n\n${buckets.join('\n\n')}`
}

function formatNewsSection(headlines: NewsHeadline[]): string {
  if (headlines.length === 0) {
    return '## Berita\n\nTidak ada headline baru pagi ini.'
  }
  const lines = headlines.slice(0, 5).map((h) => {
    return `- **${h.title}** — ${h.source}\n  ${h.summary}`
  })
  return `## Berita\n\n${lines.join('\n')}`
}

// ─── time + date helpers ────────────────────────────────────────────────

/**
 * Format YYYY-MM-DD as "Senin, 8 Mei 2026" (Bahasa Indonesia).
 *
 * No fancy localization library — we hard-code Indonesian day + month
 * names. Locale-faithful for the pilot; Phase 2E-2 may pull in
 * date-fns/locale if we ever ship multi-language briefings.
 */
function formatIndonesianDate(yyyymmdd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyymmdd)
  if (!m) return yyyymmdd
  const year = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  const day = parseInt(m[3], 10)

  // Compute weekday directly from a reference Sunday (1970-01-04). This
  // avoids any TZ pitfalls — we're treating yyyymmdd as a pure calendar
  // date, not a timestamp.
  const dow = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  const ms = Date.UTC(year, month - 1, day)
  const SUNDAY_REF = Date.UTC(1970, 0, 4)
  const daysSince = Math.round((ms - SUNDAY_REF) / 86_400_000)
  const dayName = dow[((daysSince % 7) + 7) % 7]

  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ]
  return `${dayName}, ${day} ${months[month - 1]} ${year}`
}

function formatTimeRange(startIso: string, endIso: string): string {
  // Inputs are ISO with TZ offset (e.g. 2026-05-08T09:00:00+07:00).
  // We display HH:MM in WIB. Slice technique works because the offset
  // is always +07:00 in our fixtures + the production MCP normalizes.
  const startTime = startIso.slice(11, 16)
  const endTime = endIso.slice(11, 16)
  return `${startTime}–${endTime}`
}

function isOnDate(iso: string, yyyymmdd: string): boolean {
  // Compare the date portion of the ISO string after WIB offset is
  // already baked in.
  return iso.startsWith(yyyymmdd)
}

// ─── default-date helper for entrypoint use ─────────────────────────────

/**
 * Today's date in Asia/Jakarta timezone, formatted YYYY-MM-DD.
 * Pure compute; no I/O. Tests inject a synthetic clock instead.
 */
export function todayInJakarta(now: Date = new Date()): string {
  // Jakarta is UTC+7, no DST.
  const jakartaMs = now.getTime() + 7 * 60 * 60 * 1000
  const d = new Date(jakartaMs)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
