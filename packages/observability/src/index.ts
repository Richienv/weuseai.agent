// Barrel — single import surface for the observability package.
export type {
  CustomerSnapshot,
  StageKind,
  StageState,
  StageStatus,
  StatusReport,
} from './types.ts'
export { deriveCustomerStatus, STAGE_ORDER } from './derive.ts'
export { renderStatusReportText } from './render-text.ts'
export type { RenderTextOptions } from './render-text.ts'
export { renderStatusReportHtml } from './render-html.ts'
export { fetchCustomerSnapshot } from './fetch.ts'
export type { FetchSnapshotEnv } from './fetch.ts'
