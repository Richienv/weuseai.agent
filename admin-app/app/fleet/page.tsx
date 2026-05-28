/**
 * Tab 3 — Fleet Summary.
 *
 * Server component. Calls /api/admin/observability/fleet-summary and
 * renders it as a stat-grid + tables. No client-side JS. Charts are
 * plain CSS bar widths — no charting library.
 */

import { adminGet } from '../lib/admin-api';

export const dynamic = 'force-dynamic';

type FleetSummary = {
  generated_at: string;
  window_days: number;
  customers: {
    total: number;
    active: number;
    paused: number;
    canceled: number;
    pending: number;
    failed: number;
    signups_in_window: number;
  };
  vps: {
    total: number;
    running: number;
    provisioning: number;
    failed: number;
    stopped: number;
  };
  revenue: {
    window_days: number;
    paid_invoices_count: number;
    paid_idr_total: number;
    paid_idr_setup: number;
    paid_idr_hosting: number;
    by_day: { day: string; idr_total: number }[];
  };
  flow_state_parked: {
    total_parked: number;
    awaiting_customer: number;
    escalated: number;
    expiring_within_3_days: {
      id: string;
      customer_id: string;
      playbook_id: string;
      expires_at: string | null;
    }[];
  };
  template_no_match: { events_in_window_count: number };
};

function formatIdr(n: number): string {
  return `Rp ${new Intl.NumberFormat('id-ID').format(n ?? 0)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default async function FleetPage({
  searchParams,
}: {
  searchParams: { days?: string };
}) {
  const days = searchParams.days ?? '30';
  const result = await adminGet<FleetSummary>(
    `/api/admin/observability/fleet-summary?days=${encodeURIComponent(days)}`,
  );

  if (!result.ok) {
    return (
      <div>
        <header className="page-head">
          <div>
            <h1>Fleet Summary</h1>
            <p>Ringkasan fleet harian — customer, VPS, revenue.</p>
          </div>
        </header>
        <div className="alert error">
          Gagal load data: {result.error}
          {result.detail ? ` — ${result.detail}` : ''}
        </div>
      </div>
    );
  }

  const data = result.data;
  const maxByDay = Math.max(1, ...data.revenue.by_day.map((d) => d.idr_total));

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Fleet Summary</h1>
          <p>
            Window {data.window_days} hari. Generated{' '}
            {formatDate(data.generated_at)}.
          </p>
        </div>
        <form className="toolbar" method="GET">
          <label>
            Window
            <select name="days" defaultValue={String(data.window_days)}>
              <option value="7">7 hari</option>
              <option value="30">30 hari</option>
              <option value="90">90 hari</option>
              <option value="365">365 hari</option>
            </select>
          </label>
          <button type="submit" className="action-btn">
            Apply
          </button>
        </form>
      </header>

      <section className="section">
        <div className="stat-grid">
          <Stat
            label="Customer aktif"
            value={data.customers.active}
            sub={`Total ${data.customers.total}`}
          />
          <Stat
            label="Signup baru"
            value={data.customers.signups_in_window}
            sub={`Window ${data.window_days} hari`}
          />
          <Stat
            label="VPS running"
            value={data.vps.running}
            sub={`Total ${data.vps.total}`}
          />
          <Stat
            label="VPS provisioning"
            value={data.vps.provisioning}
            sub={`Failed ${data.vps.failed} · Stopped ${data.vps.stopped}`}
          />
        </div>
      </section>

      <section className="section">
        <div className="stat-grid">
          <Stat
            label="Revenue window"
            value={formatIdr(data.revenue.paid_idr_total)}
            sub={`${data.revenue.paid_invoices_count} invoice paid`}
          />
          <Stat
            label="Setup"
            value={formatIdr(data.revenue.paid_idr_setup)}
            sub="One-time"
          />
          <Stat
            label="Hosting"
            value={formatIdr(data.revenue.paid_idr_hosting)}
            sub="Recurring"
          />
          <Stat
            label="Template no-match"
            value={data.template_no_match.events_in_window_count}
            sub={
              <a href="/templates" style={{ color: 'var(--accent)' }}>
                Lihat detail →
              </a>
            }
          />
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Revenue per hari</h2>
          <div className="meta">{data.revenue.by_day.length} hari aktif</div>
        </div>
        {data.revenue.by_day.length === 0 ? (
          <div className="alert info">Belum ada paid invoice di window ini.</div>
        ) : (
          <div className="card" style={{ padding: 16 }}>
            {data.revenue.by_day.map((d) => (
              <div className="bar-row" key={d.day}>
                <span>{d.day}</span>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${(d.idr_total / maxByDay) * 100}%` }}
                  />
                </div>
                <span className="num">{formatIdr(d.idr_total)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Parked flow runs</h2>
          <div className="meta">
            {data.flow_state_parked.total_parked} total · awaiting{' '}
            {data.flow_state_parked.awaiting_customer} · escalated{' '}
            {data.flow_state_parked.escalated}
          </div>
        </div>
        {data.flow_state_parked.expiring_within_3_days.length === 0 ? (
          <div className="alert info">
            Tidak ada flow run yang expire dalam 3 hari ke depan.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Flow ID</th>
                <th>Customer</th>
                <th>Playbook</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {data.flow_state_parked.expiring_within_3_days.map((row) => (
                <tr key={row.id} className="row-warn">
                  <td>
                    <code style={{ fontSize: '0.75rem' }}>{row.id.slice(0, 8)}</code>
                  </td>
                  <td>
                    <a href={`/customers/${row.customer_id}`}>
                      <code style={{ fontSize: '0.75rem' }}>
                        {row.customer_id.slice(0, 8)}
                      </code>
                    </a>
                  </td>
                  <td>{row.playbook_id}</td>
                  <td>{formatDate(row.expires_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </div>
  );
}
