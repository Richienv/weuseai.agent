# flow-expired

<!-- Variables
{{display_name}}      — string — customer's name from onboarding form
{{playbook_name}}     — string — human-friendly label, e.g. "Pendaftaran PT Perorangan"
{{parked_at_label}}   — string — short label of the step where it parked
                                  (e.g. "menunggu KTP", "menunggu konfirmasi alamat")
{{restart_url}}       — string — fully-qualified URL to start a fresh run of the same playbook
{{dashboard_url}}     — string — fully-qualified URL to customer dashboard
-->

**Subject:** Playbook {{playbook_name}} ditutup otomatis setelah 14 hari

---

Halo {{display_name}},

Playbook {{playbook_name}} kamu sudah ditutup otomatis hari ini. Run ini berhenti di tahap {{parked_at_label}} dan tidak ada update selama 14 hari, jadi sistem menutupnya supaya tidak menggantung.

**Tidak ada biaya tambahan**

Setup fee yang kamu bayar tetap berlaku untuk agent kamu. Yang ditutup hanya satu run playbook, bukan langganan.

**Kalau mau coba lagi**

Mulai run baru di sini: {{restart_url}}. Sebagian besar input yang kamu sudah berikan tersimpan di profil kamu, jadi pengulangan biasanya lebih cepat dari awal.

Kalau yang membuat run ini berhenti adalah kendala dari sisi kami, atau kamu butuh playbook yang lebih cocok, balas email ini. Kami senang ngobrol singkat sebelum kamu mulai ulang. Dashboard kamu tetap aktif di {{dashboard_url}}.

—
Tim weuseai.agent
Dioperasikan oleh Richie Kidnovell, berbasis di Jakarta.
