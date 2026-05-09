// Phase 5-5: Telegram approval UX formatter + callback parser.
//
// Pure functions. No IO. Used by:
//   - approval-queue Edge Function (post-create) to build the outbound
//     Telegram message + inline keyboard
//   - telegram-bot-webhook handler to parse incoming callback_query
//     payloads when customer presses Approve/Reject buttons

// ─── Domain types (subset of approval-queue-handler.ApprovalRow) ──

export type ApprovalAction =
  | 'incorporate'
  | 'contract_sign'
  | 'public_emission'
  | 'regulatory_filing'

export type ApprovalRowSlim = {
  id: string
  action_kind: ApprovalAction
  action_summary: string
  proposed_by_agent: string
  expires_at: string
}

// ─── Telegram inline_keyboard payload (subset of Bot API) ────────

export type InlineKeyboardButton =
  | { text: string; callback_data: string }
  | { text: string; url: string }

export type InlineKeyboardMarkup = {
  inline_keyboard: InlineKeyboardButton[][]
}

// ─── Callback data wire format ───────────────────────────────────

/** Callback data is restricted to ≤64 bytes per Telegram Bot API.
 *  Format: `appr:<approve|reject>:<uuid>`
 *  Total: 4 + 1 + 7 + 1 + 36 = 49 bytes — fits comfortably. */
const CALLBACK_PREFIX = 'appr:'

export function buildCallbackData(
  decision: 'approve' | 'reject',
  approvalId: string,
): string {
  const out = `${CALLBACK_PREFIX}${decision}:${approvalId}`
  if (out.length > 64) {
    throw new Error(`callback_data too long (${out.length} > 64): ${out}`)
  }
  return out
}

export type ParsedCallback = {
  decision: 'approve' | 'reject'
  approval_id: string
}

export function parseCallbackData(data: string): ParsedCallback | null {
  if (!data.startsWith(CALLBACK_PREFIX)) return null
  const body = data.slice(CALLBACK_PREFIX.length)
  const colonIdx = body.indexOf(':')
  if (colonIdx === -1) return null
  const decision = body.slice(0, colonIdx)
  const approval_id = body.slice(colonIdx + 1)
  if (decision !== 'approve' && decision !== 'reject') return null
  if (!approval_id) return null
  return { decision, approval_id }
}

// ─── Action_kind → human label (BI primary, EN fallback) ────────

const ACTION_LABELS: Record<ApprovalAction, string> = {
  incorporate: 'Incorporate (akta + NIB)',
  contract_sign: 'Sign contract / dokumen legal',
  public_emission: 'Publikasi / emisi public',
  regulatory_filing: 'Filing regulasi (DJP/BPJS)',
}

// ─── Expiry formatting (relative + absolute) ────────────────────

/** Formats expiry as "expires in X jam/hari" + ISO date. Times below 1
 *  hour show "kurang dari 1 jam" (no minute precision — keeps the BI
 *  copy clean). */
export function formatExpiry(expiresAtIso: string, nowIso: string): string {
  const diffMs = Date.parse(expiresAtIso) - Date.parse(nowIso)
  if (diffMs < 0) {
    return 'expired'
  }
  const hours = Math.floor(diffMs / (60 * 60 * 1000))
  const days = Math.floor(hours / 24)
  if (days >= 1) {
    return `expires dalam ${days} hari (${expiresAtIso.slice(0, 16).replace('T', ' ')} UTC)`
  }
  if (hours >= 1) {
    return `expires dalam ${hours} jam (${expiresAtIso.slice(0, 16).replace('T', ' ')} UTC)`
  }
  return `expires kurang dari 1 jam (${expiresAtIso.slice(0, 16).replace('T', ' ')} UTC)`
}

// ─── Main formatter ─────────────────────────────────────────────

export type FormattedMessage = {
  text: string
  reply_markup: InlineKeyboardMarkup
}

export function formatApprovalRequest(
  row: ApprovalRowSlim,
  nowIso: string,
): FormattedMessage {
  const label = ACTION_LABELS[row.action_kind]
  const expiry = formatExpiry(row.expires_at, nowIso)
  // BI brand voice: kamu form, no exclamation, banned words avoided.
  const text = [
    `Approval diminta dari ${row.proposed_by_agent}.`,
    ``,
    `Action: ${label}`,
    `Detail: ${row.action_summary}`,
    `${expiry}`,
    ``,
    `Tap tombol di bawah untuk approve atau reject. Sebelum approve, pastikan kamu udah review draft yang relevan.`,
  ].join('\n')

  const reply_markup: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        {
          text: 'Approve',
          callback_data: buildCallbackData('approve', row.id),
        },
        {
          text: 'Reject',
          callback_data: buildCallbackData('reject', row.id),
        },
      ],
    ],
  }

  return { text, reply_markup }
}

// ─── Acknowledgement messages (post-callback) ───────────────────

export const APPROVAL_ACK = {
  approved: 'Approved. BD v3 lanjut execute action ini.',
  rejected: 'Rejected. Action ngga diexecute. Kasih tahu kalau mau revisi.',
  unknown: 'Approval ngga ketemu. Mungkin udah expired atau di-handle dari channel lain.',
  error: 'Ada error sistem. Coba lagi sebentar; kalau masih, ping support.',
} as const
