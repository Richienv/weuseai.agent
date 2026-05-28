/**
 * Tab 4 — Cost Monitoring.
 *
 * Server component that calls /api/admin/observability/cost and renders
 * each customer's spend vs sub-key cap, sorted by % of cap descending.
 * Rows at or above the alert threshold (70%) get a red highlight.
 */

import { adminGet } from '../lib/admin-api';

export const dynamic = 'force-dynamic';

type CostRow = {
  customer_id: string;
  email: string;
  credit_limit_usd_cents: number;
  cost_usd_cents: number;
  cost_source: 'openrouter_live' | 'snapshot' | 'unavailable';
  pct_used: number | null;
  alert_70: boolean;
};

type CostReport = {
  generated_at: string;
  alert_threshold_pct: number;
  customer_count: number;
  alert_count: number;
  customers: CostRow[];
};

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatPct(p: number | null): string {
  if (p === null) return '—';
  return `${p.toFixed(1)}%`;
}

function sourceLabel(s: CostRow['cost_source']): string {
  switch (s) {
    case 'openrouter_live':
      return 'live';
    case 'snapshot':
      return 'snapshot';
    case 'unavailable':
      return 'unavailable';
  }
}

export default async function CostPage() {
  const result = await adminGet<CostReport>('/api/admin/observability/cost');

  if (!result.ok) {
    return (
      <div>
        <header className="page-head">
          <div>
            <h1>Cost Monitoring</h1>
            <p>Per-customer LLM spend vs sub-key cap.</p>
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

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Cost Monitoring</h1>
          <p>
            Per-customer LLM spend. Alert threshold {data.alert_threshold_pct}%.
          </p>
        </div>
      </header>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Customer dipantau</div>
          <div className="stat-value">{data.customer_count}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Alert aktif (≥{data.alert_threshold_pct}%)</div>
          <div className="stat-value" style={{ color: data.alert_count > 0 ? 'var(--danger)' : undefined }}>
            {data.alert_count}
          </div>
        </div>
      </div>

      {data.customers.length === 0 ? (
        <div className="alert info">Belum ada customer dengan sub-key OpenRouter.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th className="num">Cap</th>
              <th className="num">Spend</th>
              <th className="num">% of cap</th>
              <th>Source</th>
              <th>Alert</th>
            </tr>
          </thead>
          <tbody>
            {data.customers.map((c) => (
              <tr key={c.customer_id} className={c.alert_70 ? 'row-alert' : ''}>
                <td>
                  <a href={`/customers/${c.customer_id}`}>{c.email}</a>
                </td>
                <td className="num">
                  {c.credit_limit_usd_cents > 0
                    ? formatUsd(c.credit_limit_usd_cents)
                    : '—'}
                </td>
                <td className="num">
                  {c.cost_source === 'unavailable'
                    ? '—'
                    : formatUsd(c.cost_usd_cents)}
                </td>
                <td className="num">{formatPct(c.pct_used)}</td>
                <td>
                  <span className="tag">{sourceLabel(c.cost_source)}</span>
                </td>
                <td>
                  {c.alert_70 ? (
                    <span style={{ color: 'var(--danger)', fontWeight: 500 }}>
                      ≥ {data.alert_threshold_pct}%
                    </span>
                  ) : (
                    <span style={{ color: 'var(--ink-3)' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="muted" style={{ marginTop: 18, fontSize: '0.8125rem' }}>
        Generated {new Date(data.generated_at).toLocaleString('id-ID')}. Cap di-fetch
        live dari OpenRouter management API; saat fetch gagal row degrade ke
        snapshot atau unavailable (lihat kolom Source).
      </p>
    </div>
  );
}
