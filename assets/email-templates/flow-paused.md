# flow-paused

<!-- Variables
{{display_name}}    — string — customer's name from onboarding form
{{playbook_name}}   — string — human-friendly label, e.g. "Pendaftaran PT Perorangan"
{{parked_reason}}   — string — short reason text from customer_flow_state.reason
                                (e.g. "menunggu kamu kirim KTP", "menunggu konfirmasi alamat usaha")
{{days_remaining}}  — number — days left before auto-cancel (typically 7 at send time)
{{resume_url}}      — string — fully-qualified URL to resume the playbook
                                (e.g. https://weuseai-agent.vercel.app/dashboard/flow/{{run_id}})
-->

**Subject:** Playbook {{playbook_name}} kamu menunggu satu langkah

---

Halo {{display_name}},

Playbook {{playbook_name}} kamu sudah berjalan, tapi terhenti di satu titik karena {{parked_reason}}. Kami menyimpan progres kamu apa adanya selama menunggu.

**Yang kami butuhkan dari kamu**

Buka halaman ini untuk melanjutkan: {{resume_url}}. Setelah kamu kirim yang kami minta, agent akan langsung lanjut ke langkah berikutnya tanpa harus mengulang.

**Batas waktu**

Tersisa {{days_remaining}} hari sebelum playbook ini otomatis ditutup. Kalau ditutup, kamu masih bisa memulai ulang dari dashboard, tapi langkah yang sudah selesai harus diulang sebagian.

Kalau ada kendala atau kamu butuh waktu lebih lama, balas email ini. Kami bisa pause manual sampai kamu siap.

—
Tim weuseai.agent
Dioperasikan oleh Richie Kidnovell, berbasis di Jakarta.
