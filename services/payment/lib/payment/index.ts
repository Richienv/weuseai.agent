import type { IPaymentProvider } from './payment-provider.js'
import { MockPaymentProvider } from './mock-payment.js'
import { XenditPaymentProvider } from './xendit-payment.js'

/** Pilih payment provider berdasarkan env PAYMENT_PROVIDER. Default: xendit. */
export function createPaymentProvider(): IPaymentProvider {
  const which = process.env.PAYMENT_PROVIDER ?? 'xendit'
  switch (which) {
    case 'mock':
      return new MockPaymentProvider()
    case 'xendit':
      return new XenditPaymentProvider()
    default:
      throw new Error(`Unknown PAYMENT_PROVIDER: ${which}`)
  }
}

export { MockPaymentProvider } from './mock-payment.js'
export { XenditPaymentProvider } from './xendit-payment.js'
export type {
  IPaymentProvider,
  CreateInvoiceOpts,
  Invoice,
  InvoiceStatus,
  WebhookPayload,
} from './payment-provider.js'
