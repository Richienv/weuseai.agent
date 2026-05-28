'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { provisionCustomerAction, type ProvisionResult } from './actions';

type PersonaOpt = { slug: string; name: string; tier: string };
type PaymentOpt = { value: string; label: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn" disabled={pending}>
      {pending ? 'Memproses…' : 'Provision customer'}{' '}
      <span className="arrow">↗</span>
    </button>
  );
}

export function ProvisionForm({
  personaOptions,
  paymentMethodOptions,
}: {
  personaOptions: PersonaOpt[];
  paymentMethodOptions: PaymentOpt[];
}) {
  const [state, formAction] = useFormState<ProvisionResult | null, FormData>(
    provisionCustomerAction,
    null,
  );

  // On error, repopulate fields from the action's echoed input. On success
  // the action redirects, so we never see a success state here.
  const echoed = state && !state.ok ? state.input ?? {} : {};

  return (
    <form action={formAction} noValidate>
      {state && !state.ok ? (
        <div className="alert error" role="alert">
          {state.error}
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="email">Email customer</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="off"
          defaultValue={echoed.email ?? ''}
          placeholder="customer@example.com"
        />
      </div>

      <div className="field">
        <label htmlFor="display_name">Nama display</label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          required
          autoComplete="off"
          defaultValue={echoed.display_name ?? ''}
          placeholder="Nama yang dipakai agent buat sapa customer"
        />
      </div>

      <div className="field">
        <label htmlFor="persona_slug">Persona</label>
        <select
          id="persona_slug"
          name="persona_slug"
          required
          defaultValue={echoed.persona_slug ?? ''}
        >
          <option value="" disabled>
            — Pilih persona —
          </option>
          {personaOptions.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name} ({p.tier})
            </option>
          ))}
        </select>
        <span className="hint">
          Tier subscription di-inferensi dari persona ini.
        </span>
      </div>

      <div className="field">
        <label htmlFor="amount_idr">Jumlah bayar (IDR)</label>
        <input
          id="amount_idr"
          name="amount_idr"
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          required
          defaultValue={echoed.amount_idr ?? ''}
          placeholder="399000"
        />
        <span className="hint">Angka tanpa titik atau koma.</span>
      </div>

      <div className="field">
        <label htmlFor="payment_method">Metode bayar</label>
        <select
          id="payment_method"
          name="payment_method"
          required
          defaultValue={echoed.payment_method ?? ''}
        >
          <option value="" disabled>
            — Pilih metode —
          </option>
          {paymentMethodOptions.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="payment_reference">Referensi bayar (opsional)</label>
        <input
          id="payment_reference"
          name="payment_reference"
          type="text"
          autoComplete="off"
          defaultValue={echoed.payment_reference ?? ''}
          placeholder="Contoh: BCA mutasi line 23/05 jam 14:32"
        />
        <span className="hint">
          Catatan audit — jangan tulis nomor rekening lengkap.
        </span>
      </div>

      <div className="field">
        <label htmlFor="notes">Catatan (opsional)</label>
        <textarea
          id="notes"
          name="notes"
          defaultValue={echoed.notes ?? ''}
          placeholder="Konteks tambahan buat catatan internal."
        />
      </div>

      <SubmitButton />
    </form>
  );
}
