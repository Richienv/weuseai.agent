/**
 * Tab 2 — Customer List.
 *
 * Server component that reads customers + their latest subscription +
 * latest VPS instance directly from Supabase using the service-role
 * client (same client the manual-provision action uses). No new
 * server-side endpoint required.
 *
 * Filter via ?status=active|pending|paused|canceled|failed|refunded|all.
 * Default = all.
 */

import Link from 'next/link';
import { getSupabaseAdmin } from '../lib/supabase';

export const dynamic = 'force-dynamic';

type SubscriptionRow = {
  id: string;
  tier: 'starter' | 'pro' | 'studio' | null;
  status: string | null;
  hosting_active: boolean | null;
  started_at: string | null;
};

type VpsRow = {
  id: string;
  status: string | null;
  ip_address: string | null;
  created_at: string | null;
};

type CustomerRow = {
  id: string;
  email: string;
  display_name: string | null;
  telegram_chat_id: string | null;
  created_at: string | null;
  subscriptions: SubscriptionRow[] | null;
  vps_instances: VpsRow[] | null;
};

type StatusFilter =
  | 'all'
  | 'active'
  | 'pending'
  | 'paused'
  | 'canceled'
  | 'failed'
  | 'refunded';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: 'active', label: 'Aktif' },
  { value: 'pending', label: 'Pending' },
  { value: 'paused', label: 'Paused' },
  { value: 'canceled', label: 'Canceled' },
  { value: 'failed', label: 'Error' },
  { value: 'refunded', label: 'Refunded' },
];

function statusLabel(s: string | null | undefined): string {
  if (!s) return '—';
  if (s === 'active') return 'Aktif';
  if (s === 'pending') return 'Pending';
  if (s === 'paused') return 'Paused';
  if (s === 'canceled') return 'Canceled';
  if (s === 'failed') return 'Error';
  if (s === 'refunded') return 'Refunded';
  return s;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function latestVps(rows: VpsRow[] | null): VpsRow | null {
  if (!rows || rows.length === 0) return null;
  return [...rows].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  })[0];
}

function latestSub(rows: SubscriptionRow[] | null): SubscriptionRow | null {
  if (!rows || rows.length === 0) return null;
  // Prefer active over inactive; otherwise newest started_at.
  const active = rows.find((r) => r.status === 'active');
  if (active) return active;
  return [...rows].sort((a, b) => {
    const ta = a.started_at ? new Date(a.started_at).getTime() : 0;
    const tb = b.started_at ? new Date(b.started_at).getTime() : 0;
    return tb - ta;
  })[0];
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const statusParam = (searchParams.status as StatusFilter) ?? 'all';
  const filter: StatusFilter = STATUS_OPTIONS.some((o) => o.value === statusParam)
    ? statusParam
    : 'all';

  let rows: CustomerRow[] = [];
  let loadError: string | null = null;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('customers')
      .select(
        'id, email, display_name, telegram_chat_id, created_at, ' +
          'subscriptions(id, tier, status, hosting_active, started_at), ' +
          'vps_instances(id, status, ip_address, created_at)',
      )
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      loadError = error.message;
    } else if (data) {
      rows = data as unknown as CustomerRow[];
    }
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  const filteredRows =
    filter === 'all'
      ? rows
      : rows.filter((r) => {
          const sub = latestSub(r.subscriptions);
          return sub?.status === filter;
        });

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Customer List</h1>
          <p>
            {filteredRows.length} customer{filter !== 'all' ? ` (filter: ${filter})` : ''}
            {' · total '} {rows.length}.
          </p>
        </div>
      </header>

      <form className="toolbar" method="GET">
        <label>
          Status
          <select name="status" defaultValue={filter}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="action-btn">
          Apply
        </button>
      </form>

      {loadError ? (
        <div className="alert error">Gagal load customer: {loadError}</div>
      ) : null}

      {filteredRows.length === 0 ? (
        <div className="alert info">Tidak ada customer untuk filter ini.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Nama</th>
              <th>Tier</th>
              <th>Status</th>
              <th>VPS</th>
              <th>Bot</th>
              <th>Created</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((c) => {
              const sub = latestSub(c.subscriptions);
              const vps = latestVps(c.vps_instances);
              const tier = sub?.tier ?? null;
              const subStatus = sub?.status ?? null;
              const vpsStatus = vps?.status ?? null;
              const hasBot = Boolean(c.telegram_chat_id);
              return (
                <tr key={c.id}>
                  <td>
                    <Link href={`/customers/${c.id}`}>{c.email}</Link>
                  </td>
                  <td>{c.display_name ?? <span className="muted">—</span>}</td>
                  <td>
                    {tier ? (
                      <span className={`tag tier-${tier}`}>{tier}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-dot s-${subStatus ?? 'pending'}`} />
                    {statusLabel(subStatus)}
                  </td>
                  <td>
                    {vpsStatus ? (
                      <>
                        <span className={`status-dot s-${vpsStatus}`} />
                        {vpsStatus}
                      </>
                    ) : (
                      <span className="muted">tidak ada</span>
                    )}
                  </td>
                  <td>
                    {hasBot ? (
                      <span className="status-dot s-active" />
                    ) : (
                      <span className="status-dot s-pending" />
                    )}
                    {hasBot ? 'paired' : 'belum'}
                  </td>
                  <td style={{ color: 'var(--ink-3)' }}>
                    {formatDate(c.created_at)}
                  </td>
                  <td>
                    <Link href={`/customers/${c.id}`} className="action-btn">
                      Detail
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="muted" style={{ marginTop: 18, fontSize: '0.8125rem' }}>
        Klik email atau Detail untuk membuka halaman customer dengan opsi
        resend onboarding email + stub actions lainnya.
      </p>
    </div>
  );
}
