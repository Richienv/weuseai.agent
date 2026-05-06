import type {
  IDataStore,
  Customer,
  Subscription,
  VPSInstanceRecord,
  CreateVPSInstanceInput,
  OpenRouterKeyRecord,
} from '../data-store.js'

/** In-memory IDataStore. State exposed for assertions in tests. */
export class MockDataStore implements IDataStore {
  customers = new Map<string, Customer>()
  subscriptions = new Map<string, Subscription>()
  vpsInstances = new Map<string, VPSInstanceRecord>()
  credits = new Map<string, number>()
  openRouterKeys = new Map<string, OpenRouterKeyRecord>()

  private idCounter = 0
  private nextId(prefix: string): string {
    return `${prefix}-${++this.idCounter}`
  }

  async getCustomer(id: string): Promise<Customer | null> {
    return this.customers.get(id) ?? null
  }

  async createSubscription(rec: Omit<Subscription, 'id'>): Promise<Subscription> {
    const sub: Subscription = { ...rec, id: this.nextId('sub') }
    this.subscriptions.set(sub.id, sub)
    return { ...sub }
  }

  async findActiveVPSByCustomer(customerId: string): Promise<VPSInstanceRecord | null> {
    for (const v of this.vpsInstances.values()) {
      if (
        v.customer_id === customerId &&
        (v.status === 'provisioning' || v.status === 'running')
      ) {
        return { ...v }
      }
    }
    return null
  }

  async createVPSInstance(rec: CreateVPSInstanceInput): Promise<VPSInstanceRecord> {
    const full: VPSInstanceRecord = { ...rec, id: this.nextId('vps') }
    this.vpsInstances.set(full.vps_id, full)
    return { ...full }
  }

  async updateVPSInstance(
    vpsId: string,
    patch: Partial<VPSInstanceRecord>,
  ): Promise<void> {
    const cur = this.vpsInstances.get(vpsId)
    if (!cur) throw new Error(`mock store: vps not found ${vpsId}`)
    this.vpsInstances.set(vpsId, { ...cur, ...patch })
  }

  async getBalance(customerId: string): Promise<number> {
    return this.credits.get(customerId) ?? 0
  }

  async decrementCredits(customerId: string, cents: number): Promise<number> {
    const cur = this.credits.get(customerId) ?? 0
    const next = Math.max(0, cur - cents)
    this.credits.set(customerId, next)
    return next
  }

  async upsertOpenRouterKey(rec: OpenRouterKeyRecord): Promise<void> {
    this.openRouterKeys.set(rec.customer_id, {
      ...rec,
      created_at: rec.created_at ?? new Date().toISOString(),
    })
  }

  async getOpenRouterKey(customerId: string): Promise<OpenRouterKeyRecord | null> {
    return this.openRouterKeys.get(customerId) ?? null
  }

  /** Test helper. */
  setBalance(customerId: string, cents: number) {
    this.credits.set(customerId, cents)
  }

  /** Test helper. */
  seedCustomer(c: Customer) {
    this.customers.set(c.id, c)
  }
}
