// Iterate engine — replay a SkillSpec against a fresh page load using
// Playwright. Reports per-step pass/fail + per-output extraction value.
//
// Used by the iterate CLI to validate a synthesized SkillSpec against a
// live page (founder runs `autobrowse iterate --skill-slug <id>` after
// synthesize). Pure replay — no DOM mutation, no form-submit unless the
// spec includes one.

import { chromium, type Browser, type Page, type Locator } from 'playwright'

import type {
  SkillSpec,
  ReplayStep,
  IterateRunResult,
  SelectorCandidate,
} from '../types.ts'

export type ReplayOpts = {
  /** Parameter values supplied for this replay run. */
  parameters: Record<string, string | number | boolean>
  /** Headless mode (defaults to true for iterate; false for debug). */
  headless?: boolean
  /** Timeout per step in ms (defaults to 10s). */
  stepTimeoutMs?: number
}

export async function replaySkill(
  spec: SkillSpec,
  opts: ReplayOpts,
): Promise<IterateRunResult> {
  const browser: Browser = await chromium.launch({ headless: opts.headless ?? true })
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 } })
  const page: Page = await context.newPage()
  const stepResults: IterateRunResult['steps'] = []
  const outputs: IterateRunResult['outputs'] = []
  const broken: SelectorCandidate[] = []
  const stepTimeout = opts.stepTimeoutMs ?? 10_000

  try {
    for (let i = 0; i < spec.steps.length; i++) {
      const step = spec.steps[i]
      try {
        await runStep(page, step, opts.parameters, stepTimeout, outputs)
        stepResults.push({ idx: i, ok: true })
      } catch (err) {
        stepResults.push({
          idx: i,
          ok: false,
          note: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
        })
        const sel = stepSelector(step)
        if (sel) broken.push(sel)
      }
    }
  } finally {
    await browser.close().catch(() => {})
  }

  const deterministic = stepResults.every((s) => s.ok)
  return { deterministic, steps: stepResults, outputs, brokenSelectors: broken }
}

async function runStep(
  page: Page,
  step: ReplayStep,
  params: Record<string, string | number | boolean>,
  timeoutMs: number,
  outputs: IterateRunResult['outputs'],
): Promise<void> {
  switch (step.kind) {
    case 'navigate': {
      const url = typeof step.url === 'string' ? step.url : interpolate(step.url.template, params)
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
      return
    }
    case 'click': {
      const loc = locatorFor(page, step.selector)
      await loc.click({ timeout: timeoutMs })
      return
    }
    case 'type': {
      const loc = locatorFor(page, step.selector)
      const value = 'literal' in step.value
        ? step.value.literal
        : String(params[step.value.paramName] ?? '')
      await loc.fill(value, { timeout: timeoutMs })
      return
    }
    case 'wait': {
      if (step.reason === 'selector-visible' && step.selector) {
        const loc = locatorFor(page, step.selector)
        await loc.waitFor({ state: 'visible', timeout: timeoutMs })
      } else {
        await page.waitForLoadState('networkidle', { timeout: timeoutMs })
      }
      return
    }
    case 'extract': {
      const loc = locatorFor(page, step.output.selector)
      const captured = await loc.textContent({ timeout: timeoutMs })
      outputs.push({
        field: step.output.name,
        captured: captured?.trim() ?? null,
        matchedPattern: captured !== null && captured.trim().length > 0,
      })
      return
    }
  }
}

/** Convert a SelectorCandidate into a Playwright Locator. */
export function locatorFor(page: Page, sel: SelectorCandidate): Locator {
  switch (sel.kind) {
    case 'testid':
      return page.locator(`[data-testid="${escapeAttr(sel.value)}"]`)
    case 'role':
      return sel.name
        ? page.getByRole(sel.role as 'button', { name: sel.name })
        : page.getByRole(sel.role as 'button')
    case 'text':
      return sel.exact
        ? page.getByText(sel.value, { exact: true })
        : page.getByText(sel.value)
    case 'label':
      return page.getByLabel(sel.value)
    case 'placeholder':
      return page.getByPlaceholder(sel.value)
    case 'id':
      return page.locator(`#${cssEscape(sel.value)}`)
    case 'css':
      return page.locator(sel.value)
    case 'xpath':
      return page.locator(`xpath=${sel.value}`)
  }
}

function stepSelector(step: ReplayStep): SelectorCandidate | null {
  switch (step.kind) {
    case 'click':
      return step.selector
    case 'type':
      return step.selector
    case 'wait':
      return step.selector ?? null
    case 'extract':
      return step.output.selector
    case 'navigate':
      return null
  }
}

function interpolate(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const v = params[key]
    return v === undefined ? '' : String(v)
  })
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '\\"')
}

function cssEscape(s: string): string {
  // Minimal CSS.escape polyfill for Node — escape special chars in IDs.
  return s.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1')
}
