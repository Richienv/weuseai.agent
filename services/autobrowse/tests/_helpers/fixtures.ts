// Test fixtures — synthetic CaptureSession objects used across the suite.
// Hand-built so they're predictable and the assertions are tight.

import type {
  CaptureSession,
  RawSelector,
  SelectorCandidate,
} from '../../src/types.ts'

export function rawSelectorFromCandidates(candidates: SelectorCandidate[]): RawSelector {
  return { candidates, primary: candidates[0] }
}

/**
 * Build a Tokopedia-shaped capture session: navigate → search → click →
 * extract product title + price.
 */
export function tokopediaSearchSession(opts: {
  sessionIdx: number
  searchQuery: string
  productTitle: string
  productPrice: string
}): CaptureSession {
  const t = Date.now()
  return {
    sessionId: `test-tokopedia-${opts.sessionIdx}`,
    skillSlug: 'tokopedia-product-search',
    startedAt: new Date(t).toISOString(),
    endedAt: new Date(t + 30_000).toISOString(),
    startUrl: 'https://tokopedia.com',
    actions: [
      { kind: 'navigate', t, url: 'https://tokopedia.com' },
      {
        kind: 'type',
        t: t + 1000,
        selector: rawSelectorFromCandidates([
          { kind: 'testid', value: 'search-input' },
          { kind: 'placeholder', value: 'Cari di Tokopedia' },
          { kind: 'css', value: 'input.search-bar' },
        ]),
        value: opts.searchQuery,
      },
      {
        kind: 'click',
        t: t + 2000,
        selector: rawSelectorFromCandidates([
          { kind: 'role', role: 'button', name: 'Cari' },
          { kind: 'css', value: 'button.search-submit' },
        ]),
        text: 'Cari',
      },
      {
        kind: 'wait',
        t: t + 3000,
        reason: 'network-idle',
      },
      {
        kind: 'click',
        t: t + 4000,
        selector: rawSelectorFromCandidates([
          { kind: 'css', value: 'a.product-card:nth-child(1)' },
          { kind: 'role', role: 'link', name: opts.productTitle },
        ]),
        text: opts.productTitle,
      },
      {
        kind: 'extract',
        t: t + 5000,
        label: 'product title',
        selector: rawSelectorFromCandidates([
          { kind: 'role', role: 'heading', name: opts.productTitle },
          { kind: 'css', value: 'h1.product-title' },
        ]),
        value: opts.productTitle,
      },
      {
        kind: 'extract',
        t: t + 5500,
        label: 'product price',
        selector: rawSelectorFromCandidates([
          { kind: 'testid', value: 'product-price' },
          { kind: 'css', value: 'div.price-tag' },
        ]),
        value: opts.productPrice,
      },
    ],
    traceZipPath: `/tmp/test-tokopedia-${opts.sessionIdx}.trace.zip`,
  }
}

/**
 * Single-action session — useful for narrow unit tests.
 */
export function singleClickSession(slug: string): CaptureSession {
  const t = Date.now()
  return {
    sessionId: `test-single-${slug}`,
    skillSlug: slug,
    startedAt: new Date(t).toISOString(),
    endedAt: new Date(t + 1000).toISOString(),
    startUrl: 'https://example.com',
    actions: [
      { kind: 'navigate', t, url: 'https://example.com' },
      {
        kind: 'click',
        t: t + 100,
        selector: rawSelectorFromCandidates([
          { kind: 'testid', value: 'cta-button' },
        ]),
        text: 'Click me',
      },
    ],
    traceZipPath: '',
  }
}
