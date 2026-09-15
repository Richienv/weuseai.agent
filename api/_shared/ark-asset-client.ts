// BytePlus ModelArk private asset library (Assets API) client.
// AK/SK HMAC-SHA256 signing over WebCrypto so the same file runs on Node and Deno.
// Twin of supabase/functions/_shared/ark-asset-client.ts — keep byte-identical
// (tests/ark-asset-client.spec.ts pins the pair). No local imports on purpose.

export const ARK_ASSET_HOST = 'ark.ap-southeast-1.byteplusapi.com'
export const ARK_ASSET_REGION = 'ap-southeast-1'
export const ARK_ASSET_SERVICE = 'ark'
export const ARK_ASSET_API_VERSION = '2024-01-01'
export const ARK_ASSET_DEFAULT_PROJECT = 'default'
export const ARK_ASSET_SIGNED_HEADERS = 'content-type;host;x-content-sha256;x-date'
export const ARK_ASSET_ID_RE = /^[A-Za-z0-9._-]{8,120}$/
export const ARK_ASSET_URI_RE = /^asset:\/\/[A-Za-z0-9._-]{8,120}$/
export const ARK_ASSET_TYPES = ['Image', 'Video', 'Audio'] as const
export const ARK_ASSET_GROUP_TYPES = ['LivenessFace', 'AIGC'] as const
export const ARK_ASSET_STATUSES = ['processing', 'active', 'failed'] as const
export const ARK_ASSET_NAME_MAX = 64
export const ARK_ASSET_PAGE_SIZE_MAX = 100

export type ArkAssetType = (typeof ARK_ASSET_TYPES)[number]
export type ArkAssetGroupType = (typeof ARK_ASSET_GROUP_TYPES)[number]
export type ArkAssetStatus = (typeof ARK_ASSET_STATUSES)[number]

export type ArkEnv = Readonly<Record<string, string | undefined>>

export type ArkAssetConfig = {
  accessKey: string
  secretKey: string
  host: string
  region: string
  service: string
  projectName: string
}

export type ArkSignInput = {
  accessKey: string
  secretKey: string
  host: string
  region: string
  service: string
  query: Readonly<Record<string, string>>
  body: string
  date: Date
  method?: 'POST'
  path?: string
  contentType?: string
}

export type ArkSignedRequest = {
  url: string
  method: 'POST'
  headers: Record<string, string>
  canonicalRequest: string
  stringToSign: string
}

export type ArkVisualValidateSession = {
  bytedToken: string
  h5Link: string
  callbackUrl: string
}

export type ArkAsset = {
  id: string
  groupId: string
  assetType: ArkAssetType | null
  name: string | null
  status: ArkAssetStatus
  failedReason: string | null
  url: string | null
  lastInferenceTime: string | null
}

export type ArkAssetPage = {
  items: ArkAsset[]
  totalCount: number | null
  pageNumber: number
  pageSize: number
}

export type ArkListAssetsInput = {
  groupIds?: readonly string[]
  groupType?: ArkAssetGroupType
  statuses?: readonly ArkAssetStatus[]
  pageNumber?: number
  pageSize?: number
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
type Clock = () => Date

const BYTED_TOKEN_RE = /^[A-Za-z0-9._-]{8,256}$/
const HOST_RE = /^[a-z0-9.-]+$/
const REQUEST_TIMEOUT_MS = 20_000
const UPSTREAM_STATUS: Record<string, ArkAssetStatus> = {
  processing: 'processing',
  active: 'active',
  failed: 'failed',
}
const STATUS_TO_UPSTREAM: Record<ArkAssetStatus, string> = {
  processing: 'Processing',
  active: 'Active',
  failed: 'Failed',
}

export function isArkAssetUri(value: unknown): value is string {
  return typeof value === 'string' && ARK_ASSET_URI_RE.test(value)
}

export function arkAssetIdFromUri(value: string): string {
  if (!isArkAssetUri(value)) throw new Error('invalid_ark_asset_uri')
  return value.slice('asset://'.length)
}

export function isArkAssetId(value: unknown): value is string {
  return typeof value === 'string' && ARK_ASSET_ID_RE.test(value)
}

export function resolveArkAssetConfig(env: ArkEnv, input: { projectName?: string } = {}): ArkAssetConfig {
  const accessKey = (env.BYTEPLUS_ARK_ACCESS_KEY ?? '').trim()
  const secretKey = (env.BYTEPLUS_ARK_SECRET_KEY ?? '').trim()
  if (accessKey.length < 8 || accessKey.length > 200 || secretKey.length < 8 || secretKey.length > 500) {
    throw new Error('missing_ark_asset_credentials')
  }
  const host = normalizeArkHost(env.MODELARK_ASSET_HOST)
  const projectName = (input.projectName ?? ARK_ASSET_DEFAULT_PROJECT).trim()
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(projectName)) throw new Error('invalid_ark_project_name')
  return { accessKey, secretKey, host, region: ARK_ASSET_REGION, service: ARK_ASSET_SERVICE, projectName }
}

function normalizeArkHost(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return ARK_ASSET_HOST
  let host = trimmed.toLowerCase()
  if (host.includes('://')) {
    let parsed: URL
    try { parsed = new URL(host) } catch { throw new Error('invalid_ark_asset_host') }
    if (parsed.protocol !== 'https:' || (parsed.pathname !== '/' && parsed.pathname !== '') || parsed.search || parsed.port) {
      throw new Error('invalid_ark_asset_host')
    }
    host = parsed.hostname
  }
  host = host.replace(/\/+$/, '')
  if (!HOST_RE.test(host) || host !== ARK_ASSET_HOST) throw new Error('invalid_ark_asset_host')
  return host
}

export function formatArkDate(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error('invalid_ark_sign_date')
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

// Volcengine/BytePlus HMAC-SHA256 request signing (SigV4 family, service `ark`).
export async function signArkRequest(input: ArkSignInput): Promise<ArkSignedRequest> {
  const method = input.method ?? 'POST'
  const path = input.path ?? '/'
  const contentType = input.contentType ?? 'application/json'
  const host = input.host.toLowerCase()
  if (!HOST_RE.test(host)) throw new Error('invalid_ark_asset_host')
  if (path !== '/') throw new Error('invalid_ark_sign_path')
  const xDate = formatArkDate(input.date)
  const shortDate = xDate.slice(0, 8)
  const payloadHash = await sha256Hex(input.body)
  const canonicalQuery = canonicalQueryString(input.query)
  const headers: Record<string, string> = {
    'content-type': contentType,
    host,
    'x-content-sha256': payloadHash,
    'x-date': xDate,
  }
  const signedHeaderNames = Object.keys(headers).sort()
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name].trim()}\n`).join('')
  const signedHeaders = signedHeaderNames.join(';')
  const canonicalRequest = [method, path, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const credentialScope = `${shortDate}/${input.region}/${input.service}/request`
  const stringToSign = ['HMAC-SHA256', xDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n')
  const kDate = await hmacSha256(utf8(input.secretKey), shortDate)
  const kRegion = await hmacSha256(kDate, input.region)
  const kService = await hmacSha256(kRegion, input.service)
  const kSigning = await hmacSha256(kService, 'request')
  const signature = hex(await hmacSha256(kSigning, stringToSign))
  const authorization = `HMAC-SHA256 Credential=${input.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  return {
    url: `https://${host}${path}?${canonicalQuery}`,
    method,
    headers: {
      Host: host,
      'Content-Type': contentType,
      'X-Date': xDate,
      'X-Content-Sha256': payloadHash,
      Authorization: authorization,
    },
    canonicalRequest,
    stringToSign,
  }
}

export function mapArkError(status: number, code: string | null): string {
  const c = code ?? ''
  if (status === 429 || /QPS|QPM|TPM|RateLimit|RequestLimit|FlowLimit|Throttl|TooManyRequest|Frequency/i.test(c)) {
    return 'ark_rate_limited'
  }
  if (/Quota|LimitExceeded|Exceeded|Overdue|Insufficient|Balance/i.test(c)) return 'ark_quota_exceeded'
  if (
    status === 401 || status === 403
    || /Signature|Authorization|Unauthorized|AccessDenied|Forbidden|InvalidAccessKey|Credential|AuthFailure|Permission|Authentication/i.test(c)
  ) {
    return 'ark_unauthorized'
  }
  if (status >= 500 || status === 0) return 'ark_unavailable'
  return 'ark_invalid_request'
}

export function mapArkAssetStatus(value: unknown): ArkAssetStatus {
  const mapped = UPSTREAM_STATUS[String(value ?? '').toLowerCase()]
  if (!mapped) throw new Error('ark_invalid_response')
  return mapped
}

// One signed Assets API call. Returns `Result` or throws a stable ark_* code.
export async function arkAssetRequest(
  action: string,
  body: Readonly<Record<string, unknown>>,
  config: ArkAssetConfig,
  fetchImpl: FetchLike = fetch,
  now: Clock = () => new Date(),
): Promise<Record<string, unknown>> {
  if (!/^[A-Za-z]{3,64}$/.test(action)) throw new Error('invalid_ark_action')
  const payload = JSON.stringify({ ...body, ProjectName: config.projectName })
  const signed = await signArkRequest({
    accessKey: config.accessKey,
    secretKey: config.secretKey,
    host: config.host,
    region: config.region,
    service: config.service,
    query: { Action: action, Version: ARK_ASSET_API_VERSION },
    body: payload,
    date: now(),
  })
  let response: Response
  try {
    response = await fetchImpl(signed.url, {
      method: signed.method,
      headers: signed.headers,
      body: payload,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw new Error('ark_unavailable')
  }
  let parsed: unknown = null
  try {
    parsed = await response.json()
  } catch {
    if (!response.ok) throw new Error(mapArkError(response.status, null))
    throw new Error('ark_invalid_response')
  }
  const envelope = asRecord(parsed)
  const metadata = asRecord(envelope?.ResponseMetadata)
  const error = asRecord(metadata?.Error)
  if (error) {
    const code = typeof error.Code === 'string' ? error.Code : null
    throw new Error(mapArkError(response.status, code))
  }
  if (!response.ok) throw new Error(mapArkError(response.status, null))
  if (!envelope) throw new Error('ark_invalid_response')
  return asRecord(envelope.Result) ?? {}
}

export async function createVisualValidateSession(
  input: { callbackUrl: string },
  config: ArkAssetConfig,
  fetchImpl: FetchLike = fetch,
  now: Clock = () => new Date(),
): Promise<ArkVisualValidateSession> {
  const callbackUrl = httpsUrlOrThrow(input.callbackUrl, 'invalid_ark_callback_url')
  const result = await arkAssetRequest('CreateVisualValidateSession', { CallbackURL: callbackUrl }, config, fetchImpl, now)
  const bytedToken = typeof result.BytedToken === 'string' ? result.BytedToken : ''
  const h5Link = typeof result.H5Link === 'string' ? result.H5Link : ''
  if (!BYTED_TOKEN_RE.test(bytedToken)) throw new Error('ark_invalid_response')
  httpsUrlOrThrow(h5Link, 'ark_invalid_response')
  return {
    bytedToken,
    h5Link,
    callbackUrl: typeof result.CallbackURL === 'string' && result.CallbackURL ? result.CallbackURL : callbackUrl,
  }
}

export async function getVisualValidateResult(
  input: { bytedToken: string },
  config: ArkAssetConfig,
  fetchImpl: FetchLike = fetch,
  now: Clock = () => new Date(),
): Promise<{ groupId: string | null }> {
  if (typeof input.bytedToken !== 'string' || !BYTED_TOKEN_RE.test(input.bytedToken)) throw new Error('invalid_ark_byted_token')
  const result = await arkAssetRequest('GetVisualValidateResult', { BytedToken: input.bytedToken }, config, fetchImpl, now)
  const groupId = result.GroupId
  if (groupId === undefined || groupId === null || groupId === '') return { groupId: null }
  if (!isArkAssetId(groupId)) throw new Error('ark_invalid_response')
  return { groupId }
}

export async function createAsset(
  input: { groupId: string; url: string; assetType: ArkAssetType; name?: string },
  config: ArkAssetConfig,
  fetchImpl: FetchLike = fetch,
  now: Clock = () => new Date(),
): Promise<{ id: string }> {
  if (!isArkAssetId(input.groupId)) throw new Error('invalid_ark_group_id')
  if (!ARK_ASSET_TYPES.includes(input.assetType)) throw new Error('invalid_ark_asset_type')
  const url = httpsUrlOrThrow(input.url, 'invalid_ark_asset_url')
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, ARK_ASSET_NAME_MAX) : ''
  // No `Moderation` field on purpose: the default content pre-filter stays on.
  const body: Record<string, unknown> = { GroupId: input.groupId, URL: url, AssetType: input.assetType }
  if (name) body.Name = name
  const result = await arkAssetRequest('CreateAsset', body, config, fetchImpl, now)
  if (!isArkAssetId(result.Id)) throw new Error('ark_invalid_response')
  return { id: result.Id }
}

export async function getAsset(
  input: { id: string },
  config: ArkAssetConfig,
  fetchImpl: FetchLike = fetch,
  now: Clock = () => new Date(),
): Promise<ArkAsset> {
  if (!isArkAssetId(input.id)) throw new Error('invalid_ark_asset_id')
  const result = await arkAssetRequest('GetAsset', { Id: input.id }, config, fetchImpl, now)
  return presentArkAsset(result)
}

export async function listAssets(
  input: ArkListAssetsInput,
  config: ArkAssetConfig,
  fetchImpl: FetchLike = fetch,
  now: Clock = () => new Date(),
): Promise<ArkAssetPage> {
  const groupType = input.groupType ?? 'LivenessFace'
  if (!ARK_ASSET_GROUP_TYPES.includes(groupType)) throw new Error('invalid_ark_group_type')
  const groupIds = [...(input.groupIds ?? [])]
  if (groupIds.length > 50 || !groupIds.every(isArkAssetId)) throw new Error('invalid_ark_group_id')
  const statuses = [...(input.statuses ?? [])]
  if (!statuses.every((status) => ARK_ASSET_STATUSES.includes(status))) throw new Error('invalid_ark_asset_status')
  const pageNumber = input.pageNumber ?? 1
  const pageSize = input.pageSize ?? 50
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 400) throw new Error('invalid_ark_page')
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > ARK_ASSET_PAGE_SIZE_MAX) throw new Error('invalid_ark_page')
  const filter: Record<string, unknown> = { GroupType: groupType }
  if (groupIds.length) filter.GroupIds = groupIds
  if (statuses.length) filter.Statuses = statuses.map((status) => STATUS_TO_UPSTREAM[status])
  const result = await arkAssetRequest('ListAssets', { Filter: filter, PageNumber: pageNumber, PageSize: pageSize }, config, fetchImpl, now)
  const rawItems = Array.isArray(result.Items) ? result.Items : []
  return {
    items: rawItems.map((item) => presentArkAsset(asRecord(item) ?? {})),
    totalCount: typeof result.TotalCount === 'number' && Number.isFinite(result.TotalCount) ? result.TotalCount : null,
    pageNumber: typeof result.PageNumber === 'number' ? result.PageNumber : pageNumber,
    pageSize: typeof result.PageSize === 'number' ? result.PageSize : pageSize,
  }
}

export async function deleteAsset(
  input: { id: string },
  config: ArkAssetConfig,
  fetchImpl: FetchLike = fetch,
  now: Clock = () => new Date(),
): Promise<void> {
  if (!isArkAssetId(input.id)) throw new Error('invalid_ark_asset_id')
  await arkAssetRequest('DeleteAsset', { Id: input.id }, config, fetchImpl, now)
}

export async function deleteAssetGroup(
  input: { id: string },
  config: ArkAssetConfig,
  fetchImpl: FetchLike = fetch,
  now: Clock = () => new Date(),
): Promise<void> {
  if (!isArkAssetId(input.id)) throw new Error('invalid_ark_group_id')
  await arkAssetRequest('DeleteAssetGroup', { Id: input.id }, config, fetchImpl, now)
}

export function presentArkAsset(raw: Readonly<Record<string, unknown>>): ArkAsset {
  if (!isArkAssetId(raw.Id)) throw new Error('ark_invalid_response')
  const groupId = isArkAssetId(raw.GroupId) ? raw.GroupId : ''
  const status = mapArkAssetStatus(raw.Status)
  const error = asRecord(raw.Error)
  const failedReason = status === 'failed'
    ? (stringOrNull(error?.Code) ?? stringOrNull(error?.Message) ?? 'unknown')
    : null
  const assetType = ARK_ASSET_TYPES.find((type) => type === raw.AssetType) ?? null
  return {
    id: raw.Id,
    groupId,
    assetType,
    name: stringOrNull(raw.Name),
    status,
    failedReason: failedReason ? failedReason.slice(0, 200) : null,
    url: httpsUrlOrNull(raw.URL),
    lastInferenceTime: stringOrNull(raw.LastInferenceTime),
  }
}

function canonicalQueryString(query: Readonly<Record<string, string>>): string {
  return Object.keys(query)
    .sort()
    .map((key) => `${rfc3986(key)}=${rfc3986(query[key])}`)
    .join('&')
}

function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

type SubtleLike = typeof globalThis.crypto.subtle

function subtle(): SubtleLike {
  const api = globalThis.crypto?.subtle
  if (!api) throw new Error('ark_webcrypto_unavailable')
  return api
}

// Plain ArrayBuffer keeps the WebCrypto calls typed the same under Node and DOM libs.
function utf8(value: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(value)
  const out = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(out).set(bytes)
  return out
}

function hex(bytes: ArrayBuffer): string {
  let out = ''
  for (const byte of new Uint8Array(bytes)) out += byte.toString(16).padStart(2, '0')
  return out
}

async function sha256Hex(value: string): Promise<string> {
  return hex(await subtle().digest('SHA-256', utf8(value)))
}

async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await subtle().importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return subtle().sign('HMAC', cryptoKey, utf8(message))
}

function httpsUrlOrThrow(value: unknown, code: string): string {
  const url = httpsUrlOrNull(value)
  if (!url) throw new Error(code)
  return url
}

function httpsUrlOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4000) return null
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' ? value : null
  } catch {
    return null
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}
