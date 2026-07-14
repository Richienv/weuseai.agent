/* Hero chat terminal for the Konten landing — the previous DashboardDemo's rich
   12-scene cycling chat, extracted terminal-only (no section/headline/CTAs) and
   mounted into #kt-hero-demo using the design runtime's global React. Compiled to
   konten-hero-demo.js with esbuild (jsx=transform). Honest demo: every exchange is
   a real shipped capability; no email/calendar access implied. */
(function start() {
  if (!window.React || !window.ReactDOM) {
    return setTimeout(start, 100);
  }
  const React = window.React;
  const { useState, useEffect } = React;

  function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17 L17 7 M8 7 h9 v9" />
    </svg>
  );
}

function HeroChatTerminal() {
  const conversation = [
    { type: 'system', text: '07:00 · Pagi Briefing — dikirim otomatis' },
    { type: 'agent', content: (<>Pagi. Ini briefing kamu hari ini.<div className="db-list"><div className="item"><span className="marker" />Outstanding kemarin: follow-up PT Sinar Abadi <span className="meta">belum dibalas</span></div><div className="item"><span className="marker" />IDR/USD 15.892 <span className="meta">turun 0.2%</span></div><div className="item"><span className="marker" />2 berita F&amp;B yang relevan buat kamu <span className="meta">ringkas</span></div></div>Prioritas kamu hari ini apa?</>) },
    { type: 'user', text: 'Buatin surat penawaran harga buat PT Sinar Abadi' },
    { type: 'agent', content: (<>Beres — pakai template <strong>surat penawaran</strong> dari library, diisi data klien kamu.<div className="db-list"><div className="item"><span className="marker" />Item, qty, harga satuan <span className="meta">terisi</span></div><div className="item"><span className="marker" />Masa berlaku 14 hari <span className="meta">standar kamu</span></div><div className="item"><span className="marker" />Gaya formal, tanda tangan kamu <span className="meta">siap kirim</span></div></div></>) },
    { type: 'user', text: 'Susun kalender konten IG seminggu, tema kopi susu' },
    { type: 'agent', content: (<>Kalender 7 hari disusun — <strong>3 pilar konten</strong>, caption per post mengikuti gaya kamu.<div className="db-stats"><div className="db-stat"><div className="num">7</div><div className="lbl">Post</div></div><div className="db-stat"><div className="num">3</div><div className="lbl">Reels</div></div><div className="db-stat"><div className="num">7</div><div className="lbl">Caption</div></div></div></>) },
    { type: 'user', text: 'Minggu lalu aku cerita soal supplier baru — masih ingat?' },
    { type: 'agent', content: (<>Ingat — supplier biji kopi dari Bandung, kamu nunggu sampel sebelum nego harga. Ini ringkasannya:<div className="db-list"><div className="item"><span className="marker" />Sampel dijanjikan datang minggu ini <span className="meta">cek status</span></div><div className="item"><span className="marker" />Target harga kamu di bawah pasar <span className="meta">tercatat</span></div><div className="item"><span className="marker" />Draft pesan follow-up sudah aku siapkan <span className="meta">tinggal kirim</span></div></div></>) },
    { type: 'user', text: 'Kirim draft follow-up nya' },
    { type: 'agent', content: (<>Ini draftnya — gaya nulis kamu, singkat dan sopan. Aku tidak mengirim apa pun tanpa kamu setujui.<div className="db-cal-row"><div className="db-cal-cell">Sen</div><div className="db-cal-cell evt">Sel<br />cek sampel</div><div className="db-cal-cell">Rab</div><div className="db-cal-cell evt">Kam<br />nego</div><div className="db-cal-cell">Jum</div><div className="db-cal-cell">Sab</div><div className="db-cal-cell">Min</div></div></>) },
    { type: 'user', text: 'Rapikan catatan rapat ini jadi notulen' },
    { type: 'agent', content: (<>Sudah aku rapikan — keputusan, aksi, dan PIC-nya terpisah jelas.<div className="db-list"><div className="item"><span className="marker" />3 keputusan utama <span className="meta">terangkum</span></div><div className="item"><span className="marker" />5 item aksi <span className="meta">+ tenggat</span></div><div className="item"><span className="marker" />Format siap kamu teruskan <span className="meta">ke tim</span></div></div></>) },
    { type: 'user', text: 'Bikin pitch deck 12 slide buat investor' },
    { type: 'agent', content: (<>Beres. <strong>12 slide</strong>, tema oxblood. Alur cerita: masalah → solusi → pasar → traksi → ajakan.<div className="db-attach"><span className="ic">MD</span><span className="nm">pitch-deck-v3.md · 12 slide</span></div></>) },
    { type: 'user', text: 'Kasih 5 ide konten TikTok buat brand wellness' },
    { type: 'agent', content: (<>Lima ide, lengkap dengan angle dan hook pembuka.<div className="db-list"><div className="item"><span className="marker" />"Rutinitas pagi 5 menit" <span className="meta">edukasi</span></div><div className="item"><span className="marker" />"Mitos vs fakta wellness" <span className="meta">engagement</span></div><div className="item"><span className="marker" />Behind-the-scenes produk <span className="meta">trust</span></div></div></>) },
    { type: 'user', text: 'Bikin script TikTok 60 detik, gaya humor' },
    { type: 'agent', content: (<>Siap — terstruktur, tinggal kamu rekam.<div className="db-script"><div className="db-script-row"><span className="t">0:03</span><span className="lbl">HOOK</span><span className="bar" style={{ background: '#E5322D' }} /></div><div className="db-script-row"><span className="t">0:48</span><span className="lbl">BODY</span><span className="bar" /></div><div className="db-script-row"><span className="t">1:00</span><span className="lbl">CTA</span><span className="bar" style={{ width: '70%' }} /></div></div></>) },
    { type: 'user', text: 'Susun draft balasan buat 3 pertanyaan customer ini' },
    { type: 'agent', content: (<>Tiga draft balasan siap — nada ramah, sesuai gaya brand kamu. Aku tidak kirim sendiri, kamu yang tekan kirim.<div className="db-list"><div className="item"><span className="marker" />"Refund prosesnya berapa lama?" <span className="meta">draft</span></div><div className="item"><span className="marker" />"Bisa custom warna?" <span className="meta">draft</span></div><div className="item"><span className="marker" />"Ada diskon grosir?" <span className="meta">draft</span></div></div></>) },
    { type: 'user', text: 'Pivot Q4 sales by region' },
    { type: 'agent', content: (<>Beres. Formula: <strong style={{ fontFamily: "'JetBrains Mono', monospace", color: '#E5322D' }}>=SUMIFS(C:C, A:A, "Q4", B:B, region)</strong>. Atau langsung file siap.<div className="db-attach"><span className="ic">XLSX</span><span className="nm">q4-sales-pivot.xlsx · 4 sheet</span></div></>) },
    { type: 'user', text: 'Tulis caption listing rumah BSD buat 3 kanal' },
    { type: 'agent', content: (<>Tiga caption, panjang dan nada disesuaikan tiap kanal. Tinggal copy-paste.<div className="db-chips"><span className="db-chip">Instagram</span><span className="db-chip">Facebook</span><span className="db-chip">Marketplace</span></div></>) },
    { type: 'user', text: 'Minggu lalu aku sebut target Q3 — masih ingat?' },
    { type: 'agent', content: (<>Ingat — target Q3 kamu: tambah 2 reseller dan rapikan SOP gudang. Mau aku buatkan rencana langkahnya?</>) },
  ];

  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState('idle');
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    let cleanup = () => {};
    if (step >= conversation.length) {
      const t = setTimeout(() => { setStep(0); setPhase('idle'); setTyped(0); }, 5000);
      return () => clearTimeout(t);
    }
    const ev = conversation[step];
    if (ev.type === 'system') {
      setPhase('idle');
      const t = setTimeout(() => setStep(s => s + 1), 1400);
      cleanup = () => clearTimeout(t);
    } else if (ev.type === 'agent') {
      setPhase('agent-typing');
      const t1 = setTimeout(() => {
        setPhase('idle');
        const t2 = setTimeout(() => setStep(s => s + 1), 2400);
        cleanup = () => clearTimeout(t2);
      }, 1100);
      cleanup = () => clearTimeout(t1);
    } else {
      setPhase('user-typing');
      setTyped(0);
      const text = ev.text;
      const speed = Math.max(28, Math.min(55, 1400 / text.length));
      let i = 0;
      const ti = setInterval(() => {
        i++;
        setTyped(i);
        if (i >= text.length) {
          clearInterval(ti);
          const t1 = setTimeout(() => {
            setPhase('user-moving');
            const t2 = setTimeout(() => {
              setPhase('user-click');
              const t3 = setTimeout(() => {
                setPhase('idle');
                setTyped(0);
                const t4 = setTimeout(() => setStep(s => s + 1), 200);
                cleanup = () => clearTimeout(t4);
              }, 240);
              cleanup = () => clearTimeout(t3);
            }, 380);
            cleanup = () => clearTimeout(t2);
          }, 320);
          cleanup = () => clearTimeout(t1);
        }
      }, speed);
      cleanup = () => clearInterval(ti);
    }
    return () => cleanup();
  }, [step]);

  const ev = conversation[step];
  const visible = conversation.slice(0, step);
  if (ev) {
    if (ev.type === 'system') visible.push(ev);
    else if (ev.type === 'agent' && phase === 'idle') visible.push(ev);
  }
  const showAgentTyping = ev && ev.type === 'agent' && phase === 'agent-typing';
  const showTypedInInput = ev && ev.type === 'user' && (phase === 'user-typing' || phase === 'user-moving' || phase === 'user-click');
  const typedText = showTypedInInput ? ev.text.slice(0, typed || ev.text.length) : '';

  const renderBubble = (m, i) => {
    if (m.type === 'system') return <div key={i} className="db-bubble-row system">{m.text}</div>;
    if (m.type === 'user') return <div key={i} className="db-bubble-row user"><div className="db-msg-user">{m.text}</div></div>;
    return (
      <div key={i} className="db-bubble-row agent">
        <div className="db-avatar">●</div>
        <div className="db-bubble">{m.content}</div>
      </div>
    );
  };

  return (
    <div className="db-frame">
      <div className="db-topbar">
        <div className="db-traffic"><span /><span /><span /></div>
        <div className="db-title">weuseai.agent · dashboard</div>
        <div className="db-status">Online</div>
      </div>
      <div className="db-body">
        <aside className="db-sidebar">
          <button className="db-nav active" tabIndex={-1} aria-hidden="true">
            <div className="db-agent-avatar a">A</div>
            <span className="db-agent-name">Agent A</span>
            <span className="db-agent-badge">3</span>
          </button>
          <button className="db-nav" tabIndex={-1} aria-hidden="true">
            <div className="db-agent-avatar b">B</div>
            <span className="db-agent-name">Agent B</span>
            <span className="db-agent-badge">1</span>
          </button>
          <button className="db-nav" tabIndex={-1} aria-hidden="true">
            <div className="db-agent-avatar c">C</div>
            <span className="db-agent-name">Agent C</span>
          </button>
          <div className="db-user">
            <div className="db-user-avatar">J</div>
            <span>Jason</span>
          </div>
        </aside>
        <div className="db-main" role="presentation">
          <div className="db-thread">
            <div className="db-thread-content">
              {visible.map(renderBubble)}
              {showAgentTyping && (
                <div className="db-typing-row agent">
                  <div className="typing-bubble"><span className="dot" /><span className="dot" /><span className="dot" /></div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="db-input">
        <div className="db-input-box">
          {typedText
            ? <span className="db-input-typed">{typedText}<span className="db-input-caret" /></span>
            : <span className="db-input-placeholder">Tanya apa aja...<span className="db-input-caret" /></span>}
        </div>
        <button type="button" tabIndex={-1} aria-hidden="true" className={`db-send ${phase === 'user-click' ? 'db-send-clicked' : ''}`}>
          <Arrow />
        </button>
      </div>
      <div className={`db-cursor cur-${phase}`} aria-hidden="true">
        <svg viewBox="0 0 18 22">
          <path d="M2 2 L2 17 L6.5 13 L9 18 L11.5 17 L8.8 12 L14 12 Z" fill="#fff" stroke="#000" strokeWidth="0.7" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

  // #kt-hero-demo lives inside the design's runtime React tree, which re-renders
  // it empty (initial load, FAQ toggles). Mount into a self-managed host child
  // and re-mount whenever the runtime removes it — the host marker prevents loops.
  function ensure() {
    const slot = document.getElementById('kt-hero-demo');
    if (!slot || slot.querySelector('[data-hero-host]')) return;
    const host = document.createElement('div');
    host.setAttribute('data-hero-host', '');
    host.style.cssText = 'position:absolute; inset:0;';
    slot.appendChild(host);
    window.ReactDOM.createRoot(host).render(React.createElement(HeroChatTerminal));
  }
  // The runtime replaces the raw template with its React render (a NEW
  // #kt-hero-demo) and may re-render it on FAQ toggles; a light poll keeps our
  // terminal mounted into whichever #kt-hero-demo is current.
  ensure();
  setInterval(ensure, 300);
})();
