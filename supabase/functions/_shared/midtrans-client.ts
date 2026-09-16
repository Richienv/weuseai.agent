// Type surface for create-ai-video-order-handler. Runtime client is constructed
// by create-ai-video-order/index.ts; this file is the missing _shared type.

export type MidtransSnapClient = {
  createTransaction(input: {
    orderId: string
    grossAmount: number
    customerEmail?: string
    description: string
    itemId?: string
    enabledPayments: string[]
    finishUrl: string
    errorUrl: string
  }): Promise<{ token: string; redirectUrl: string }>
}
