/**
 * Tab 2 — Customer Detail (/customers/<id>).
 *
 * Server component. Renders customer info, subscriptions, VPS instance,
 * recent manual provisions audit, and action buttons (Resend onboarding
 * email — wired; restart gateway / mark refunded / escalate — stubs).
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '../../lib/supabase';
import { ActionPanel } from './action-panel';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

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

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  if (!UUID_RE.test(params.id)) {
    notFound();
  }

  let customer: Record<string, unknown> | null = null;
  let subscriptions: Record<string, unknown>[] = [];
  let vpsInstances: Record<string, unknown>[] = [];
  let manualProvisions: Record<string, unknown>[] = [];
  let loadError: string | null = null;

  try {
    const supabase = getSupabaseAdmin();
    const { data: cust, error: cErr } = await supabase
      .from('customers')
      .select(
        'id, email, display_name, telegram_chat_id, telegram_bot_username, ' +
          'whatsapp_number, created_at',
      )
      .eq('id', params.id)
      .maybeSingle();
    if (cErr) {
      loadError = cErr.message;
    } else if (!cust) {
      notFound();
    } else {
      customer = cust as unknown as Record<string, unknown>;

      const [subs, vps, audits] = await Promise.all([
        supabase
          .from('subscriptions')
          .select('id, tier, status, hosting_active, always_on_enabled, started_at, next_billing_at')
          .eq('customer_id', params.id)
          .order('started_at', { ascending: false }),
        supabase
          .from('vps_instances')
          .select('id, status, ip_address, region, created_at')
          .eq('customer_id', params.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('manual_provisions')
          .select('id, payment_method, payment_reference, amount_idr, persona_slug, tier, notes, created_at')
          .eq('customer_id', params.id)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      subscriptions = (subs.data ?? []) as Record<string, unknown>[];
      vpsInstances = (vps.data ?? []) as Record<string, unknown>[];
      manualProvisions = (audits.data ?? []) as Record<string, unknown>[];
    }
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  if (loadError) {
    return (
      <div>
        <header className="page-head">
          <div>
            <h1>Customer detail</h1>
            <p>
              <Link href="/customers">← Kembali ke Customer List</Link>
            </p>
          </div>
        </header>
        <div className="alert error">Gagal load: {loadError}</div>
      </div>
    );
  }
  if (!customer) {
    notFound();
  }

  const email = customer.email as string;
  const displayName = (customer.display_name as string | null) ?? '—';

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>{displayName === '—' ? email : displayName}</h1>
          <p>
            <Link href="/customers">← Customer List</Link>
          </p>
        </div>
      </header>

      <section className="section">
        <h2>Profile</h2>
        <div className="card">
          <dl className="kv-grid">
            <dt>Email</dt>
            <dd>{email}</dd>
            <dt>Display name</dt>
            <dd>{displayName}</dd>
            <dt>Customer ID</dt>
            <dd>
              <code style={{ fontSize: '0.75rem' }}>{customer.id as string}</code>
            </dd>
            <dt>Telegram chat ID</dt>
            <dd>{(customer.telegram_chat_id as string | null) ?? '—'}</dd>
            <dt>Bot username</dt>
            <dd>
              {customer.telegram_bot_username ? (
                <a
                  href={`https://t.me/${customer.telegram_bot_username as string}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  @{customer.telegram_bot_username as string}
                </a>
              ) : (
                '—'
              )}
            </dd>
            <dt>WhatsApp</dt>
            <dd>{(customer.whatsapp_number as string | null) ?? '—'}</dd>
            <dt>Created</dt>
            <dd>{formatDate(customer.created_at as string | null)}</dd>
          </dl>
        </div>
      </section>

      <section className="section">
        <h2>Subscriptions ({subscriptions.length})</h2>
        {subscriptions.length === 0 ? (
          <div className="alert info">Customer belum punya subscription.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Status</th>
                <th>Hosting</th>
                <th>Always-on</th>
                <th>Started</th>
                <th>Next billing</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((s) => (
                <tr key={s.id as string}>
                  <td>
                    <span className={`tag tier-${s.tier as string}`}>
                      {s.tier as string}
                    </span>
                  </td>
                  <td>
                    <span className={`status-dot s-${(s.status as string) ?? 'pending'}`} />
                    {statusLabel(s.status as string | null)}
                  </td>
                  <td>{s.hosting_active ? 'on' : 'off'}</td>
                  <td>{s.always_on_enabled ? 'on' : 'off'}</td>
                  <td>{formatDate(s.started_at as string | null)}</td>
                  <td>{formatDate(s.next_billing_at as string | null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="section">
        <h2>VPS instances ({vpsInstances.length})</h2>
        {vpsInstances.length === 0 ? (
          <div className="alert info">Belum ada VPS untuk customer ini.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>IP</th>
                <th>Region</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {vpsInstances.map((v) => (
                <tr key={v.id as string}>
                  <td>
                    <span className={`status-dot s-${(v.status as string) ?? 'pending'}`} />
                    {(v.status as string) ?? '—'}
                  </td>
                  <td>
                    <code style={{ fontSize: '0.8125rem' }}>
                      {(v.ip_address as string | null) ?? '—'}
                    </code>
                  </td>
                  <td>{(v.region as string | null) ?? '—'}</td>
                  <td>{formatDate(v.created_at as string | null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {manualProvisions.length > 0 ? (
        <section className="section">
          <h2>Manual provisions ({manualProvisions.length})</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Payment method</th>
                <th>Reference</th>
                <th className="num">Amount</th>
                <th>Persona</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {manualProvisions.map((m) => (
                <tr key={m.id as string}>
                  <td>{m.payment_method as string}</td>
                  <td style={{ color: 'var(--ink-3)' }}>
                    {(m.payment_reference as string | null) ?? '—'}
                  </td>
                  <td className="num">
                    Rp {new Intl.NumberFormat('id-ID').format(m.amount_idr as number)}
                  </td>
                  <td>{m.persona_slug as string}</td>
                  <td>{formatDate(m.created_at as string | null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="section">
        <h2>Actions</h2>
        <ActionPanel customerId={params.id} email={email} />
      </section>
    </div>
  );
}
