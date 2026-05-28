'use client';

/**
 * Client component for customer-detail actions.
 *
 * Each button invokes a server action and shows the result inline. The
 * three stub actions render their error message verbatim so the founder
 * sees the wiring TODO at a glance.
 */

import { useState, useTransition } from 'react';
import {
  resendOnboardingEmail,
  restartGatewayStub,
  markRefundedStub,
  escalateSupportStub,
  type ActionResult,
} from './actions';

type ActionKey = 'resend' | 'restart' | 'refund' | 'escalate';

export function ActionPanel({
  customerId,
  email,
}: {
  customerId: string;
  email: string;
}) {
  const [busy, startTransition] = useTransition();
  const [activeKey, setActiveKey] = useState<ActionKey | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);

  function run(key: ActionKey, fn: () => Promise<ActionResult>) {
    setActiveKey(key);
    setResult(null);
    startTransition(async () => {
      try {
        const r = await fn();
        setResult(r);
      } catch (e) {
        setResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }

  function confirmRefund(): boolean {
    return confirm(
      `Tandai customer ${email} sebagai refunded? Aksi ini akan men-trigger ` +
        `update subscription + email + deprovision VPS (saat ini stub).`,
    );
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="action-btn primary"
          disabled={busy}
          onClick={() => run('resend', () => resendOnboardingEmail(customerId))}
        >
          {busy && activeKey === 'resend'
            ? 'Mengirim…'
            : 'Resend onboarding email'}
        </button>
        <button
          type="button"
          className="action-btn"
          disabled={busy}
          onClick={() => run('restart', () => restartGatewayStub(customerId))}
        >
          Force gateway restart
        </button>
        <button
          type="button"
          className="action-btn"
          disabled={busy}
          onClick={() => {
            if (!confirmRefund()) return;
            run('refund', () => markRefundedStub(customerId));
          }}
        >
          Mark refunded
        </button>
        <button
          type="button"
          className="action-btn"
          disabled={busy}
          onClick={() => run('escalate', () => escalateSupportStub(customerId))}
        >
          Escalate ke support
        </button>
      </div>

      {result ? (
        <div
          className={`alert ${result.ok ? 'success' : 'error'}`}
          style={{ marginTop: 14, marginBottom: 0 }}
          role="status"
        >
          {result.ok ? result.message : result.error}
        </div>
      ) : (
        <p
          className="muted"
          style={{ marginTop: 14, marginBottom: 0, fontSize: '0.8125rem' }}
        >
          Hanya &quot;Resend onboarding email&quot; yang fully wired. Tiga
          tombol lain stub — message mereka menjelaskan endpoint mana yang
          dipanggil saat di-wire nanti.
        </p>
      )}
    </div>
  );
}
