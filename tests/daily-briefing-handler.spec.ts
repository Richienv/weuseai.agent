/**
 * Tests for daily-briefing-handler — Phase 2E-1 pilot 2.
 *
 * Strategy: dependency-injected source readers. We don't touch real
 * Supabase Storage at this layer — fixture parsing happens in the
 * deno-serve entrypoint. Handler tests use canned event/email/headline
 * arrays.
 *
 * Coverage:
 *   - Default sources (calendar + email + news)
 *   - Custom source filter
 *   - Date defaulting via fallbackDate hook
 *   - Missing connector → graceful warning, section skipped
 *   - Empty result per source → "no events / inbox bersih" prose
 *   - Email bucketing (important / follow_up / noise / uncategorized)
 *   - Calendar event filtering by date (defensive against fixture leak)
 *   - Indonesian date formatting (weekday + month names)
 *   - Drift checks for the 4 mock fixtures on disk
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  buildDailyBriefing,
  todayInJakarta,
  type CalendarEvent,
  type EmailMessage,
  type NewsHeadline,
  type DailyBriefingDeps,
} from '../supabase/functions/_shared/daily-briefing-handler.ts'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(TEST_DIR, '..')

// ─── helpers ──────────────────────────────────────────────────────────

function readFixture(rel: string): unknown {
  const text = readFileSync(resolve(REPO_ROOT, rel), 'utf8')
  return JSON.parse(text)
}

function fakeDeps(opts: {
  calendar?: CalendarEvent[] | null
  email?: EmailMessage[] | null
  news?: NewsHeadline[] | null
}): DailyBriefingDeps {
  return {
    readCalendar: async () => (opts.calendar !== undefined ? opts.calendar : []),
    readEmail: async () => (opts.email !== undefined ? opts.email : []),
    readNews: async () => (opts.news !== undefined ? opts.news : []),
  }
}

const FIXED_DATE = '2026-05-08'  // Jumat, 8 Mei 2026

// ─── default sources + sections ───────────────────────────────────────

test('briefing: default sources are calendar + email + news', async () => {
  const r = await buildDailyBriefing(
    {},
    fakeDeps({ calendar: [], email: [], news: [] }),
    () => FIXED_DATE,
  )
  assert.deepEqual(r.sources_loaded.sort(), ['calendar', 'email', 'news'])
})

test('briefing: heading uses Indonesian weekday + month', async () => {
  const r = await buildDailyBriefing({ date: FIXED_DATE }, fakeDeps({}), () => FIXED_DATE)
  // 2026-05-08 is a Friday → Jumat
  assert.match(r.text, /^# Briefing pagi — Jumat, 8 Mei 2026/m)
})

test('briefing: respects explicit date input', async () => {
  const r = await buildDailyBriefing(
    { date: '2026-12-25' },
    fakeDeps({}),
    () => FIXED_DATE,
  )
  // 2026-12-25 is a Friday → Jumat
  assert.match(r.text, /Jumat, 25 Desember 2026/)
})

// ─── source filter ────────────────────────────────────────────────────

test('briefing: custom source list excludes unwanted sections', async () => {
  const r = await buildDailyBriefing(
    { date: FIXED_DATE, sources: ['calendar'] },
    fakeDeps({ calendar: [], email: [], news: [] }),
    () => FIXED_DATE,
  )
  assert.deepEqual(r.sources_loaded, ['calendar'])
  assert.match(r.text, /## Kalender/)
  assert.equal(r.text.includes('## Email'), false)
  assert.equal(r.text.includes('## Berita'), false)
})

test('briefing: unknown source produces a warning + is ignored', async () => {
  const r = await buildDailyBriefing(
    // @ts-expect-error testing unknown source string
    { date: FIXED_DATE, sources: ['calendar', 'fictional-source'] },
    fakeDeps({ calendar: [] }),
    () => FIXED_DATE,
  )
  assert.deepEqual(r.sources_loaded, ['calendar'])
  assert.ok(r.warnings.some((w) => w.includes('fictional-source')))
})

// ─── missing connectors → graceful warnings ───────────────────────────

test('briefing: calendar connector unavailable → warning, no section, no fail', async () => {
  const r = await buildDailyBriefing(
    { date: FIXED_DATE },
    fakeDeps({ calendar: null, email: [], news: [] }),
    () => FIXED_DATE,
  )
  assert.equal(r.sources_loaded.includes('calendar'), false)
  assert.ok(r.warnings.some((w) => w.includes('Calendar tidak terhubung')))
  assert.equal(r.text.includes('## Kalender'), false)
})

test('briefing: email connector unavailable → graceful', async () => {
  const r = await buildDailyBriefing(
    { date: FIXED_DATE },
    fakeDeps({ calendar: [], email: null, news: [] }),
    () => FIXED_DATE,
  )
  assert.ok(r.warnings.some((w) => w.includes('Email tidak terhubung')))
})

test('briefing: news source unavailable → graceful', async () => {
  const r = await buildDailyBriefing(
    { date: FIXED_DATE },
    fakeDeps({ calendar: [], email: [], news: null }),
    () => FIXED_DATE,
  )
  assert.ok(r.warnings.some((w) => w.includes('berita tidak tersedia')))
})

// ─── empty per source → friendly prose ────────────────────────────────

test('briefing: empty calendar → "tidak ada agenda" prose', async () => {
  const r = await buildDailyBriefing(
    { date: FIXED_DATE, sources: ['calendar'] },
    fakeDeps({ calendar: [] }),
    () => FIXED_DATE,
  )
  assert.match(r.text, /Tidak ada agenda hari ini/)
})

test('briefing: empty email → "inbox bersih"', async () => {
  const r = await buildDailyBriefing(
    { date: FIXED_DATE, sources: ['email'] },
    fakeDeps({ email: [] }),
    () => FIXED_DATE,
  )
  assert.match(r.text, /Inbox bersih/)
})

test('briefing: empty news → no headlines line', async () => {
  const r = await buildDailyBriefing(
    { date: FIXED_DATE, sources: ['news'] },
    fakeDeps({ news: [] }),
    () => FIXED_DATE,
  )
  assert.match(r.text, /Tidak ada headline baru/)
})

// ─── calendar formatting ──────────────────────────────────────────────

test('briefing: calendar shows time range, summary, location, attendee count', async () => {
  const events: CalendarEvent[] = [
    {
      id: 'x',
      summary: 'Standup',
      start: { dateTime: `${FIXED_DATE}T09:00:00+07:00` },
      end: { dateTime: `${FIXED_DATE}T09:15:00+07:00` },
      attendees: [{ email: 'a@x.com' }, { email: 'b@x.com' }],
      location: 'Zoom',
    },
  ]
  const r = await buildDailyBriefing(
    { date: FIXED_DATE, sources: ['calendar'] },
    fakeDeps({ calendar: events }),
    () => FIXED_DATE,
  )
  assert.match(r.text, /09:00–09:15/)
  assert.match(r.text, /Standup/)
  assert.match(r.text, /Zoom/)
  assert.match(r.text, /\(2 attendees\)/)
})

test('briefing: calendar filters out events not on the requested date', async () => {
  const events: CalendarEvent[] = [
    {
      id: 'today',
      summary: 'On-date',
      start: { dateTime: `${FIXED_DATE}T09:00:00+07:00` },
      end: { dateTime: `${FIXED_DATE}T10:00:00+07:00` },
    },
    {
      id: 'yesterday',
      summary: 'Off-date',
      start: { dateTime: `2026-05-07T09:00:00+07:00` },
      end: { dateTime: `2026-05-07T10:00:00+07:00` },
    },
  ]
  const r = await buildDailyBriefing(
    { date: FIXED_DATE, sources: ['calendar'] },
    fakeDeps({ calendar: events }),
    () => FIXED_DATE,
  )
  assert.match(r.text, /On-date/)
  assert.equal(r.text.includes('Off-date'), false, 'past-day events must not leak')
})

// ─── email bucketing ──────────────────────────────────────────────────

test('briefing: email bucketed by importance (important / follow_up / noise)', async () => {
  const emails: EmailMessage[] = [
    { id: '1', from: 'a@x', subject: 'Big deal', snippet: 'urgent', received_at: '', importance: 'important' },
    { id: '2', from: 'b@x', subject: 'Follow up Tuesday', snippet: 'reminder', received_at: '', importance: 'follow_up' },
    { id: '3', from: 'p@x', subject: 'Sale 50%', snippet: 'noise', received_at: '', importance: 'noise' },
  ]
  const r = await buildDailyBriefing(
    { date: FIXED_DATE, sources: ['email'] },
    fakeDeps({ email: emails }),
    () => FIXED_DATE,
  )
  // Bucket headers + counts
  assert.match(r.text, /### Penting \(1\)/)
  assert.match(r.text, /### Follow-up \(1\)/)
  assert.match(r.text, /### Noise \(1\)/)
  // Important is rendered with subject + sender
  assert.match(r.text, /Big deal/)
  // Noise summarized only — subject NOT shown verbatim, just bucket header + summary line
  assert.equal(r.text.includes('Sale 50%'), false, 'noise email subject should not appear in body')
  assert.match(r.text, /Newsletter, promo/)
})

test('briefing: email without importance goes to "Belum dikategorikan"', async () => {
  const emails: EmailMessage[] = [
    { id: '1', from: 'a@x', subject: 'Random', snippet: '', received_at: '' },
  ]
  const r = await buildDailyBriefing(
    { date: FIXED_DATE, sources: ['email'] },
    fakeDeps({ email: emails }),
    () => FIXED_DATE,
  )
  assert.match(r.text, /### Belum dikategorikan \(1\)/)
})

// ─── news section ─────────────────────────────────────────────────────

test('briefing: news section caps at 5 headlines', async () => {
  const headlines: NewsHeadline[] = Array.from({ length: 10 }, (_, i) => ({
    source: 'detik',
    title: `Berita ${i + 1}`,
    url: `https://detik.example/${i}`,
    summary: `Ringkasan ${i + 1}.`,
  }))
  const r = await buildDailyBriefing(
    { date: FIXED_DATE, sources: ['news'] },
    fakeDeps({ news: headlines }),
    () => FIXED_DATE,
  )
  // Top 5 present, 6th absent
  for (let i = 1; i <= 5; i++) {
    assert.match(r.text, new RegExp(`Berita ${i}`))
  }
  assert.equal(r.text.includes('Berita 6'), false)
})

// ─── todayInJakarta ───────────────────────────────────────────────────

test('todayInJakarta: returns YYYY-MM-DD in Jakarta TZ', () => {
  // 2026-05-08 16:00 UTC = 2026-05-08 23:00 WIB (still same calendar day)
  const result = todayInJakarta(new Date('2026-05-08T16:00:00Z'))
  assert.equal(result, '2026-05-08')
})

test('todayInJakarta: handles midnight Jakarta crossover', () => {
  // 2026-05-08 17:30 UTC = 2026-05-09 00:30 WIB (next day)
  const result = todayInJakarta(new Date('2026-05-08T17:30:00Z'))
  assert.equal(result, '2026-05-09')
})

// ─── fixture drift checks ─────────────────────────────────────────────

test('drift: templates/mocks/calendar/typical-day.json parses to {events: [...]}', () => {
  const parsed = readFixture('agent-packs/the-pro/templates/mocks/calendar/typical-day.json') as { events: CalendarEvent[] }
  assert.equal(Array.isArray(parsed.events), true)
  assert.equal(parsed.events.length, 5, 'spec says 5 events: 4 meetings + 1 personal')
  // Meeting count + personal count
  const meetings = parsed.events.filter((e) => e.type === 'meeting').length
  const personal = parsed.events.filter((e) => e.type === 'personal').length
  assert.equal(meetings, 4)
  assert.equal(personal, 1)
  // Every event has start + end + summary
  for (const e of parsed.events) {
    assert.ok(e.summary, `event ${e.id} missing summary`)
    assert.match(e.start.dateTime, /\d{4}-\d{2}-\d{2}T/)
    assert.match(e.end.dateTime, /\d{4}-\d{2}-\d{2}T/)
  }
})

test('drift: templates/mocks/calendar/empty.json is {events: []}', () => {
  const parsed = readFixture('agent-packs/the-pro/templates/mocks/calendar/empty.json') as { events: CalendarEvent[] }
  assert.deepEqual(parsed, { events: [] })
})

test('drift: templates/mocks/gmail/typical-day.json has 3 important + 5 noise + 2 follow-up', () => {
  const parsed = readFixture('agent-packs/the-pro/templates/mocks/gmail/typical-day.json') as { emails: EmailMessage[] }
  assert.equal(Array.isArray(parsed.emails), true)
  assert.equal(parsed.emails.length, 10, 'spec says 10 emails total')
  const buckets = {
    important: parsed.emails.filter((e) => e.importance === 'important').length,
    noise: parsed.emails.filter((e) => e.importance === 'noise').length,
    follow_up: parsed.emails.filter((e) => e.importance === 'follow_up').length,
  }
  assert.deepEqual(buckets, { important: 3, noise: 5, follow_up: 2 })
})

test('drift: templates/mocks/gmail/empty.json is {emails: []}', () => {
  const parsed = readFixture('agent-packs/the-pro/templates/mocks/gmail/empty.json') as { emails: EmailMessage[] }
  assert.deepEqual(parsed, { emails: [] })
})
