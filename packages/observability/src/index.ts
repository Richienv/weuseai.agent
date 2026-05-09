// Barrel — single import surface for the observability package.
//
// NOTE: runtime re-exports use .js extension (NodeNext-style) so the compiled
// index.js resolves correctly at Vercel runtime under "type": "module" / strict
// ESM. Type-only re-exports keep .ts extensions because they're erased at
// compile time. See: api/admin/observability/customer.ts for the full rationale.
export type {
  CustomerSnapshot,
  StageKind,
  StageState,
  StageStatus,
  StatusReport,
} from './types.ts'
export { deriveCustomerStatus, STAGE_ORDER } from './derive.js'
export { renderStatusReportText } from './render-text.js'
export type { RenderTextOptions } from './render-text.ts'
export { renderStatusReportHtml } from './render-html.js'
export { fetchCustomerSnapshot } from './fetch.js'
export type { FetchSnapshotEnv } from './fetch.ts'
