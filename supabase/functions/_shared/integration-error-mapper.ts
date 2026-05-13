// Sesi R Phase 0 (2026-05-13): Bahasa error mapping for third-party APIs.
//
// Premium Bahasa Indonesian copy for every error path our integration
// broker surfaces. Customers see calm, actionable messages — never raw
// HTTP status codes, never English jargon, never backend service names.
//
// Brand voice (CLAUDE.md §"Brand voice rules"):
//   - Bahasa Indonesia primary
//   - Calm-premium register
//   - No exclamation marks in body copy
//   - No banned words (basically/just/literally/etc.)
//   - "kamu" pronoun (lowercase, not "Anda")
//
// Pure function. No DB, no network, no side effects.

export type IntegrationName = 'xendit' | 'whatsapp_cloud_api' | 'onlinepajak'

export interface UpstreamError {
  /** HTTP status from the third-party. 0 if network failure / no response. */
  status: number
  /** String error code from the third-party body. Optional. */
  code?: string
  /** Free-form upstream message — NEVER surfaced to customer. Audit only. */
  message?: string
}

export interface MappedError {
  /** Stable internal code. Used for analytics + customer-support lookup. */
  code: string
  /** Customer-facing Bahasa copy. Display this. */
  message_bahasa: string
  /** Optional Bahasa next-step suggestion. */
  suggested_action?: string
}

const FALLBACK_BAHASA =
  'Layanan sementara tidak tersedia. Coba lagi dalam beberapa menit.'

// ─── Xendit catalog ────────────────────────────────────────────────────

const XENDIT_BY_CODE: Record<string, MappedError> = {
  INVALID_API_KEY: {
    code: 'invalid_api_key',
    message_bahasa:
      'Akun Xendit kamu tidak valid. Periksa API key di pengaturan integrasi.',
    suggested_action:
      'Buka pengaturan Xendit di dashboard kamu, salin API key terbaru, lalu paste ulang.',
  },
  EXPIRED_API_KEY: {
    code: 'expired_api_key',
    message_bahasa:
      'API key Xendit kamu sudah kadaluarsa. Ganti dengan key baru di pengaturan.',
    suggested_action:
      'Login ke dashboard Xendit, generate API key baru, lalu paste di pengaturan integrasi.',
  },
  INSUFFICIENT_BALANCE: {
    code: 'insufficient_balance',
    message_bahasa:
      'Saldo Xendit kamu tidak mencukupi untuk transaksi ini.',
    suggested_action: 'Top up saldo Xendit kamu, lalu coba lagi.',
  },
  FORBIDDEN: {
    code: 'forbidden',
    message_bahasa:
      'Akun Xendit kamu belum punya izin untuk operasi ini.',
    suggested_action:
      'Hubungi tim Xendit untuk aktivasi fitur, atau cek tier akun kamu.',
  },
  DATA_NOT_FOUND: {
    code: 'not_found',
    message_bahasa: 'Data tidak ditemukan di Xendit.',
  },
  // Note: API_VALIDATION_ERROR is intentionally NOT in this code catalog.
  // Xendit returns it both for 400 (input validation) and 429 (rate limit
  // trigger). We let status-based dispatch decide: 429 → rate_limited,
  // 400 → unknown_error fallback (since we can't usefully tell the
  // customer which specific field was invalid without parsing the body).
  DUPLICATE_PAYMENT_REQUEST: {
    code: 'duplicate_request',
    message_bahasa:
      'Invoice dengan referensi yang sama sudah ada. Cek riwayat invoice kamu.',
  },
  SERVER_ERROR: {
    code: 'upstream_error',
    message_bahasa:
      'Layanan Xendit sedang gangguan. Kami coba ulang otomatis.',
  },
  SERVICE_UNAVAILABLE: {
    code: 'upstream_error',
    message_bahasa:
      'Layanan Xendit sedang gangguan. Kami coba ulang otomatis.',
  },
  NETWORK_ERROR: {
    code: 'network_error',
    message_bahasa:
      'Koneksi ke Xendit terputus. Periksa jaringan, lalu coba lagi.',
  },
  REFUND_NOT_SUPPORTED_BY_CHANNEL: {
    code: 'refund_unsupported',
    message_bahasa:
      'Channel pembayaran ini tidak mendukung refund otomatis. '
      + 'Untuk pembayaran tunai (Indomaret / Alfamart), refund harus diproses manual.',
  },
}

const XENDIT_BY_STATUS: Record<number, MappedError> = {
  401: XENDIT_BY_CODE.INVALID_API_KEY,
  402: XENDIT_BY_CODE.INSUFFICIENT_BALANCE,
  403: XENDIT_BY_CODE.FORBIDDEN,
  404: XENDIT_BY_CODE.DATA_NOT_FOUND,
  429: {
    code: 'rate_limited',
    message_bahasa:
      'Permintaan ke Xendit terlalu sering. Tunggu beberapa detik lalu coba lagi.',
  },
  500: XENDIT_BY_CODE.SERVER_ERROR,
  502: XENDIT_BY_CODE.SERVER_ERROR,
  503: XENDIT_BY_CODE.SERVICE_UNAVAILABLE,
  504: XENDIT_BY_CODE.SERVICE_UNAVAILABLE,
}

// ─── Stubs for slot 2 + 3 (filled when those phases ship) ──────────────

const WHATSAPP_BY_CODE: Record<string, MappedError> = {
  // Filled in Phase 2 (Slot 2 WhatsApp build).
}

const ONLINEPAJAK_BY_CODE: Record<string, MappedError> = {
  // Filled in Phase 3 (Slot 3 OnlinePajak build).
}

// ─── Per-integration fallback messages ─────────────────────────────────

const FALLBACK_PER_INTEGRATION: Record<IntegrationName, MappedError> = {
  xendit: {
    code: 'unknown_error',
    message_bahasa: FALLBACK_BAHASA,
  },
  whatsapp_cloud_api: {
    code: 'unknown_error',
    message_bahasa: FALLBACK_BAHASA,
  },
  onlinepajak: {
    code: 'unknown_error',
    message_bahasa: FALLBACK_BAHASA,
  },
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Map a third-party API error to customer-facing Bahasa copy.
 *
 * Lookup priority:
 *   1. String code (e.g. INVALID_API_KEY) — most specific.
 *   2. HTTP status (e.g. 401, 429) — fallback for known statuses.
 *   3. Per-integration fallback ("Layanan sementara tidak tersedia...").
 *
 * NEVER surfaces the upstream raw message. That goes to audit_log only.
 */
export function mapIntegrationError(
  integration: IntegrationName,
  err: UpstreamError,
): MappedError {
  const catalog = catalogFor(integration)

  // 1. String-code match wins.
  if (err.code && catalog[err.code]) {
    return catalog[err.code]
  }

  // 2. Xendit has status-code fallbacks too.
  if (integration === 'xendit' && XENDIT_BY_STATUS[err.status]) {
    return XENDIT_BY_STATUS[err.status]
  }

  // 3. Network errors (status 0) get a friendly Bahasa.
  if (err.status === 0 && integration === 'xendit') {
    return XENDIT_BY_CODE.NETWORK_ERROR
  }

  // 4. Final fallback per integration.
  return FALLBACK_PER_INTEGRATION[integration]
}

function catalogFor(integration: IntegrationName): Record<string, MappedError> {
  switch (integration) {
    case 'xendit': return XENDIT_BY_CODE
    case 'whatsapp_cloud_api': return WHATSAPP_BY_CODE
    case 'onlinepajak': return ONLINEPAJAK_BY_CODE
  }
}
