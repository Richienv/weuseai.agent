import { PERSONA_OPTIONS } from '../lib/personas';
import { ProvisionForm } from './form';

export const dynamic = 'force-dynamic';

const PAYMENT_METHOD_OPTIONS = [
  { value: 'manual_bank_transfer', label: 'Manual bank transfer' },
  { value: 'manual_qris', label: 'Manual QRIS' },
  { value: 'manual_wise', label: 'Manual Wise' },
  { value: 'other', label: 'Lainnya' },
];

export default function ManualProvisionPage({
  searchParams,
}: {
  searchParams: {
    customer_id?: string;
    subscription_id?: string;
    email_status?: string;
    message?: string;
  };
}) {
  const successMessage = searchParams.message ?? null;

  return (
    <div>
      <h1>Manual provision customer</h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        Buat customer baru tanpa lewat Xendit. Pakai ini buat onboarding via
        bank transfer atau QRIS manual.
      </p>

      {successMessage ? (
        <div className="alert success" role="status">
          <strong>Berhasil.</strong> {successMessage}
        </div>
      ) : null}

      <div className="card">
        <ProvisionForm
          personaOptions={PERSONA_OPTIONS.map((p) => ({
            slug: p.slug,
            name: p.name,
            tier: p.tier,
          }))}
          paymentMethodOptions={PAYMENT_METHOD_OPTIONS}
        />
      </div>

      <p className="muted" style={{ marginTop: 18, fontSize: '0.8125rem' }}>
        Tier di-inferensi dari persona yang dipilih (lowest tier yang grant
        persona itu). VPS provisioning tidak otomatis di-trigger dari form ini
        — jalankan flow onboarding biasa setelah customer terdaftar.
      </p>
    </div>
  );
}
