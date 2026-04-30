// Server-authoritative pricing computation.

import {
  ALWAYS_ON_MONTHLY_IDR,
  HOSTING_MONTHLY_IDR,
  PAYMENT_METHOD_FEES,
  PLANS,
  type PaymentMethodId,
  type Tier,
} from './types.ts'

export function chargeBeforeFee(tier: Tier, alwaysOn: boolean): number {
  return PLANS[tier].setupIdr + HOSTING_MONTHLY_IDR + (alwaysOn ? ALWAYS_ON_MONTHLY_IDR : 0)
}

export function paymentFee(amount: number, methodId: PaymentMethodId): number {
  const m = PAYMENT_METHOD_FEES[methodId]
  return Math.round((amount * m.pct) / 100) + m.flat
}

export function totalCharge(
  tier: Tier,
  alwaysOn: boolean,
  methodId: PaymentMethodId,
): { base: number; fee: number; total: number } {
  const base = chargeBeforeFee(tier, alwaysOn)
  const fee = paymentFee(base, methodId)
  return { base, fee, total: base + fee }
}

// Maps our internal method id to Xendit `payment_methods` enum values.
// See https://developers.xendit.co/api-reference/#create-invoice for full list.
export const XENDIT_PAYMENT_METHODS: Record<PaymentMethodId, string[]> = {
  qris: ['QRIS'],
  va: ['BCA', 'MANDIRI', 'BNI', 'BRI', 'PERMATA'],
  card: ['CREDIT_CARD'],
  cicilan: ['CREDIT_CARD'],
  ewallet: ['OVO', 'DANA', 'SHOPEEPAY', 'LINKAJA'],
  bnpl: ['KREDIVO', 'AKULAKU'],
}
