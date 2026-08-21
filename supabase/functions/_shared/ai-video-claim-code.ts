export const AI_VIDEO_CLAIM_CODE_PREFIX = 'WU-' as const
export const AI_VIDEO_CLAIM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ' as const
export const AI_VIDEO_CLAIM_CODE_RE = /^WU-[2-9A-HJ-NP-Z]{4}$/

export function isAiVideoClaimCode(value: unknown): value is string {
  return typeof value === 'string' && AI_VIDEO_CLAIM_CODE_RE.test(value)
}

export function mintAiVideoClaimCode(randomBytes: Uint8Array): string {
  if (randomBytes.length < 4) throw new Error('claim_code_entropy')
  let code = AI_VIDEO_CLAIM_CODE_PREFIX
  for (let index = 0; index < 4; index++) {
    code += AI_VIDEO_CLAIM_CODE_ALPHABET[randomBytes[index]! % AI_VIDEO_CLAIM_CODE_ALPHABET.length]
  }
  return code
}

export function paidWhatsAppPrefill(claimCode: string, sku: string): string {
  return `${claimCode}\nSKU=${sku}`
}
