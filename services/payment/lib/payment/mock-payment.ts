import type {
  IPaymentProvider,
  CreateInvoiceOpts,
  Invoice,
  InvoiceStatus,
  WebhookPayload,
} from './payment-provider.js'

/** In-memory payment. `markAsPaid` simulates a Xendit callback. */
export class MockPaymentProvider implements IPaymentProvider {
  readonly name = 'mock'
  private invoices = new Map<string, Invoice>()
  private idCounter = 0

  async createInvoice(opts: CreateInvoiceOpts): Promise<Invoice> {
    const id = `mock-inv-${++this.idCounter}`
    const externalId = opts.externalId ?? `ext-${id}`
    const inv: Invoice = {
      id,
      externalId,
      invoiceUrl: `https://mock-payment.local/pay/${id}`,
      status: 'PENDING',
      amount: opts.amountIdr,
      customerId: opts.customerId,
    }
    this.invoices.set(id, inv)
    return { ...inv }
  }

  async getInvoice(id: string): Promise<Invoice> {
    const inv = this.invoices.get(id)
    if (!inv) throw new Error(`mock invoice not found: ${id}`)
    return { ...inv }
  }

  verifyWebhook(_headers: Record<string, string>, _rawBody: string): boolean {
    return true
  }

  parseWebhook(rawBody: string): WebhookPayload {
    return JSON.parse(rawBody) as WebhookPayload
  }

  /** Test helper — flip an invoice status as if webhook fired. */
  async markAsPaid(id: string): Promise<WebhookPayload> {
    const inv = this.invoices.get(id)
    if (!inv) throw new Error(`mock invoice not found: ${id}`)
    inv.status = 'PAID'
    return {
      externalId: inv.externalId,
      status: 'PAID',
      amount: inv.amount,
      paidAt: new Date().toISOString(),
    }
  }

  /** Test helper. */
  setStatus(id: string, status: InvoiceStatus) {
    const inv = this.invoices.get(id)
    if (!inv) throw new Error(`mock invoice not found: ${id}`)
    inv.status = status
  }
}
