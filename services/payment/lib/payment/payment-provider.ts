/**
 * IPaymentProvider — port untuk invoice creation + webhook handling.
 *
 * Adapter implementations:
 * - mock-payment.ts (in-memory, untuk tests)
 * - xendit-payment.ts (real)
 */

export type CreateInvoiceOpts = {
  customerId: string
  amountIdr: number
  description: string
  externalId?: string
  successRedirectUrl?: string
  failureRedirectUrl?: string
}

export type InvoiceStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED'

export type Invoice = {
  id: string
  externalId: string
  invoiceUrl: string
  status: InvoiceStatus
  amount: number
  customerId: string
}

export type WebhookPayload = {
  externalId: string
  status: InvoiceStatus
  amount: number
  paidAt?: string
}

export interface IPaymentProvider {
  readonly name: string
  createInvoice(opts: CreateInvoiceOpts): Promise<Invoice>
  getInvoice(id: string): Promise<Invoice>
  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean
  parseWebhook(rawBody: string): WebhookPayload
}
