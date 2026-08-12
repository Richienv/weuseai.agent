"use strict";
let __waits = 0;
(function start() {
  if (!window.React || !window.ReactDOM) {
    // Berhenti menunggu sesudah ~10 detik: kalau runtime tidak pernah datang,
    // timer abadi hanya membakar baterai tanpa hasil.
    if (++__waits > 100) return;
    return setTimeout(start, 100);
  }
  const React = window.React;
  const { useState, useEffect, useRef } = React;
  // Gerak dihentikan total kalau pembaca minta reduced motion.
  const reduceMotionQuery = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function prefersReducedMotion() {
    return !!(reduceMotionQuery && reduceMotionQuery.matches);
  }
  function Arrow() {
    return /* @__PURE__ */ React.createElement("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M7 17 L17 7 M8 7 h9 v9" }));
  }
  function HeroChatTerminal() {
    const conversation = [
      { type: "system", text: "07:00 \xB7 Pagi Briefing \u2014 dikirim otomatis" },
      { type: "agent", content: /* @__PURE__ */ React.createElement(React.Fragment, null, "Pagi. Ini briefing kamu hari ini.", /* @__PURE__ */ React.createElement("div", { className: "db-list" }, /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("span", { className: "marker" }), "Outstanding kemarin: follow-up PT Sinar Abadi ", /* @__PURE__ */ React.createElement("span", { className: "meta" }, "belum dibalas")), /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("span", { className: "marker" }), "IDR/USD 15.892 ", /* @__PURE__ */ React.createElement("span", { className: "meta" }, "turun 0.2%")), /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("span", { className: "marker" }), "2 berita F&B yang relevan buat kamu ", /* @__PURE__ */ React.createElement("span", { className: "meta" }, "ringkas"))), "Prioritas kamu hari ini apa?") },
      { type: "user", text: "Buatin surat penawaran harga buat PT Sinar Abadi" },
      { type: "agent", content: /* @__PURE__ */ React.createElement(React.Fragment, null, "Beres \u2014 pakai template ", /* @__PURE__ */ React.createElement("strong", null, "surat penawaran"), " dari library, diisi data klien kamu.", /* @__PURE__ */ React.createElement("div", { className: "db-list" }, /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("span", { className: "marker" }), "Item, qty, harga satuan ", /* @__PURE__ */ React.createElement("span", { className: "meta" }, "terisi")), /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("span", { className: "marker" }), "Masa berlaku 14 hari ", /* @__PURE__ */ React.createElement("span", { className: "meta" }, "standar kamu")), /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("span", { className: "marker" }), "Gaya formal, tanda tangan kamu ", /* @__PURE__ */ React.createElement("span", { className: "meta" }, "siap kirim")))) },
      { type: "user", text: "Susun kalender konten IG seminggu, tema kopi susu" },
      { type: "agent", content: /* @__PURE__ */ React.createElement(React.Fragment, null, "Kalender 7 hari disusun \u2014 ", /* @__PURE__ */ React.createElement("strong", null, "3 pilar konten"), ", caption per post mengikuti gaya kamu.", /* @__PURE__ */ React.createElement("div", { className: "db-stats" }, /* @__PURE__ */ React.createElement("div", { className: "db-stat" }, /* @__PURE__ */ React.createElement("div", { className: "num" }, "7"), /* @__PURE__ */ React.createElement("div", { className: "lbl" }, "Post")), /* @__PURE__ */ React.createElement("div", { className: "db-stat" }, /* @__PURE__ */ React.createElement("div", { className: "num" }, "3"), /* @__PURE__ */ React.createElement("div", { className: "lbl" }, "Reels")), /* @__PURE__ */ React.createElement("div", { className: "db-stat" }, /* @__PURE__ */ React.createElement("div", { className: "num" }, "7"), /* @__PURE__ */ React.createElement("div", { className: "lbl" }, "Caption")))) },
      { type: "user", text: "Minggu lalu aku cerita soal supplier baru \u2014 masih ingat?" },
      { type: "agent", content: /* @__PURE__ */ React.createElement(React.Fragment, null, "Ingat \u2014 supplier biji kopi dari Bandung, kamu nunggu sampel sebelum nego harga. Ini ringkasannya:", /* @__PURE__ */ React.createElement("div", { className: "db-list" }, /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("span", { className: "marker" }), "Sampel dijanjikan datang minggu ini ", /* @__PURE__ */ React.createElement("span", { className: "meta" }, "cek status")), /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("span", { className: "marker" }), "Target harga kamu di bawah pasar ", /* @__PURE__ */ React.createElement("span", { className: "meta" }, "tercatat")), /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("span", { className: "marker" }), "Draft pesan follow-up sudah aku siapkan ", /* @__PURE__ */ React.createElement("span", { className: "meta" }, "tinggal kirim")))) },
      { type: "user", text: "Kirim draft follow-up nya" },
      { type: "agent", content: /* @__PURE__ */ React.createElement(React.Fragment, null, "Ini draftnya \u2014 gaya nulis kamu, singkat dan sopan. Aku tidak mengirim apa pun tanpa kamu setujui.", /* @__PURE__ */ React.createElement("div", { className: "db-cal-row" }, /* @__PURE__ */ React.createElement("div", { className: "db-cal-cell" }, "Sen"), /* @__PURE__ */ React.createElement("div", { className: "db-cal-cell evt" }, "Sel", /* @__PURE__ */ React.createElement("br", null), "cek sampel"), /* @__PURE__ */ React.createElement("div", { className: "db-cal-cell" }, "Rab"), /* @__PURE__ */ React.createElement("div", { className: "db-cal-cell evt" }, "Kam", /* @__PURE__ */ React.createElement("br", null), "nego"), /* @__PURE__ */ React.createElement("div", { className: "db-cal-cell" }, "Jum"), /* @__PURE__ */ React.createElement("div", { className: "db-cal-cell" }, "Sab"), /* @__PURE__ */ React.createElement("div", { className: "db-cal-cell" }, "Min"))) },
      { type: "user", text: "Rapikan catatan rapat ini jadi notulen" },
      { type: "agent", content: /* @__PURE__ */ React.createElement(React.Fragment, null, "Sudah aku rapikan \u2014 keputusan, aksi, dan PIC-nya terpisah jelas.", /* @__PURE__ */ React.createElement("div", { className: "db-list" }, /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("span", { className: "marker" }), "3 keputusan utama ", /* @__PURE__ */ React.createElement("span", { className: "meta" }, "terangkum")), /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("span", { className: "marker" }), "5 item aksi ", /* @__PURE__ */ React.createElement("span", { className: "meta" }, "+ tenggat")), /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("span", { className: "marker" }), "Format siap kamu teruskan ", /* @__PURE__ */ React.createElement("span", { className: "meta" }, "ke tim")))) },
      { type: "user", text: "Bikin pitch deck 12 slide buat investor" },
      { type: "agent", content: /* @__PURE__ */ React.createElement(React.Fragment, null, "Beres. ", /* @__PURE__ */ React.createElement("strong", null, "12 slide"), ", tema oxblood. Alur cerita: masalah \u2192 solusi \u2192 pasar \u2192 traksi \u2192 ajakan.", /* @__PURE__ */ React.createElement("div", { className: "db-attach" }, /* @__PURE__ */ React.createElement("span", { className: "ic" }, "MD"), /* @__PURE__ */ React.createElement("span", { className: "nm" }, "pitch-deck-v3.md \xB7 12 slide"))) },
      { type: "user", text: "Kasih 5 ide konten TikTok buat brand wellness" },
      { type: "agent", content: /* @__PURE__ */ React.createElement(React.Fragment, null, "Lima ide, lengkap dengan angle dan hook pembuka.", /* @__PURE__ */ React.createElement("div", { className: "db-list" }, /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("span", { className: "marker" }), '"Rutinitas pagi 5 menit" ', /* @__PURE__ */ React.createElement("span", { className: "meta" }, "edukasi")), /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("span", { className: "marker" }), '"Mitos vs fakta wellness" ', /* @__PURE__ */ React.createElement("span", { className: "meta" }, "engagement")), /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("span", { className: "marker" }), "Behind-the-scenes produk ", /* @__PURE__ */ React.createElement("span", { className: "meta" }, "trust")))) },
      { type: "user", text: "Bikin script TikTok 60 detik, gaya humor" },
      { type: "agent", content: /* @__PURE__ */ React.createElement(React.Fragment, null, "Siap \u2014 terstruktur, tinggal kamu rekam.", /* @__PURE__ */ React.createElement("div", { className: "db-script" }, /* @__PURE__ */ React.createElement("div", { className: "db-script-row" }, /* @__PURE__ */ React.createElement("span", { className: "t" }, "0:03"), /* @__PURE__ */ React.createElement("span", { className: "lbl" }, "HOOK"), /* @__PURE__ */ React.createElement("span", { className: "bar", style: { background: "#E5322D" } })), /* @__PURE__ */ React.createElement("div", { className: "db-script-row" }, /* @__PURE__ */ React.createElement("span", { className: "t" }, "0:48"), /* @__PURE__ */ React.createElement("span", { className: "lbl" }, "BODY"), /* @__PURE__ */ React.createElement("span", { className: "bar" })), /* @__PURE__ */ React.createElement("div", { className: "db-script-row" }, /* @__PURE__ */ React.createElement("span", { className: "t" }, "1:00"), /* @__PURE__ */ React.createElement("span", { className: "lbl" }, "CTA"), /* @__PURE__ */ React.createElement("span", { className: "bar", style: { width: "70%" } })))) },
      { type: "user", text: "Susun draft balasan buat 3 pertanyaan customer ini" },
      { type: "agent", content: /* @__PURE__ */ React.createElement(React.Fragment, null, "Tiga draft balasan siap \u2014 nada ramah, sesuai gaya brand kamu. Aku tidak kirim sendiri, kamu yang tekan kirim.", /* @__PURE__ */ React.createElement("div", { className: "db-list" }, /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("span", { className: "marker" }), '"Refund prosesnya berapa lama?" ', /* @__PURE__ */ React.createElement("span", { className: "meta" }, "draft")), /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("span", { className: "marker" }), '"Bisa custom warna?" ', /* @__PURE__ */ React.createElement("span", { className: "meta" }, "draft")), /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("span", { className: "marker" }), '"Ada diskon grosir?" ', /* @__PURE__ */ React.createElement("span", { className: "meta" }, "draft")))) },
      { type: "user", text: "Pivot Q4 sales by region" },
      { type: "agent", content: /* @__PURE__ */ React.createElement(React.Fragment, null, "Beres. Formula: ", /* @__PURE__ */ React.createElement("strong", { style: { fontFamily: "'JetBrains Mono', monospace", color: "#E5322D" } }, '=SUMIFS(C:C, A:A, "Q4", B:B, region)'), ". Atau langsung file siap.", /* @__PURE__ */ React.createElement("div", { className: "db-attach" }, /* @__PURE__ */ React.createElement("span", { className: "ic" }, "XLSX"), /* @__PURE__ */ React.createElement("span", { className: "nm" }, "q4-sales-pivot.xlsx \xB7 4 sheet"))) },
      { type: "user", text: "Tulis caption listing rumah BSD buat 3 kanal" },
      { type: "agent", content: /* @__PURE__ */ React.createElement(React.Fragment, null, "Tiga caption, panjang dan nada disesuaikan tiap kanal. Tinggal copy-paste.", /* @__PURE__ */ React.createElement("div", { className: "db-chips" }, /* @__PURE__ */ React.createElement("span", { className: "db-chip" }, "Instagram"), /* @__PURE__ */ React.createElement("span", { className: "db-chip" }, "Facebook"), /* @__PURE__ */ React.createElement("span", { className: "db-chip" }, "Marketplace"))) },
      { type: "user", text: "Minggu lalu aku sebut target Q3 \u2014 masih ingat?" },
      { type: "agent", content: /* @__PURE__ */ React.createElement(React.Fragment, null, "Ingat \u2014 target Q3 kamu: tambah 2 reseller dan rapikan SOP gudang. Mau aku buatkan rencana langkahnya?") }
    ];
    const [step, setStep] = useState(0);
    const [phase, setPhase] = useState("idle");
    const [typed, setTyped] = useState(0);
    const [reduced, setReduced] = useState(prefersReducedMotion);
    const [awake, setAwake] = useState(true);
    const frameRef = useRef(null);
    useEffect(() => {
      if (!reduceMotionQuery) return;
      const onChange = () => setReduced(reduceMotionQuery.matches);
      if (reduceMotionQuery.addEventListener) {
        reduceMotionQuery.addEventListener("change", onChange);
        return () => reduceMotionQuery.removeEventListener("change", onChange);
      }
      reduceMotionQuery.addListener(onChange);
      return () => reduceMotionQuery.removeListener(onChange);
    }, []);
    useEffect(() => {
      if (reduced) return;
      let onScreen = true;
      const sync = () => setAwake(onScreen && !document.hidden);
      const onVis = () => sync();
      document.addEventListener("visibilitychange", onVis);
      let io = null;
      const node = frameRef.current;
      if (node && typeof window.IntersectionObserver === "function") {
        io = new window.IntersectionObserver((entries) => {
          for (const entry of entries) onScreen = entry.isIntersecting;
          sync();
        }, { threshold: 0 });
        io.observe(node);
      }
      sync();
      return () => {
        document.removeEventListener("visibilitychange", onVis);
        if (io) io.disconnect();
      };
    }, [reduced]);
    useEffect(() => {
      if (reduced || !awake) return;
      let cleanup = () => {
      };
      if (step >= conversation.length) {
        const t = setTimeout(() => {
          setStep(0);
          setPhase("idle");
          setTyped(0);
        }, 5e3);
        return () => clearTimeout(t);
      }
      const ev2 = conversation[step];
      if (ev2.type === "system") {
        setPhase("idle");
        const t = setTimeout(() => setStep((s) => s + 1), 1400);
        cleanup = () => clearTimeout(t);
      } else if (ev2.type === "agent") {
        setPhase("agent-typing");
        const t1 = setTimeout(() => {
          setPhase("idle");
          const t2 = setTimeout(() => setStep((s) => s + 1), 2400);
          cleanup = () => clearTimeout(t2);
        }, 1100);
        cleanup = () => clearTimeout(t1);
      } else {
        setPhase("user-typing");
        setTyped(0);
        const text = ev2.text;
        const speed = Math.max(28, Math.min(55, 1400 / text.length));
        let i = 0;
        const ti = setInterval(() => {
          i++;
          setTyped(i);
          if (i >= text.length) {
            clearInterval(ti);
            const t1 = setTimeout(() => {
              setPhase("user-moving");
              const t2 = setTimeout(() => {
                setPhase("user-click");
                const t3 = setTimeout(() => {
                  setPhase("idle");
                  setTyped(0);
                  const t4 = setTimeout(() => setStep((s) => s + 1), 200);
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
    }, [step, awake, reduced]);
    const ev = reduced ? null : conversation[step];
    const visible = reduced ? conversation.slice(0) : conversation.slice(0, step);
    if (ev) {
      if (ev.type === "system") visible.push(ev);
      else if (ev.type === "agent" && phase === "idle") visible.push(ev);
    }
    const showAgentTyping = ev && ev.type === "agent" && phase === "agent-typing";
    const showTypedInInput = ev && ev.type === "user" && (phase === "user-typing" || phase === "user-moving" || phase === "user-click");
    const typedText = showTypedInInput ? ev.text.slice(0, typed || ev.text.length) : "";
    const renderBubble = (m, i) => {
      if (m.type === "system") return /* @__PURE__ */ React.createElement("div", { key: i, className: "db-bubble-row system" }, m.text);
      if (m.type === "user") return /* @__PURE__ */ React.createElement("div", { key: i, className: "db-bubble-row user" }, /* @__PURE__ */ React.createElement("div", { className: "db-msg-user" }, m.text));
      return /* @__PURE__ */ React.createElement("div", { key: i, className: "db-bubble-row agent" }, /* @__PURE__ */ React.createElement("div", { className: "db-avatar" }, "\u25CF"), /* @__PURE__ */ React.createElement("div", { className: "db-bubble" }, m.content));
    };
    return /* @__PURE__ */ React.createElement("div", { className: "db-frame", ref: frameRef }, /* @__PURE__ */ React.createElement("div", { className: "db-topbar" }, /* @__PURE__ */ React.createElement("div", { className: "db-traffic" }, /* @__PURE__ */ React.createElement("span", null), /* @__PURE__ */ React.createElement("span", null), /* @__PURE__ */ React.createElement("span", null)), /* @__PURE__ */ React.createElement("div", { className: "db-title" }, "weuseai.agent \xB7 dashboard"), /* @__PURE__ */ React.createElement("div", { className: "db-status" }, "Online")), /* @__PURE__ */ React.createElement("div", { className: "db-body" }, /* @__PURE__ */ React.createElement("aside", { className: "db-sidebar" }, /* @__PURE__ */ React.createElement("button", { className: "db-nav active", tabIndex: -1, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("div", { className: "db-agent-avatar a" }, "A"), /* @__PURE__ */ React.createElement("span", { className: "db-agent-name" }, "Agent A"), /* @__PURE__ */ React.createElement("span", { className: "db-agent-badge" }, "3")), /* @__PURE__ */ React.createElement("button", { className: "db-nav", tabIndex: -1, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("div", { className: "db-agent-avatar b" }, "B"), /* @__PURE__ */ React.createElement("span", { className: "db-agent-name" }, "Agent B"), /* @__PURE__ */ React.createElement("span", { className: "db-agent-badge" }, "1")), /* @__PURE__ */ React.createElement("button", { className: "db-nav", tabIndex: -1, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("div", { className: "db-agent-avatar c" }, "C"), /* @__PURE__ */ React.createElement("span", { className: "db-agent-name" }, "Agent C")), /* @__PURE__ */ React.createElement("div", { className: "db-user" }, /* @__PURE__ */ React.createElement("div", { className: "db-user-avatar" }, "J"), /* @__PURE__ */ React.createElement("span", null, "Jason"))), /* @__PURE__ */ React.createElement("div", { className: "db-main", role: "presentation" }, /* @__PURE__ */ React.createElement("div", { className: "db-thread" }, /* @__PURE__ */ React.createElement("div", { className: "db-thread-content" }, visible.map(renderBubble), showAgentTyping && /* @__PURE__ */ React.createElement("div", { className: "db-typing-row agent" }, /* @__PURE__ */ React.createElement("div", { className: "typing-bubble" }, /* @__PURE__ */ React.createElement("span", { className: "dot" }), /* @__PURE__ */ React.createElement("span", { className: "dot" }), /* @__PURE__ */ React.createElement("span", { className: "dot" }))))))), /* @__PURE__ */ React.createElement("div", { className: "db-input" }, /* @__PURE__ */ React.createElement("div", { className: "db-input-box" }, typedText ? /* @__PURE__ */ React.createElement("span", { className: "db-input-typed" }, typedText, /* @__PURE__ */ React.createElement("span", { className: "db-input-caret" })) : /* @__PURE__ */ React.createElement("span", { className: "db-input-placeholder" }, "Tanya apa aja...", /* @__PURE__ */ React.createElement("span", { className: "db-input-caret" }))), /* @__PURE__ */ React.createElement("button", { type: "button", tabIndex: -1, "aria-hidden": "true", className: `db-send ${phase === "user-click" ? "db-send-clicked" : ""}` }, /* @__PURE__ */ React.createElement(Arrow, null))), /* @__PURE__ */ React.createElement("div", { className: `db-cursor cur-${phase}`, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 18 22" }, /* @__PURE__ */ React.createElement("path", { d: "M2 2 L2 17 L6.5 13 L9 18 L11.5 17 L8.8 12 L14 12 Z", fill: "#fff", stroke: "#000", strokeWidth: "0.7", strokeLinejoin: "round" }))));
  }
  function ensure() {
    const slot = document.getElementById("kt-hero-demo");
    if (!slot || slot.querySelector("[data-hero-host]")) return;
    const host = document.createElement("div");
    host.setAttribute("data-hero-host", "");
    host.style.cssText = "position:absolute; inset:0;";
    slot.appendChild(host);
    window.ReactDOM.createRoot(host).render(React.createElement(HeroChatTerminal));
  }
  // Dulu ini polling setInterval(ensure, 300) selamanya — CPU dan baterai kepakai
  // walau tidak ada yang berubah. Sekarang kita hanya bereaksi saat runtime DC
  // benar-benar mengganti node #kt-hero-demo. Callback-nya digabung lewat rAF,
  // dan rAF sendiri berhenti saat tab tidak terlihat.
  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    const run = () => {
      queued = false;
      ensure();
    };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(run);
    else setTimeout(run, 32);
  }
  function watch() {
    ensure();
    if (typeof window.MutationObserver !== "function") {
      // Fallback lawas: poll lambat, dan lewati saat tab tersembunyi.
      setInterval(() => {
        if (!document.hidden) ensure();
      }, 1e3);
      return;
    }
    const mo = new window.MutationObserver(() => {
      const slot = document.getElementById("kt-hero-demo");
      if (!slot || slot.querySelector("[data-hero-host]")) return; // masih terpasang
      schedule();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    // Node bisa berganti persis saat tab kembali terlihat; sekali cek murah.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) schedule();
    });
  }
  if (document.body) watch();
  else document.addEventListener("DOMContentLoaded", watch, { once: true });
})();
