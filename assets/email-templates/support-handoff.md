# support-handoff

<!-- Variables
{{display_name}}        — string — customer's name from onboarding form
{{ticket_id}}           — string — internal ticket reference, e.g. "T-2026-0142"
{{summary_done}}        — string — one-sentence summary of what the admin fixed/changed
                                    (e.g. "menyalakan ulang gateway dan menyegarkan koneksi LLM kamu")
{{action_required}}     — string — what the customer needs to do next, or the literal string
                                    "tidak ada" when no action is needed
{{verified_at_label}}   — string — short human label of when the change was verified, in WIB
                                    (e.g. "tadi pagi pukul 10.42 WIB")
-->

**Subject:** Tiket {{ticket_id}} sudah kami tangani — kamu bisa lanjut

---

Halo {{display_name}},

Tiket kamu sudah kami tangani manual dari sisi tim. Berikut ringkasannya.

**Yang sudah kami lakukan**

{{summary_done}}

Kami uji ulang di {{verified_at_label}} dan agent kamu merespons normal saat itu.

**Yang perlu kamu lakukan**

{{action_required}}

Kalau ada hal yang masih terasa janggal, balas email ini dan sebut tiket {{ticket_id}}. Konteks kamu sudah kami catat, jadi kamu tidak perlu menjelaskan dari awal lagi.

—
Tim weuseai.agent
Dioperasikan oleh Richie Kidnovell, berbasis di Jakarta.
