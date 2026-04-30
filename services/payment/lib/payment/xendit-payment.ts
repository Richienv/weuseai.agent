import crypto from 'node:crypto'
import type {
  IPaymentProvider,
  CreateInvoiceOpts,
  Invoice,
  InvoiceStatus,
  WebhookPayload,
} from './payment-provider.js'

/**
 * Xendit adapter (skeleton — wraps Invoice API).
 * Docs: https://developers.xendit.co/api-reference/#invoices
 */
export class XenditPaymentProvider implements IPaymentProvider {
  readonly name = 'xendit'
  private secretKey: string
  private webhookToken: string
  private base: string

  constructor(opts: { secretKey?: string; webhookToken?: string; base?: string } = {}) {
    const sk = opts.secretKey ?? process.env.XENDIT_SECRET_KEY
    const wt = opts.webhookToken ?? process.env.XENDIT_WEBHOOK_TOKEN
    if (!sk) throw new Error('XenditPaymentProvider: missing XENDIT_SECRET_KEY')
    if (!wt) throw new Error('XenditPaymentProvider: missing XENDIT_WEBHOOK_TOKEN')
    this.secretKey = sk
    this.webhookToken = wt
    this.base = opts.base ?? 'https://api.xendit.co'
  }

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`
  }

  async createInvoice(opts: CreateInvoiceOpts): Promise<Invoice> {
    const externalId = opts.externalId ?? `liren-${opts.customerId}-${Date.now()}`
    const r = await fetch(`${this.base}/v2/invoices`, {
      method: 'POST',
      headers: {
        authorization: this.authHeader(),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        external_id: externalId,
        amount: opts.amountIdr,
        description: opts.description,
        success_redirect_url: opts.successRedirectUrl,
        failure_redirect_url: opts.failureRedirectUrl,
      }),
    })
    if (!r.ok) {
      const txt = await r.text()
      throw new Error(`Xendit createInvoice -> ${r.status}: ${txt.slice(0, 500)}`)
    }
    const data = (await r.json()) as {
      id: string
      external_id: string
      invoice_url: string
      status: string
      amount: number
    }
    return {
      id: data.id,
      externalId: data.external_id,
      invoiceUrl: data.invoice_url,
      status: normalizeStatus(data.status),
      amount: data.amount,
      customerId: opts.customerId,
    }
  }

  async getInvoice(id: string): Promise<Invoice> {
    const r = await fetch(`${this.base}/v2/invoices/${id}`, {
      headers: { authorization: this.authHeader() },
    })
    if (!r.ok) {
      const txt = await r.text()
      throw new Error(`Xendit getInvoice -> ${r.status}: ${txt.slice(0, 500)}`)
    }
    const data = (await r.json()) as {
      id: string
      external_id: string
      invoice_url: string
      status: string
      amount: number
    }
    return {
      id: data.id,
      externalId: data.external_id,
      invoiceUrl: data.invoice_url,
      status: normalizeStatus(data.status),
      amount: data.amount,
      customerId: '',
    }
  }

  verifyWebhook(headers: Record<string, string>, _rawBody: string): boolean {
    const got = headers['x-callback-token'] ?? headers['X-CALLBACK-TOKEN']
    if (!got) return false
    const a = Buffer.from(got)
    const b = Buffer.from(this.webhookToken)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  }

  parseWebhook(rawBody: string): WebhookPayload {
    const data = JSON.parse(rawBody) as {
      external_id: string
      status: string
      amount: number
      paid_at?: string
    }
    return {
      externalId: data.external_id,
      status: normalizeStatus(data.status),
      amount: data.amount,
      paidAt: data.paid_at,
    }
  }
}

function normalizeStatus(s: string): InvoiceStatus {
  const up = s.toUpperCase()
  if (up === 'PAID' || up === 'SETTLED') return 'PAID'
  if (up === 'EXPIRED') return 'EXPIRED'
  if (up === 'FAILED') return 'FAILED'
  return 'PENDING'
}
