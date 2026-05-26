/**
 * /assets/persona-details.js
 *
 * Shared persona detail content used by:
 *   - index.html  (landing "10 persona spesialis" grid + modal/page link)
 *   - persona.html (dedicated full-page persona detail — 2026-05-26 cowork
 *                   redesign; founder asked for a page instead of a popup
 *                   so each persona can breathe with negative space)
 *
 * Single source of truth. DO NOT duplicate this array in either page —
 * update here and both pages refresh on next deploy.
 *
 * Shape per persona:
 *   { slug, name, glyph, tagline, capabilities[], flow[], deliverable, templates[] }
 *
 * Content was locked during the 2026-05-08 P3 landing-detail sprint plus
 * the 2026-05-19 Indonesia-deep batches — DO NOT change copy without a
 * separate content review.
 */
(function () {
  window.PERSONA_DETAILS = [
    {
      slug: 'the-pro',
      name: 'The Pro',
      glyph: 'P',
      tagline: 'Pendamping kerja harian yang ingat percakapan lintas sesi dan belajar gaya kerja kamu.',
      capabilities: [
        'Briefing pagi tiap jam 7 WIB — fokus pada yang berubah, bukan ulang headline kemarin.',
        'Ingat percakapan lintas sesi — kamu cerita training Senin, Rabu aku tanya hasilnya.',
        'Belajar gaya nulis kamu — formal vs casual, BI vs campur English — saat bantu draft balasan.',
        'Tracking commitment ke orang — deadline, follow-up, janji — aku ingatkan sebelum lewat.',
        'Rangkum percakapan jadi action items, biar kamu lebih jernih bukan lebih sibuk.',
      ],
      flow: [
        { title: 'Klasifikasi pesan masuk', desc: 'Tag tipe pesan, urgensi, hubungan, dan apakah butuh balasan personal.' },
        { title: 'Ingat thread lintas sesi', desc: 'Surface konteks dari percakapan sebelumnya — commitment, tone, nada akhir.' },
        { title: 'Draft balasan dengan voice match', desc: 'Susun balasan dalam gaya nulis kamu — register, length, BI/EN sesuai default.' },
        { title: 'Tampilkan untuk review', desc: 'Aku tunjukkan draft. Kamu approve, revisi, atau decline.' },
        { title: 'Kirim hanya setelah approve eksplisit', desc: 'Tidak pernah kirim atas nama kamu tanpa konfirmasi per-pesan.' },
      ],
      deliverable: {
        kind: 'briefing',
        mini: 'briefing',
        caption: 'Briefing pagi harian — **5 meeting hari ini**, 3 email penting, 2 follow-up. Markdown rapi, satu reflection prompt di akhir.',
      },
      templates: [
        { name: 'morning-briefing.md', kind: 'briefing' },
        { name: 'weekly-recap.md', kind: 'briefing' },
        { name: 'reply-professional.md', kind: 'reply' },
        { name: 'commitment-tracker.md', kind: 'tracker' },
        { name: 'one-on-one-notes.md', kind: 'notes' },
      ],
    },
    {
      slug: 'deep-researcher',
      name: 'Deep Researcher',
      glyph: 'R',
      tagline: 'Riset topik kompleks dari banyak sumber, sintesis jadi laporan dengan citation lengkap per claim.',
      capabilities: [
        'Riset topik dengan minimum 5 sumber primer — paper akademik, laporan resmi, reporting jurnalistik berjarak.',
        'Citation per claim, footnote-numbered dengan URL atau DOI — tidak ada generalisasi tanpa source.',
        'Sintesis 10+ paper jadi executive summary dua halaman, lengkap dengan methodology note.',
        'Tag claim yang tidak bisa diverifikasi dengan [unverified] — tidak menyembunyikan ketidakpastian.',
        'Tampilkan claim yang bertentangan dengan attribution masing-masing — bukan pilih satu side diam-diam.',
      ],
      flow: [
        { title: 'Intake scope', desc: 'Konfirmasi topik, periode, geografi, depth, dan format output yang kamu mau.' },
        { title: 'Kumpulkan sumber', desc: 'Decompose topik jadi sub-pertanyaan, web search per sub-pertanyaan, gather source set.' },
        { title: 'Grading kredibilitas', desc: 'Skor tiap sumber pakai rubrik lima dimensi — authority, recency, primary, bias, corroboration.' },
        { title: 'Checkpoint review', desc: 'Aku tunjukkan source set yang sudah di-grade. Kamu boleh remove sumber lemah sebelum sintesis.' },
        { title: 'Citation builder', desc: 'Susun daftar pustaka — footnote-numbered, APA, atau author-date — flag metadata yang tidak lengkap.' },
        { title: 'Sintesis laporan', desc: 'Compose TL;DR, key findings, detail, konflik antar sumber, gaps. Brief-memo, exec-summary, atau full-report.' },
      ],
      deliverable: {
        kind: 'research',
        mini: 'research',
        caption: 'Laporan riset terstruktur dengan **TL;DR di atas**, key findings per source, dan reference list footnote-numbered di akhir.',
      },
      templates: [
        { name: 'source-credibility-rubric.md', kind: 'reference' },
        { name: 'synthesis-structure.md', kind: 'reference' },
        { name: 'market-research playbook', kind: 'playbook' },
        { name: 'citation-builder', kind: 'skill' },
        { name: 'web-research', kind: 'skill' },
      ],
    },
    {
      slug: 'slide-master',
      name: 'Slide Master',
      glyph: 'S',
      tagline: 'Dari outline ke deck 12 slide profesional — grafik, visual hierarchy, dan speaker notes per slide.',
      capabilities: [
        'Convert outline jadi deck 12 slide. Story arc default: problem, solution, market, traction, ask.',
        'Template library — pitch deck, defense skripsi, weekly report, project update, training onboarding.',
        'Visual hierarchy per slide — title clear, key visual atau chart, support text minimal.',
        'Generate chart dari data kamu — bar, line, pie, scatter. Source data tetap dari kamu.',
        'Speaker notes per slide dengan timing estimasi dan transisi ke slide berikut.',
      ],
      flow: [
        { title: 'Pilih template atau mode narrative-arc', desc: 'Pitch deck, internal review, defense skripsi, weekly report — atau outline bebas dengan story arc.' },
        { title: 'Konfirmasi audience dan durasi', desc: 'Investor, internal team, atau customer. Durasi presentasi dan tone yang kamu mau.' },
        { title: 'Susun outline per slide', desc: 'Aku tunjukkan title plus key visual brief per slide, sebelum content actual.' },
        { title: 'Generate content + chart', desc: 'Isi setiap slide dengan content kamu plus chart dari data yang kamu kasih.' },
        { title: 'Tulis speaker notes', desc: 'Poin yang harus disampaikan, transisi ke slide berikut, timing per slide.' },
        { title: 'Export sesuai format', desc: 'PowerPoint, Keynote, Google Slides, atau Markdown.' },
      ],
      deliverable: {
        kind: 'slides',
        mini: 'slides',
        caption: 'Deck 12 slide dengan **story arc** problem-solution-market-traction-ask. Setiap slide punya visual brief dan speaker notes.',
      },
      templates: [
        { name: 'pitch-deck/seed-round.md', kind: 'pitch-deck' },
        { name: 'pitch-deck/series-a.md', kind: 'pitch-deck' },
        { name: 'deck/student/thesis-defense.md', kind: 'deck' },
        { name: 'deck/worker/weekly-report.md', kind: 'deck' },
        { name: 'pitch-deck/board-update.md', kind: 'pitch-deck' },
      ],
    },
    {
      slug: 'doc-expert',
      name: 'Doc Expert',
      glyph: 'D',
      tagline: 'Laporan, proposal, email, dan invoice yang sudah match gaya kamu — siap kirim dalam menit.',
      capabilities: [
        'Draft email reply yang match gaya kamu — formal vs casual, concise vs detailed, BI vs campur English.',
        'Bikin laporan dari outline atau raw notes — executive summary, key sections, appendix kalau perlu.',
        'Susun proposal end-to-end: problem statement, solution, deliverable, timeline, ask yang clear.',
        'Generate invoice profesional — empat varian, dari minimal sampai B2B korporat dengan PPN.',
        'Voice-match dari sample writing kamu — kasih 2-3 contoh, aku adaptasi tone untuk draft baru.',
      ],
      flow: [
        { title: 'Pilih jenis dokumen', desc: 'Invoice, proposal, laporan, email, memo, kontrak — atau academic mode untuk skripsi.' },
        { title: 'Konfirmasi konteks + audience', desc: 'Klien B2B atau personal. Tone formal atau casual. Output Notion, Docs, atau Markdown.' },
        { title: 'Mine voice dari sample', desc: 'Kalau kamu kasih sample writing, aku ekstrak pattern — register, length, sentence rhythm.' },
        { title: 'Draft dengan restraint', desc: 'Tulis sekali jadi, bukan skeleton yang harus kamu rewrite ulang.' },
        { title: 'Track changes pada edit substantive', desc: 'Comment per perubahan kalau bukan typo — kamu tahu apa yang aku ubah.' },
      ],
      deliverable: {
        kind: 'invoice',
        mini: 'invoice',
        caption: 'Invoice **W-Professional** untuk klien B2B korporat — PPN 11%, due date, payment instruction, branded header.',
      },
      templates: [
        { name: 'invoice-w-professional.html', kind: 'invoice' },
        { name: 'invoice-pro.html', kind: 'invoice' },
        { name: 'proposal-services.md', kind: 'proposal' },
        { name: 'report-standard.md', kind: 'report' },
        { name: 'email-formal.md', kind: 'email' },
      ],
    },
    {
      slug: 'business-agent',
      name: 'Business Director',
      glyph: 'B',
      tagline: 'Roadmap 5-tahap founder Indonesia — dari ide ke launched company dengan first 10 paying customers.',
      capabilities: [
        'Susun roadmap lima tahap — Idea, Setup, Identity, Build, Sell — state persisted lintas sesi.',
        'Surface PT/CV setup, OSS, NPWP, BPJS, payment gateway lokal sesuai tahap kamu sekarang.',
        'Rekomendasi gateway: Xendit untuk UMKM dan QRIS, Midtrans untuk e-commerce besar, DOKU untuk B2B.',
        'Dispatch ke department pack — Sales, Marketing, Engineering, Legal, Finance — masing-masing route ke specialist.',
        'Approval queue untuk irreversible action — incorporate, contract sign, public emission, regulatory filing.',
      ],
      flow: [
        { title: 'Cek state roadmap kamu', desc: 'Resume dari tahap terakhir yang kita capai — Idea, Setup, Identity, Build, atau Sell.' },
        { title: 'Identifikasi initiative + department', desc: 'Tentukan apakah task ini Sales, Marketing, Engineering, Legal, atau Finance.' },
        { title: 'Dispatch ke specialist', desc: 'Route ke The Pro, Doc Expert, Web Creator, Slide Master, Trade Pro, atau Social Conductor yang relevan.' },
        { title: 'Buka department thread', desc: 'Department thread persisted — aku resume context lintas sesi tanpa kamu repeat.' },
        { title: 'Approval gate untuk irreversible', desc: 'Action yang tidak bisa di-undo (incorporate, sign contract) menunggu approve eksplisit kamu via Telegram.' },
        { title: 'Track outcome + lessons', desc: 'Setiap initiative ditutup dengan ringkasan — apa yang shipped, apa yang slip, apa yang dibawa ke initiative berikut.' },
      ],
      deliverable: {
        kind: 'business',
        mini: 'roadmap',
        caption: 'Roadmap 5-tahap dengan **checklist per tahap** — PT/CV, NPWP, OSS, BPJS, payment gateway. State persisted lintas sesi.',
      },
      templates: [
        { name: 'roadmap/5-stage-checklist.md', kind: 'roadmap' },
        { name: 'incorporation/pt-vs-cv-comparison.md', kind: 'incorporation' },
        { name: 'finance/pnl-summary.md', kind: 'financial' },
        { name: 'finance/cash-runway.md', kind: 'financial' },
        { name: 'compliance/indonesian-due-dates.md', kind: 'compliance' },
      ],
    },
    {
      slug: 'project-conductor',
      name: 'Project Conductor',
      glyph: 'C',
      tagline: 'Pecah project jadi kanban board, dispatch ke specialist agent, monitor progress lintas hari.',
      capabilities: [
        'Terjemahkan goal jadi kanban — "Plan product launch" jadi 12 task terstruktur dengan dependency dan owner.',
        'Spawn specialist agent per task — riset ke Deep Researcher, draft ke Doc Expert, landing ke Web Creator.',
        'Run kanban via Hermes native — column standar To Do, In Progress, Review, Done. Custom column tersedia.',
        'Surface dashboard URL — real-time status semua task, owner, ETA, blocker yang muncul.',
        'Weekly recap mode — yang selesai, blocker, minggu depan focus mana. Siap kirim ke stakeholder.',
      ],
      flow: [
        { title: 'Terima project goal', desc: 'Kamu kasih outcome yang kamu mau — "ship landing baru", "launch produk Q3", "onboard 10 customer".' },
        { title: 'Decompose jadi task', desc: 'Pecah goal jadi 8-15 task dengan dependency, milestone, dan owner per task.' },
        { title: 'Route ke specialist agent', desc: 'Riset, draft, design, build — masing-masing didelegasikan ke persona yang tepat.' },
        { title: 'Monitor lintas hari', desc: 'Dashboard live. Ping kamu via Telegram kalau ada blocker baru atau milestone reached.' },
        { title: 'Weekly recap', desc: 'Tiap akhir minggu, sintesis: shipped, slipped, blocked, fokus minggu depan.' },
      ],
      deliverable: {
        kind: 'kanban',
        mini: 'kanban',
        caption: 'Kanban board lintas-hari dengan **12 task terstruktur**, dependency map, dan dashboard URL untuk monitor live.',
      },
      templates: [
        { name: 'kanban-orchestrator', kind: 'skill' },
        { name: 'task-decomposer', kind: 'skill' },
        { name: 'multi-agent-router', kind: 'skill' },
        { name: 'progress-monitor', kind: 'skill' },
        { name: 'weekly-recap-cycle', kind: 'playbook' },
      ],
    },
    {
      slug: 'web-app-builder',
      name: 'Web Creator',
      glyph: 'W',
      tagline: 'Website lengkap dari struktur ke deploy — landing, blog, multi-page, plus listing marketplace lokal.',
      capabilities: [
        'Bikin landing page dari template — SaaS, agency, course, portfolio, e-commerce.',
        'Susun multi-page site — about, services, contact — dengan navigation dan typography yang konsisten.',
        'Tulis blog post SEO-optimized untuk konteks Indonesia, heading hierarchy, CTA yang jelas.',
        'Deploy ke Vercel auto — dari kode ke URL hidup dalam 2-3 menit, custom domain hookup tersedia.',
        'Listing marketplace Indonesia — Tokopedia, Shopee, OLX, Lamudi, Glints, Kompas — copy yang sesuai platform.',
      ],
      flow: [
        { title: 'Pilih template + tipe site', desc: 'Landing, multi-page, blog, atau marketplace listing. Visual register: SaaS, agency, course, portfolio, e-commerce.' },
        { title: 'Susun copy + struktur', desc: 'Dari nama bisnis dan value prop kamu, aku susun hero, sections, dan CTA yang konsisten.' },
        { title: 'Domain advisory', desc: 'Rekomendasi provider Indonesia — Niagahoster, IDwebhost, Hostinger — perbandingan harga dan fitur.' },
        { title: 'Deploy ke Vercel', desc: 'Push ke Vercel auto. URL hidup dalam 2-3 menit. Custom domain hookup kalau kamu sudah punya.' },
        { title: 'Launch checklist + post-launch report', desc: 'Pre-launch check list semua kritis. Post-launch report metrik minggu pertama.' },
      ],
      deliverable: {
        kind: 'web',
        mini: 'landing',
        caption: 'Landing page **SaaS v1** — hero, social proof, feature grid, pricing, CTA. Deploy ke Vercel dengan URL siap share.',
      },
      templates: [
        { name: 'landing/saas/v1.html', kind: 'landing' },
        { name: 'landing/agency/v1.html', kind: 'landing' },
        { name: 'multipage/umkm-default/v1', kind: 'site' },
        { name: 'blog/long-form-article/v1.md', kind: 'blog' },
        { name: 'launch-checklist.md', kind: 'checklist' },
      ],
    },
    {
      slug: 'social-conductor',
      name: 'Social Conductor',
      glyph: 'O',
      tagline: 'Content calendar, post drafting cross-platform, engagement log — voice tetap satu di semua channel.',
      capabilities: [
        'Susun content calendar lintas platform — TikTok, Reels, X, LinkedIn, blog — tema mingguan dan jenis konten.',
        'Draft post copy per platform dengan length-adjustment. Kamu copy-paste manual ke platform.',
        'Engagement log — comment penting, DM perlu balas, mention yang harus diapresiasi.',
        'Voice-consistency check — skor draft baru terhadap locked voice, flag drift kalau ada pola yang bergeser.',
        'Campaign plan multi-week untuk produk launch atau content series — calendar entries siap eksekusi.',
      ],
      flow: [
        { title: 'Voice onboarding dari sample', desc: 'Kamu drop 5-10 sample post. Aku ekstrak voice profile — register, pattern, signature phrase.' },
        { title: 'Lock voice profile', desc: 'Voice profile di-save sebagai reference untuk semua draft berikut. Aku tidak nebak voice baru.' },
        { title: 'Susun content calendar', desc: 'Tema mingguan, jenis konten per platform, due date drafting. Calendar persisted di DB lokal.' },
        { title: 'Draft post per platform', desc: 'Caption per platform sesuai length rule masing-masing — TikTok singkat, LinkedIn lebih panjang.' },
        { title: 'Voice fit check + log engagement', desc: 'Setiap draft di-skor fit ke voice. Engagement masuk di-log dengan reply draft siap kirim.' },
      ],
      deliverable: {
        kind: 'social',
        mini: 'calendar',
        caption: 'Content calendar minggu ini — **4 platform**, 12 slot terjadwal, draft per slot dengan voice-fit score di pojok kanan.',
      },
      templates: [
        { name: 'voice-profile-template.md', kind: 'schema' },
        { name: 'calendar-schema.md', kind: 'schema' },
        { name: 'weekly-cadence-presets.md', kind: 'reference' },
        { name: 'campaign-template.md', kind: 'reference' },
        { name: 'voice-fit-rubric.md', kind: 'reference' },
      ],
    },
    {
      slug: 'trade-pro',
      name: 'Trade Pro',
      glyph: 'T',
      tagline: 'Briefing pasar pagi, alert saham dan crypto, ringkas laporan keuangan emiten — IDX + crypto fluent.',
      capabilities: [
        'Briefing pasar tiap jam 8 WIB — IDX open recap, US/EU overnight, crypto major moves, event calendar hari ini.',
        'Alert saham atau crypto berdasarkan threshold kamu — break support, volume spike, news trigger.',
        'Ringkas laporan keuangan emiten — revenue, EBITDA, net income, surprises vs konsensus, catatan auditor.',
        'Monitor IDR/USD dan BI rate — update kalau IDR break level psikologis atau BI signal rate change.',
        'Integrasi Bitget read-only — portfolio snapshot, P&L, funding rate signal. Tidak execute trade.',
      ],
      flow: [
        { title: 'Set watchlist + threshold', desc: 'Saham IDX, crypto pair, atau pasangan FX yang kamu monitor. Threshold untuk alert.' },
        { title: 'Briefing pagi otomatis', desc: 'Jam 8 WIB tiap hari — IDX open, overnight US/EU, crypto top 10, event hari ini.' },
        { title: 'Alert ad-hoc', desc: 'Threshold tertembak, atau breaking news pada saham kamu — kirim ke Telegram dengan one-line context.' },
        { title: 'Earnings season tracking', desc: 'Reminder satu hari sebelum earnings. Begitu rilis, aku ringkas key metrics plus surprises.' },
        { title: 'Bitget read-only sync', desc: 'Snapshot portfolio plus P&L plus funding rate signal — tidak execute trade.' },
      ],
      deliverable: {
        kind: 'trade',
        mini: 'briefing-trade',
        caption: 'Market briefing pagi — **IDX open +0.4%**, US session flat, BTC 67k konsolidasi, satu earnings event sore ini.',
      },
      templates: [
        { name: 'market-briefing-format.md', kind: 'reference' },
        { name: 'alert-rule-schema.md', kind: 'schema' },
        { name: 'earnings-summary-format.md', kind: 'reference' },
        { name: 'rate-watch-reference.md', kind: 'reference' },
        { name: 'bitget-onboarding playbook', kind: 'playbook' },
      ],
    },
    {
      slug: 'video-producer',
      name: 'Video Producer',
      glyph: 'V',
      tagline: 'Script TikTok dan Reels, hashtag research, sound trend tracking — workflow tempo produksi tinggi.',
      capabilities: [
        'Tulis script TikTok dan Reels — 15s, 30s, 60s, 90s — struktur hook-body-CTA, hook 3 detik pertama prioritas.',
        'Research hashtag per niche dan trend stage — emerging, peak, atau decay. Tag mix sesuai target.',
        'Track sound trend dan kapan adopt — early ride atau saturated, kamu tahu sebelum putuskan.',
        'Edit suggestion — cut points, transition style, B-roll prompts, timing per beat. CapCut atau Premiere compatible.',
        'HyperFrames storyboard — JSON spec per-scene siap render di RunwayML atau Sora.',
      ],
      flow: [
        { title: 'Tentukan format + durasi', desc: '15s untuk hook-only, 30s untuk single beat, 60s untuk hook-body-CTA penuh, 90s untuk story arc.' },
        { title: 'Hook brainstorm — 3 detik pertama', desc: 'Aku tunjukkan 3-5 hook variant. Kamu pilih satu yang paling kena.' },
        { title: 'Body script + B-roll prompt', desc: 'Susun body sesuai durasi. Setiap beat dapat B-roll prompt yang siap di-shoot atau di-render.' },
        { title: 'Hashtag mix + sound recommendation', desc: 'Mix emerging, peak, dan niche-locked hashtag. Sound recommendation dengan stage marking.' },
        { title: 'Caption optimizer', desc: 'Caption final yang match brand voice plus algorithm-optimized. CTA natural, bukan generik.' },
      ],
      deliverable: {
        kind: 'video',
        mini: 'script',
        caption: 'Script TikTok 60s — **hook 0:03**, body 0:48, CTA 1:00. Sound recommendation plus hashtag mix di footer.',
      },
      templates: [
        { name: 'tiktok-script-format.md', kind: 'schema' },
        { name: 'hyperframes-storyboard-format.md', kind: 'schema' },
        { name: 'sound-trend-stages.md', kind: 'reference' },
        { name: 'hashtag-mix-strategy.md', kind: 'reference' },
        { name: 'caption-patterns.md', kind: 'reference' },
      ],
    },
  ];
})();
