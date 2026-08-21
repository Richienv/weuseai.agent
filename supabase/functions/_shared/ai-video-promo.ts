export const AI_VIDEO_PROMO_PERCENT = 25 as const
export const AI_VIDEO_PROMO_TTL_DAYS = 7 as const
export const AI_VIDEO_PROMO_SERIAL_RE = /^[0-9]{8,12}$/
export const AI_VIDEO_LOCAL_PROMO_SERIAL = '0000000125'

export function isAiVideoPromoSerial(value: unknown): value is string {
  return typeof value === 'string' && AI_VIDEO_PROMO_SERIAL_RE.test(value)
}

export function mintAiVideoPromoSerial(randomBytes: Uint8Array): string {
  if (randomBytes.length < 5) throw new Error('promo_serial_entropy')
  let serial = ''
  for (let index = 0; index < 10; index++) {
    serial += String(randomBytes[index % randomBytes.length]! % 10)
  }
  return serial
}

export function discountedAiVideoAmount(listAmountIdr: number): number {
  if (!Number.isInteger(listAmountIdr) || listAmountIdr <= 0) {
    throw new Error('invalid_list_amount')
  }
  return listAmountIdr - Math.trunc((listAmountIdr * AI_VIDEO_PROMO_PERCENT) / 100)
}

export function promoExpiresAt(paidAt: Date): Date {
  return new Date(paidAt.getTime() + AI_VIDEO_PROMO_TTL_DAYS * 24 * 60 * 60 * 1000)
}

export function promoStatus(input: {
  redeemedAt: string | null
  expiresAt: string
  now?: Date
}): 'unused' | 'redeemed' | 'expired' {
  if (input.redeemedAt) return 'redeemed'
  const now = input.now ?? new Date()
  if (new Date(input.expiresAt).getTime() <= now.getTime()) return 'expired'
  return 'unused'
}
