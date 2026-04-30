import type { IDataStore } from '../data-store.js'
import { MockDataStore } from './mock-store.js'
import { SupabaseDataStore } from './supabase-store.js'

/** Pilih data store berdasarkan env DATA_STORE. Default: supabase. */
export function createDataStore(): IDataStore {
  const which = process.env.DATA_STORE ?? 'supabase'
  switch (which) {
    case 'mock':
      return new MockDataStore()
    case 'supabase':
      return new SupabaseDataStore()
    default:
      throw new Error(`Unknown DATA_STORE: ${which}`)
  }
}

export { MockDataStore } from './mock-store.js'
export { SupabaseDataStore } from './supabase-store.js'
