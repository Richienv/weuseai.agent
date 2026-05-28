/**
 * Tab 5 — Template no-match log.
 *
 * Server component. Calls /api/admin/observability/template-no-match
 * and renders the aggregated "what templates to author next" view —
 * grouped by persona × skill, sorted by count descending.
 */

import { adminGet } from '../lib/admin-api';

export const dynamic = 'force-dynamic';

type TemplateReport = {
  generated_at: string;
  window_days: number;
  total_events: number;
  by_persona_skill: {
    persona_slug: string;
    skill_id: string;
    count: number;
    sample_deliverables: string[];
  }[];
  recent: {
    id: string;
    persona_slug: string;
    skill_id: string;
    requested_deliverable: string;
    created_at: string;
  }[];
};

function formatDate(iso: string): string {
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

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: { days?: string };
}) {
  const days = searchParams.days ?? '30';
  const result = await adminGet<TemplateReport>(
    `/api/admin/observability/template-no-match?days=${encodeURIComponent(days)}`,
  );

  if (!result.ok) {
    return (
      <div>
        <header className="page-head">
          <div>
            <h1>Template no-match</h1>
            <p>Skill yang minta template tapi library belum punya.</p>
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
          <h1>Template no-match</h1>
          <p>
            {data.total_events} event dalam {data.window_days} hari · paling
            banyak count = template berikutnya yang worth di-author.
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
        <div className="section-head">
          <h2>Grup persona × skill</h2>
          <div className="meta">Sorted by count DESC</div>
        </div>
        {data.by_persona_skill.length === 0 ? (
          <div className="alert info">Tidak ada miss di window ini.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Skill</th>
                <th>Sample request</th>
                <th className="num">Count</th>
              </tr>
            </thead>
            <tbody>
              {data.by_persona_skill.map((g, i) => (
                <tr key={`${g.persona_slug}::${g.skill_id}::${i}`}>
                  <td>
                    <span className="tag">{g.persona_slug}</span>
                  </td>
                  <td>
                    <code style={{ fontSize: '0.75rem' }}>{g.skill_id}</code>
                  </td>
                  <td style={{ color: 'var(--ink-2)', fontSize: '0.8125rem' }}>
                    {g.sample_deliverables
                      .slice(0, 2)
                      .map((s) => `"${s.slice(0, 80)}"`)
                      .join(' · ')}
                  </td>
                  <td className="num">
                    <strong>{g.count}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Recent events</h2>
          <div className="meta">Newest first · max 100</div>
        </div>
        {data.recent.length === 0 ? (
          <div className="alert info">Belum ada event.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Skill</th>
                <th>Requested deliverable</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((e) => (
                <tr key={e.id}>
                  <td>
                    <span className="tag">{e.persona_slug}</span>
                  </td>
                  <td>
                    <code style={{ fontSize: '0.75rem' }}>{e.skill_id}</code>
                  </td>
                  <td style={{ color: 'var(--ink-2)' }}>
                    {e.requested_deliverable.slice(0, 140)}
                  </td>
                  <td style={{ color: 'var(--ink-3)' }}>
                    {formatDate(e.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
