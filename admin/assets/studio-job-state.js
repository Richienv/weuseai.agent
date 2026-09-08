// UI states describe observed evidence. A URL is not proof of a saved result.
export const PROMPT_LIMIT = 6000;
export const JOB_STEPS = ['Antrean', 'Diterima provider', 'Render', 'Simpan video', 'Selesai'];
export function jobState(job, now = Date.now()) {
  if (!job) return { phase: 'empty', label: 'Hasil videomu', detail: 'Tulis prompt, tambahkan referensi, lalu generate.', tone: 'neutral', step: -1, active: false };
  if (!job.id) return { phase: 'sending', label: 'Mengirim permintaan', detail: 'Sedang memastikan job tersimpan. Jangan kirim ulang.', tone: 'progress', step: 0, active: true };
  const age = now - Date.parse(job.updated_at || job.created_at || '');
  if (job.status === 'cancelled') return { phase: 'cancelled', label: 'Dibatalkan', detail: job.provider_task_id ? 'Provider melaporkan proses dihentikan.' : 'Job dibatalkan sebelum dikirim ke provider.', tone: 'neutral', step: -1, active: false };
  if (job.status === 'failed') {
    if (job.error_code === 'monid_submission_unknown') return { phase: 'unconfirmed', label: 'Periksa pengiriman', detail: 'Pengiriman ke provider belum terkonfirmasi.', tone: 'warning', step: -1, active: false };
    const sync = job.can_sync === true || (job.provider_task_id && ['operator_sync_timeout', 'operator_result_store_failed'].includes(job.error_code));
    return { phase: sync ? 'sync-paused' : 'failed', label: sync ? 'Perlu cek status' : 'Generate gagal', detail: sync ? 'Pemantauan terhenti. Cek kembali run yang sama tanpa membuat video baru.' : '', tone: sync ? 'warning' : 'error', step: -1, active: false, canSync: Boolean(sync) };
  }
  if (job.status === 'succeeded' && job.result_path) return { phase: 'ready', label: 'Video siap', detail: 'Video sudah tersimpan. Putar, unduh, atau simpan prompt ke library.', tone: 'success', step: 4, active: false };
  if (job.phase === 'saving' || job.result_url || job.status === 'succeeded') return { phase: 'saving', label: 'Menyimpan video', detail: 'Render selesai. Salinan video sedang disimpan agar bisa diakses kembali.', tone: 'progress', step: 3, active: true };
  if (age > 120000 || job.error_code === 'operator_poll_unavailable') return { phase: 'stale', label: 'Menunggu kabar provider', detail: 'Belum ada pembaruan terbaru. Ini belum berarti gagal; jangan generate ulang dulu.', tone: 'warning', step: job.status === 'running' ? 2 : 1, active: true };
  if (job.status === 'queued' && job.attempt > 0) return { phase: 'sending', label: 'Mengirim ke provider', detail: 'Permintaan sedang dikirim. Tunggu konfirmasi sebelum membuat ulang.', tone: 'progress', step: 0, active: true };
  if (job.status === 'running') return { phase: 'running', label: 'Sedang render', detail: 'Provider sedang membuat video. Proses biasanya membutuhkan beberapa menit.', tone: 'progress', step: 2, active: true };
  if (job.status === 'submitted') return { phase: 'submitted', label: 'Diterima provider', detail: 'Permintaan sudah diterima. Menunggu giliran render.', tone: 'progress', step: 1, active: true };
  return { phase: 'queued', label: 'Dalam antrean', detail: job.error_code ? 'Ada kendala pada antrean. Status akan diperbarui setelah diperiksa.' : 'Job tersimpan dan menunggu dikirim ke provider.', tone: job.error_code ? 'warning' : 'progress', step: 0, active: true };
}
export function isActiveJob(job) { return job && (['queued', 'submitted', 'running'].includes(job.status) || (job.status === 'succeeded' && !job.result_path)); }
export function mayCancelJob(job) { return Boolean(job && job.status === 'queued' && job.can_cancel === true); }
export function elapsedTime(iso, now = Date.now()) {
  const start = Date.parse(iso || '');
  if (!Number.isFinite(start)) return 'Baru saja';
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  if (seconds < 60) return seconds + ' detik';
  if (seconds < 3600) return Math.floor(seconds / 60) + ' menit';
  return Math.floor(seconds / 3600) + ' jam ' + Math.floor((seconds % 3600) / 60) + ' menit';
}
export function estimateCost(model, resolution, duration) {
  const rate = { 'seedance-2.5': 10.7, 'seedance-2.0': 7, 'seedance-2.0-fast': 5.6, 'seedance-2.0-mini': 3.5 }[model] || 10.7;
  return Math.round((resolution === '480p' ? 0.52 : 1.156) * duration / 5 * rate / 10.7 * 100) / 100;
}
