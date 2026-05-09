// Capture engine — wraps Playwright to record a founder browsing session
// and emit a CaptureSession JSON artifact.
//
// Founder runs `autobrowse capture --skill-slug <id> --start-url <url>`,
// Chromium opens, founder clicks/types/extracts as they normally would.
// We intercept page events via Playwright's instrumentation API and
// build the actions[] array. Tracing.zip is also captured for reference.
//
// Pure-logic pieces (action recording strategy, extraction marker UI)
// live below. The actual page-control loop calls Playwright's chromium
// .launch and is exported as `runCaptureSession`.

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

import type {
  CaptureSession,
  UserAction,
  RawSelector,
  SelectorCandidate,
} from '../types.ts'

export type CaptureOpts = {
  skillSlug: string
  startUrl: string
  /** Output directory (defaults to ~/.weuseai/autobrowse/<skill-slug>/captures). */
  outputDir: string
  /** Index for this capture (multiple captures per skill); used in filename. */
  sessionIdx: number
  /** Optional founder notes. */
  notes?: string
  /** Headless mode override — defaults to false (founder watches). */
  headless?: boolean
}

export type CaptureResult = {
  session: CaptureSession
  /** Full path to the persisted session JSON. */
  sessionJsonPath: string
}

/**
 * Run a single capture session. Opens Chromium, navigates to startUrl,
 * waits for the founder to interact + close the browser. Returns the
 * resulting CaptureSession.
 */
export async function runCaptureSession(opts: CaptureOpts): Promise<CaptureResult> {
  await fs.mkdir(opts.outputDir, { recursive: true })
  const sessionId = randomUUID()
  const startedAt = new Date().toISOString()
  const traceZipPath = join(opts.outputDir, `${opts.skillSlug}-${opts.sessionIdx}.trace.zip`)
  const sessionJsonPath = join(
    opts.outputDir,
    `${opts.skillSlug}-${opts.sessionIdx}.session.json`,
  )

  const actions: UserAction[] = []

  const browser: Browser = await chromium.launch({
    headless: opts.headless ?? false,
    // Slow-mo so the founder's actions are easier to inspect later.
    slowMo: 50,
  })
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1366, height: 800 },
  })
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: false,
  })

  const page: Page = await context.newPage()

  // Inject the founder-facing extraction-marker UI.
  await injectExtractionMarker(page, actions)

  // Subscribe to page events.
  attachActionListeners(page, actions)

  // Navigate.
  actions.push({ kind: 'navigate', t: Date.now(), url: opts.startUrl })
  await page.goto(opts.startUrl, { waitUntil: 'domcontentloaded' })

  // Wait for the founder to close the browser. Re-inject the extraction
  // marker on every navigation since DOM gets reset.
  page.on('framenavigated', async (frame) => {
    if (frame === page.mainFrame()) {
      try {
        await injectExtractionMarker(page, actions)
      } catch {
        /* page may be closing */
      }
    }
  })

  // Promise that resolves when the page closes.
  await new Promise<void>((resolve) => {
    page.on('close', () => resolve())
    browser.on('disconnected', () => resolve())
  })

  await context.tracing.stop({ path: traceZipPath })
  await browser.close().catch(() => {})

  const endedAt = new Date().toISOString()
  const session: CaptureSession = {
    sessionId,
    skillSlug: opts.skillSlug,
    startedAt,
    endedAt,
    startUrl: opts.startUrl,
    actions,
    traceZipPath,
    notes: opts.notes,
  }

  await fs.writeFile(sessionJsonPath, JSON.stringify(session, null, 2), 'utf8')
  return { session, sessionJsonPath }
}

// ─── Extraction-marker UI ─────────────────────────────────────────────
//
// During capture, the founder right-clicks an element they want the skill
// to extract. We inject a context-menu hook that prompts for a label and
// pushes an 'extract' action into the recording.

async function injectExtractionMarker(
  page: Page,
  actions: UserAction[],
): Promise<void> {
  // Expose a callback the page can call back into Node.
  await page.exposeFunction(
    '__autobrowse_recordExtract',
    (payload: { label: string; selector: RawSelector; value: string }) => {
      actions.push({
        kind: 'extract',
        t: Date.now(),
        label: payload.label,
        selector: payload.selector,
        value: payload.value,
      })
    },
  )

  // Inject a tiny script: right-click → prompt for label → push extract.
  await page.addInitScript(() => {
    document.addEventListener(
      'contextmenu',
      (e) => {
        const target = e.target as HTMLElement | null
        if (!target) return
        const label = window.prompt(
          'Autobrowse: label this extraction (e.g. "product price")',
        )
        if (!label) return
        e.preventDefault()
        const selector = inferRawSelector(target)
        const value = (target.textContent ?? '').trim()
        // @ts-expect-error — exposed function injected by Playwright
        window.__autobrowse_recordExtract({ label, selector, value })

        function inferRawSelector(el: HTMLElement): {
          candidates: any[]
          primary: any
        } {
          const candidates: any[] = []
          if (el.dataset.testid) {
            candidates.push({ kind: 'testid', value: el.dataset.testid })
          }
          const role = el.getAttribute('role') || implicitRole(el)
          const name = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 40)
          if (role) {
            candidates.push({ kind: 'role', role, name })
          }
          const text = el.textContent?.trim()
          if (text && text.length > 0 && text.length <= 80) {
            candidates.push({ kind: 'text', value: text })
          }
          if (el.id) candidates.push({ kind: 'id', value: el.id })
          candidates.push({ kind: 'css', value: cssPath(el) })
          return {
            candidates,
            primary: candidates[0],
          }
        }

        function implicitRole(el: HTMLElement): string | null {
          const tag = el.tagName.toLowerCase()
          if (tag === 'button') return 'button'
          if (tag === 'a' && (el as HTMLAnchorElement).href) return 'link'
          if (tag === 'input') {
            const t = (el as HTMLInputElement).type
            if (t === 'submit' || t === 'button') return 'button'
            if (t === 'checkbox') return 'checkbox'
            if (t === 'radio') return 'radio'
            return 'textbox'
          }
          if (tag === 'h1' || tag === 'h2' || tag === 'h3') return 'heading'
          return null
        }

        function cssPath(el: HTMLElement): string {
          const parts: string[] = []
          let cur: HTMLElement | null = el
          while (cur && cur !== document.body && cur !== document.documentElement) {
            let part = cur.tagName.toLowerCase()
            if (cur.id) {
              parts.unshift(`${part}#${cur.id}`)
              break
            }
            if (cur.classList.length > 0) {
              part += '.' + Array.from(cur.classList).slice(0, 2).join('.')
            }
            parts.unshift(part)
            cur = cur.parentElement
          }
          return parts.join(' > ')
        }
      },
      true,
    )
  })
}

// ─── Action listeners — convert Playwright page events to UserAction ──

function attachActionListeners(page: Page, actions: UserAction[]): void {
  // Click: capture via mousedown to get the actual target before any
  // navigation kicks off.
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      actions.push({ kind: 'navigate', t: Date.now(), url: frame.url() })
    }
  })

  page.on('console', (msg) => {
    // Watch for our injected mark-as-action events that the inject-script
    // pushes via console.log.
    const text = msg.text()
    if (!text.startsWith('__autobrowse:')) return
    try {
      const payload = JSON.parse(text.slice('__autobrowse:'.length))
      if (payload && typeof payload === 'object' && 'kind' in payload) {
        actions.push(payload as UserAction)
      }
    } catch {
      /* ignore malformed */
    }
  })

  // We also subscribe to page.on('request') to detect network-idle
  // boundaries useful for the synthesizer's wait insertion. Skipped here
  // for brevity; Phase 4-1 v0 relies on framenavigated + manual extracts.
}
