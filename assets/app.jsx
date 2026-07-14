    const { useEffect, useRef, useState } = React;
    const M = window.Motion || window.motion || {};
    // Mot = framer's motion factory; if framer failed to load (e.g. CDN blocked),
    // fall back to a passthrough that renders plain elements (sans animation props)
    // so the page still works instead of throwing on the first <Mot.div>.
    const Mot = M.motion || new Proxy({}, {
      get: (_t, tag) => (props = {}) => {
        const { initial, animate, exit, whileInView, whileHover, whileTap, whileFocus,
          whileDrag, transition, viewport, variants, custom, onViewportEnter, onViewportLeave,
          layout, layoutId, layoutDependency, drag, dragConstraints, style, children, ...rest } = props;
        return React.createElement(typeof tag === 'string' ? tag : 'div', { style, ...rest }, children);
      },
    });

    const HLS_STATS = "https://stream.mux.com/NcU3HlHeF7CUL86azTTzpy3Tlb00d6iF3BmCdFslMJYM.m3u8";

    const EASE = [0.16, 1, 0.3, 1];

    // ─────────────────────── ICONS ───────────────────────
    const Icon = ({ d, size = 16, stroke = 1.75, fill = 'none', className = '' }) => (
      <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
        fill={fill} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
        className={className}>{d}</svg>
    );
    const ArrowUpRight = (p) => <Icon {...p} d={<><path d="M7 17 17 7" /><path d="M7 7h10v10" /></>} />;
    const Play = (p) => <Icon {...p} fill="currentColor" stroke="currentColor" d={<polygon points="6 3 20 12 6 21 6 3" />} />;

    // ─────────────────────── HLS VIDEO ───────────────────────
    // hls.js is loaded ON DEMAND (83KB stays off the critical path; most
    // visits never need it — Safari plays HLS natively, and only HLS
    // sources reach this component).
    let __hlsPromise = null;
    const loadHlsLib = () => {
      if (window.Hls) return Promise.resolve(window.Hls);
      if (!__hlsPromise) {
        __hlsPromise = new Promise((resolve) => {
          const sc = document.createElement('script');
          sc.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.6.15/dist/hls.min.js';
          sc.onload = () => resolve(window.Hls || null);
          sc.onerror = () => resolve(null);
          document.head.appendChild(sc);
        });
      }
      return __hlsPromise;
    };
    function HlsVideo({ src, className = '', style = {}, filter = '' }) {
      const ref = useRef(null);
      useEffect(() => {
        const v = ref.current; if (!v) return;
        if (v.canPlayType('application/vnd.apple.mpegurl')) {
          v.src = src;
          return;
        }
        let cancelled = false;
        let hls = null;
        loadHlsLib().then((Hls) => {
          if (cancelled || !v) return;
          if (Hls && Hls.isSupported()) {
            hls = new Hls({ enableWorker: true });
            hls.loadSource(src); hls.attachMedia(v);
          } else {
            v.src = src;
          }
        });
        return () => { cancelled = true; if (hls) hls.destroy(); };
      }, [src]);
      return (
        <video ref={ref} autoPlay loop muted playsInline
          className={`absolute inset-0 w-full h-full object-cover ${className}`}
          style={{ filter, ...style }} />
      );
    }

    const FadeTop = ({ h = 200 }) => <div className="absolute top-0 left-0 right-0 pointer-events-none z-[2]" style={{ height: h, background: 'linear-gradient(to bottom, #000, transparent)' }} />;
    const FadeBottom = ({ h = 200 }) => <div className="absolute bottom-0 left-0 right-0 pointer-events-none z-[2]" style={{ height: h, background: 'linear-gradient(to top, #000, transparent)' }} />;

    // ─────────────────────── DOTTED VIDEO (Grainrad-style halftone) ───────────────────────
    // Samples a video frame-by-frame and renders each cell as a colored dot
    // whose radius scales with luminance. Pure Canvas 2D, runs at video FPS.
    // Source video must be same-origin (it is — /assets/).
    function DottedVideo({ src, color = '#E5322D', cellSize = 6, threshold = 0.06, className = '', style = {} }) {
      const wrapRef = useRef(null);
      const videoRef = useRef(null);
      const canvasRef = useRef(null);

      useEffect(() => {
        const wrap = wrapRef.current;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!wrap || !video || !canvas) return;
        const sample = document.createElement('canvas');
        const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
        const ctx = canvas.getContext('2d');

        // Mobile / data-saver tier — bigger cells (fewer dots), slower refresh.
        const isMobile = window.matchMedia('(max-width: 767px)').matches;
        const saveData = !!(navigator.connection && navigator.connection.saveData);
        const effectiveCell = isMobile || saveData ? Math.max(cellSize, 9) : cellSize;
        const frameModulo = isMobile || saveData ? 3 : 2; // ~20fps on mobile, ~30fps desktop

        const dpr = 1;
        let mounted = true;
        let raf = 0;
        let inView = false;
        let frame = 0;

        const resize = () => {
          const r = wrap.getBoundingClientRect();
          canvas.width = Math.max(1, Math.floor(r.width * dpr));
          canvas.height = Math.max(1, Math.floor(r.height * dpr));
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(wrap);

        const tick = () => {
          if (!mounted) return;
          raf = requestAnimationFrame(tick);
          if (!inView) return;
          // Frame modulo controls effective FPS — 1 of every N rAF ticks
          // actually re-samples + redraws.
          if ((frame++ % frameModulo) !== 0) return;
          if (video.readyState < 2) return;

          const w = canvas.width, h = canvas.height;
          const cell = Math.max(2, effectiveCell * dpr);
          const cols = Math.ceil(w / cell);
          const rows = Math.ceil(h / cell);
          if (sample.width !== cols) sample.width = cols;
          if (sample.height !== rows) sample.height = rows;

          const vw = video.videoWidth, vh = video.videoHeight;
          if (!vw || !vh) return;
          const scale = Math.max(cols / vw, rows / vh);
          const dw = vw * scale, dh = vh * scale;
          const dx = (cols - dw) / 2, dy = (rows - dh) / 2;
          sampleCtx.drawImage(video, dx, dy, dw, dh);
          const data = sampleCtx.getImageData(0, 0, cols, rows).data;

          ctx.clearRect(0, 0, w, h);
          ctx.fillStyle = color;
          const half = cell / 2;
          const maxR = half * 0.95;
          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
              const i = (y * cols + x) * 4;
              const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
              if (lum < threshold) continue;
              const r = lum * maxR;
              ctx.beginPath();
              ctx.arc(x * cell + half, y * cell + half, r, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        };

        // Visibility-gated rAF. Browsers don't pause rAF for offscreen
        // elements, so without this an offscreen DottedVideo keeps doing
        // getImageData on every frame and tanks scroll perf.
        const io = new IntersectionObserver(
          (entries) => {
            entries.forEach((e) => {
              inView = e.isIntersecting;
              if (inView) {
                const p = video.play();
                if (p && p.catch) p.catch(() => {});
              } else {
                video.pause();
              }
            });
          },
          { rootMargin: '200px' }
        );
        io.observe(wrap);

        if (!raf) raf = requestAnimationFrame(tick);

        return () => {
          mounted = false;
          ro.disconnect();
          io.disconnect();
          cancelAnimationFrame(raf);
        };
      }, [src, color, cellSize, threshold]);

      return (
        <div ref={wrapRef} className={className} style={style}>
          <video
            ref={videoRef}
            src={src}
            loop muted playsInline
            preload="none"
            crossOrigin="anonymous"
            aria-hidden="true"
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
          />
          <canvas ref={canvasRef} aria-hidden="true" style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
      );
    }

    // ─────────────────────── UNICORN STUDIO EMBED ───────────────────────
    // Lazy-loads the unicornStudio.js lib once per page; (re-)initializes
    // any [data-us-project] divs on mount.
    function UnicornEmbed({ projectId, className = '', style = {} }) {
      useEffect(() => {
        const init = () => window.UnicornStudio?.init?.();
        if (window.UnicornStudio && window.UnicornStudio.init) {
          init();
          return;
        }
        if (window.__usLoading) {
          window.addEventListener('us-loaded', init, { once: true });
          return () => window.removeEventListener('us-loaded', init);
        }
        window.__usLoading = true;
        window.UnicornStudio = { isInitialized: false };
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.1.12/dist/unicornStudio.umd.js';
        s.onload = () => {
          init();
          window.dispatchEvent(new Event('us-loaded'));
        };
        document.head.appendChild(s);
      }, [projectId]);
      return <div data-us-project={projectId} className={className} style={style} />;
    }

    // ─────────────────────── DOTTED UNICORN STUDIO ───────────────────────
    // Wraps UnicornEmbed in an offscreen layer, samples its WebGL canvas
    // each frame into a halftone overlay (red dots, luminance-modulated —
    // same Grainrad-style renderer as DottedVideo).
    function DottedUnicorn({ projectId, color = '#E5322D', cellSize = 6, threshold = 0.06, className = '', style = {} }) {
      const wrapRef = useRef(null);
      const sourceWrapRef = useRef(null);
      const canvasRef = useRef(null);

      useEffect(() => {
        const wrap = wrapRef.current;
        const sourceWrap = sourceWrapRef.current;
        const canvas = canvasRef.current;
        if (!wrap || !sourceWrap || !canvas) return;

        const sample = document.createElement('canvas');
        const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
        const ctx = canvas.getContext('2d');

        const isMobile = window.matchMedia('(max-width: 767px)').matches;
        const saveData = !!(navigator.connection && navigator.connection.saveData);
        const effectiveCell = isMobile || saveData ? Math.max(cellSize, 9) : cellSize;
        const frameModulo = isMobile || saveData ? 3 : 2;

        const dpr = 1;
        let mounted = true;
        let raf = 0;
        let inView = false;
        let frame = 0;

        const resize = () => {
          const r = wrap.getBoundingClientRect();
          canvas.width = Math.max(1, Math.floor(r.width * dpr));
          canvas.height = Math.max(1, Math.floor(r.height * dpr));
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(wrap);

        const tick = () => {
          if (!mounted) return;
          raf = requestAnimationFrame(tick);
          if (!inView) return;
          if ((frame++ % frameModulo) !== 0) return;
          const usCanvas = sourceWrap.querySelector('canvas');
          if (!usCanvas || !usCanvas.width || !usCanvas.height) return;

          const w = canvas.width, h = canvas.height;
          const cell = Math.max(2, effectiveCell * dpr);
          const cols = Math.ceil(w / cell);
          const rows = Math.ceil(h / cell);
          if (sample.width !== cols) sample.width = cols;
          if (sample.height !== rows) sample.height = rows;

          const sw = usCanvas.width, sh = usCanvas.height;
          const scale = Math.max(cols / sw, rows / sh);
          const dw = sw * scale, dh = sh * scale;
          const dx = (cols - dw) / 2, dy = (rows - dh) / 2;
          try {
            sampleCtx.drawImage(usCanvas, dx, dy, dw, dh);
          } catch (e) { return; }
          const data = sampleCtx.getImageData(0, 0, cols, rows).data;

          ctx.clearRect(0, 0, w, h);
          ctx.fillStyle = color;
          const half = cell / 2;
          const maxR = half * 0.95;
          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
              const i = (y * cols + x) * 4;
              const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
              if (lum < threshold) continue;
              const r = lum * maxR;
              ctx.beginPath();
              ctx.arc(x * cell + half, y * cell + half, r, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        };

        const io = new IntersectionObserver(
          (entries) => entries.forEach((e) => { inView = e.isIntersecting; }),
          { rootMargin: '200px' }
        );
        io.observe(wrap);

        raf = requestAnimationFrame(tick);
        return () => {
          mounted = false;
          ro.disconnect();
          io.disconnect();
          cancelAnimationFrame(raf);
        };
      }, [projectId, color, cellSize, threshold]);

      return (
        <div ref={wrapRef} className={className} style={{ ...style, position: style.position || 'absolute' }}>
          {/* Source rendering — kept in-flow at opacity 0 so UnicornStudio's
              rAF loop keeps drawing every frame. Pointer-events none so it
              doesn't trap interactions. */}
          <div
            ref={sourceWrapRef}
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none' }}
          >
            <UnicornEmbed projectId={projectId} className="w-full h-full" style={{ width: '100%', height: '100%' }} />
          </div>
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
          />
        </div>
      );
    }

    // ─────────────────────── COUNT UP ───────────────────────
    function CountUp({ to, suffix = '', duration = 1800, delay = 0, locale = 'id-ID', className = '', style = {} }) {
      const [val, setVal] = useState(0);
      const [active, setActive] = useState(false);
      const ref = useRef(null);
      const startedRef = useRef(false);

      useEffect(() => {
        const el = ref.current; if (!el) return;
        const obs = new IntersectionObserver((entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting && !startedRef.current) {
              startedRef.current = true;
              setActive(true);
              const t0 = performance.now() + delay;
              let raf;
              const tick = (now) => {
                const t = Math.max(0, now - t0);
                const p = Math.min(1, t / duration);
                const eased = 1 - Math.pow(1 - p, 3);
                setVal(Math.round(eased * to));
                if (p < 1) raf = requestAnimationFrame(tick);
                else setTimeout(() => setActive(false), 450);
              };
              raf = requestAnimationFrame(tick);
            }
          });
        }, { threshold: 0.35 });
        obs.observe(el);
        return () => obs.disconnect();
      }, [to, duration, delay]);

      return (
        <span ref={ref} className={`countup ${active ? 'glow' : ''} ${className}`} style={style}>
          {val.toLocaleString(locale)}{suffix}
        </span>
      );
    }

    // ─────────────────────── BLUR TEXT ───────────────────────
    function BlurText({ text, className = '', by = 'word', delay = 100, as: Tag = 'h2', style = {} }) {
      const parts = by === 'word' ? text.split(' ') : text.split('');
      const [inView, setInView] = useState(false);
      const ref = useRef(null);
      // The CSS reduced-motion reset can't reach framer's JS-driven reveal, so
      // gate it here: motion-sensitive users get the headline already settled.
      const reduced = typeof window !== 'undefined' && window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const settled = { filter: 'blur(0px)', opacity: 1, y: 0 };
      useEffect(() => {
        const el = ref.current; if (!el) return;
        const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.unobserve(el); } }, { threshold: 0.15 });
        io.observe(el);
        return () => io.disconnect();
      }, []);
      return (
        <Tag ref={ref} className={className} style={style} aria-label={text}>
          {parts.map((p, i) => (
            <Mot.span
              key={`bt-${i}`}
              aria-hidden="true"
              style={{
                display: 'inline-block',
                marginRight: by === 'word' && i < parts.length - 1 ? '0.28em' : 0
              }}
              initial={reduced ? settled : { filter: 'blur(10px)', opacity: 0, y: 50 }}
              animate={reduced ? settled : (inView ? settled : {})}
              transition={reduced ? { duration: 0 } : { duration: 0.7, ease: EASE, delay: i * delay / 1000 }}>
              {p}
            </Mot.span>
          ))}
        </Tag>
      );
    }

    // ─────────────────────── NAVBAR ───────────────────────
    // Konten redesign nav (Iter 2): solid glassmorphism top bar, diamond+gradient
    // logo, decorative search (no search backend — design fidelity), Kerja/Harga/
    // FAQ + white Mulai pill. Wiring preserved; mobile hamburger kept.
    function Navbar() {
      const links = [
        { label: 'Kerja', href: '#proses' },
        { label: 'Harga', href: '#pricing' },
        { label: 'FAQ', href: '#faq' },
      ];
      const [menuOpen, setMenuOpen] = useState(false);
      return (
        <header className="kt-nav fixed top-0 left-0 right-0 z-50">
          <div className="kt-nav-inner">
            <a href="/" aria-label="weuseai.agent — beranda" className="kt-nav-brand">
              <span className="kt-nav-logo" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 100 100"><path d="M50 8 C54 32 68 46 92 50 C68 54 54 68 50 92 C46 68 32 54 8 50 C32 46 46 32 50 8 Z" fill="#5a0f08" /></svg>
              </span>
              <span className="kt-nav-word">weuseai<span style={{ color: '#ff6a4c' }}>.agent</span></span>
            </a>
            <div className="kt-nav-search" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7c736e" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
              <span>Cari tugas atau agent</span>
            </div>
            <nav className="kt-nav-links">
              {links.map((l) => (
                <a key={l.label} href={l.href} className="kt-nav-link">{l.label}</a>
              ))}
              <a href="#pricing" className="kt-nav-cta cta-tactile">Mulai <ArrowUpRight size={14} stroke={2.2} /></a>
            </nav>
            <div className="kt-nav-mobile">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label={menuOpen ? 'Tutup menu' : 'Buka menu'}
                aria-expanded={menuOpen}
                className="kt-nav-burger"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  {menuOpen
                    ? <><line x1="6" y1="6" x2="18" y2="18" /><line x1="6" y1="18" x2="18" y2="6" /></>
                    : <><line x1="4" y1="8" x2="20" y2="8" /><line x1="4" y1="16" x2="20" y2="16" /></>}
                </svg>
              </button>
              <a href="#pricing" onClick={() => setMenuOpen(false)} className="kt-nav-cta-sm cta-tactile">Mulai <ArrowUpRight size={12} stroke={2.2} /></a>
            </div>
          </div>
          {menuOpen && (
            <Mot.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="kt-nav-panel"
            >
              {links.map((l) => (
                <a key={l.label} href={l.href} onClick={() => setMenuOpen(false)} className="kt-nav-panel-link">{l.label}</a>
              ))}
            </Mot.div>
          )}
        </header>
      );
    }

    // ─────────────────────── HERO ───────────────────────
    // ─────────────────────── CREATURE SPRITES ───────────────────────
    // Each agent card hosts a unique creature animation (10 creatures × 3-5
    // frames each, dot-pattern silhouettes in Signal Red). SVG inline + CSS
    // @keyframes cross-fades between frames. Storyboard locked in
    // docs/plans/2026-05-07-agent-persona-creatures-design.md.
    //
    // Each frame is a grid string, # = dot, space = empty. The grid is
    // 20 cols × 15 rows (4-unit pitch in 80×60 viewBox, dot radius 1.3).
    //
    // To replace a placeholder frame: edit the strings below, the JSX
    // helper auto-converts every # into a <circle> at the grid coords.
    function gridDots(grid) {
      const dots = [];
      for (let r = 0; r < grid.length; r++) {
        const row = grid[r];
        for (let c = 0; c < row.length; c++) {
          if (row[c] === '#') {
            dots.push(<circle key={`${r}-${c}`} cx={c * 4 + 2} cy={r * 4 + 2} r="1.3" fill="#E5322D" />);
          }
        }
      }
      return dots;
    }

    // Each creature key is the agent slug. Value is { frames: string[][] }.
    // Empty/missing creatures fall back to the static halftone placeholder.
    const CREATURES = {
      // The Pro — Smiley face. Friendly, approachable companion.
      // Round face with eyes + smile. Frames: relaxed → medium smile →
      // wide laugh → wink (one eye closed).
      pro: {
        frames: [
          [ // f0 — relaxed neutral smile
            "                    ",
            "                    ",
            "                    ",
            "     ##########     ",
            "   ##          ##   ",
            "   ##          ##   ",
            "   ##  ##  ##  ##   ",
            "   ##          ##   ",
            "   ##          ##   ",
            "   ##   ####   ##   ",
            "   ##          ##   ",
            "     ##########     ",
            "                    ",
            "                    ",
            "                    ",
          ],
          [ // f1 — medium smile
            "                    ",
            "                    ",
            "                    ",
            "     ##########     ",
            "   ##          ##   ",
            "   ##          ##   ",
            "   ##  ##  ##  ##   ",
            "   ##          ##   ",
            "   ##          ##   ",
            "   ##  ######  ##   ",
            "   ##          ##   ",
            "     ##########     ",
            "                    ",
            "                    ",
            "                    ",
          ],
          [ // f2 — wide laugh (smile curves down at corners)
            "                    ",
            "                    ",
            "                    ",
            "     ##########     ",
            "   ##          ##   ",
            "   ##          ##   ",
            "   ##  ##  ##  ##   ",
            "   ##          ##   ",
            "   ##  ######  ##   ",
            "   ## ##    ## ##   ",
            "   ##          ##   ",
            "     ##########     ",
            "                    ",
            "                    ",
            "                    ",
          ],
          [ // f3 — wink (left eye closes)
            "                    ",
            "                    ",
            "                    ",
            "     ##########     ",
            "   ##          ##   ",
            "   ##          ##   ",
            "   ##   #  ##  ##   ",
            "   ##          ##   ",
            "   ##          ##   ",
            "   ##  ######  ##   ",
            "   ##          ##   ",
            "     ##########     ",
            "                    ",
            "                    ",
            "                    ",
          ],
        ],
      },

      // Deep Researcher — Magnifying glass. Circle outline + diagonal
      // handle. Searching, investigation, discovery. Frames: glass alone
      // → glass + handle stub → full handle → glass with sparkle inside.
      researcher: {
        frames: [
          [ // f0 — circle only
            "                    ",
            "                    ",
            "      ######        ",
            "    ##      ##      ",
            "   ##        ##     ",
            "   ##        ##     ",
            "    ##      ##      ",
            "      ######        ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
          ],
          [ // f1 — circle + handle stub
            "                    ",
            "                    ",
            "      ######        ",
            "    ##      ##      ",
            "   ##        ##     ",
            "   ##        ##     ",
            "    ##      ##      ",
            "      ######        ",
            "            ##      ",
            "             ##     ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
          ],
          [ // f2 — circle + full handle
            "                    ",
            "                    ",
            "      ######        ",
            "    ##      ##      ",
            "   ##        ##     ",
            "   ##        ##     ",
            "    ##      ##      ",
            "      ######        ",
            "            ##      ",
            "             ##     ",
            "              ##    ",
            "               ##   ",
            "                    ",
            "                    ",
            "                    ",
          ],
          [ // f3 — circle + handle + sparkle reflection
            "                    ",
            "                    ",
            "      ######        ",
            "    ##      ##      ",
            "   ##  #     ##     ",
            "   ##    #   ##     ",
            "    ##      ##      ",
            "      ######        ",
            "            ##      ",
            "             ##     ",
            "              ##    ",
            "               ##   ",
            "                    ",
            "                    ",
            "                    ",
          ],
        ],
      },

      // Web Creator (renamed 2026-05-09 from Web Master, scope shifted from
      // browser automation to site builder + deploy + domain advisor) —
      // Browser window with search bar sprite. Visual still works as a
      // deploy-preview metaphor. Slug "web" kept for backwards compat.
      web: {
        frames: [
          [ // f0 — empty browser frame
            "                    ",
            "                    ",
            "                    ",
            "  ################  ",
            "  ##            ##  ",
            "  ##            ##  ",
            "  ##            ##  ",
            "  ##            ##  ",
            "  ##            ##  ",
            "  ##            ##  ",
            "  ##            ##  ",
            "  ################  ",
            "                    ",
            "                    ",
            "                    ",
          ],
          [ // f1 — frame + empty URL bar
            "                    ",
            "                    ",
            "                    ",
            "  ################  ",
            "  ##            ##  ",
            "  ##  ########  ##  ",
            "  ##            ##  ",
            "  ##            ##  ",
            "  ##            ##  ",
            "  ##            ##  ",
            "  ##            ##  ",
            "  ################  ",
            "                    ",
            "                    ",
            "                    ",
          ],
          [ // f2 — URL bar with typing cursor
            "                    ",
            "                    ",
            "                    ",
            "  ################  ",
            "  ##            ##  ",
            "  ##  ########  ##  ",
            "  ##  ##        ##  ",
            "  ##            ##  ",
            "  ##            ##  ",
            "  ##            ##  ",
            "  ##            ##  ",
            "  ################  ",
            "                    ",
            "                    ",
            "                    ",
          ],
          [ // f3 — URL filled + content rectangle below
            "                    ",
            "                    ",
            "                    ",
            "  ################  ",
            "  ##            ##  ",
            "  ##  ########  ##  ",
            "  ##  ########  ##  ",
            "  ##            ##  ",
            "  ##  ###  ##   ##  ",
            "  ##  ##  ##    ##  ",
            "  ##            ##  ",
            "  ################  ",
            "                    ",
            "                    ",
            "                    ",
          ],
        ],
      },

      // Doc Expert — A4 paper with writing. Vertical rectangle outline,
      // text lines appearing top to bottom (drafting in progress).
      // Frames: empty page → 25% → 50% → 75-100% filled.
      doc: {
        frames: [
          [ // f0 — empty page
            "                    ",
            "     ##########     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ##########     ",
            "                    ",
          ],
          [ // f1 — 1 line (25%)
            "                    ",
            "     ##########     ",
            "     ##      ##     ",
            "     ## #### ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ##########     ",
            "                    ",
          ],
          [ // f2 — 2 lines (50%)
            "                    ",
            "     ##########     ",
            "     ##      ##     ",
            "     ## #### ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ## ## # ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ##########     ",
            "                    ",
          ],
          [ // f3 — 4 lines (75-100%)
            "                    ",
            "     ##########     ",
            "     ##      ##     ",
            "     ## #### ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ## ## # ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ## ###  ##     ",
            "     ##      ##     ",
            "     ##      ##     ",
            "     ## ##   ##     ",
            "     ##########     ",
            "                    ",
          ],
        ],
      },

      // Slide Master — slide deck stack revealing one by one.
      slide: {
        frames: [
          [ // f0 — single rectangle (one slide)
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "      ##########    ",
            "      ##        #   ",
            "      ##        #   ",
            "      ##        #   ",
            "      ##        #   ",
            "      ##        #   ",
            "      ##########    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
          ],
          [ // f1 — 2 stacked rectangles (slight offset)
            "                    ",
            "                    ",
            "                    ",
            "       ##########   ",
            "       ##        #  ",
            "      ##########  # ",
            "      ##        ##  ",
            "      ##        #   ",
            "      ##        #   ",
            "      ##        #   ",
            "      ##########    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
          ],
          [ // f2 — 3 stacked rectangles fanned
            "                    ",
            "                    ",
            "        ##########  ",
            "        ##        # ",
            "       ##########  #",
            "       ##        ## ",
            "      ##########  # ",
            "      ##        ##  ",
            "      ##        #   ",
            "      ##        #   ",
            "      ##########    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
          ],
          [ // f3 — 3 fanned + bullets inside front slide
            "                    ",
            "                    ",
            "        ##########  ",
            "        ##        # ",
            "       ##########  #",
            "       ##        ## ",
            "      ##########  # ",
            "      ## ##  ## ##  ",
            "      ## ##  ##  #  ",
            "      ## ##     #   ",
            "      ##########    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
          ],
        ],
      },

      // Trade Pro — Bar chart with up-arrow.
      trade: {
        frames: [
          [ // f0 — 1 small bar
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "      ##            ",
            "      ##            ",
            "      ##            ",
          ],
          [ // f1 — 2 bars ascending
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "          ##        ",
            "          ##        ",
            "      ##  ##        ",
            "      ##  ##        ",
            "      ##  ##        ",
          ],
          [ // f2 — 3 bars ascending
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "              ##    ",
            "              ##    ",
            "          ##  ##    ",
            "          ##  ##    ",
            "      ##  ##  ##    ",
            "      ##  ##  ##    ",
            "      ##  ##  ##    ",
          ],
          [ // f3 — 4 bars + arrow tip extending past top
            "                    ",
            "                    ",
            "                  # ",
            "                 ###",
            "                # # ",
            "                  # ",
            "                  # ",
            "              ##  # ",
            "              ##  # ",
            "              ##  # ",
            "          ##  ##  # ",
            "          ##  ##  # ",
            "      ##  ##  ##  # ",
            "      ##  ##  ##  # ",
            "      ##  ##  ##  # ",
          ],
        ],
      },

      // Project Conductor (renamed 2026-05-09 from Macro Strategist) —
      // 3 concentric rings sprite. Builds outward: center dot → small ring →
      // medium ring → all 3 rings. Minimalist outline, ~25-50 dots/frame.
      // Visual still works as kanban orchestration ring; legacy slug "macro"
      // intentionally left as sprite dict key for backwards compat.
      project: {
        frames: [
          [ // f0 — center dot only
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "         ##         ",
            "         ##         ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
          ],
          [ // f1 — center + small ring
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "         ##         ",
            "       ##  ##       ",
            "      ##    ##      ",
            "      ## ## ##      ",
            "      ## ## ##      ",
            "      ##    ##      ",
            "       ##  ##       ",
            "         ##         ",
            "                    ",
            "                    ",
            "                    ",
          ],
          [ // f2 — center + small + medium ring
            "                    ",
            "                    ",
            "       ######       ",
            "     ##      ##     ",
            "    ##  ####  ##    ",
            "   ##  ##  ##  ##   ",
            "   ##  ## ## ##  #  ",
            "   ##  ## ## ##  #  ",
            "   ##  ##  ##  ##   ",
            "    ##  ##  ##      ",
            "     ##      ##     ",
            "       ######       ",
            "                    ",
            "                    ",
            "                    ",
          ],
          [ // f3 — center + small + medium + large ring (all 3)
            "      ########      ",
            "    ##        ##    ",
            "   ##  ######  ##   ",
            "  ##  ##    ##  ##  ",
            "  ##  ## ## ##  ##  ",
            "  ##  ## ## ##  ##  ",
            "  ##  ##    ##  ##  ",
            "   ##  ######  ##   ",
            "    ##        ##    ",
            "      ########      ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
          ],
        ],
      },

      // Business Director — Dollar sign $ (founder pivot from lion mane).
      // Drawn progressively: vertical bar → S top → S middle → full $.
      // Serif-style construction, ~30-45 dots/frame.
      business: {
        frames: [
          [ // f0 — vertical bar (the $ stem)
            "                    ",
            "                    ",
            "          ##        ",
            "          ##        ",
            "          ##        ",
            "          ##        ",
            "          ##        ",
            "          ##        ",
            "          ##        ",
            "          ##        ",
            "          ##        ",
            "          ##        ",
            "          ##        ",
            "                    ",
            "                    ",
          ],
          [ // f1 — bar + S top
            "                    ",
            "                    ",
            "          ##        ",
            "        ######      ",
            "       ##    ##     ",
            "       ##           ",
            "       ##           ",
            "        ###         ",
            "          ##        ",
            "          ##        ",
            "          ##        ",
            "          ##        ",
            "          ##        ",
            "                    ",
            "                    ",
          ],
          [ // f2 — bar + S top + S middle
            "                    ",
            "                    ",
            "          ##        ",
            "        ######      ",
            "       ##    ##     ",
            "       ##           ",
            "       ##           ",
            "        ###         ",
            "           ###      ",
            "             ##     ",
            "             ##     ",
            "          ##        ",
            "          ##        ",
            "                    ",
            "                    ",
          ],
          [ // f3 — full $ (bar + S complete)
            "                    ",
            "                    ",
            "          ##        ",
            "        ######      ",
            "       ##    ##     ",
            "       ##           ",
            "        ###         ",
            "          ##        ",
            "           ###      ",
            "             ##     ",
            "       ##    ##     ",
            "        ######      ",
            "          ##        ",
            "                    ",
            "                    ",
          ],
        ],
      },

      // Video Producer — Play button. Right-pointing triangle with
      // optional outer ring. Convey: video, content production, "press
      // play". Frames: small triangle → larger → triangle + ring → ring
      // pulse outward.
      video: {
        frames: [
          [ // f0 — small triangle
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "         ##         ",
            "         ####       ",
            "         ##         ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
          ],
          [ // f1 — larger triangle
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "        ##          ",
            "        ####        ",
            "        ######      ",
            "        ####        ",
            "        ##          ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
          ],
          [ // f2 — triangle + ring
            "                    ",
            "      ########      ",
            "    ##        ##    ",
            "   ##          ##   ",
            "   ##          ##   ",
            "   ##  ##       ##  ",
            "   ##  ####     ##  ",
            "   ##  ######   ##  ",
            "   ##  ####     ##  ",
            "   ##  ##       ##  ",
            "   ##          ##   ",
            "   ##          ##   ",
            "    ##        ##    ",
            "      ########      ",
            "                    ",
          ],
          [ // f3 — triangle + ring + pulse outward (top + bottom dots)
            "         #          ",
            "      ########      ",
            "    ##        ##    ",
            "   ##          ##   ",
            "   ##          ##   ",
            "   ##  ##       ##  ",
            "   ##  ####     ##  ",
            "   ##  ######   ##  ",
            "   ##  ####     ##  ",
            "   ##  ##       ##  ",
            "   ##          ##   ",
            "   ##          ##   ",
            "    ##        ##    ",
            "      ########      ",
            "         #          ",
          ],
        ],
      },

      // Social Conductor — Expanding concentric squares (broadcast
      // amplification, network growth). Distinct from Project Conductor's
      // concentric CIRCLES — Social is concentric SQUARES. Frames:
      // 1 sq → 2 sq → 3 sq → 2 sq (outer recedes, then cycle restarts).
      social: {
        frames: [
          [ // f0 — 1 small square
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "        ####        ",
            "        #  #        ",
            "        #  #        ",
            "        ####        ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
          ],
          [ // f1 — 2 squares (small + medium)
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "      ########      ",
            "      # #### #      ",
            "      # #  # #      ",
            "      # #  # #      ",
            "      # #### #      ",
            "      ########      ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
          ],
          [ // f2 — 3 squares (small + medium + large)
            "                    ",
            "                    ",
            "                    ",
            "    ############    ",
            "    #          #    ",
            "    # ######## #    ",
            "    # # #### # #    ",
            "    # # #  # # #    ",
            "    # # #  # # #    ",
            "    # # #### # #    ",
            "    # ######## #    ",
            "    #          #    ",
            "    ############    ",
            "                    ",
            "                    ",
          ],
          [ // f3 — 2 squares again (outer receded, before cycle restart)
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
            "      ########      ",
            "      # #### #      ",
            "      # #  # #      ",
            "      # #  # #      ",
            "      # #### #      ",
            "      ########      ",
            "                    ",
            "                    ",
            "                    ",
            "                    ",
          ],
        ],
      },
    };

    function CreatureSprite({ slug, index }) {
      const creature = CREATURES[slug];
      if (!creature) return null;
      // Stagger each card's animation by 140ms so the 10 cards aren't
      // synchronized on the same frame at the same moment.
      const delay = `${(index || 0) * 140}ms`;
      return (
        <svg className="creature" viewBox="0 0 80 60" preserveAspectRatio="xMidYMid meet" style={{ '--creature-delay': delay }}>
          {creature.frames.map((g, i) => (
            <g key={i} className={`frame f${i}`}>
              {gridDots(g)}
            </g>
          ))}
        </svg>
      );
    }

    // ─────────────────────── AGENT SCENES (chat + action) ───────────────────────
    // New direction (2026-05-07 pivot): each card shows a literal user→agent
    // exchange + an action visualization, mirroring the DashboardDemo. The
    // CSS in .agent-scene + sceneUserIn/sceneAgentIn/sceneMemoN keyframes
    // handles the timing — components below just supply markup.
    //
    // Storyboard scope: only 'pro' has a scene right now. Other slugs fall
    // through to CreatureSprite. After founder approval the rest will follow.
    // Reusable shell — chat header (no dot) + WhatsApp-style auto-scroll
    // chat viewport. Each bubble lives in its own .chat-slot which animates
    // grid-template-rows from 0fr → 1fr at its scheduled time. As newer
    // slots grow, the .chat-content (anchored to bottom:0 of the viewport)
    // pushes earlier slots up. Older content stays rendered, just scrolled
    // off the top — exactly like WhatsApp.
    //
    // Structure per card:
    //   Header (sticky)       → agent name + "aktif sekarang"
    //   chat-viewport         → overflow:hidden mask
    //     chat-content        → bottom-anchored stack of slots
    //       slot-user         → user bubble (right-aligned)
    //       slot-ack          → agent's "Aku [verb] dulu" (with avatar)
    //       slot-progress     → concrete number (continuation, no avatar)
    //       slot-insight      → pattern / recommendation (oxblood pulse)
    //       slot-output       → connector
    //       slot-anim1        → raw data view (memos / tabs / chart / etc.)
    //       slot-anim2        → the deliverable (oxblood-accent border)
    function SceneShell({ name, user, agentAck, agentProgress, agentInsight, agentOutput, anim1, anim2, slug }) {
      return (
        <>
          <div className="scene-header">
            <div className="scene-header-text">
              <div className="scene-header-name">{name}</div>
              <div className="scene-header-status">aktif sekarang</div>
            </div>
          </div>
          {/* Use data-scene (not className) to avoid collisions with the
              inner .scene-doc (Doc paper outline) and .scene-slide (Slide
              Master slide cards) — those classes were getting applied to
              the entire scene container, painting a gray bg + border. */}
          <div className="agent-scene" data-scene={slug}>
            {/* Bubble zone — auto-scrolling chat viewport. As newer bubbles
                grow, older ones get pushed up + clipped by overflow:hidden.
                Latest bubble always anchored to bottom of zone. */}
            <div className="bubble-zone">
              <div className="chat-content">
                <div className="chat-slot slot-user">
                  <div className="chat-slot-inner">
                    <div className="scene-user">{user}</div>
                  </div>
                </div>
                <div className="chat-slot slot-ack">
                  <div className="chat-slot-inner">
                    <div className="scene-agent-row">
                      <div className="scene-avatar" />
                      <div className="scene-bubble scene-bubble-ack">{agentAck}</div>
                    </div>
                  </div>
                </div>
                <div className="chat-slot slot-progress">
                  <div className="chat-slot-inner">
                    <div className="scene-agent-row continuation">
                      <div className="scene-bubble scene-bubble-progress">{agentProgress}</div>
                    </div>
                  </div>
                </div>
                <div className="chat-slot slot-insight">
                  <div className="chat-slot-inner">
                    <div className="scene-agent-row continuation">
                      <div className="scene-bubble scene-bubble-insight">{agentInsight}</div>
                    </div>
                  </div>
                </div>
                <div className="chat-slot slot-output">
                  <div className="chat-slot-inner">
                    <div className="scene-agent-row continuation">
                      <div className="scene-bubble scene-bubble-output">{agentOutput}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Pin zone — anim1 + anim2 stack here, both stay visible at the
                end of the cycle (no auto-scroll). anim1 grows in first,
                anim2 grows below it. */}
            <div className="pin-zone">
              <div className="pin-slot pin-anim1">
                <div className="pin-slot-inner">{anim1}</div>
              </div>
              <div className="pin-slot pin-anim2">
                <div className="pin-slot-inner">{anim2}</div>
              </div>
            </div>
          </div>
        </>
      );
    }

    // Animation 1 (raw data view) and Animation 2 (deliverable view) per
    // agent. Anim1 fades out and Anim2 fades in around 9s into the loop —
    // both share the same vertical space inside the output bubble.

    function AgentScenePro() {
      return (
        <SceneShell
          slug="pro"
          name="The Pro"
          user="Inget gimana gaya kerja saya?"
          agentAck="Aku cek memori."
          agentProgress="12 percakapan dari 3 minggu terakhir."
          agentInsight="Pola: fokus klien Jakarta, deadline Kamis."
          agentOutput="Ini yang aku catat:"
          anim1={
            <div className="scene-memos scene-stagger">
              <div className="scene-memo">klien jakarta</div>
              <div className="scene-memo">deadline kamis</div>
              <div className="scene-memo">preferensi makan</div>
              <div className="scene-memo">kontrak Q3</div>
            </div>
          }
          anim2={
            <div className="scene-anim2">
              <div className="anim2-row"><span className="anim2-time">08:00</span><span className="anim2-label">email check</span><span className="anim2-meta">15min</span></div>
              <div className="anim2-row"><span className="anim2-time">10:00</span><span className="anim2-label">meeting klien jakarta</span><span className="anim2-meta">1h</span></div>
              <div className="anim2-row"><span className="anim2-time">14:00</span><span className="anim2-label">deadline review kamis</span><span className="anim2-meta">2h</span></div>
            </div>
          }
        />
      );
    }

    function AgentSceneResearcher() {
      return (
        <SceneShell
          slug="researcher"
          name="Deep Researcher"
          user="Riset volatilitas IDR 30 hari"
          agentAck="Aku scan 100+ sumber."
          agentProgress="12 paper akademik + BI report."
          agentInsight="Korelasi tinggi dengan kebijakan Fed."
          agentOutput="Sintesis siap:"
          anim1={
            <div className="scene-papers scene-stagger">
              <div className="scene-paper">
                <span className="paper-icon" />
                <span className="paper-title">bi.go.id · monthly report</span>
                <span className="paper-conf high">tinggi</span>
              </div>
              <div className="scene-paper">
                <span className="paper-icon" />
                <span className="paper-title">imf.org · em outlook</span>
                <span className="paper-conf high">tinggi</span>
              </div>
              <div className="scene-paper">
                <span className="paper-icon" />
                <span className="paper-title">reuters · idr trend</span>
                <span className="paper-conf med">sedang</span>
              </div>
              <div className="scene-paper">
                <span className="paper-icon" />
                <span className="paper-title">forum trader · sentimen</span>
                <span className="paper-conf low">rendah</span>
              </div>
            </div>
          }
          anim2={
            <div className="scene-anim2">
              <div className="anim2-bullet">IDR volatility +12% Q1 vs Q4 2025</div>
              <div className="anim2-bullet">Driven by Fed rate uncertainty</div>
              <div className="anim2-bullet">Forecast stabilize Q3 2026</div>
            </div>
          }
        />
      );
    }

    function AgentSceneWeb() {
      return (
        <SceneShell
          slug="web"
          name="Web Creator"
          user="Bangun landing page UMKM kuliner"
          agentAck="Template multi-page Bahasa, siap."
          agentProgress="Hero + menu + kontak + WhatsApp link."
          agentInsight="Domain ID-friendly: niagahoster.co.id."
          agentOutput="Live di Vercel, siap connect domain:"
          anim1={
            <div className="scene-tabs scene-stagger">
              <div className="scene-tab">
                <span className="tab-dots"><span /><span /><span /></span>
                <span className="tab-url">index.html</span>
                <span className="tab-check">✓</span>
              </div>
              <div className="scene-tab">
                <span className="tab-dots"><span /><span /><span /></span>
                <span className="tab-url">menu.html</span>
                <span className="tab-check">✓</span>
              </div>
              <div className="scene-tab">
                <span className="tab-dots"><span /><span /><span /></span>
                <span className="tab-url">contact.html</span>
                <span className="tab-check">✓</span>
              </div>
            </div>
          }
          anim2={
            <div className="scene-anim2">
              <div className="anim2-row"><span className="anim2-label">vercel deploy</span><span className="anim2-num">live</span></div>
              <div className="anim2-row"><span className="anim2-label">warung-bunda.id</span><span className="anim2-num">DNS ✓</span></div>
              <div className="anim2-row"><span className="anim2-label">SSL cert</span><span className="anim2-num">aktif</span></div>
            </div>
          }
        />
      );
    }

    function AgentSceneDoc() {
      return (
        <SceneShell
          slug="doc"
          name="Doc Expert"
          user="Bikin invoice 3jt klien PT Maju"
          agentAck="Templat ditemukan."
          agentProgress="PT = badan usaha."
          agentInsight="Tambah PPN 11%, total Rp 3,33jt."
          agentOutput="Siap kirim ke klien:"
          anim1={
            <div className="scene-doc scene-stagger">
              <div className="scene-doc-line long" />
              <div className="scene-doc-line med" />
              <div className="scene-doc-line long" />
              <div className="scene-doc-line short" />
              <div className="scene-doc-line med" />
              <div className="scene-doc-line short" />
            </div>
          }
          anim2={
            <div className="scene-anim2">
              <div className="anim2-email-meta"><span className="label">to:</span><span className="val">klien@ptmaju.co.id</span></div>
              <div className="anim2-email-meta"><span className="label">subject:</span><span className="val">Invoice Mei 2026</span></div>
              <div className="anim2-attach">PDF · invoice-mei.pdf</div>
              <div className="anim2-cta">Kirim sekarang</div>
            </div>
          }
        />
      );
    }

    function AgentSceneSlide() {
      return (
        <SceneShell
          slug="slide"
          name="Slide Master"
          user="Pitch deck buat angel investor"
          agentAck="Aku cek industri kamu."
          agentProgress="SaaS B2B → format YC 12-slide."
          agentInsight="Alur: masalah → solusi → traction → ask."
          agentOutput="12 slide siap review:"
          anim1={
            <div className="scene-slides scene-stagger">
              <div className="scene-slide"><span className="slide-h" /><span className="slide-l" /><span className="slide-l" /></div>
              <div className="scene-slide"><span className="slide-h" /><span className="slide-l" /><span className="slide-l" /></div>
              <div className="scene-slide"><span className="slide-h" /><span className="slide-l" /><span className="slide-l" /></div>
              <div className="scene-slide"><span className="slide-h" /><span className="slide-l" /><span className="slide-l" /></div>
              <div className="scene-slide"><span className="slide-h" /><span className="slide-l" /><span className="slide-l" /></div>
            </div>
          }
          anim2={
            <div className="scene-anim2">
              <div className="anim2-headline">Solution: AI-First Workflow</div>
              <div className="anim2-bullet">Otomasi 80% admin tugas harian</div>
              <div className="anim2-bullet">Setup dalam 5 menit, bukan 5 hari</div>
              <div className="anim2-bullet">Pricing transparan, no hidden fee</div>
            </div>
          }
        />
      );
    }

    function AgentSceneTrade() {
      // Simple SVG line chart — a polyline with stroke-dasharray draw, plus
      // a marker dot at the rightmost point. Coords on a 100×40 viewBox so
      // the line sweeps through ~3 swings.
      return (
        <SceneShell
          slug="trade"
          name="Trade Pro"
          user="Analisis BBCA earnings"
          agentAck="Tarik data 90 hari + 4 earnings lalu."
          agentProgress="EPS naik 8% YoY, NIM stabil 5,6%."
          agentInsight="Konsensus analis: target Rp 11.500."
          agentOutput="Sizing aman 2% portfolio:"
          anim1={
            <div className="scene-chart">
              <svg viewBox="0 0 100 40" preserveAspectRatio="none">
                <polyline className="chart-line" points="0,30 12,26 22,32 35,18 48,22 60,12 75,16 88,6 100,10" />
                <circle className="chart-marker" cx="100" cy="10" r="2.4" />
                <circle className="chart-marker" cx="60" cy="12" r="1.8" style={{ animationDelay: '-50ms' }} />
              </svg>
            </div>
          }
          anim2={
            <div className="scene-anim2">
              <div className="anim2-row"><span className="anim2-label">entry</span><span className="anim2-num">Rp 9.250</span></div>
              <div className="anim2-row"><span className="anim2-label">stop loss</span><span className="anim2-num">Rp 9.100 <span style={{ color: 'rgba(255,255,255,0.45)' }}>(−1,6%)</span></span></div>
              <div className="anim2-row"><span className="anim2-label">target</span><span className="anim2-num">Rp 9.800 <span style={{ color: 'rgba(255,255,255,0.45)' }}>(+5,9%)</span></span></div>
              <div className="anim2-row"><span className="anim2-label">sizing</span><span className="anim2-meta">2% portfolio</span></div>
              <div className="anim2-disclaimer">Bukan rekomendasi investasi. Sizing example only.</div>
            </div>
          }
        />
      );
    }

    function AgentSceneProject() {
      return (
        <SceneShell
          slug="project"
          name="Project Conductor"
          user="Launch produk minggu ini, pecah task-nya"
          agentAck="Aku breakdown jadi 8 task."
          agentProgress="Doc Expert handle T&C; Web Creator handle landing."
          agentInsight="Critical path: deploy + payment integration."
          agentOutput="Kanban siap, progress monitor aktif:"
          anim1={
            <div className="scene-multi">
              <div className="scene-multi-row bull">
                <span className="scene-multi-label">done</span>
                <span className="scene-multi-bar" />
              </div>
              <div className="scene-multi-row base">
                <span className="scene-multi-label">in-prog</span>
                <span className="scene-multi-bar" />
              </div>
              <div className="scene-multi-row bear">
                <span className="scene-multi-label">todo</span>
                <span className="scene-multi-bar" />
              </div>
            </div>
          }
          anim2={
            <div className="scene-anim2">
              <div className="anim2-row"><span className="anim2-arrow up">↑</span><span className="anim2-label">Web Creator</span><span className="anim2-num">deploy ✓</span></div>
              <div className="anim2-row"><span className="anim2-arrow flat">→</span><span className="anim2-label">Doc Expert</span><span className="anim2-num">draft 60%</span></div>
              <div className="anim2-row"><span className="anim2-arrow down">↓</span><span className="anim2-label">Trade Pro</span><span className="anim2-meta">queued</span></div>
            </div>
          }
        />
      );
    }

    function AgentSceneBusiness() {
      return (
        <SceneShell
          slug="business"
          name="Business Director"
          user="Cek KPI minggu ini"
          agentAck="Tarik dashboard."
          agentProgress="Revenue +12% WoW, margin stabil."
          agentInsight="Anomaly: CAC naik 18% — investigate."
          agentOutput="3 angka penting:"
          anim1={
            <div className="scene-kpis scene-stagger">
              <div className="scene-kpi">
                <div className="kpi-num">Rp 142<span className="kpi-pct">jt</span></div>
                <div className="kpi-lbl">revenue</div>
              </div>
              <div className="scene-kpi">
                <div className="kpi-num">38<span className="kpi-pct">%</span></div>
                <div className="kpi-lbl">margin</div>
              </div>
              <div className="scene-kpi">
                <div className="kpi-num">+12<span className="kpi-pct">%</span></div>
                <div className="kpi-lbl">growth</div>
              </div>
            </div>
          }
          anim2={
            <div className="scene-anim2">
              <div className="anim2-headline">CAC breakdown</div>
              <div className="anim2-row"><span className="anim2-label">FB Ads</span><span className="anim2-num">↑ 23%</span></div>
              <div className="anim2-row"><span className="anim2-label">Google</span><span className="anim2-num">↑ 15%</span></div>
              <div className="anim2-row"><span className="anim2-label">Organic</span><span className="anim2-meta">flat</span></div>
            </div>
          }
        />
      );
    }

    function AgentSceneVideo() {
      return (
        <SceneShell
          slug="video"
          name="Video Producer"
          user="Script TikTok 60s gym tips"
          agentAck="Cek trending TikTok."
          agentProgress="Home workout naik 340% bulan ini."
          agentInsight="Hook angle: '5 menit hasil maksimal'."
          agentOutput="6 frame visual siap shoot:"
          anim1={
            <div className="scene-frames scene-stagger">
              <div className="scene-frame" />
              <div className="scene-frame" />
              <div className="scene-frame" />
              <div className="scene-frame" />
              <div className="scene-frame" />
              <div className="scene-frame" />
            </div>
          }
          anim2={
            <div className="scene-anim2">
              <div className="anim2-row"><span className="anim2-time">0–3s</span><span className="anim2-label">"Coba 5 menit ini"</span><span className="anim2-meta">hook</span></div>
              <div className="anim2-row"><span className="anim2-time">3–48s</span><span className="anim2-label">5 exercises</span><span className="anim2-meta">body</span></div>
              <div className="anim2-row"><span className="anim2-time">48–60s</span><span className="anim2-label">"Ikut challenge"</span><span className="anim2-meta">cta</span></div>
            </div>
          }
        />
      );
    }

    function AgentSceneSocial() {
      return (
        <SceneShell
          slug="social"
          name="Social Conductor"
          user="Posting ini ke 5 platform"
          agentAck="Cek brand voice + platform spec."
          agentProgress="Best time: IG 19.30, TikTok 21.00 WIB."
          agentInsight="Caption per platform, hashtag custom."
          agentOutput="Jadwal optimal:"
          anim1={
            <div className="scene-platforms scene-stagger">
              <div className="scene-platform">IG</div>
              <div className="scene-platform">TikTok</div>
              <div className="scene-platform">X</div>
              <div className="scene-platform">FB</div>
              <div className="scene-platform">LinkedIn</div>
            </div>
          }
          anim2={
            <div className="scene-anim2">
              <div className="anim2-row"><span className="anim2-time">Sen</span><span className="anim2-label">IG carousel</span><span className="anim2-meta">19:30</span></div>
              <div className="anim2-row"><span className="anim2-time">Sel</span><span className="anim2-label">TikTok video</span><span className="anim2-meta">21:00</span></div>
              <div className="anim2-row"><span className="anim2-time">Rab</span><span className="anim2-label">X thread</span><span className="anim2-meta">12:00</span></div>
            </div>
          }
        />
      );
    }

    // ─────────────────────── AGENT VISUAL — RAW VIDEO PLAYBACK ───────────────────────
    // 2026-05-09 pivot: founder hand-built 9 oxblood-on-black wireframe GIFs
    // for the agents (one per persona). We just play the converted MP4s
    // directly — no canvas pipeline, no WebGL filter, no per-frame
    // processing. The visual treatment lives in the GIFs themselves.
    //
    // Source files: assets/<file>.mp4 (mp4-converted from founder's GIFs via
    //   ffmpeg -i in.gif -movflags +faststart -pix_fmt yuv420p \
    //     -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -crf 28 \
    //     -preset slow -an out.mp4)
    // Per-file ~0.9-2.0 MB, total ~17 MB across 9 cards.
    //
    // Lazy-load via IntersectionObserver: video.preload starts as 'metadata'
    // (just enough to know dimensions); when the card enters the viewport
    // we set preload='auto' and call play(); when it leaves, we pause.
    // Saves bandwidth on first paint (~1MB instead of 17MB) and CPU when
    // off-screen.
    //
    // prefers-reduced-motion: video stays paused at first frame, no play().
    // Brand glyph for poster cards (personas without a demo video yet).
    // Signal-red stroke on dark — minimal, editorial.
    function AgentGlyph({ kind }) {
      const common = { viewBox: '0 0 48 48', fill: 'none', stroke: '#E5322D', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' };
      switch (kind) {
        case 'slide':
          return (
            <svg {...common}><rect x="7" y="10" width="34" height="24" rx="2" /><line x1="13" y1="18" x2="28" y2="18" /><line x1="13" y1="24" x2="24" y2="24" /><line x1="24" y1="34" x2="24" y2="40" /><line x1="18" y1="40" x2="30" y2="40" /></svg>
          );
        case 'social':
          return (
            <svg {...common}><circle cx="16" cy="16" r="5" /><circle cx="33" cy="13" r="4" /><circle cx="30" cy="33" r="5" /><line x1="20" y1="18" x2="29" y2="14" /><line x1="19" y1="20" x2="27" y2="30" /></svg>
          );
        case 'video':
          return (
            <svg {...common}><rect x="8" y="13" width="22" height="22" rx="3" /><path d="M30 20l9-5v18l-9-5z" /><path d="M16 21l6 3-6 3z" fill="#E5322D" stroke="none" /></svg>
          );
        default:
          return (
            <svg {...common}><circle cx="24" cy="24" r="14" /><circle cx="24" cy="24" r="4" /></svg>
          );
      }
    }

    function AgentVisual({ file, glyph }) {
      const videoRef = useRef(null);
      useEffect(() => {
        const v = videoRef.current;
        if (!v || !file) return;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const io = new IntersectionObserver(
          (entries) => {
            entries.forEach((e) => {
              if (e.isIntersecting) {
                if (reduced) {
                  // Show first frame only.
                  v.preload = 'auto';
                  try { v.currentTime = 0; } catch (err) {}
                  v.pause();
                } else {
                  v.preload = 'auto';
                  const p = v.play();
                  if (p && p.catch) p.catch(() => {});
                }
              } else {
                v.pause();
              }
            });
          },
          { rootMargin: '200px' }
        );
        io.observe(v);
        return () => io.disconnect();
      }, [file]);
      // Persona without a demo video yet → honest "Segera hadir" poster.
      if (!file) {
        return (
          <div className="agent-poster" aria-hidden="true">
            <AgentGlyph kind={glyph} />
            <span className="agent-poster-tag">Demo menyusul</span>
          </div>
        );
      }
      return (
        <video
          ref={videoRef}
          src={`/assets/${file}.mp4`}
          loop
          muted
          playsInline
          preload="none"
          aria-hidden="true"
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: 'cover', display: 'block', background: '#000' }}
        />
      );
    }

    // ─────────────────────── AGENT PERSONA CAROUSEL ───────────────────────
    // The 10 canonical library personas (single source of truth:
    // assets/persona-details.js + supabase/functions/_shared/tier-personas.ts).
    // Sits inside #proses below the CTA. Continuous butter-smooth rAF marquee
    // (no dead-air pause — head meets tail seamlessly), hover/focus pause,
    // click-next/prev, dots, swipe, prefers-reduced-motion respect.
    //
    // `file` = demo mp4 on disk (assets/<file>.mp4); null → "Segera hadir"
    // poster + brand glyph (slide-master / social-conductor / video-producer
    // have no video yet). `detail` = PERSONA_DETAILS slug → /persona?slug=,
    // so EVERY card has a working button. (rev 2026-06-16)
    const AGENTS = [
      { slug: 'the-pro',          file: 'the-pro',           detail: 'the-pro',          name: 'The Pro',           glyph: 'pro',
        desc: 'Briefing pagi & ingatan lintas sesi.' },
      { slug: 'deep-researcher',  file: 'deep-researcher',   detail: 'deep-researcher',  name: 'Deep Researcher',   glyph: 'research',
        desc: 'Riset jadi laporan siap pakai.' },
      { slug: 'doc-expert',       file: 'doc-expert',        detail: 'doc-expert',       name: 'Doc Expert',        glyph: 'doc',
        desc: 'Surat, proposal, skripsi.' },
      { slug: 'web-app-builder',  file: 'app-builder',       detail: 'web-app-builder',  name: 'Web Creator',       glyph: 'web',
        desc: 'Ide jadi web app.' },
      { slug: 'project-conductor',file: 'project-conductor', detail: 'project-conductor',name: 'Project Conductor', glyph: 'project',
        desc: 'Proyek jadi task board.' },
      { slug: 'business-agent',   file: 'business-director', detail: 'business-agent',   name: 'Business Director', glyph: 'business',
        desc: 'Roadmap founder Indonesia.' },
      { slug: 'trade-pro',        file: 'trade-pro',         detail: 'trade-pro',        name: 'Trade Pro',         glyph: 'trade',
        desc: 'Briefing pasar & emiten.' },
      { slug: 'slide-master',     file: null,                detail: 'slide-master',     name: 'Slide Master',      glyph: 'slide',
        desc: 'Outline jadi deck.' },
      { slug: 'social-conductor', file: null,                detail: 'social-conductor', name: 'Social Conductor',  glyph: 'social',
        desc: 'Kalender & draf konten.' },
      { slug: 'video-producer',   file: null,                detail: 'video-producer',   name: 'Video Producer',    glyph: 'video',
        desc: 'Skrip TikTok & Reels.' },
      // ── Sedang dibangun — terhubung lewat Gmail/Sekolah (founder: "we'll build it",
      //    2026-06-17). Video preview + "Segera hadir" chip; tombol -> #integrasi.
      //    detail:null (belum ada halaman); status:'segera' marks them coming. ──
      { slug: 'email-manager',    file: 'email-manager',     detail: null,               name: 'Email Manager',     glyph: 'default', status: 'segera',
        desc: 'Rapikan kotak masuk.' },
      { slug: 'calendar-agent',   file: 'calendar-agent',    detail: null,               name: 'Calendar Agent',    glyph: 'default', status: 'segera',
        desc: 'Atur jadwal kamu.' },
    ];

    function AgentCarousel() {
      const trackRef = useRef(null);
      const rootRef = useRef(null);
      // Continuous infinite marquee over a DOUBLED track ([...AGENTS, ...AGENTS]).
      // The track drifts left at SPEED px/s via rAF; when the offset passes one
      // full copy (halfRef) we subtract it — invisible because copy 2 is pixel-
      // identical to copy 1. Result: head meets tail with zero dead-air. Click /
      // dots / keyboard / swipe ride a short transitioned "snap" that never locks
      // input. prefers-reduced-motion → static strip, instant jumps.
      const SPEED = 42;                  // px/s — calm continuous drift
      const SNAP_MS = 520;
      const offsetRef = useRef(0);       // px translated (always normalized to [0, half) by drift)
      const pitchRef = useRef(0);        // cardWidth + gap
      const halfRef = useRef(0);         // AGENTS.length * pitch (one full copy)
      const rafRef = useRef(0);
      const lastTsRef = useRef(0);
      const pausedRef = useRef(false);   // drift paused (hover/focus/drag/snap)
      const pinnedRef = useRef(false);   // hovered or focused
      const snapping = useRef(false);
      const snapTimer = useRef(0);
      const reducedMotion = useRef(false);
      const activeRef = useRef(0);
      const [active, setActive] = useState(0);

      const measure = () => {
        const track = trackRef.current;
        if (!track) return;
        const card = track.querySelector('.agent-card');
        const cardW = card ? card.getBoundingClientRect().width : 0;
        const gap = parseFloat(getComputedStyle(track).columnGap) || 18;
        pitchRef.current = cardW + gap;
        halfRef.current = pitchRef.current * AGENTS.length;
      };
      const apply = () => {
        const t = trackRef.current;
        if (t) t.style.transform = `translate3d(${-offsetRef.current}px,0,0)`;
      };
      const syncActive = () => {
        if (!pitchRef.current) return;
        const idx = ((Math.round(offsetRef.current / pitchRef.current) % AGENTS.length) + AGENTS.length) % AGENTS.length;
        if (idx !== activeRef.current) { activeRef.current = idx; setActive(idx); }
      };
      const tick = (ts) => {
        if (!halfRef.current) measure();
        if (!lastTsRef.current) lastTsRef.current = ts;
        const dt = Math.min((ts - lastTsRef.current) / 1000, 0.05); // clamp tab-switch jumps
        lastTsRef.current = ts;
        if (!pausedRef.current && !snapping.current && halfRef.current) {
          offsetRef.current += SPEED * dt;
          if (offsetRef.current >= halfRef.current) offsetRef.current -= halfRef.current;
          apply();
          syncActive();
        }
        rafRef.current = requestAnimationFrame(tick);
      };

      useEffect(() => {
        reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        measure();
        apply();
        if (reducedMotion.current) return;
        rafRef.current = requestAnimationFrame(tick);
        const onResize = () => {
          const old = halfRef.current;
          measure();
          if (old) offsetRef.current = (offsetRef.current / old) * halfRef.current;
          apply();
        };
        window.addEventListener('resize', onResize);
        return () => {
          cancelAnimationFrame(rafRef.current);
          clearTimeout(snapTimer.current);
          window.removeEventListener('resize', onResize);
        };
      }, []);

      const pin = () => { pinnedRef.current = true; pausedRef.current = true; };
      const unpin = () => { pinnedRef.current = false; if (!snapping.current) { pausedRef.current = false; lastTsRef.current = 0; } };

      // Shared: after a transitioned move, normalize offset into [0, half)
      // WITHOUT a transition (the seamless wrap) and resume drift.
      const scheduleNormalize = () => {
        clearTimeout(snapTimer.current);
        snapTimer.current = setTimeout(() => {
          const track = trackRef.current;
          if (track) track.style.transition = 'none';
          if (halfRef.current) offsetRef.current = ((offsetRef.current % halfRef.current) + halfRef.current) % halfRef.current;
          apply();
          snapping.current = false;
          pausedRef.current = pinnedRef.current;
          lastTsRef.current = 0;
        }, SNAP_MS + 40);
      };

      const moveTo = (rawTarget, instantIdx) => {
        const track = trackRef.current;
        if (!track || !halfRef.current) return;
        offsetRef.current = rawTarget;             // may be <0 or >half; normalized after the slide
        if (typeof instantIdx === 'number') { activeRef.current = instantIdx; setActive(instantIdx); }
        if (reducedMotion.current) {
          track.style.transition = 'none';
          offsetRef.current = ((rawTarget % halfRef.current) + halfRef.current) % halfRef.current;
          apply();
          syncActive();
          return;
        }
        snapping.current = true;
        pausedRef.current = true;
        track.style.transition = `transform ${SNAP_MS}ms cubic-bezier(.22,.61,.36,1)`;
        apply();
        syncActive();
        scheduleNormalize();
      };

      // Next / prev advance exactly one pitch from the CURRENT position — the
      // raw (un-normalized) target lets the slide cross the copy boundary
      // smoothly, then scheduleNormalize() snaps back invisibly.
      const goNext = () => moveTo(offsetRef.current + pitchRef.current);
      const goPrev = () => moveTo(offsetRef.current - pitchRef.current);

      // Dot: jump to card i, picking whichever equivalent copy is nearest the
      // current offset so we never scroll the long way around.
      const goTo = (i) => {
        if (!pitchRef.current) return;
        const cur = offsetRef.current;
        const cands = [i * pitchRef.current, i * pitchRef.current + halfRef.current, i * pitchRef.current - halfRef.current];
        let target = cands[0];
        for (const c of cands) if (Math.abs(c - cur) < Math.abs(target - cur)) target = c;
        moveTo(target, i);
      };

      // Keyboard on the region
      const onKeyDown = (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      };

      // Pointer drag / swipe (mouse + touch)
      const dragRef = useRef(null);
      const onPointerDown = (e) => {
        if (e.target.closest && e.target.closest('a,button')) return;
        dragRef.current = { startX: e.clientX, startOffset: offsetRef.current, moved: false };
        pausedRef.current = true;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
      };
      const onPointerMove = (e) => {
        if (!dragRef.current || !halfRef.current) return;
        const dx = e.clientX - dragRef.current.startX;
        if (Math.abs(dx) > 3) dragRef.current.moved = true;
        let o = dragRef.current.startOffset - dx;
        o = ((o % halfRef.current) + halfRef.current) % halfRef.current;
        offsetRef.current = o;
        const t = trackRef.current;
        if (t) t.style.transition = 'none';
        apply();
        syncActive();
      };
      const onPointerUp = () => {
        if (!dragRef.current) return;
        dragRef.current = null;
        pausedRef.current = pinnedRef.current;
        lastTsRef.current = 0;
      };

      const track2 = [...AGENTS, ...AGENTS];

      return (
        <div
          ref={rootRef}
          className="relative z-10 mt-16 md:mt-24 w-full"
          role="region"
          aria-roledescription="carousel"
          aria-label="Agen spesialis"
          onMouseEnter={pin}
          onMouseLeave={unpin}
          onFocusCapture={pin}
          onBlurCapture={unpin}
          onKeyDown={onKeyDown}
        >
          <div className="agent-fade-wrap">
            <button type="button" className="agent-nav agent-nav-prev" onClick={goPrev} aria-label="Agent sebelumnya">
              <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button type="button" className="agent-nav agent-nav-next" onClick={goNext} aria-label="Agent berikutnya">
              <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
            </button>
            <div
              className="agent-fade"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <div ref={trackRef} className="agent-track">
                {/* Doubled track: [...10 real, ...10 clones]. Clones are aria-
                    hidden + untabbable; they exist only so the seamless modulo
                    reset has identical pixels to land on. */}
                {track2.map((a, i) => {
                  const isClone = i >= AGENTS.length;
                  const isSegera = a.status === 'segera';
                  const detailSlug = (typeof PERSONA_DETAILS !== 'undefined' && PERSONA_DETAILS &&
                    PERSONA_DETAILS.some((p) => p.slug === a.detail)) ? a.detail : null;
                  // Live persona -> its /persona page. "Segera" specialist (email/
                  // calendar, coming via Gmail) -> the integrations centerpiece where
                  // it's clearly marked Segera. Anything else -> pricing.
                  const detailHref = isSegera ? '#integrasi' : (detailSlug ? `/persona?slug=${encodeURIComponent(detailSlug)}` : '#pricing');
                  const detailLabel = isSegera ? 'Lihat integrasi' : (detailSlug ? 'Lihat detail' : 'Lihat paket');
                  return (
                    <article
                      key={`slot-${i}`}
                      className="agent-card"
                      aria-label={`Agent: ${a.name}${isSegera ? ' (segera hadir)' : ''}`}
                      aria-hidden={isClone}
                    >
                      <div className="agent-viz">
                        <AgentVisual file={a.file} glyph={a.glyph} />
                        {isSegera && <span className="agent-viz-chip" aria-hidden="true">Segera hadir</span>}
                      </div>
                      <div className="agent-body">
                        <div className="agent-name">{a.name}</div>
                        <div className="agent-desc">{a.desc}</div>
                        <a
                          className="agent-cta"
                          href={detailHref}
                          tabIndex={isClone ? -1 : 0}
                          aria-hidden={isClone}
                          aria-label={`${detailLabel} ${a.name}`}
                        >
                          <span>{detailLabel}</span>
                          {/* Northeast arrow — matches pricing-section CTA glyph for continuity */}
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M7 17 17 7" />
                            <path d="M7 7h10v10" />
                          </svg>
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="agent-dots" role="group" aria-label="Pilih agent">
            {AGENTS.map((a, i) => (
              <button
                key={a.slug}
                type="button"
                aria-label={`Ke kartu ${i + 1} — ${a.name}`}
                aria-current={i === active ? 'true' : undefined}
                className="agent-dot"
                onClick={() => goTo(i)}
              />
            ))}
          </div>

          <p className="agent-tier-line">
            Voice Starter: 3 persona · Siap Pakai: 8 persona · Library Lengkap: full set — pilih yang cocok di <a href="#pricing">harga →</a>
          </p>
        </div>
      );
    }

    // ─────────────────────── PERSONA DETAIL DATA ───────────────────────
    // Detail-view content for the 10 canonical personas. Each entry has
    // five blocks rendered in the modal: tagline, capabilities, flow,
    // sample deliverable, templates. Slugs match agent-packs/<slug>/ and
    // supabase/functions/_shared/tier-personas.ts. CTA links to
    // /checkout?persona=<slug>.
    // PERSONA_DETAILS lives in /assets/persona-details.js (loaded via
    // <script src> in <head>) so the landing + /persona dedicated page
    // share a single source of truth. window.PERSONA_DETAILS is set by
    // that script BEFORE this React tree mounts.
    const PERSONA_DETAILS = window.PERSONA_DETAILS;

    // ─────────────────────── PERSONA DELIVERABLE MOCKS ───────────────────────
    // Brand-styled mini visuals for the "Contoh deliverable" block. No
    // stock photos — every visual is composed inline with brand tokens.
    function DeliverableMock({ kind }) {
      switch (kind) {
        case 'briefing':
          return (
            <div className="pd-deliv-mini">
              <div className="pd-mini-title">Briefing pagi — Jumat</div>
              <div style={{ fontSize: 10, color: 'rgba(229,50,45,0.85)', letterSpacing: '0.1em', marginBottom: 6 }}>KALENDER · 5 EVENT</div>
              <div className="pd-mini-line long" />
              <div className="pd-mini-line med" />
              <div className="pd-mini-line med" />
              <div style={{ fontSize: 10, color: 'rgba(229,50,45,0.85)', letterSpacing: '0.1em', margin: '8px 0 4px' }}>EMAIL · 3 PENTING</div>
              <div className="pd-mini-line short accent" />
              <div className="pd-mini-line short" />
            </div>
          );
        case 'research':
          return (
            <div className="pd-deliv-mini">
              <div className="pd-mini-title">Market sintesis — fintech UMKM</div>
              <div style={{ fontSize: 10, color: 'rgba(229,50,45,0.85)', letterSpacing: '0.1em', marginBottom: 4 }}>TL;DR</div>
              <div className="pd-mini-line long" />
              <div className="pd-mini-line med" />
              <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
                <div className="pd-mini-citation">[1] BPS, 2025. UMKM landscape Indonesia.</div>
                <div className="pd-mini-citation">[2] OJK, 2024. Fintech regulation update.</div>
                <div className="pd-mini-citation">[3] McKinsey, 2025. SEA digital payments.</div>
              </div>
            </div>
          );
        case 'slides':
          return (
            <div className="pd-deliv-mini">
              <div className="pd-mini-title">Pitch deck — seed round</div>
              <div style={{ marginTop: 8 }}>
                <span className="pd-mini-slide active" />
                <span className="pd-mini-slide" />
                <span className="pd-mini-slide" />
                <span className="pd-mini-slide" />
                <span className="pd-mini-slide" />
                <span className="pd-mini-slide" />
                <span className="pd-mini-slide" />
                <span className="pd-mini-slide" />
                <span className="pd-mini-slide" />
                <span className="pd-mini-slide" />
                <span className="pd-mini-slide" />
                <span className="pd-mini-slide" />
              </div>
              <div style={{ fontSize: 9, color: 'rgba(245,245,245,0.5)', marginTop: 8 }}>Problem · Solution · Market · Traction · Ask</div>
            </div>
          );
        case 'invoice':
          return (
            <div className="pd-deliv-mini">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="pd-mini-title" style={{ marginBottom: 0 }}>INV-2026-042</div>
                <div className="pd-mini-tag">PPN 11%</div>
              </div>
              <div style={{ fontSize: 9, color: 'rgba(245,245,245,0.5)', marginTop: 2 }}>PT Klien Korporat · Jakarta</div>
              <div style={{ marginTop: 10, fontSize: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Service retainer</span><span>Rp 12.500.000</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>PPN 11%</span><span>Rp 1.375.000</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(229,50,45,0.3)', color: '#E5322D' }}>
                  <span>Total</span><span>Rp 13.875.000</span>
                </div>
              </div>
            </div>
          );
        case 'business':
          return (
            <div className="pd-deliv-mini">
              <div className="pd-mini-title">Roadmap — tahap 3 dari 5</div>
              <div style={{ marginTop: 10 }}>
                <span className="pd-mini-chip">Idea</span>
                <span className="pd-mini-chip">Setup</span>
                <span className="pd-mini-chip" style={{ background: 'rgba(229,50,45,0.3)' }}>Identity</span>
                <span className="pd-mini-chip" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(245,245,245,0.4)' }}>Build</span>
                <span className="pd-mini-chip" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(245,245,245,0.4)' }}>Sell</span>
              </div>
              <div style={{ fontSize: 9, color: 'rgba(245,245,245,0.55)', marginTop: 10, lineHeight: 1.5 }}>
                PT setup done. NPWP active. OSS RBA pending. Brand identity in review.
              </div>
            </div>
          );
        case 'kanban':
          return (
            <div className="pd-deliv-mini">
              <div className="pd-mini-title">Launch product Q3</div>
              <div className="pd-mini-kanban" style={{ marginTop: 10 }}>
                <div className="col">
                  <div style={{ fontSize: 8, marginBottom: 3 }}>TO DO</div>
                  <div className="card" />
                  <div className="card" />
                  <div className="card" />
                </div>
                <div className="col">
                  <div style={{ fontSize: 8, marginBottom: 3 }}>IN PROGRESS</div>
                  <div className="card accent" />
                  <div className="card accent" />
                </div>
                <div className="col">
                  <div style={{ fontSize: 8, marginBottom: 3 }}>DONE</div>
                  <div className="card" />
                  <div className="card" />
                  <div className="card" />
                  <div className="card" />
                </div>
              </div>
            </div>
          );
        case 'web':
          return (
            <div className="pd-deliv-mini">
              <div className="pd-mini-title">acme-saas.id</div>
              <div className="pd-mini-row" style={{ marginTop: 4 }}>
                <span className="pd-mini-tag">LIVE</span>
                <span>deployed via Vercel · 2:14</span>
              </div>
              <div style={{ marginTop: 10, background: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: 8 }}>
                <div className="pd-mini-line long" />
                <div className="pd-mini-line med" />
                <div className="pd-mini-line short accent" />
                <div className="pd-mini-line med" style={{ marginTop: 8 }} />
                <div className="pd-mini-line short" />
              </div>
            </div>
          );
        case 'social':
          return (
            <div className="pd-deliv-mini">
              <div className="pd-mini-title">Content calendar — minggu ini</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginTop: 10 }}>
                {['S','S','R','K','J','S','M'].map((d, i) => (
                  <div key={i} style={{ textAlign: 'center', fontSize: 8, color: 'rgba(245,245,245,0.5)' }}>
                    <div style={{ marginBottom: 3 }}>{d}</div>
                    <div style={{ height: 14, background: i === 1 || i === 3 || i === 5 ? 'rgba(229,50,45,0.4)' : 'rgba(255,255,255,0.06)', borderRadius: 2 }} />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 10, color: 'rgba(245,245,245,0.6)' }}>
                <span className="pd-mini-chip">TikTok</span>
                <span className="pd-mini-chip">Reels</span>
                <span className="pd-mini-chip">LinkedIn</span>
              </div>
            </div>
          );
        case 'trade':
          return (
            <div className="pd-deliv-mini">
              <div className="pd-mini-title">Market briefing — 08:00 WIB</div>
              <div style={{ marginTop: 8, fontSize: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>IHSG</span><span style={{ color: '#7AC97B' }}>+0.42%</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>USD/IDR</span><span>15.892</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>BTC</span><span style={{ color: '#E5322D' }}>67.2k</span></div>
              </div>
              <div className="pd-mini-chart">
                <div className="bar" style={{ height: '40%' }} /><div className="bar" style={{ height: '60%' }} /><div className="bar" style={{ height: '55%' }} /><div className="bar" style={{ height: '75%' }} /><div className="bar" style={{ height: '50%' }} /><div className="bar" style={{ height: '85%' }} /><div className="bar" style={{ height: '70%' }} />
              </div>
            </div>
          );
        case 'video':
          return (
            <div className="pd-deliv-mini">
              <div className="pd-mini-title">TikTok 60s — morning routine</div>
              <div style={{ marginTop: 10, fontSize: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#E5322D' }}>0:00–0:03</span>
                  <span>HOOK</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,245,245,0.55)' }}>0:03–0:48</span>
                  <span>BODY</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'rgba(245,245,245,0.55)' }}>0:48–1:00</span>
                  <span>CTA</span>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <span className="pd-mini-chip">#MorningRoutine</span>
                <span className="pd-mini-chip">#5MinuteRule</span>
              </div>
            </div>
          );
        default:
          return null;
      }
    }

    // ─────────────────────── PERSONA BENTO BLOCKS ───────────────────────
    // 2026-05-19 cowork: bento redesign for persona modals. Scoped to
    // deep-researcher initially as the style proof; rolls out to the other
    // 9 personas after founder approval.

    // Reusable tiny step-icon — keeps the flow bento compact + on-brand.
    function StepIcon({ kind }) {
      const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
      switch (kind) {
        case 'intake':
          return (<svg {...common}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>);
        case 'gather':
          return (<svg {...common}><circle cx="11" cy="11" r="7" /><line x1="20" y1="20" x2="16.5" y2="16.5" /></svg>);
        case 'grade':
          return (<svg {...common}><polyline points="20 6 9 17 4 12" /></svg>);
        case 'checkpoint':
          return (<svg {...common}><rect x="5" y="5" width="14" height="14" rx="2" /><polyline points="9 12 11 14 15 10" /></svg>);
        case 'cite':
          return (<svg {...common}><line x1="6" y1="7" x2="18" y2="7" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="6" y1="17" x2="14" y2="17" /></svg>);
        case 'synth':
          return (<svg {...common}><path d="M12 2v6M5 12h14M12 16v6" /><circle cx="12" cy="12" r="3" /></svg>);
        default:
          return (<svg {...common}><circle cx="12" cy="12" r="9" /></svg>);
      }
    }

    // Deep-researcher specific capability cards. Each capability gets its
    // own mockup that SHOWS the capability inline, per the Windsurf-style
    // brief — no list-of-prose.
    function DeepResearcherBento() {
      return (
        <div className="pd-bento">
          {/* Card 1 — span 2 cols: citation per claim */}
          <div className="pd-bento-card span-2">
            <div className="pd-bento-title">
              Citation per claim
              <span className="pd-bento-badge">Headline</span>
            </div>
            <div className="pd-bento-desc">
              Tiap klaim numerik atau faktual ditandai dengan footnote. Tidak ada generalisasi mengambang.
            </div>
            <div className="pd-bento-mock">
              <div className="pd-mock-paragraph">
                Pasar fintech Indonesia tumbuh 23% YoY <span className="ref">[1]</span> dengan dominasi e-wallet 67% transaksi digital <span className="ref">[2]</span>. UMKM lending naik 41% sepanjang 2024 <span className="ref">[3]</span>.
              </div>
              <div className="pd-mock-footnotes">
                <div className="pd-mock-footnote"><span className="num">[1]</span><span>BPS, 2025. UMKM landscape Indonesia.</span></div>
                <div className="pd-mock-footnote"><span className="num">[2]</span><span>OJK, 2024. Statistik sistem pembayaran.</span></div>
                <div className="pd-mock-footnote"><span className="num">[3]</span><span>DDTC News, 2025. P2P lending review.</span></div>
              </div>
            </div>
          </div>

          {/* Card 2 — span 1: minimum 5 sumber primer */}
          <div className="pd-bento-card">
            <div className="pd-bento-title">5 sumber minimum</div>
            <div className="pd-bento-desc">
              Setiap topik di-decompose sampai punya minimal lima sumber primer berjarak.
            </div>
            <div className="pd-bento-mock" style={{ padding: '8px 10px' }}>
              <div className="pd-mock-sources">
                <span className="pd-mock-source-icon" />
                <span className="pd-mock-source-icon" />
                <span className="pd-mock-source-icon" />
                <span className="pd-mock-source-icon" />
                <span className="pd-mock-source-icon" />
              </div>
              <div className="pd-mock-counter">5+</div>
              <div className="pd-mock-counter-lbl">sumber primer</div>
            </div>
          </div>

          {/* Card 3 — span 1: verified vs unverified tagging */}
          <div className="pd-bento-card">
            <div className="pd-bento-title">[unverified] tag</div>
            <div className="pd-bento-desc">
              Klaim yang tidak bisa diverifikasi di-tag eksplisit. Ketidakpastian tidak disembunyikan.
            </div>
            <div className="pd-bento-mock">
              <div className="pd-mock-split">
                <div className="pd-mock-split-col verified">
                  <div className="lbl">✓ Verified</div>
                  <div className="ln" />
                  <div className="ln" />
                  <div className="ln" style={{ width: '60%' }} />
                </div>
                <div className="pd-mock-split-col unverified">
                  <div className="lbl">[unverified]</div>
                  <div className="ln" />
                  <div className="ln" style={{ width: '70%' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Card 4 — span 2 cols: conflict attribution */}
          <div className="pd-bento-card span-2">
            <div className="pd-bento-title">
              Conflict attribution
              <span className="pd-bento-badge">New</span>
            </div>
            <div className="pd-bento-desc">
              Klaim yang bertentangan ditampilkan dengan attribution masing-masing — bukan pilih satu side diam-diam.
            </div>
            <div className="pd-bento-mock">
              <div className="pd-mock-conflict">
                <div className="pd-mock-quote">
                  Pertumbuhan fintech UMKM akan stabil di 20-25% sampai 2027.
                  <span className="src">— OJK, Outlook 2025</span>
                </div>
                <div className="pd-mock-quote">
                  Saturasi pasar akan menekan growth ke single-digit pasca 2026.
                  <span className="src">— Kontan, Analisis Q1 2025</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 5 — span 1: sintesis 10+ paper */}
          <div className="pd-bento-card">
            <div className="pd-bento-title">Sintesis 10+ paper</div>
            <div className="pd-bento-desc">
              Decompose, baca, distill jadi exec summary dua halaman dengan methodology note.
            </div>
            <div className="pd-bento-mock">
              <div className="pd-mock-funnel">
                <div className="pd-mock-paper-stack">
                  <span className="pg" />
                  <span className="pg" />
                  <span className="pg" />
                </div>
                <span className="pd-mock-arrow">→</span>
                <div className="pd-mock-summary-card">
                  <div className="ttl">Exec Summary</div>
                  <div className="ln" />
                  <div className="ln" />
                  <div className="ln short" />
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Bento-mode flow steps — used for deep-researcher (and after approval,
    // generalised across all personas). Numbered prominently, with a tiny
    // icon-led visual hint per step.
    const FLOW_ICON_MAP = {
      'deep-researcher': ['intake', 'gather', 'grade', 'checkpoint', 'cite', 'synth'],
    };
    function PersonaFlowBento({ persona }) {
      const icons = FLOW_ICON_MAP[persona.slug] || [];
      return (
        <div className="pd-bento-flow">
          {persona.flow.map((step, i) => (
            <div key={i} className="pd-bento-step">
              <div className="pd-bento-step-head">
                <span className="pd-bento-step-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="pd-bento-step-icon"><StepIcon kind={icons[i]} /></span>
              </div>
              <div className="pd-bento-step-title">{step.title}</div>
              <div className="pd-bento-step-desc">{step.desc}</div>
            </div>
          ))}
        </div>
      );
    }

    // Enlarged deliverable frames with document-preview chrome.
    function PersonaDeliverableBento({ persona }) {
      return (
        <div className="pd-bento-deliv">
          <div className="pd-bento-deliv-frame">
            <DeliverableMock kind={persona.deliverable.kind} />
            <div className="pd-bento-deliv-caption" dangerouslySetInnerHTML={{ __html: persona.deliverable.caption.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
          </div>
          <div className="pd-bento-deliv-frame">
            <div className="pd-deliv-mini">
              <div className="pd-mini-title">Output yang kamu pegang</div>
              <div style={{ fontSize: 10, color: 'rgba(245,245,245,0.6)', marginTop: 8, lineHeight: 1.6 }}>
                Setiap deliverable di-versi dan tersimpan di VPS kamu sendiri. Aku tidak push ke cloud pihak ketiga tanpa kamu approve.
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {persona.templates.slice(0, 3).map((t, i) => (
                  <span key={i} className="pd-mini-chip">{t.kind}</span>
                ))}
              </div>
            </div>
            <div className="pd-bento-deliv-caption">
              Output disimpan <strong>di VPS kamu</strong>. Versi history, audit log, dan export ke format apapun yang kamu mau.
            </div>
          </div>
        </div>
      );
    }

    // ─────────────────────── PERSONA DETAIL MODAL ───────────────────────
    function PersonaDetailModal({ persona, onClose }) {
      // Esc to close
      useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        document.body.classList.add('pd-modal-open');
        return () => {
          document.removeEventListener('keydown', onKey);
          document.body.classList.remove('pd-modal-open');
        };
      }, [onClose]);

      if (!persona) return null;

      // Bento mode — per 2026-05-19 cowork consult. Currently scoped to
      // deep-researcher as the style proof. After founder approval, we
      // remove this branch and apply bento to all 10 personas.
      const useBento = persona.slug === 'deep-researcher';

      // Build a "secondary" deliverable variant to satisfy the 1-2 examples
      // requirement. We render the primary mock plus a stylised template-list
      // mini that surfaces the persona's signature output shape.
      return (
        <div className="pd-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Detail ${persona.name}`}>
          <div className="pd-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="pd-modal-close" onClick={onClose} aria-label="Tutup">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="pd-modal-header">
              <div className="pd-modal-glyph">{persona.glyph}</div>
              <div>
                <div className="pd-modal-title">{persona.name}</div>
                <div className="pd-modal-tag">{persona.tagline}</div>
              </div>
            </div>

            <div className="pd-block">
              <div className="pd-block-label">Apa yang aku bisa</div>
              {useBento ? (
                <DeepResearcherBento />
              ) : (
                <ul className="pd-list">
                  {persona.capabilities.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              )}
            </div>

            <div className="pd-block">
              <div className="pd-block-label">Bagaimana aku kerja</div>
              {useBento ? (
                <PersonaFlowBento persona={persona} />
              ) : (
                <div className="pd-flow">
                  {persona.flow.map((step, i) => (
                    <div key={i} className="pd-step">
                      <div className="pd-step-num">{String(i + 1).padStart(2, '0')}</div>
                      <div className="pd-step-body">
                        <div className="pd-step-title">{step.title}</div>
                        <div className="pd-step-desc">{step.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pd-block">
              <div className="pd-block-label">Contoh deliverable</div>
              {useBento ? (
                <PersonaDeliverableBento persona={persona} />
              ) : (
                <div className="pd-deliverable-grid">
                  <div className="pd-deliverable">
                    <DeliverableMock kind={persona.deliverable.kind} />
                    <div className="pd-deliv-caption" dangerouslySetInnerHTML={{ __html: persona.deliverable.caption.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
                  </div>
                  <div className="pd-deliverable">
                    <div className="pd-deliv-mini">
                      <div className="pd-mini-title">Output yang kamu pegang</div>
                      <div style={{ fontSize: 10, color: 'rgba(245,245,245,0.6)', marginTop: 8, lineHeight: 1.6 }}>
                        Setiap deliverable di-versi dan tersimpan di VPS kamu sendiri. Aku tidak push ke cloud pihak ketiga tanpa kamu approve.
                      </div>
                      <div style={{ marginTop: 10, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {persona.templates.slice(0, 3).map((t, i) => (
                          <span key={i} className="pd-mini-chip">{t.kind}</span>
                        ))}
                      </div>
                    </div>
                    <div className="pd-deliv-caption">
                      Output disimpan **di VPS kamu**. Versi history, audit log, dan export ke format apapun yang kamu mau.
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="pd-block">
              <div className="pd-block-label">Templates aku punya</div>
              <div className="pd-templates">
                {persona.templates.map((t, i) => (
                  <div key={i} className="pd-template">
                    <div className="pd-template-icon">{(t.kind || 'tpl').slice(0, 3).toUpperCase()}</div>
                    <div className="pd-template-body">
                      <div className="pd-template-name">{t.name}</div>
                      <div className="pd-template-kind">{t.kind}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pd-cta-row">
              <span className="pd-cta-hint">Pilih agent kamu — checkout 5 menit, Telegram bot kamu siap hari ini.</span>
              <a className="pd-cta-primary" href={`/checkout?persona=${persona.slug}`}>
                <span>Pilih {persona.name} sebagai agent kamu</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      );
    }

    // ─────────────────────── PERSONA DETAIL GRID ───────────────────────
    // 2026-05-26 cowork: tile click now navigates to a dedicated full-page
    // persona detail (/persona?slug=<slug>) instead of opening an inline
    // modal. Founder wanted more breathing room — modal felt too packed.
    // Legacy #persona-<slug> hash links auto-redirect to the new page so
    // any inbound links still work.
    function PersonaDetailGrid() {
      // Auto-redirect legacy hash links (#persona-<slug>) to the new page.
      useEffect(() => {
        const m = window.location.hash.match(/^#persona-([\w-]+)$/);
        if (m && PERSONA_DETAILS.some((p) => p.slug === m[1])) {
          window.location.href = `/persona?slug=${encodeURIComponent(m[1])}`;
        }
      }, []);

      return (
        <div className="pd-section" id="persona-details">
          <div className="pd-section-head">
            <div className="pd-eyebrow">10 persona spesialis</div>
            <h3>Lihat lebih dekat tiap agent</h3>
            <p>
              Klik kartu untuk membuka halaman detail — apa yang dia bisa, bagaimana dia kerja, contoh output, dan template yang sudah ada di inventory.
            </p>
          </div>
          <div className="pd-grid">
            {PERSONA_DETAILS.map((p) => (
              <a
                key={p.slug}
                className="pd-tile"
                href={`/persona?slug=${encodeURIComponent(p.slug)}`}
                aria-label={`Buka detail ${p.name}`}
              >
                <div className="pd-tile-glyph">{p.glyph}</div>
                <div className="pd-tile-name">{p.name}</div>
                <div className="pd-tile-tag">{p.tagline.split(' — ')[0]}</div>
                <div className="pd-tile-cta">Lihat detail</div>
              </a>
            ))}
          </div>
        </div>
      );
    }

    // ─────────────────────── START SECTION ───────────────────────
    function StartSection() {
      return (
        <section id="proses" className="relative overflow-hidden bg-black min-h-[760px] md:min-h-[920px]">
          <DottedVideo
            src="/assets/ascii-wave.mp4"
            color="#E5322D"
            cellSize={6}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 1, background: '#000' }}
          />
          <FadeTop /> <FadeBottom />
          <div className="relative z-10 flex flex-col items-center text-center px-6 py-40" style={{ minHeight: 500 }}>
            <div className="liquid-glass rounded-full px-3.5 py-1 text-xs font-medium font-body text-white/90">
              Kenalan dengan tim kamu
            </div>
            <BlurText
              as="h2"
              text="Spesialis untuk tiap pekerjaan. Satu tim. Satu chat."
              className="mt-8 text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-heading tracking-tight leading-[1.05] md:leading-[0.9] max-w-3xl"
              style={{ letterSpacing: '-0.03em' }}
              delay={80} />
            <p className="mt-5 md:mt-6 max-w-2xl text-white/65 font-body font-light text-[13px] md:text-base leading-relaxed">
              Tiap persona di-engineer dan diuji satu per satu — siap kerja hari pertama.
            </p>
            <AgentCarousel />
          </div>
        </section>
      );
    }

    // ─────────────────────── DASHBOARD DEMO ───────────────────────
    // Animated signal-red circuit flowing into a hub — konten-style hero motion,
    // pure SVG (stroke-dashoffset), sits behind the dim so it never fights the mockup.
    function HeroCircuit() {
      // Converging-channels circuit backdrop (Konten redesign Iter 3): faint
      // L-elbow traces carry flowing current from the customer's channels
      // (left + right edges) into a central agent hub. CSS-only motion
      // (ktCurrentFlow / ktPortPulse / ktGlowPulse) — reduced-motion safe.
      const HUBX = 600, HUBY = 250;
      const left = [{ y: 110, label: 'WhatsApp', c: '#25d366' }, { y: 250, label: 'Instagram', c: '#e1306c' }, { y: 390, label: 'Telegram', c: '#3aa9e0' }];
      const right = [{ y: 110, label: 'Email', c: '#e0b341' }, { y: 250, label: 'Kalender', c: '#ff7a5e' }, { y: 390, label: 'Spreadsheet', c: '#4caa5a' }];
      const trace = (x0, y0) => `M${x0} ${y0} H${x0 < HUBX ? x0 + 230 : x0 - 230} L${HUBX} ${HUBY}`;
      const all = [...left, ...right];
      return (
        <div className="kt-hero-circuit" aria-hidden="true">
          <svg viewBox="0 0 1200 520" fill="none" preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="ktHubGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ee3c30" stopOpacity="0.5" />
                <stop offset="55%" stopColor="#ee3c30" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#ee3c30" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx={HUBX} cy={HUBY} r="150" fill="url(#ktHubGlow)" className="kt-hub-glow" />
            {all.map((ch, i) => {
              const d = trace(i < 3 ? 60 : 1140, ch.y);
              return (
                <g key={'t' + i}>
                  <path d={d} stroke="rgba(238,60,48,0.13)" strokeWidth="1.4" />
                  <path d={d} stroke={ch.c} strokeOpacity="0.7" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="10 30" className="kt-current" style={{ animationDelay: `${i * 0.45}s` }} />
                </g>
              );
            })}
            {left.map((ch, i) => (
              <g key={'l' + i} className="kt-chan">
                <circle cx="60" cy={ch.y} r="5" fill={ch.c} className="kt-port" style={{ animationDelay: `${i * 0.4}s` }} />
                <text x="74" y={ch.y + 4} fill="#8a837d" fontFamily="'JetBrains Mono',monospace" fontSize="13">{ch.label}</text>
              </g>
            ))}
            {right.map((ch, i) => (
              <g key={'r' + i} className="kt-chan">
                <circle cx="1140" cy={ch.y} r="5" fill={ch.c} className="kt-port" style={{ animationDelay: `${i * 0.4}s` }} />
                <text x="1126" y={ch.y + 4} fill="#8a837d" fontFamily="'JetBrains Mono',monospace" fontSize="13" textAnchor="end">{ch.label}</text>
              </g>
            ))}
            <circle cx={HUBX} cy={HUBY} r="9" fill="#ee3c30" className="kt-hub-core" />
          </svg>
        </div>
      );
    }

    function DashboardDemo() {
      // Conversation: each event has type 'system' | 'user' | 'agent'
      // user: text shown as typewriter in input then sent as bubble
      // agent: typing dots appear, then content renders as agent bubble
      // Honest demo: every exchange below is a REAL shipped capability
      // (briefing cron, template library, content calendar, cross-session
      // memory). No email/calendar access is implied — we don't have it yet.
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
        { type: 'agent', content: (<>Ini draftnya — gaya nulis kamu, singkat dan sopan. Aku tidak mengirim apa pun tanpa kamu setujui.<div className="db-cal-row"><div className="db-cal-cell">Sen</div><div className="db-cal-cell evt">Sel<br/>cek sampel</div><div className="db-cal-cell">Rab</div><div className="db-cal-cell evt">Kam<br/>nego</div><div className="db-cal-cell">Jum</div><div className="db-cal-cell">Sab</div><div className="db-cal-cell">Min</div></div></>) },
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
          // user event
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
        <section id="beranda" className="db-section db-section--hero">
          {/* Konten redesign: converging-channels circuit backdrop. */}
          <HeroCircuit />
          <div className="db-hero-fade" aria-hidden="true" />
          <div className="db-eyebrow">
            <div className="db-eyebrow-pill">
              <span className="live-dot" />
              <span>Agen kamu bekerja</span>
            </div>
            <h1 className="db-headline"><span className="kt-grad-text">Satu agent.</span><br className="hidden md:inline" /> Ngerjain kerja kamu.</h1>
            <p className="db-sub">Dia nyapa kamu duluan — briefing pagi masuk sebelum diminta. Kamu cukup setujui.</p>
            <div className="mt-7 flex flex-col items-center gap-3">
              <div className="flex items-center gap-3 flex-wrap justify-center">
                <a href="#pricing" className="kt-cta-primary cta-tactile no-underline">
                  Aktifkan asisten kamu <ArrowUpRight size={14} stroke={2.2} />
                </a>
                <a href="https://cal.com/weuseai.agent/15min" target="_blank" rel="noopener" className="kt-cta-ghost no-underline">
                  Konsultasi gratis (15 menit)
                </a>
              </div>
            </div>
          </div>

          <div className="db-frame">
            {/* Top bar */}
            <div className="db-topbar">
              <div className="db-traffic"><span /><span /><span /></div>
              <div className="db-title">weuseai.agent · dashboard</div>
              <div className="db-status">Online</div>
            </div>

            {/* Body: sidebar + main */}
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

            {/* Input area — typewriter shows next user prompt */}
            <div className="db-input">
              <div className="db-input-box">
                {typedText
                  ? <span className="db-input-typed">{typedText}<span className="db-input-caret" /></span>
                  : <span className="db-input-placeholder">Tanya apa aja...<span className="db-input-caret" /></span>}
              </div>
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                className={`db-send ${phase === 'user-click' ? 'db-send-clicked' : ''}`}>
                <ArrowUpRight size={18} stroke={2.4} />
              </button>
            </div>

            {/* Animated mouse cursor — moves to send button when user message is ready */}
            <div className={`db-cursor cur-${phase}`} aria-hidden="true">
              <svg viewBox="0 0 18 22">
                <path d="M2 2 L2 17 L6.5 13 L9 18 L11.5 17 L8.8 12 L14 12 Z" fill="#fff" stroke="#000" strokeWidth="0.7" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </section>
      );
    }


    // ─────────────────────── DIY PAIN ───────────────────────
    function FeaturesChess() {
      const pains = [
        { n: '01', viz: 'vps',   title: 'Beli & konfigurasi VPS',     body: 'Pilih provider. Setup SSH. Buka port. Berdoa port 22 nggak ke-expose.' },
        { n: '02', viz: 'py',    title: 'Library bentrok terus',      body: 'Conda vs venv. CUDA salah. Python 3.9 vs 3.11. Weekend kamu hilang.' },
        { n: '03', viz: 'tools', title: 'Setup API key satu-satu',    body: 'Search. Browser. TTS. Vision. 10 dashboard, 10 billing, 10 auth.' },
        { n: '04', viz: 'debug', title: 'Debug error tengah malam',   body: 'Stack trace. SSL expired. Bot mati. Kamu jadi sysadmin dadakan.' },
        { n: '05', viz: 'mem',   title: 'Maintain sistem 24/7',       body: 'Restart. Update. Memory leak. Tiap minggu kebakaran baru.' },
        { n: '06', viz: 'tune',  title: 'Bakar token cuma buat tune', body: 'Tiap session bakar token. Hasil generic. Tagihan API naik. Progress nol.' },
      ];

      const PainViz = ({ kind }) => {
        if (kind === 'vps') {
          return (
            <div className="pain-viz pv-vps">
              <div className="row"><span className="prompt">$</span> ssh -i ~/.ssh/id_rsa root@164.92.</div>
              <div className="row"><span className="flag">ufw</span> allow 22/tcp <span className="flag">→</span> Status: active</div>
              <div className="row"><span className="prompt">$</span> apt install nginx postgres redis</div>
              <div className="row">Port 5432 already in use by pid 4421</div>
              <div className="row"><span className="prompt">$</span> systemctl status nginx</div>
              <div className="row">✕ Failed: bind: address already in use<span className="cursor"></span></div>
            </div>
          );
        }
        if (kind === 'py') {
          return (
            <div className="pain-viz pv-py">
              <div className="ver a">python 3.9</div>
              <div className="clash"></div>
              <div className="ver b">python 3.11</div>
              <div className="err">ImportError: incompatible CUDA toolkit</div>
            </div>
          );
        }
        if (kind === 'tools') {
          return (
            <div className="pain-viz pv-tools">
              <span className="chip">OPENAI_KEY</span>
              <span className="chip">SERP_API ✕</span>
              <span className="chip">BROWSERLESS</span>
              <span className="chip">ELEVENLABS</span>
              <span className="chip">PINECONE</span>
              <span className="chip">STRIPE 401</span>
              <span className="chip">REPLICATE</span>
              <span className="chip">TELEGRAM_BOT</span>
              <span className="chip">DEEPGRAM</span>
            </div>
          );
        }
        if (kind === 'debug') {
          return (
            <div className="pain-viz pv-debug">
              <div className="clock">02:14 AM</div>
              <div className="stream">
                <div>Traceback (most recent call last):</div>
                <div><span className="dim">  File "agent.py", line 247, in &lt;module&gt;</span></div>
                <div>ConnectionResetError: [Errno 104]</div>
                <div><span className="dim">  ssl.SSLError: cert expired</span></div>
                <div>aiohttp.ClientError: 502 Bad Gateway</div>
                <div><span className="dim">  RuntimeError: event loop closed</span></div>
                <div>docker: container exited (137)</div>
                <div>Traceback (most recent call last):</div>
                <div><span className="dim">  File "agent.py", line 247, in &lt;module&gt;</span></div>
                <div>ConnectionResetError: [Errno 104]</div>
                <div><span className="dim">  ssl.SSLError: cert expired</span></div>
                <div>aiohttp.ClientError: 502 Bad Gateway</div>
                <div><span className="dim">  RuntimeError: event loop closed</span></div>
                <div>docker: container exited (137)</div>
              </div>
            </div>
          );
        }
        if (kind === 'mem') {
          return (
            <div className="pain-viz pv-mem">
              <div className="label"><span>RAM usage</span><span className="pct">96%</span></div>
              <div className="bar"><div className="fill"></div></div>
              <div className="ticks">
                <span></span><span></span><span></span><span></span>
                <span></span><span></span><span></span><span></span>
                <span></span><span></span><span></span><span></span>
              </div>
            </div>
          );
        }
        return (
          <div className="pain-viz pv-tune">
            <div className="row"><span className="name">tone</span><div className="track"><div className="knob"></div></div></div>
            <div className="row"><span className="name">verbose</span><div className="track"><div className="knob"></div></div></div>
            <div className="row"><span className="name">style</span><div className="track"><div className="knob"></div></div></div>
          </div>
        );
      };

      return (
        <section className="relative overflow-hidden py-20 md:py-32 px-5 md:px-6 lg:px-16 bg-black">
          <DottedUnicorn
            projectId="k6zzxblRW6JEuhAczFHj"
            color="#E5322D"
            cellSize={6}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 1, background: '#000' }}
          />
          <FadeTop /> <FadeBottom />
          <div className="relative z-10 max-w-6xl mx-auto">
            <div className="flex flex-col items-center text-center mb-14 md:mb-20">
              <div className="liquid-glass rounded-full px-3.5 py-1 text-xs font-medium font-body text-white/90" style={{ borderColor: 'rgba(229, 50, 45, 0.45)' }}>
                Mau bikin sendiri?
              </div>
              <BlurText
                as="h2"
                text="Bikin sendiri itu mahal. Kami sudah bayar harganya."
                className="mt-5 md:mt-6 text-3xl md:text-5xl lg:text-6xl font-heading text-white tracking-tight leading-[1.0] md:leading-[0.95] max-w-4xl"
                style={{ letterSpacing: '-0.04em' }}
                delay={70}
              />
              <p className="mt-5 md:mt-6 max-w-2xl text-white/55 font-body font-light text-sm md:text-base leading-relaxed">
                Nyusun agent stack sendiri habis waktu dan token, dan sering tetap rapuh. Semua trial-and-error itu sudah kami lewati di China. Kamu tinggal pakai hasilnya.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
              {pains.map((p, i) => (
                <Mot.div key={p.n}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.6, ease: EASE, delay: 0.05 * i }}
                  className="liquid-glass rounded-2xl md:rounded-3xl p-7 md:p-10 flex flex-col"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs md:text-sm font-mono uppercase tracking-[0.18em]" style={{ color: '#E5322D' }}>{p.n}</div>
                  </div>
                  <PainViz kind={p.viz} />
                  <h3 className="text-2xl md:text-3xl font-heading text-white leading-[1.1]" style={{ letterSpacing: '-0.02em' }}>{p.title}</h3>
                  <p className="mt-3 md:mt-4 text-base md:text-lg text-white/70 font-body font-light leading-relaxed">{p.body}</p>
                </Mot.div>
              ))}
            </div>

            <div className="mt-12 md:mt-16 flex items-center justify-center gap-3 text-white/60 font-body text-sm text-center px-4">
              <span>Atau —</span>
              <span className="font-heading text-white text-base" style={{ letterSpacing: '-0.02em' }}>biar kami yang urus semuanya.</span>
            </div>
          </div>
        </section>
      );
    }

    // ─────────────────────── USE CASES (Velvet, with bg-video) ───────────────────────
    function VelvetSection() {
      const capabilities = [
        { n: '01', kind: 'email',     title: 'Rangkum Apa Pun',  body: 'Tempel thread email atau dokumen panjang — dirangkum jadi satu halaman, lengkap dengan draft balasan yang tinggal kamu kirim.' },
        { n: '02', kind: 'slide',     title: 'Auto-Slide',       body: 'Dari materi mentah ke slide lengkap — judul, isi, speaker notes, layout. Begadang malam Minggu diganti 10 menit Senin pagi.' },
        { n: '03', kind: 'multipost', title: 'Caption Multi-Kanal', body: 'Satu listing, caption berbeda untuk tiap kanal — panjang dan nada disesuaikan per platform, tinggal copy-paste.' },
        { n: '04', kind: 'autoreply', title: 'Siaga 24/7',       body: 'Jam 23:47 kamu kepikiran sesuatu? Chat saja. Tim kamu tidak tidur, tidak cuti, dan tidak bosan ditanya.' },
        { n: '05', kind: 'pitch',     title: 'Pitch Deck',       body: 'Dari ide ke deck 12 slide — masalah, solusi, pasar, traksi, ajakan. Investor besok pagi, deck siap malam ini.' },
        { n: '06', kind: 'crm',       title: 'Memori Relasi',    body: 'Cerita sekali soal kenalan kamu — dia ingat. Minggu depan dia ingatkan siapa yang perlu kamu follow-up, dan kenapa.' },
        { n: '07', kind: 'radar',     title: 'Radar Ide',        body: 'Minta ide konten kapan pun — dapat angle, hook 3 detik, dan format yang cocok untuk brand kamu. Lima ide dalam satu perintah.' },
        { n: '08', kind: 'script',    title: 'Script Generator', body: 'Dari topik ke script TikTok 60 detik — hook, body, CTA, saran scene, caption, hashtag. Sekali perintah, siap rekam.' },
        { n: '09', kind: 'excel',     title: 'Excel Wizard',     body: 'Pivot table, VLOOKUP, dashboard? Kirim datanya — dapat formula plus penjelasan, atau file Excel jadi sekalian.' },
        { n: '10', kind: 'recap',     title: 'Recap Rapat',      body: 'Tempel transkrip atau catatan rapat 2 jam — diringkas jadi satu halaman: keputusan, aksi, dan siapa pegang apa.' },
        { n: '11', kind: 'calendar',  title: 'Rencana Minggu',   body: 'Ceritakan jadwal kamu — dia susun prioritas mingguan, deteksi bentrok, dan siapkan draft reschedule yang sopan.' },
        { n: '12', kind: 'brief',     title: 'Morning Brief',    body: 'Tiap pagi jam 7, briefing masuk ke Telegram kamu — berita relevan, outstanding kemarin, prioritas hari ini. Tanpa diminta.' },
      ];

      const CapViz = ({ kind }) => {
        if (kind === 'email') {
          return (
            <div className="cap-viz cap-email">
              <div className="ln"><span className="tag" /></div>
              <div className="ln"><span className="tag" /></div>
              <div className="ln"><span className="tag" /></div>
              <div className="ln"><span className="tag" /></div>
            </div>
          );
        }
        if (kind === 'slide') {
          return (
            <div className="cap-viz cap-slide">
              <div className="s"><span className="h" /><span className="l" /><span className="l" /></div>
              <div className="s"><span className="h" /><span className="l" /><span className="l" /></div>
              <div className="s"><span className="h" /><span className="l" /><span className="l" /></div>
            </div>
          );
        }
        if (kind === 'multipost') {
          return (
            <div className="cap-viz cap-multipost">
              <div className="row">
                <span className="p">OLX</span>
                <span className="p">LMD</span>
                <span className="p">R123</span>
                <span className="p">IG</span>
                <span className="p">FB</span>
                <span className="p">TT</span>
              </div>
              <div className="src">↑ 1 listing</div>
            </div>
          );
        }
        if (kind === 'autoreply') {
          return (
            <div className="cap-viz cap-autoreply">
              <div className="clock">23:47</div>
              <div className="bubble b1">Besok meeting jam berapa?</div>
              <div className="bubble b2">09:30 — materinya sudah siap</div>
            </div>
          );
        }
        if (kind === 'pitch') {
          return (
            <div className="cap-viz cap-pitch">
              {Array.from({ length: 12 }, (_, i) => <div key={i} className="cell" />)}
            </div>
          );
        }
        if (kind === 'crm') {
          return (
            <div className="cap-viz cap-crm">
              <svg viewBox="0 0 200 56" preserveAspectRatio="xMidYMid meet">
                <line className="e" x1="100" y1="28" x2="22"  y2="10" style={{ animationDelay: '0s' }} />
                <line className="e" x1="100" y1="28" x2="22"  y2="46" style={{ animationDelay: '0.25s' }} />
                <line className="e" x1="100" y1="28" x2="178" y2="10" style={{ animationDelay: '0.5s' }} />
                <line className="e" x1="100" y1="28" x2="178" y2="46" style={{ animationDelay: '0.75s' }} />
                <line className="e" x1="100" y1="28" x2="100" y2="6"  style={{ animationDelay: '1.0s' }} />
                <circle className="me" cx="100" cy="28" r="4" />
                <circle className="c"  cx="22"  cy="10" r="2.6" style={{ animationDelay: '0.4s' }} />
                <circle className="c"  cx="22"  cy="46" r="2.6" style={{ animationDelay: '0.65s' }} />
                <circle className="c"  cx="178" cy="10" r="2.6" style={{ animationDelay: '0.9s' }} />
                <circle className="c"  cx="178" cy="46" r="2.6" style={{ animationDelay: '1.15s' }} />
                <circle className="c"  cx="100" cy="6"  r="2.6" style={{ animationDelay: '1.4s' }} />
              </svg>
            </div>
          );
        }
        if (kind === 'radar') {
          return (
            <div className="cap-viz cap-radar">
              <svg viewBox="0 0 60 60">
                <circle className="ring" cx="30" cy="30" r="24" stroke="rgba(255,255,255,0.18)" />
                <circle className="ring" cx="30" cy="30" r="16" stroke="rgba(255,255,255,0.10)" />
                <circle className="ring" cx="30" cy="30" r="8"  stroke="rgba(255,255,255,0.07)" />
                <line className="sweep" x1="30" y1="30" x2="30" y2="6" />
                <circle className="blip" cx="42" cy="22" r="2"   style={{ animationDelay: '0.5s' }} />
                <circle className="blip" cx="20" cy="40" r="1.6" style={{ animationDelay: '1.5s' }} />
                <circle className="blip" cx="38" cy="44" r="1.6" style={{ animationDelay: '2.4s' }} />
              </svg>
            </div>
          );
        }
        if (kind === 'script') {
          return (
            <div className="cap-viz cap-script">
              <div className="seg"><span className="t">0:03</span><span className="lbl">HOOK</span><span className="bar" /></div>
              <div className="seg"><span className="t">0:48</span><span className="lbl">BODY</span><span className="bar" /></div>
              <div className="seg"><span className="t">1:00</span><span className="lbl">CTA</span><span className="bar" /></div>
            </div>
          );
        }
        if (kind === 'excel') {
          return (
            <div className="cap-viz cap-excel">
              <div className="formula">=SUM(B2:B5)</div>
              <div className="grid">
                <div className="cell" /><div className="cell" /><div className="cell active" /><div className="cell" />
                <div className="cell" /><div className="cell" /><div className="cell" /><div className="cell" />
              </div>
            </div>
          );
        }
        if (kind === 'recap') {
          return (
            <div className="cap-viz cap-recap">
              <div className="timeline" />
              <div className="bullets">
                <span className="b" /><span className="b" /><span className="b" />
              </div>
            </div>
          );
        }
        if (kind === 'calendar') {
          return (
            <div className="cap-viz cap-calendar">
              <div className="day"><div className="e" /></div>
              <div className="day"><div className="e mid" /></div>
              <div className="day"><div className="e" /><div className="e" /></div>
              <div className="day conflict"><div className="e" /><div className="e warn" /></div>
              <div className="day"><div className="e mid" /></div>
              <div className="day" />
              <div className="day"><div className="e" /></div>
            </div>
          );
        }
        // brief
        return (
          <div className="cap-viz cap-brief">
            <div className="sun" />
            <div className="ticker">
              <span className="news" /><span className="news" /><span className="news" /><span className="news" /><span className="news" />
            </div>
          </div>
        );
      };

      const cases = [
        { kind: 'research',  title: 'Riset',           body: 'Mencari, merangkum, dan mencantumkan sumber — tanpa perlu kamu pantau.' },
        { kind: 'content',   title: 'Konten',          body: 'Membaca tulisan lama kamu, lalu menghasilkan thread, post, atau video explainer dengan suara kamu.' },
        { kind: 'coding',    title: 'Coding',          body: 'Code Wizard akan ngambil instruksi kabur, selesaikan seluruh script — end to end.', roadmap: 'Q3 2026', cta: 'Daftar early access →', ctaHref: 'https://wa.me/6282154902561?text=Halo%20Richie%2C%20mau%20early%20access%20Code%20Wizard%20agent%20di%20weuseai.agent' },
        { kind: 'knowledge', title: 'Pengetahuan',     body: 'Membangun memori dari setiap catatan, percakapan, dan tugas. Ia mengingat semua yang kamu kerjakan.' },
        { kind: 'memory',    title: 'Memori',          body: 'Ingat segalanya lintas sesi. Memori permanen dengan pencarian 10ms untuk 10.000+ entri — nggak perlu jelasin konteks dari awal lagi.' },
        { kind: 'schedule',  title: 'Jadwal',          body: 'Otomasi jadwal pakai bahasa biasa. Tulis "setiap Senin jam 8, lakukan X" — tanpa coding, tanpa batas harian.' },
        { kind: 'browse',    title: 'Browsing',        body: 'Browsing internet secara mandiri. Scraping, search, dan otomasi browser.' },
        { kind: 'platforms', title: 'Multi-platform',  body: 'Runtime-nya mendukung 15+ kanal — Telegram, Discord, Slack, dan lainnya. Kamu mulai di Telegram; kanal lain menyusul.' },
        { kind: 'subagent',  title: 'Sub-agen',        body: 'Mendelegasikan tugas paralel ke 5 sub-agen spesialis sekaligus — tiap satu fokus di domain-nya.' },
        { kind: 'skill',     title: 'Skill mandiri',   body: 'Menulis skill sendiri secara otomatis. Setelah tugas kompleks, ia mendokumentasi metodologinya — biar nggak perlu mikir ulang.' },
        { kind: 'home',      title: 'Smart Home',      body: 'Kontrol rumah pintar lewat perintah biasa.' },
        { kind: 'files',     title: 'File Management', body: 'Beresin dokumen yang berantakan. File chaos jadi rapih — dia yang nyusun.' },
      ];

      const UseCaseViz = ({ kind }) => {
        if (kind === 'research') {
          return (
            <div className="uc-viz uc-research">
              <div className="row"><span className="dot" /><span className="line" /></div>
              <div className="row"><span className="dot" /><span className="line" /></div>
              <div className="row"><span className="dot" /><span className="line" /></div>
              <div className="row"><span className="dot" /><span className="line" /></div>
              <div className="scanner" />
            </div>
          );
        }
        if (kind === 'content') {
          return (
            <div className="uc-viz uc-content">
              <div className="ln" />
              <div className="ln" />
              <div className="ln" />
              <div className="ln" />
            </div>
          );
        }
        if (kind === 'coding') {
          return (
            <div className="uc-viz uc-coding">
              <div className="ln"><span className="num">1</span><span className="kw">function</span> build<span className="punct">{'() {'}</span></div>
              <div className="ln"><span className="num">2</span><span className="kw">const</span> data <span className="punct">=</span> fetch<span className="punct">()</span></div>
              <div className="ln"><span className="num">3</span><span className="kw">return</span> data<span className="punct">.</span>map<span className="punct">()</span></div>
              <div className="ln"><span className="num">4</span><span className="punct">{'}'}</span></div>
            </div>
          );
        }
        if (kind === 'knowledge') {
          return (
            <div className="uc-viz uc-knowledge">
              <svg viewBox="0 0 200 108" preserveAspectRatio="xMidYMid meet">
                <line className="edge" x1="40"  y1="28" x2="100" y2="56" />
                <line className="edge" x1="100" y1="56" x2="160" y2="32" />
                <line className="edge" x1="40"  y1="28" x2="60"  y2="80" />
                <line className="edge" x1="60"  y1="80" x2="100" y2="56" />
                <line className="edge" x1="100" y1="56" x2="140" y2="82" />
                <line className="edge" x1="160" y1="32" x2="140" y2="82" />
                <circle className="node" cx="40"  cy="28" r="3" />
                <circle className="node" cx="100" cy="56" r="3.5" />
                <circle className="node" cx="160" cy="32" r="3" />
                <circle className="node" cx="60"  cy="80" r="3" />
                <circle className="node" cx="140" cy="82" r="3" />
              </svg>
            </div>
          );
        }
        if (kind === 'memory') {
          return (
            <div className="uc-viz uc-memory">
              {Array.from({ length: 32 }, (_, i) => (
                <div key={i} className="cell" style={{ animationDelay: `${((i * 0.17) % 3.2).toFixed(2)}s` }} />
              ))}
              <div className="latency">10ms · 10k+ entri</div>
            </div>
          );
        }
        if (kind === 'schedule') {
          const days = ['Sen','Sel','Rab','Kam','Jum','Sab','Min'];
          return (
            <div className="uc-viz uc-schedule">
              <div className="head"><span>Otomasi mingguan</span><span>04:28</span></div>
              <div className="days">
                {days.map((d, i) => (
                  <div key={d} className="day" style={{ animationDelay: `${(i * 0.7).toFixed(2)}s` }}>{d}</div>
                ))}
              </div>
            </div>
          );
        }
        if (kind === 'browse') {
          return (
            <div className="uc-viz uc-browse">
              <div className="url">
                <span className="lock" />
                <span className="domain">https://firecrawl.dev/scrape</span>
                <span className="caret" />
              </div>
              <div className="row"><span className="ln" style={{ flex: '0 0 64%' }} /></div>
              <div className="row"><span className="ln" style={{ flex: '0 0 80%' }} /></div>
              <div className="row"><span className="ln" style={{ flex: '0 0 50%' }} /></div>
            </div>
          );
        }
        if (kind === 'platforms') {
          const labels = ['Telegram','Discord','Slack','WhatsApp','iMessage','WeChat','Signal','Email','SMS'];
          return (
            <div className="uc-viz uc-platforms">
              {labels.map((l, i) => (
                <span key={l} className="pill" style={{ animationDelay: `${(i * 0.7).toFixed(2)}s` }}>{l}</span>
              ))}
            </div>
          );
        }
        if (kind === 'subagent') {
          return (
            <div className="uc-viz uc-subagent">
              <svg viewBox="0 0 200 108" preserveAspectRatio="xMidYMid meet">
                <line className="b" x1="100" y1="54" x2="32"  y2="22"  style={{ animationDelay: '0s' }} />
                <line className="b" x1="100" y1="54" x2="32"  y2="86"  style={{ animationDelay: '0.25s' }} />
                <line className="b" x1="100" y1="54" x2="168" y2="22"  style={{ animationDelay: '0.5s' }} />
                <line className="b" x1="100" y1="54" x2="168" y2="86"  style={{ animationDelay: '0.75s' }} />
                <circle className="parent" cx="100" cy="54" r="6" />
                <circle className="child" cx="32"  cy="22" r="3.2" style={{ animationDelay: '0.4s' }} />
                <circle className="child" cx="32"  cy="86" r="3.2" style={{ animationDelay: '0.65s' }} />
                <circle className="child" cx="168" cy="22" r="3.2" style={{ animationDelay: '0.9s' }} />
                <circle className="child" cx="168" cy="86" r="3.2" style={{ animationDelay: '1.15s' }} />
              </svg>
            </div>
          );
        }
        if (kind === 'skill') {
          return (
            <div className="uc-viz uc-skill">
              <div className="header">
                <span className="filebadge">SKILL.md</span>
                <span>auto-doc</span>
              </div>
              <div className="ln" />
              <div className="ln" />
              <div className="ln" />
              <div className="saved">SAVED ✓</div>
            </div>
          );
        }
        if (kind === 'home') {
          return (
            <div className="uc-viz uc-home">
              <svg viewBox="0 0 200 108" preserveAspectRatio="xMidYMid meet">
                <path className="frame" d="M30 50 L100 18 L170 50" />
                <rect className="frame" x="42" y="50" width="116" height="44" />
                <rect className="room" x="50"  y="58" width="24" height="20" style={{ animationDelay: '0s' }} />
                <rect className="room" x="80"  y="58" width="24" height="20" style={{ animationDelay: '0.5s' }} />
                <rect className="room" x="110" y="58" width="24" height="20" style={{ animationDelay: '1.0s' }} />
                <rect className="room" x="140" y="58" width="14" height="20" style={{ animationDelay: '1.5s' }} />
                <rect className="door" x="92" y="78" width="16" height="16" />
              </svg>
            </div>
          );
        }
        // files
        return (
          <div className="uc-viz uc-files">
            <svg viewBox="0 0 200 108" preserveAspectRatio="xMidYMid meet">
              <path className="folder" d="M16 30 H58 L66 38 H102 V92 H16 Z" />
              <path className="folder" d="M118 30 H160 L168 38 H200 V92 H118 Z" transform="translate(-32 0)" />
              <path className="folder" d="M132 30 H174 L182 38 H218 V92 H132 Z" transform="translate(-22 0)" />
              <rect className="file" x="22" y="46" width="36" height="3" rx="1.5" style={{ '--ox': '-22px', '--oy': '-30px', '--or': '-12deg', animationDelay: '0s' }} />
              <rect className="file" x="22" y="54" width="28" height="3" rx="1.5" style={{ '--ox': '40px',  '--oy': '-22px', '--or': '8deg',  animationDelay: '0.3s' }} />
              <rect className="file" x="22" y="62" width="32" height="3" rx="1.5" style={{ '--ox': '60px',  '--oy': '14px',  '--or': '-6deg', animationDelay: '0.6s' }} />
              <rect className="file" x="22" y="70" width="24" height="3" rx="1.5" style={{ '--ox': '-30px', '--oy': '12px',  '--or': '14deg', animationDelay: '0.9s' }} />
              <rect className="file" x="92" y="48" width="34" height="3" rx="1.5" style={{ '--ox': '24px',  '--oy': '-32px', '--or': '6deg',  animationDelay: '0.2s' }} />
              <rect className="file" x="92" y="56" width="26" height="3" rx="1.5" style={{ '--ox': '-24px', '--oy': '20px',  '--or': '-10deg',animationDelay: '0.5s' }} />
              <rect className="file" x="92" y="64" width="30" height="3" rx="1.5" style={{ '--ox': '14px',  '--oy': '24px',  '--or': '4deg',  animationDelay: '0.8s' }} />
              <rect className="file" x="148" y="48" width="32" height="3" rx="1.5" style={{ '--ox': '36px',  '--oy': '-18px', '--or': '-8deg', animationDelay: '0.4s' }} />
              <rect className="file" x="148" y="56" width="28" height="3" rx="1.5" style={{ '--ox': '-12px', '--oy': '24px',  '--or': '12deg', animationDelay: '0.7s' }} />
              <rect className="file" x="148" y="64" width="34" height="3" rx="1.5" style={{ '--ox': '20px',  '--oy': '-26px', '--or': '-4deg', animationDelay: '1.0s' }} />
            </svg>
          </div>
        );
      };

      return (
        <section id="filosofi" className="relative overflow-hidden bg-black" style={{ minHeight: 940 }}>
          <div className="absolute inset-0 z-[1] pointer-events-none" style={{ background: 'radial-gradient(ellipse at 30% 40%, rgba(229,50,45,0.05) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.85) 100%)' }} />
          <div className="absolute top-0 left-0 right-0 z-[2] pointer-events-none" style={{ height: 220, background: 'linear-gradient(to bottom, #000, transparent)' }} />
          <div className="absolute bottom-0 left-0 right-0 z-[2] pointer-events-none" style={{ height: 220, background: 'linear-gradient(to top, #000, transparent)' }} />

          <div className="relative z-[5] flex flex-col items-center px-5 md:px-6 lg:px-16" style={{ minHeight: 940 }}>
            <div className="pt-20 md:pt-24 flex flex-col items-center text-center max-w-3xl">
              <Mot.div
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.8, ease: EASE }}
                className="liquid-glass rounded-full px-3.5 py-1 text-xs font-medium font-body text-white/90 inline-block w-fit"
              >
                Apa yang bisa di-delegasikan
              </Mot.div>

              <BlurText
                as="h2"
                text="Yang bisa kamu serahkan, mulai hari pertama."
                className="mt-6 md:mt-8 text-3xl md:text-5xl lg:text-[4rem] font-heading text-white tracking-tight leading-[1.0] md:leading-[0.95]"
                style={{ letterSpacing: '-0.04em' }}
                delay={70}
              />

              <p className="mt-5 md:mt-7 max-w-xl text-white/70 font-body font-light text-sm md:text-base leading-relaxed">
                Bukan demo. Siap pakai dari hari pertama — pekerjaan nyata yang dikerjakan tim kamu tiap hari.
              </p>
            </div>

            <div className="flex-1" style={{ minHeight: 80 }} />

            <div className="w-full pb-16 md:pb-20 space-y-5 md:space-y-7">
              {/* TOP marquee — capability cards, scrolling reverse direction */}
              <Mot.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.7, ease: EASE }}
                className="uc-marquee uc-marquee-rev"
              >
                <div className="uc-marquee-track">
                  {[...capabilities, ...capabilities].map((c, i) => (
                    <div key={i} className="uc-card-text liquid-glass">
                      <CapViz kind={c.kind} />
                      <div className="num">{c.n} · Kapabilitas</div>
                      <div className="title">{c.title}</div>
                      <div className="body">{c.body}</div>
                    </div>
                  ))}
                </div>
              </Mot.div>

              {/* BOTTOM marquee — use case cards with vizes */}
              <Mot.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.7, ease: EASE }}
                className="uc-marquee"
              >
                <div className="uc-marquee-track">
                  {[...cases, ...cases].map((u, i) => (
                    <div key={i} className={`uc-card liquid-glass rounded-2xl p-5 md:p-7 flex flex-col${u.roadmap ? ' uc-card-roadmap' : ''}`} style={u.roadmap ? { opacity: 0.78 } : undefined}>
                      <UseCaseViz kind={u.kind} />
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg md:text-2xl font-heading text-white leading-tight" style={{ letterSpacing: '-0.02em' }}>{u.title}</h3>
                        {u.roadmap && (
                          <span className="text-[10px] md:text-[11px] font-mono uppercase tracking-[0.10em] text-white px-2 py-[3px] rounded" style={{ background: 'rgba(229, 50, 45, 0.85)' }}>
                            {u.roadmap}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 md:mt-4 text-white/65 font-body font-light text-[12px] md:text-sm leading-relaxed">{u.body}</p>
                      {u.cta && (
                        <a href={u.ctaHref} target="_blank" rel="noopener" className="mt-3 md:mt-4 text-[12px] md:text-sm font-body font-medium no-underline hover:underline self-start" style={{ color: '#E5322D' }}>
                          {u.cta}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </Mot.div>
              <div className="mt-10 flex justify-center px-5">
                <a href="use-cases.html" className="liquid-glass-strong rounded-full px-5 py-2.5 min-h-[44px] text-sm font-medium flex items-center gap-2 text-white">
                  Lihat cara orang pakai <ArrowUpRight size={14} stroke={2.2} />
                </a>
              </div>
            </div>
          </div>
        </section>
      );
    }

    // ─────────────────────── HOW IT WORKS ───────────────────────
    function FeaturesGrid() {
      const steps = [
        { n: 1, title: 'Pilih plan kamu',     body: 'Satu instance dedicated, langsung termasuk.', mock: 'plan' },
        { n: 2, title: 'Isi informasi',       body: 'Pilih channel. AI brain kami yang pilihkan.', mock: 'form' },
        { n: 3, title: 'Sistem auto-setup',   body: 'Server, persona, template — kami siapkan.', mock: 'setup' },
        { n: 4, title: 'Mulai pakai',         body: 'Buka Telegram, kirim pesan, beres.', mock: 'chat' },
      ];

      const Mock = ({ kind }) => {
        if (kind === 'plan') {
          return (
            <svg viewBox="0 0 200 110" className="howmock-plan" preserveAspectRatio="xMidYMid meet">
              <rect x="40" y="20" width="120" height="70" rx="8" fill="none" stroke="#E5322D" strokeWidth="1.8" strokeDasharray="4 4" />
              <circle cx="100" cy="55" r="14" fill="none" stroke="#E5322D" strokeWidth="1.8" />
              <path className="check" d="M93 55 L99 61 L108 50" fill="none" stroke="#E5322D" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          );
        }
        if (kind === 'form') {
          return (
            <div className="howmock-form">
              <div className="field"><span className="label">Channel</span><span className="value">Telegram</span></div>
              <div className="field"><span className="label">AI Brain</span><span className="value">Hand-picked ⌄</span></div>
              <div className="field"><span className="label">Bot Token</span><span className="value" style={{ opacity: 0.6 }}>[opsional]</span></div>
            </div>
          );
        }
        if (kind === 'setup') {
          return (
            <div className="howmock-setup">
              <div className="bar"><div className="fill" /></div>
              <div className="task"><span className="check">✓</span>VPS provisioned</div>
              <div className="task"><span className="check">✓</span>Tools tersambung</div>
              <div className="task"><span className="check">✓</span>Voice tuned</div>
            </div>
          );
        }
        return (
          <div className="howmock-chat">
            <div className="bubble user">Bikin notulen meeting tadi</div>
            <div className="bubble dots">
              <span className="dot" /><span className="dot" /><span className="dot" />
            </div>
            <div className="bubble reply">Beres — 4 action items.</div>
            <div className="pdf-chip">
              <span className="ic">PDF</span>
              <span className="nm">notulen-meeting.pdf</span>
            </div>
            <div className="email-toast">
              <span className="env">✉</span> Juga ke email kamu
            </div>
          </div>
        );
      };

      return (
        <section className="relative overflow-hidden py-20 md:py-32 px-5 md:px-6 lg:px-16 bg-black">
          <DottedVideo
            src="assets/empat-langkah-bg.mp4"
            color="#E5322D"
            cellSize={6}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 0, background: '#000', opacity: 0.55 }}
          />
          <FadeTop /> <FadeBottom />
          <div className="relative z-10 max-w-7xl mx-auto">
            <div className="flex flex-col items-center text-center mb-14 md:mb-20">
              <div className="liquid-glass rounded-full px-3.5 py-1 text-xs font-medium font-body text-white/90">
                Cara kerjanya
              </div>
              <BlurText
                as="h2"
                text="Empat langkah. Delapan menit."
                className="mt-5 md:mt-6 text-3xl md:text-5xl lg:text-6xl font-heading text-white tracking-tight leading-[1.0] md:leading-[0.95]"
                style={{ letterSpacing: '-0.04em' }}
                delay={70}
              />
            </div>

            <div className="how-cycle grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 relative">
              {/* progress line behind badges (lg only) */}
              <div className="hidden lg:block how-line" />

              {steps.map((s, i) => (
                <Mot.div key={s.n}
                  data-i={s.n}
                  initial={{ opacity: 0, x: i % 2 ? 36 : -36, y: 24 }}
                  whileInView={{ opacity: 1, x: 0, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.7, ease: EASE, delay: 0.12 * i }}
                  className="flex flex-col items-center text-center relative z-10"
                >
                  <div
                    className="badge w-16 h-16 rounded-full flex items-center justify-center text-3xl font-heading"
                    style={{ letterSpacing: '-0.02em' }}
                  >
                    {s.n}
                  </div>

                  <div className="how-mockbox liquid-glass card-glow mt-6 md:mt-8 w-full rounded-2xl flex items-center justify-center">
                    <div style={{ width: '92%', maxHeight: 200, height: '100%' }}>
                      <Mock kind={s.mock} />
                    </div>
                  </div>

                  <h3 className="mt-6 md:mt-7 text-xl md:text-2xl font-heading text-white leading-tight" style={{ letterSpacing: '-0.02em' }}>{s.title}</h3>
                  <p className="mt-2 md:mt-3 text-[15px] md:text-base text-white/60 font-body font-light leading-relaxed max-w-none md:max-w-[34ch]">{s.body}</p>
                </Mot.div>
              ))}
            </div>

          </div>
        </section>
      );
    }

    // ─────────────────────── PRICING ───────────────────────
    // Honesty lock (CLAUDE.md): the counter MUST read a REAL subscription
    // count. This fetches /api/public/subscription-count (active paid
    // subscriptions, edge-cached 5 min). If the fetch fails the banner
    // renders NOTHING — we never show a fabricated number.
    function LimitedSeats() {
      const TOTAL = 1000;
      const [paid, setPaid] = useState(null);

      useEffect(() => {
        let alive = true;
        // Abort a slow/hanging API after 3s so the banner never waits on it.
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3000);
        fetch('/api/public/subscription-count', { signal: ctrl.signal })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (!alive || !data) return;
            if (typeof data.paid_customers === 'number' && data.paid_customers >= 0) {
              setPaid(data.paid_customers);
            }
          })
          .catch(() => {})
          .finally(() => clearTimeout(t));
        return () => { alive = false; clearTimeout(t); };
      }, []);

      if (paid === null) return null;

      const remaining = Math.max(0, TOTAL - paid);
      const pct = (remaining / TOTAL) * 100;

      return (
        <Mot.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, ease: EASE }}
          className="liquid-glass seats-banner"
        >
          <div className="seats-stack">
            <p className="seats-caption">Harga launch — batch pertama 1.000 pelanggan.</p>
            <div className="seats-num-big pulse" aria-label={`${remaining.toLocaleString('id-ID')} dari 1.000 seat tersisa`}>
              <CountUp to={remaining} duration={1600} delay={120} />
            </div>
            <p className="seats-sub">dari 1.000 seat tersisa di harga launch</p>
            <div className="seats-bar">
              <div className="seats-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="seats-rise">
              Setelah 1.000 pertama, setup Library Lengkap naik dari Rp 799rb ke <strong>Rp 999rb</strong>.
            </div>
            <div className="seats-foot">
              Counter terhubung ke data pembayaran. Update tiap beberapa menit.
            </div>
          </div>
        </Mot.div>
      );
    }

    // ─────────────────────── PRICE BREAKDOWN MODAL ───────────────────────
    function PriceBreakdownModal({ open, onClose, tier }) {
      const dialogRef = React.useRef(null);
      const titleId = React.useId();

      React.useEffect(() => {
        if (!open) return;
        const prevFocus = document.activeElement;
        const onKey = (e) => {
          if (e.key === 'Escape') { onClose(); return; }
          if (e.key === 'Tab') {
            // Focus trap (WCAG 2.4.3/2.1.2): keep Tab inside the dialog.
            const sel = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';
            const list = Array.from(dialogRef.current?.querySelectorAll(sel) || []).filter((el) => el.offsetParent !== null);
            if (!list.length) return;
            const first = list[0], last = list[list.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
          }
        };
        document.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => {
          const closeBtn = dialogRef.current?.querySelector('[data-close]');
          closeBtn?.focus();
        });
        return () => {
          document.removeEventListener('keydown', onKey);
          document.body.style.overflow = prev;
          // Restore focus to whatever opened the dialog.
          if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
        };
      }, [open, onClose]);

      if (!open || !tier) return null;

      const setupRupiah = tier.setupIdr;
      const fmt = (n) => 'Rp ' + n.toLocaleString('id-ID');
      const yearWithout = setupRupiah + 99000 * 12;
      const yearWith    = setupRupiah + (99000 + 49000) * 12;

      return (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          style={{
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            animation: 'modalFadeIn 200ms ease',
          }}
        >
          <div
            ref={dialogRef}
            className="liquid-glass-strong rounded-2xl p-6 md:p-7 w-full max-w-[480px] max-h-[90vh] overflow-y-auto"
            style={{ background: '#0a0a0a', borderColor: 'rgba(229,50,45,0.35)' }}
          >
            <div className="flex items-start justify-between gap-4">
              <h3 id={titleId} className="text-lg md:text-xl font-heading text-white" style={{ letterSpacing: '-0.02em' }}>
                {tier.name} — Rincian Biaya
              </h3>
              <button
                data-close
                onClick={onClose}
                aria-label="Tutup rincian biaya"
                className="w-7 h-7 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 text-lg leading-none"
                style={{ border: '1px solid rgba(255,255,255,0.18)' }}
              >
                ×
              </button>
            </div>

            <div className="mt-6 space-y-5 font-body text-sm text-white/85">
              {/* Setup */}
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <div className="text-white/85">Biaya setup</div>
                  <div className="text-xs text-white/45 mt-0.5">sekali bayar</div>
                </div>
                <div className="text-white font-medium whitespace-nowrap">{fmt(setupRupiah)}</div>
              </div>

              <div className="border-t border-white/[0.08]" />

              {/* Hosting */}
              <div>
                <div className="flex items-baseline justify-between gap-4">
                  <div className="text-white/85">Hosting bulanan</div>
                  <div className="text-white font-medium whitespace-nowrap">+{fmt(99000)}/bulan</div>
                </div>
                <ul className="mt-2 text-xs text-white/55 space-y-1 list-none">
                  <li>· Auto-pause kalau tidak aktif 30 hari</li>
                  <li>· Stop kapan saja, tanpa penalti</li>
                </ul>
              </div>

              {/* Always-On */}
              <div>
                <div className="flex items-baseline justify-between gap-4">
                  <div className="text-white/85">Always-On <span className="text-white/45 text-xs">(opsional)</span></div>
                  <div className="text-white font-medium whitespace-nowrap">+{fmt(49000)}/bulan</div>
                </div>
                <ul className="mt-2 text-xs text-white/55 space-y-1 list-none">
                  <li>· VPS aktif 24/7, skip auto-suspend</li>
                  <li>· Untuk yang pakai agent setiap hari</li>
                </ul>
              </div>

              <div className="border-t border-white/[0.08]" />

              {/* Year-1 totals */}
              <div className="space-y-1.5">
                <div className="text-xs text-white/55 uppercase tracking-wider mb-2">Estimasi tahun pertama</div>
                <div className="flex items-baseline justify-between gap-4">
                  <div className="text-white/75">Tanpa Always-On</div>
                  <div className="text-white whitespace-nowrap">{fmt(yearWithout)}</div>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <div className="text-white/75">Dengan Always-On</div>
                  <div className="text-white whitespace-nowrap">{fmt(yearWith)}</div>
                </div>
              </div>

              <p className="mt-4 text-xs italic text-white/55 leading-relaxed">
                Tidak ada biaya tersembunyi. Pause dan stop kapan saja.
              </p>
            </div>
          </div>
        </div>
      );
    }

    // ─────────────────────── CONNECTED APPS PREVIEW ───────────────────────
    function ConnectedAppsPreview({ apps, totalCount }) {
      const visible = apps.slice(0, 5);
      const hidden = Math.max(0, totalCount - visible.length);
      return (
        <div className="flex items-center flex-wrap gap-1.5">
          {visible.map((name) => (
            <span
              key={name}
              aria-label={`Terhubung ke ${name}`}
              className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-mono uppercase tracking-[0.06em] text-white/65"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {name}
            </span>
          ))}
          {hidden > 0 && (
            <span
              aria-label={`Plus ${hidden} aplikasi lain`}
              className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-mono"
              style={{ background: 'rgba(229,50,45,0.10)', border: '1px solid rgba(229,50,45,0.25)', color: '#E5322D' }}
            >
              +{hidden}
            </span>
          )}
        </div>
      );
    }

    function PricingCard({ tier, index, onShowBreakdown }) {
      const isFeatured = !!tier.featured;
      const isDecoy = !!tier.decoy;
      // Decoy (Bare): visually subordinate — muted + slightly smaller so the
      // eye skips it toward the recommended tier. Featured (Library Lengkap):
      // solid premium card with a metallic gradient border + pulsing glow.
      const restScale = isFeatured ? 1.03 : (isDecoy ? 0.95 : 1);
      const restOpacity = isDecoy ? 0.62 : 1;
      return (
        <Mot.div
          initial={{ opacity: 0, y: 16, scale: restScale }}
          whileInView={{ opacity: restOpacity, y: 0, scale: restScale }}
          whileHover={isDecoy ? { opacity: 0.92, scale: 0.97 } : undefined}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.05 * index }}
          className={`rounded-2xl p-6 md:p-7 flex flex-col relative pc-card ${isFeatured ? 'pc-card-featured' : 'liquid-glass'}`}
          style={
            isFeatured
              ? {
                  overflow: 'visible',
                  border: '1px solid transparent',
                  backgroundImage:
                    'linear-gradient(#0e0e0e, #0e0e0e), linear-gradient(135deg, rgba(255,255,255,0.62), rgba(229,50,45,0.95) 42%, rgba(150,150,162,0.55) 68%, rgba(229,50,45,0.85))',
                  backgroundOrigin: 'border-box',
                  backgroundClip: 'padding-box, border-box',
                  WebkitBackgroundClip: 'padding-box, border-box',
                  animation: 'priceGlowPulse 3.8s ease-in-out infinite',
                }
              : (isDecoy ? { filter: 'saturate(0.55)' } : undefined)
          }
        >
          {isFeatured && (
            <div
              className="absolute -top-3 right-5 px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-[0.18em] text-white whitespace-nowrap"
              style={{
                background: '#E5322D',
                zIndex: 5,
                boxShadow: '0 6px 20px -4px rgba(229,50,45,0.7), 0 0 0 1px rgba(229,50,45,0.5)',
              }}
            >
              Rekomendasi kami
            </div>
          )}

          {/* 1. Tier name */}
          <div>
            <h3 className="text-2xl md:text-3xl font-heading text-white" style={{ letterSpacing: '-0.03em' }}>
              {tier.name}
            </h3>
          </div>

          {/* 2. Price breakdown — setup + hosting + Bulan 1 total + recurring */}
          <div className="mt-5 flex flex-col gap-2">
            {/* Setup (one-time, with strikethrough discount) */}
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-body font-light text-white/55">Setup (sekali bayar)</span>
              <span className="font-heading text-white text-base md:text-lg" style={{ letterSpacing: '-0.02em' }}>
                {tier.priceStrike && (
                  <span className="text-xs font-body font-light text-white/55 line-through mr-2" style={{ textDecorationColor: 'rgba(229,50,45,0.75)' }}>
                    {tier.priceStrike}
                  </span>
                )}
                {tier.priceLabel}
              </span>
            </div>
            {/* Hosting per bulan */}
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-body font-light text-white/55">Hosting per bulan</span>
              <span className="font-heading text-white text-base md:text-lg" style={{ letterSpacing: '-0.02em' }}>
                {tier.hostingMonth || 'Rp 99rb'}
              </span>
            </div>
            {/* Divider */}
            <div className="h-px bg-white/10 my-1" />
            {/* Bulan 1 total */}
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-mono uppercase tracking-[0.10em] text-white/65">Bulan 1</span>
              <span className="font-heading text-2xl md:text-3xl pc-price-month1" style={{ letterSpacing: '-0.03em', color: '#E5322D' }}>
                {tier.month1Total}
              </span>
            </div>
          </div>

          {/* 3. Yang kamu dapat (outcomes) — the main focus of the card */}
          <div className="mt-7">
            <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/60 mb-3">
              Yang kamu dapat
            </div>
            {tier.inheritFrom && (
              <p className="text-xs font-body font-medium text-white/75 mb-3 italic">
                Semua yang ada di {tier.inheritFrom}, plus:
              </p>
            )}
            <ul className="space-y-3 list-none pc-outcomes">
              {tier.outcomes.map((o, oi) => (
                <li key={oi} className="flex items-start gap-3 text-[15px] md:text-base font-body leading-relaxed">
                  <span
                    aria-hidden="true"
                    className="mt-[8px] block w-1.5 h-1.5 flex-shrink-0 rounded-full"
                    style={{ background: isFeatured ? '#E5322D' : 'rgba(229,50,45,0.6)' }}
                  />
                  <span className="text-white/90">{o}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 5. Connected apps preview */}
          <div className="mt-6">
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45 mb-2">
              Terhubung ke
            </div>
            <ConnectedAppsPreview apps={tier.apps} totalCount={tier.appsTotal} />
          </div>

          <div className="flex-1" />

          {/* 6. CTA + 7. breakdown link.
              Pricing CTAs route to self-serve checkout with the tier
              pre-selected (checkout.html?plan=<slug>); checkout.html PLANS +
              create-invoice both speak the v1.4 slugs. Same-tab internal nav;
              the target/rel test below only fires for any http/mailto href. */}
          <a
            href={tier.ctaHref}
            target={/^https?:|^mailto:/.test(tier.ctaHref) ? '_blank' : undefined}
            rel={/^https?:/.test(tier.ctaHref) ? 'noopener' : undefined}
            className={`cta-tactile mt-7 md:mt-8 rounded-full px-5 py-3 text-sm font-medium flex items-center justify-center gap-2 no-underline${isFeatured ? ' cta-pulse' : ''}`}
            style={
              isFeatured
                ? { background: '#E5322D', color: '#fff', border: '1px solid #E5322D' }
                : { background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.28)' }
            }
          >
            {tier.cta} <ArrowUpRight size={14} stroke={2.2} />
          </a>

          <button
            type="button"
            onClick={onShowBreakdown}
            aria-haspopup="dialog"
            className="mt-3 text-xs font-body text-white/55 hover:text-white/85 underline-offset-4 hover:underline self-center bg-transparent border-0 cursor-pointer"
          >
            Lihat rincian biaya →
          </button>
        </Mot.div>
      );
    }

    // ─────────────────────── CHAT vs AGENT ───────────────────────
    function ChatVsAgentSection() {
      // Each row = one bullet. `have: true` shows ✓ in red; false shows ✗
      // muted. Mobile order puts the highlighted (us) card first; desktop
      // grid restores the natural left/center/right read order.
      const cards = [
        {
          name: 'AI agent biasa',
          subtitle: 'Chat AI',
          subtitleAside: 'generic, tanpa konteks bisnis',
          orderMobile: 'order-2',
          orderDesktop: 'md:order-1',
          rows: [
            { have: true,  text: 'Cepat menjawab pertanyaan dengan teks' },
            { have: false, text: 'Satu agent generik — tidak ada planner, builder, atau reviewer yang kerja paralel' },
            { have: false, text: 'Tidak bisa scrape web, kontrol browser, atau jalankan cron' },
            { have: false, text: 'Berhenti kerja saat kamu tutup tab' },
            { have: false, text: 'Tiap percakapan mulai dari nol — tidak ingat workflow kamu' },
          ],
          ariaLabel: 'Perbandingan AI agent biasa',
        },
        {
          name: 'weuseai.agent',
          subtitle: 'Agent AI',
          subtitleAside: 'multi-agent paralel, milik kamu',
          featured: true,
          spanWide: true,
          orderMobile: 'order-1',
          orderDesktop: 'md:order-2',
          rows: [
            { have: true, text: 'Tim 10 spesialis yang kerja paralel — periset, penulis, penyusun slide, satu komando' },
            { have: true, text: 'Nge-chat kamu duluan — briefing pagi jam 7, ringkasan sore jam 6, tiap hari' },
            { have: true, text: 'Riset web mendalam: banding sumber, rangkum jadi keputusan' },
            { have: true, text: 'Slide deck dan dokumen jadi dari satu perintah' },
            { have: true, text: '190+ template Indonesia — PPN, BPJS, KBLI, IDX, siap isi' },
            { have: true, text: 'Kirim voice note, terima kerjaan jadi' },
            { have: true, text: 'Ingat lintas hari — kamu tidak pernah mengulang konteks' },
            { have: true, text: 'Jalan di server pribadi kamu, bukan shared' },
            { have: true, text: 'Di-tune ke gaya nulis dan pekerjaan kamu, satu per satu' },
          ],
          ariaLabel: 'Perbandingan weuseai.agent (paket kami)',
        },
        {
          name: 'Claude Pro',
          subtitle: 'Chat AI',
          subtitleAside: 'satu bot, satu giliran',
          orderMobile: 'order-3',
          orderDesktop: 'md:order-3',
          rows: [
            { have: true,  text: 'Reasoning baik untuk percakapan satu sesi' },
            { have: false, text: 'Bukan multi-agent — tanpa planner, worker, reviewer paralel' },
            { have: false, text: 'Tidak akses browser, file system, atau scheduler' },
            { have: false, text: 'Memori reset antar sesi' },
            { have: false, text: 'Projects bantu sedikit, bukan kerja autonomous' },
          ],
          ariaLabel: 'Perbandingan Claude Pro',
        },
      ];

      return (
        <section id="vs-chat" className="relative overflow-hidden py-20 md:py-32 px-5 md:px-6 lg:px-16 bg-black">
          <DottedVideo
            src="/assets/chat-vs-agent-automations.mp4"
            color="#E5322D"
            cellSize={6}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 1, background: '#000' }}
          />
          <FadeTop /> <FadeBottom />
          <div className="relative z-10 max-w-6xl mx-auto">
            <div className="flex flex-col items-center text-center mb-14 md:mb-20">
              <div
                className="liquid-glass rounded-full px-3.5 py-1 text-xs font-medium font-body text-white/90"
                style={{ borderColor: 'rgba(229, 50, 45, 0.45)' }}
              >
                Chat vs Agent
              </div>
              <BlurText
                as="h2"
                text="Chat menjawab. Agent mengerjakan."
                className="mt-5 md:mt-6 text-4xl md:text-6xl lg:text-7xl font-heading text-white tracking-tight leading-[1.0] md:leading-[0.95] max-w-4xl"
                style={{ letterSpacing: '-0.04em' }}
                delay={70}
              />
              <p className="mt-5 md:mt-6 max-w-xl text-white/55 font-body font-light text-sm md:text-base leading-relaxed">
                Menjawab itu mudah. Mengerjakan itu beda kelas. ChatGPT dan Claude berhenti saat kamu berhenti ngetik — tim agent kamu baru mulai.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-5 md:gap-6 items-stretch">
              {cards.map((c, i) => {
                const isFeatured = !!c.featured;
                const isWide = !!c.spanWide;
                return (
                  <Mot.div
                    key={c.name}
                    role="group"
                    aria-label={c.ariaLabel}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ duration: 0.6, ease: EASE, delay: 0.05 * i }}
                    className={`liquid-glass rounded-3xl ${isWide ? 'p-8 md:p-12 md:col-span-2' : 'p-7 md:p-9'} flex flex-col ${c.orderMobile} ${c.orderDesktop}`}
                    style={
                      isFeatured
                        ? {
                            borderColor: 'rgba(229, 50, 45, 0.65)',
                            boxShadow:
                              '0 0 0 1px rgba(229,50,45,0.45), 0 18px 60px -25px rgba(229,50,45,0.55), 0 0 80px -30px rgba(229,50,45,0.35)',
                          }
                        : { opacity: 0.92 }
                    }
                  >
                    <h3
                      className={`font-heading text-white leading-[1.1] ${isWide ? 'text-2xl md:text-4xl' : 'text-xl md:text-2xl'}`}
                      style={{ letterSpacing: '-0.02em' }}
                    >
                      {c.name}
                    </h3>
                    <div className="mt-1 font-body font-light text-white/65 text-sm">
                      <span className="text-white/85">{c.subtitle}</span>
                      <span className="text-white/45"> {c.subtitleAside}</span>
                    </div>

                    <ul className={`${isWide ? 'mt-6 md:mt-8 space-y-3.5' : 'mt-6 md:mt-8 space-y-4'} flex-1`}>
                      {c.rows.map((r, ri) => (
                        <li key={ri} className="flex items-start gap-3 text-sm md:text-base font-body font-light leading-relaxed">
                          <span
                            aria-hidden="true"
                            className="mt-[3px] inline-flex items-center justify-center rounded-full flex-shrink-0 font-bold w-4 h-4 text-[10px]"
                            style={
                              r.have
                                ? { background: 'rgba(229,50,45,0.18)', color: '#E5322D' }
                                : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }
                            }
                          >
                            {r.have ? '✓' : '✗'}
                          </span>
                          <span className={r.have ? 'text-white/85' : 'text-white/55'}>
                            <span className="sr-only">{r.have ? 'Ya: ' : 'Tidak: '}</span>
                            {r.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Mot.div>
                );
              })}
            </div>

            <p className="mt-10 md:mt-14 text-center text-xs md:text-sm italic text-white/55 font-body font-light max-w-2xl mx-auto leading-relaxed">
              Chat AI berhenti kerja saat kamu berhenti ngetik. Agent AI baru mulai — multi-agent paralel, scrape, schedule, deploy, sambil kamu tidur.
            </p>

            <div className="mt-7 md:mt-9 flex justify-center">
              <a
                href="#pricing"
                className="rounded-full px-5 py-3 text-sm font-medium flex items-center gap-2 no-underline text-white"
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.28)' }}
              >
                Lihat semua paket <ArrowUpRight size={14} stroke={2.2} />
              </a>
            </div>
          </div>
        </section>
      );
    }

    // ─────────────────────── COST COMPARISON (A1) ───────────────────────
    // Frames weuseai.agent against the realistic SMB owner alternative:
    // AI agent biasa (generic chat AI subscription) + asisten manusia
    // part-time. Six rows lock in: Bahasa native, 10 agents, 24/7,
    // persistent memory, setup time, cost. weuseai column hits ✓ across
    // all + Rp 99rb/bulan at the foot.
    // ─────────────────────── COST COMPARISON ───────────────────────
    function CostComparisonSection() {
      const rows = [
        {
          label: 'Bahasa native',
          us:    { mark: '✓', aside: 'kamu form, default WIB' },
          gpt:   { mark: '~', aside: 'Inggris dulu, terjemahan kedua' },
          human: { mark: '✓', aside: 'tergantung orangnya' },
        },
        {
          label: '10 agent spesialis',
          us:    { mark: '✓', aside: 'Pro, Doc, Slide, Trade, Researcher, …' },
          gpt:   { mark: '✗', aside: 'satu agent generik' },
          human: { mark: '✗', aside: 'satu orang, satu fokus' },
        },
        {
          label: '24/7',
          us:    { mark: '✓', aside: 'jalan saat kamu tidur' },
          gpt:   { mark: '~', aside: 'cuma saat kamu chat' },
          human: { mark: '✗', aside: 'jam kerja saja' },
        },
        {
          label: 'Persistent memory',
          us:    { mark: '✓', aside: 'ingat lintas sesi, lintas hari' },
          gpt:   { mark: '~', aside: 'memori terbatas per chat' },
          human: { mark: '~', aside: 'ingatan orang, lupa juga' },
        },
        {
          label: 'Waktu setup',
          us:    { mark: '5 menit',     plain: true },
          gpt:   { mark: 'langsung',    plain: true, aside: 'tapi tanpa workflow kamu' },
          human: { mark: '1–2 minggu',  plain: true, aside: 'interview, kontrak, training' },
        },
        {
          label: 'Biaya',
          us:    { mark: 'Rp 99rb/bulan',      plain: true, accent: true, aside: 'hosting flat, BYOK LLM' },
          gpt:   { mark: '$20-30/bulan',       plain: true, aside: '≈ Rp 320-480rb' },
          human: { mark: 'Rp 5–8jt/bulan',     plain: true, aside: 'gaji asisten part-time Jakarta' },
        },
      ];

      const Mark = ({ cell, isUs }) => {
        if (cell.plain) {
          return (
            <div className="flex flex-col gap-0.5">
              <span
                className={`font-heading ${cell.accent ? 'text-white' : 'text-white/85'}`}
                style={{ fontSize: cell.accent ? '1.5rem' : '1.1rem', letterSpacing: '-0.01em' }}
              >
                {cell.mark}
              </span>
              {cell.aside ? (
                <span className="text-[13px] text-white/50 font-body font-light leading-snug">
                  {cell.aside}
                </span>
              ) : null}
            </div>
          );
        }
        const ok = cell.mark === '✓';
        const partial = cell.mark === '~';
        const bg = ok
          ? (isUs ? 'rgba(229,50,45,0.22)' : 'rgba(255,255,255,0.12)')
          : partial
            ? 'rgba(255,255,255,0.08)'
            : 'rgba(255,255,255,0.04)';
        const fg = ok
          ? (isUs ? '#E5322D' : 'rgba(255,255,255,0.78)')
          : partial
            ? 'rgba(255,255,255,0.55)'
            : 'rgba(255,255,255,0.32)';
        return (
          <div className="flex flex-col gap-1">
            <span
              aria-hidden="true"
              className="inline-flex items-center justify-center rounded-full w-5 h-5 text-[11px] font-bold"
              style={{ background: bg, color: fg }}
            >
              {ok ? '✓' : partial ? '~' : '✗'}
            </span>
            {cell.aside ? (
              <span className="text-[13px] text-white/50 font-body font-light leading-snug">
                {cell.aside}
              </span>
            ) : null}
          </div>
        );
      };

      const cols = [
        { key: 'us',    label: 'weuseai.agent', tagline: 'agent kamu, di server kamu', isUs: true },
        { key: 'gpt',   label: 'AI agent biasa', tagline: 'generic, tanpa konteks bisnis' },
        { key: 'human', label: 'Asisten manusia', tagline: 'part-time, jam kerja' },
      ];

      return (
        <section id="vs-cost" className="relative overflow-hidden py-24 md:py-36 px-5 md:px-6 lg:px-16 bg-black">
          <FadeTop /> <FadeBottom />
          <div className="relative z-10 max-w-7xl mx-auto">
            <div className="flex flex-col items-center text-center mb-14 md:mb-20">
              <div
                className="liquid-glass rounded-full px-3.5 py-1 text-xs font-medium font-body text-white/90"
                style={{ borderColor: 'rgba(229, 50, 45, 0.45)' }}
              >
                Ongkos vs hasil
              </div>
              <BlurText
                as="h2"
                text="Rp 99rb/bulan. Bukan Rp 5–8jt."
                className="mt-5 md:mt-6 text-4xl md:text-6xl lg:text-7xl font-heading text-white tracking-tight leading-[1.0] md:leading-[0.95] max-w-4xl"
                style={{ letterSpacing: '-0.04em' }}
                delay={70}
              />
              <p className="mt-5 md:mt-6 max-w-xl text-white/55 font-body font-light text-sm md:text-base leading-relaxed">
                Asisten manusia part-time di Jakarta: Rp 5–8 juta sebulan, dan pulang jam 5. Tim agent kamu: Rp 99rb sebulan, dan tidak pulang.
              </p>
            </div>

            {/* Desktop / tablet: table. Mobile: stacked cards (handled below). */}
            <div className="hidden md:block">
              <div className="liquid-glass rounded-2xl overflow-hidden">
                <div className="grid grid-cols-4 gap-0 border-b border-white/8">
                  <div className="px-5 py-5 text-xs uppercase tracking-wider text-white/45 font-body font-medium">
                    Fitur
                  </div>
                  {cols.map((c) => (
                    <div
                      key={c.key}
                      className="px-5 py-5"
                      style={
                        c.isUs
                          ? { background: 'rgba(229,50,45,0.07)', borderLeft: '1px solid rgba(229,50,45,0.35)', borderRight: '1px solid rgba(229,50,45,0.35)' }
                          : {}
                      }
                    >
                      <div className={`font-heading ${c.isUs ? 'text-white' : 'text-white/85'} text-lg md:text-2xl leading-[1.15]`} style={{ letterSpacing: '-0.02em' }}>
                        {c.label}
                      </div>
                      <div className="mt-1 text-[11px] text-white/45 font-body font-light">
                        {c.tagline}
                      </div>
                    </div>
                  ))}
                </div>
                {rows.map((r, ri) => (
                  <div
                    key={r.label}
                    className={`grid grid-cols-4 gap-0 ${ri < rows.length - 1 ? 'border-b border-white/6' : ''}`}
                  >
                    <div className="px-6 py-6 md:px-7 md:py-7 text-base md:text-lg font-body text-white/85 leading-snug">
                      {r.label}
                    </div>
                    {cols.map((c) => (
                      <div
                        key={c.key}
                        className="px-5 py-5"
                        style={
                          c.isUs
                            ? { background: 'rgba(229,50,45,0.05)', borderLeft: '1px solid rgba(229,50,45,0.18)', borderRight: '1px solid rgba(229,50,45,0.18)' }
                            : {}
                        }
                      >
                        <Mark cell={r[c.key]} isUs={c.isUs} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile: 3 stacked cards. weuseai goes first so it leads. */}
            <div className="md:hidden grid grid-cols-1 gap-5">
              {cols.map((c, i) => (
                <Mot.div
                  key={c.key}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.55, ease: EASE, delay: 0.04 * i }}
                  className="liquid-glass rounded-2xl p-6"
                  style={
                    c.isUs
                      ? {
                          borderColor: 'rgba(229,50,45,0.55)',
                          boxShadow: '0 0 0 1px rgba(229,50,45,0.4), 0 14px 50px -25px rgba(229,50,45,0.45)',
                        }
                      : { opacity: 0.92 }
                  }
                >
                  <div className="font-heading text-white text-lg leading-[1.1]" style={{ letterSpacing: '-0.02em' }}>
                    {c.label}
                  </div>
                  <div className="mt-1 text-xs text-white/55 font-body font-light">
                    {c.tagline}
                  </div>
                  <ul className="mt-5 space-y-3.5">
                    {rows.map((r) => (
                      <li key={r.label} className="flex items-start justify-between gap-3">
                        <span className="text-sm text-white/65 font-body font-light leading-snug max-w-[55%]">
                          {r.label}
                        </span>
                        <span className="text-right">
                          <Mark cell={r[c.key]} isUs={c.isUs} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </Mot.div>
              ))}
            </div>

            <p className="mt-10 md:mt-14 text-center text-xs md:text-sm italic text-white/55 font-body font-light max-w-2xl mx-auto leading-relaxed">
              Setup sekali bayar. Hosting Rp 99rb/bulan. Bisa pause kapan saja dari dashboard.
            </p>

            <div className="mt-7 md:mt-9 flex justify-center">
              <a
                href="#pricing"
                className="rounded-full px-5 py-3 text-sm font-medium flex items-center gap-2 no-underline text-white"
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.28)' }}
              >
                Lihat paket lengkap <ArrowUpRight size={14} stroke={2.2} />
              </a>
            </div>
          </div>
        </section>
      );
    }

    // SecurityNarrativeSection ("Keamanan" — Privat. Terenkripsi. Milik
    // kamu.) removed 2026-05-18 per founder direction — the section was
    // judged unnecessary on the landing page.

    // konten-style interactive toy — drag to see how much ONE agent absorbs.
    // Honest: shows task VOLUME the agent handles + the flat hosting price; never
    // invents earnings/savings (we are not a payout platform). No new price string.
    function ValueSlider() {
      const [tasks, setTasks] = useState(40);
      const pct = ((tasks - 5) / (200 - 5)) * 100;
      return (
        <div className="vslider" style={{ '--vpct': pct + '%' }}>
          <div className="vslider-eyebrow">Geser — lihat berapa yang dia tangani</div>
          <div className="vslider-readout" aria-live="polite">
            Kasih dia <b>{tasks}</b> tugas seminggu — satu agent yang menangani. Hosting tetap <b className="vslider-flat">Rp 99rb/bulan</b>.
          </div>
          <div className="vslider-track" aria-hidden="true"><span className="vslider-fill" /></div>
          <input className="vslider-input" type="range" min="5" max="200" step="5" value={tasks}
            onChange={(e) => setTasks(+e.target.value)} aria-label="Tugas per minggu"
            aria-valuetext={`${tasks} tugas per minggu`} />
        </div>
      );
    }

    function Pricing() {
      const [breakdownTier, setBreakdownTier] = React.useState(null);

      // Phase A feature-bundle tiers (2026-05-28). Mirrors TIERS in
      // supabase/functions/_shared/tier-personas.ts. voice-starter /
      // library-full / done-for-you are self-serve; enterprise is a
      // contact-only card rendered separately below.
      const tiers = [
        {
          name: 'Bare Agent',
          slug: 'bare',
          decoy: true,
          tagline: 'Versi paling dasar. Tanpa persona, tanpa voice.',
          priceLabel: 'Rp 99rb',
          setupIdr: 99_000,
          setupAside: 'biaya setup sekali bayar',
          hostingMonth: 'Rp 99rb',
          month1Total: 'Rp 198rb',
          recurringLabel: 'Rp 99rb/bulan',
          persona: 'Buat kamu yang cuma mau asisten umum, tanpa spesialis.',
          outcomes: [
            'Asisten AI umum di Telegram',
            'Tanpa persona spesialis',
            'Tanpa voice note',
          ],
          apps: ['Telegram'],
          appsTotal: 1,
          cta: 'Mulai Bare Agent',
          ctaHref: 'checkout.html?plan=bare',
          featured: false,
        },
        {
          name: 'Solo Starter',
          slug: 'solo',
          tagline: '3 persona inti, tanpa voice.',
          priceLabel: 'Rp 399rb',
          setupIdr: 399_000,
          setupAside: 'biaya setup sekali bayar',
          hostingMonth: 'Rp 99rb',
          month1Total: 'Rp 498rb',
          recurringLabel: 'Rp 99rb/bulan',
          persona: 'Buat kamu yang mau persona kerja inti, cukup lewat teks.',
          outcomes: [
            '3 persona inti: asisten utama, ahli dokumen, ahli slide',
            'Draft dokumen & deck dari 190+ template Indonesia',
            'Nyapa kamu duluan, ingat obrolan lintas hari',
            'Lewat Telegram, mode teks',
          ],
          apps: ['Telegram', 'Web'],
          appsTotal: 2,
          cta: 'Mulai Solo Starter',
          ctaHref: 'checkout.html?plan=solo',
          featured: false,
        },
        {
          name: 'Voice Starter',
          slug: 'voice-starter',
          tagline: 'Pendamping pertama kamu, lengkap dengan suara.',
          priceLabel: 'Rp 599rb',
          setupIdr: 599_000,
          setupAside: 'biaya setup sekali bayar',
          hostingMonth: 'Rp 99rb',
          month1Total: 'Rp 698rb',
          recurringLabel: 'Rp 99rb/bulan',
          persona: 'Buat kamu yang mau coba rasanya didampingi agent.',
          outcomes: [
            '3 persona inti + ngobrol pakai suara',
            'Draft dokumen & deck dari 190+ template Indonesia',
            'Nyapa kamu duluan, ingat obrolan lintas hari',
            'Kirim voice note, terima kerjaan jadi',
          ],
          apps: ['Telegram', 'Voice note', 'Web'],
          appsTotal: 3,
          cta: 'Mulai Voice Starter',
          ctaHref: 'checkout.html?plan=voice-starter',
          featured: false,
        },
        {
          name: 'Library Lengkap',
          slug: 'library-full',
          tagline: 'Seluruh pustaka agent dalam satu paket.',
          priceLabel: 'Rp 799rb',
          setupIdr: 799_000,
          setupAside: 'biaya setup sekali bayar',
          hostingMonth: 'Rp 99rb',
          month1Total: 'Rp 898rb',
          recurringLabel: 'Rp 99rb/bulan',
          persona: 'Buat kamu yang mau semua persona tanpa kompromi.',
          outcomes: [
            'Semua 10 persona spesialis — riset, slide, dokumen, sosmed, keuangan',
            'Briefing pagi jam 7 + ringkasan sore, tiap hari',
            'Draft caption & dokumen dari 190+ template Indonesia',
            'Riset web mendalam, ingat obrolan lintas hari',
            'Ngobrol pakai suara · VPS pribadi, bukan shared',
          ],
          apps: ['Telegram', 'Voice note', 'Web'],
          appsTotal: 3,
          cta: 'Ambil Library Lengkap',
          ctaHref: 'checkout.html?plan=library-full',
          featured: true,
        },
        {
          name: 'Siap Pakai',
          slug: 'done-for-you',
          tagline: 'Persona kerja inti, plus web app kamu sendiri.',
          priceLabel: 'Rp 1,299jt',
          setupIdr: 1_299_000,
          setupAside: 'biaya setup sekali bayar',
          hostingMonth: 'Rp 99rb',
          month1Total: 'Rp 1,398jt',
          recurringLabel: 'Rp 99rb/bulan',
          persona: 'Buat freelancer, founder, creator yang mau agent kerja tiap hari.',
          outcomes: [
            'Web app + dashboard di subdomain kamu sendiri',
            '8 persona kerja inti, pakai suara',
            'Briefing, draft, riset — di app-mu, bukan cuma chat',
            'Support privat paling depan',
          ],
          apps: ['Telegram', 'Voice note', 'Web app'],
          appsTotal: 4,
          cta: 'Ambil Siap Pakai',
          ctaHref: 'checkout.html?plan=done-for-you',
          featured: false,
        },
      ];

      // Bare Agent (decoy) is hidden from the live grid for now (founder
      // revision 2026-06-16). It MUST stay in `tiers` above — the pricing-drift
      // gate source-greps slug:'bare', setupIdr:99_000, priceLabel 'Rp 99rb',
      // month1Total 'Rp 198rb'. Hiding the card keeps the gate green; deleting
      // the object breaks it. 4 visible tiers: Solo / Voice / Library / Siap Pakai.
      const visibleTiers = tiers.filter((t) => !t.decoy);

      return (
        <section id="pricing" className="relative overflow-hidden py-16 md:py-20 lg:py-24 px-5 md:px-6 lg:px-10 bg-black">
          <DottedVideo
            src="/assets/pricing-furnace.mp4"
            color="#E5322D"
            cellSize={6}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 1, background: '#000' }}
          />
          <FadeTop /> <FadeBottom />
          <div className="relative z-10 max-w-7xl mx-auto">
            <div className="pc-section-head flex flex-col items-center text-center mb-10 md:mb-12">
              <div
                className="liquid-glass rounded-full px-3.5 py-1 text-xs font-medium font-body text-white/90"
                style={{ borderColor: 'rgba(229, 50, 45, 0.45)' }}
              >
                Harga
              </div>
              <BlurText
                as="h2"
                text="Pilih ukuran tim kamu. Upgrade kapan saja."
                className="mt-5 md:mt-6 text-3xl md:text-4xl lg:text-5xl font-heading text-white tracking-tight leading-[1.0] md:leading-[0.95] max-w-3xl"
                style={{ letterSpacing: '-0.04em' }}
                delay={70}
              />
              <p className="mt-5 md:mt-6 max-w-xl text-white/55 font-body font-light text-sm md:text-base leading-relaxed">
                Bayar setup sekali. Hosting transparan, bisa pause kapan saja.
              </p>
            </div>

            {/* Honest risk-reversal strip — every claim is verbatim from
                faq.html + refund-policy.html. Reassures right at the decision
                moment, without re-cluttering the cards. */}
            <div className="liquid-glass rounded-2xl mt-2 mb-10 md:mb-12 px-5 py-5 md:px-7 md:py-6 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              {[
                ['VPS pribadi kamu', 'Bukan server bersama. Data nggak dibagi, bukan bahan training.'],
                ['Jaminan teknis 14 hari', 'Kalau gagal jalan karena sisi kami, kami fix gratis atau refund setup penuh.'],
                ['Berhenti kapan saja', 'Tagihan hosting stop. Tanpa penalti, tanpa komitmen.'],
                ['Setup tetap milik kamu', 'Mau pause atau pindah, hasil setup tetap punya kamu.'],
              ].map(([label, sub], i) => (
                <div key={i} className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true" className="block w-1.5 h-1.5 flex-shrink-0 rounded-full" style={{ background: '#E5322D' }} />
                    <span className="text-sm md:text-[15px] font-body text-white/90 font-medium">{label}</span>
                  </div>
                  <span className="mt-1 text-[11px] md:text-xs text-white/55 font-body font-light leading-snug">{sub}</span>
                </div>
              ))}
            </div>

            <ValueSlider />

            {/* 4 visible tiers — Solo → Voice → Library Lengkap (recommended,
                premium glow) → Siap Pakai. Bare is hidden but kept in the
                catalog for the drift gate (see visibleTiers above). */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-7 lg:gap-8 items-stretch">
              {visibleTiers.map((t, i) => (
                <PricingCard
                  key={t.name}
                  tier={t}
                  index={i}
                  onShowBreakdown={() => setBreakdownTier(t)}
                />
              ))}
            </div>

            {/* Enterprise — contact-only, no self-serve checkout */}
            <Mot.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
              className="liquid-glass rounded-2xl mt-5 md:mt-6 p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6"
            >
              <div className="md:max-w-xl">
                <h3 className="text-lg md:text-xl font-heading text-white" style={{ letterSpacing: '-0.02em' }}>
                  Enterprise
                </h3>
                <p className="mt-1 text-sm italic text-white/65 font-body font-light leading-snug">
                  Persona custom, integrasi khusus, dan build sesuai kebutuhan tim kamu.
                </p>
                <p className="mt-3 text-sm text-white/75 font-body font-light leading-relaxed">
                  Voice, web app, dan custom build penuh. Kami susun setup-nya bareng kamu, bukan dari paket jadi.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 md:flex-shrink-0">
                <a
                  href="mailto:kidnovell.richie@gmail.com?subject=Enterprise%20weuseai.agent"
                  className="rounded-full px-5 py-3 text-sm font-medium flex items-center justify-center gap-2 no-underline text-white"
                  style={{ background: '#E5322D', border: '1px solid #E5322D' }}
                >
                  Hubungi Sales <ArrowUpRight size={14} stroke={2.2} />
                </a>
                <a
                  href="https://wa.me/6282154902561?text=Halo%2C%20saya%20tertarik%20paket%20Enterprise"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full px-5 py-3 text-sm font-medium flex items-center justify-center gap-2 no-underline text-white"
                  style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.28)' }}
                >
                  WhatsApp <ArrowUpRight size={14} stroke={2.2} />
                </a>
              </div>
            </Mot.div>

            <div className="mt-16 md:mt-24">
              <LimitedSeats />
            </div>
          </div>

          <PriceBreakdownModal
            open={!!breakdownTier}
            onClose={() => setBreakdownTier(null)}
            tier={breakdownTier}
          />
        </section>
      );
    }

    // ─────────────────────── COMMUNITY ───────────────────────
    function CommunitySection() {
      // Two panels:
      //   A — sample skills we ship; agent voice (no personal pronouns)
      //   B — real public posts from the agent runtime ecosystem
      // Cards locked from docs/plans/2026-05-05-community-section-design.md.
      const skillCards = [
        {
          handle: '@weuseaibot',
          tagline: 'agen kamu',
          timestamp: 'jam 7:00 WIB',
          body: [
            'Selamat pagi.',
            '5 berita teratas dari detik, kompas, cnbcindonesia',
            'sudah diringkas. Top brief masuk chat ini sekarang.',
          ],
          footer: 'skill: daily-news-briefing-bahasa',
          shipped: true,
        },
        {
          handle: '@weuseaibot',
          tagline: 'agen kamu',
          timestamp: 'jam 6:45 WIB',
          body: [
            'Cuaca Jakarta 27° cerah, sore mulai mendung.',
            'Macet di Sudirman 14 menit, Tol Cawang merah.',
            'Saran berangkat: 7:10 lewat Casablanca.',
          ],
          footer: 'skill: cuaca-macet-pagi · roadmap',
          shipped: false,
        },
        {
          handle: '@weuseaibot',
          tagline: 'agen kamu',
          timestamp: 'jam 23:14 WIB',
          body: [
            'Semalam: 50 lowongan dari Glints, LinkedIn, Kalibrr dipantau.',
            '8 fit kriteria gaji + remote + WFA.',
            'Daftar sudah masuk Notion, siap sortir ulang besok pagi.',
          ],
          footer: 'skill: lowongan-scout · roadmap',
          shipped: false,
        },
        {
          handle: '@weuseaibot',
          tagline: 'agen kamu',
          timestamp: 'jam 4 sore',
          body: [
            'Topik "cara mulai bisnis F&B" diolah dari 12 sumber.',
            '3 draft caption Instagram + 1 thread X siap di-review.',
            'Tone otomatis mengikuti persona di SOUL.md.',
          ],
          footer: 'skill: content-drafter · roadmap',
          shipped: false,
        },
        {
          handle: '@weuseaibot',
          tagline: 'agen kamu',
          timestamp: 'jam 8:30 WIB',
          body: [
            '247 email pasca-cuti diurutkan.',
            '3 urgent · 12 important · 232 difile.',
            'Draft balasan untuk 3 urgent siap di-review.',
          ],
          footer: 'skill: inbox-triage · roadmap',
          shipped: false,
        },
        {
          handle: '@weuseaibot',
          tagline: 'agen kamu',
          timestamp: 'jam 10:00 WIB',
          body: [
            '5 invoice telat bayar di-check ulang.',
            'Reminder ramah dikirim ke 4 klien lewat email.',
            '1 di-eskalasi karena overdue >30 hari.',
          ],
          footer: 'skill: invoice-reminder · roadmap',
          shipped: false,
        },
        {
          handle: '@weuseaibot',
          tagline: 'agen kamu',
          timestamp: 'jam 14:00 WIB',
          body: [
            '12 kompetitor harga + listing dipantau hari ini.',
            '3 kompetitor turun harga rata-rata 15%.',
            'Rekomendasi adjust harga sudah masuk dashboard.',
          ],
          footer: 'skill: competitor-watch · roadmap',
          shipped: false,
        },
        {
          handle: '@weuseaibot',
          tagline: 'agen kamu',
          timestamp: 'jam 12:30 WIB',
          body: [
            '23 DM Instagram masuk semalam.',
            '18 dijawab otomatis dengan tone brand kamu.',
            '5 di-eskalasi (pertanyaan custom + komplain).',
          ],
          footer: 'skill: ig-auto-reply · roadmap',
          shipped: false,
        },
        {
          handle: '@weuseaibot',
          tagline: 'agen kamu',
          timestamp: 'jam 9:00 WIB',
          body: [
            'Watchlist crypto + saham di-scan tiap 5 menit.',
            'BTC breakout 92.4k, BBCA volume +18%.',
            'Alert sudah masuk chat, chart screenshot ter-attach.',
          ],
          footer: 'skill: trading-watchlist · roadmap',
          shipped: false,
        },
        {
          handle: '@weuseaibot',
          tagline: 'agen kamu',
          timestamp: 'semalam',
          body: [
            '50 hotel di Bali dipantau. 12 dengan rating 4.5+ tapi foto listing buruk.',
            'Foto interior diambil dari Maps, redraft jadi IG post matched ke brand hotel masing-masing.',
            'Postcard dengan QR preview siap dikirim.',
          ],
          footer: 'skill: outreach-postcard · roadmap',
          shipped: false,
        },
        {
          handle: '@weuseaibot',
          tagline: 'agen kamu',
          timestamp: 'jam 19:00 WIB',
          body: [
            'Foto 12 struk hari ini diproses.',
            'Total Rp 847k — kategori: F&B 42%, transport 28%, lainnya 30%.',
            'Sudah masuk Notion + Google Sheets, siap untuk laporan akhir bulan.',
          ],
          footer: 'skill: expense-snap · roadmap',
          shipped: false,
        },
        {
          handle: '@weuseaibot',
          tagline: 'agen kamu',
          timestamp: 'jam 11:30 WIB',
          body: [
            'Recording meeting product strategy 47 menit selesai diolah.',
            '7 action item terdeteksi, 3 paling kritis sudah masuk Asana.',
            'Ringkasan + next-step dikirim ke 4 peserta meeting.',
          ],
          footer: 'skill: meeting-recap · roadmap',
          shipped: false,
        },
        {
          handle: '@weuseaibot',
          tagline: 'agen kamu',
          timestamp: 'jam 17:30 WIB',
          body: [
            'Bahan kulkas: 3 telur, ayam fillet, brokoli, bawang putih, nasi.',
            '3 resep cocok: chicken stir-fry, telur dadar veggie, nasi goreng cepat.',
            'Estimasi masak 20 menit, kalori per porsi sudah dihitung.',
          ],
          footer: 'skill: resep-stock · roadmap',
          shipped: false,
        },
        {
          handle: '@weuseaibot',
          tagline: 'agen kamu',
          timestamp: 'jam 6:00 WIB',
          body: [
            '4 emiten watchlist dianalisa: BBCA, BBRI, ASII, TLKM.',
            'BBCA fundamental kuat, P/E rasional, dividend yield 3.2%.',
            'ASII flagged: utang naik 18% YoY, perlu monitoring.',
          ],
          footer: 'skill: saham-fundamental · roadmap',
          shipped: false,
        },
        {
          handle: '@weuseaibot',
          tagline: 'agen kamu',
          timestamp: 'jam 21:00 WIB',
          body: [
            '3 destinasi wishlist dipantau: Tokyo, Seoul, Bangkok.',
            'Tiket Tokyo turun 22% (Garuda, 6 Jul, Rp 4,2jt PP).',
            'Hotel Shibuya rate terbaik Rp 1,1jt/malam — booking window 14 hari.',
          ],
          footer: 'skill: travel-deal-watcher · roadmap',
          shipped: false,
        },
      ];

      const communityCards = [
        {
          handle: '@hermes_agent',
          timestamp: '3 hari lalu',
          body: [
            '"Hermes Agent sekarang punya multi-agent via Kanban. Beberapa agent ngambil task dari papan, kerja paralel, dan hand-off saat ada yang stuck. Kamu pantau progress dan unblock dari satu view, bukan juggling banyak terminal."',
          ],
          sourceLabel: 'github.com/NousResearch/hermes-agent',
          sourceUrl: 'https://github.com/NousResearch/hermes-agent',
        },
        {
          handle: '@Tiny_Fish',
          timestamp: '16 jam lalu',
          body: [
            '"Mulai hari ini, TinyFish Web Search dan Fetch gratis. Untuk semua dev dan agent. Tanpa kartu kredit. Rate limit-nya generous."',
          ],
          sourceLabel: 'x.com/Tiny_Fish',
          sourceUrl: 'https://x.com/Tiny_Fish',
        },
        {
          handle: '@everestchris6',
          timestamp: '10 jam lalu',
          body: [
            '"Bot OpenClaw ini cari hotel dengan foto listing jelek, redraft jadi IG post, terus kirim postcard ke owner-nya — semua otomatis. Scrape semua hotel di kota target real-time."',
          ],
          sourceLabel: 'x.com/everestchris6',
          sourceUrl: 'https://x.com/everestchris6',
        },
      ];

      const Avatar = ({ handle }) => {
        const letter = (handle.replace(/^@/, '')[0] || 'a').toUpperCase();
        return (
          <span
            aria-hidden="true"
            className="inline-flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0 text-[10px] font-mono font-semibold"
            style={{ background: 'rgba(229,50,45,0.18)', color: '#E5322D' }}
          >
            {letter}
          </span>
        );
      };

      const Card = ({ card, isCommunity }) => (
        <Mot.div
          role="article"
          aria-label={`${card.handle} — ${isCommunity ? card.sourceLabel : card.footer}`}
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.55, ease: EASE }}
          className="liquid-glass rounded-2xl p-5 md:p-6 flex flex-col"
        >
          <div className="flex items-center gap-2 text-[12px] font-mono text-white/65">
            <Avatar handle={card.handle} />
            <span className="text-white/85">{card.handle}</span>
            {card.tagline && <span className="text-white/55">· {card.tagline}</span>}
            <span className="text-white/55">· {card.timestamp}</span>
          </div>
          <div className="mt-3 text-sm text-white/85 font-body font-light leading-relaxed space-y-1">
            {card.body.map((line, li) => (
              <p key={li}>{line}</p>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-white/[0.07] text-[10px] font-mono uppercase tracking-[0.18em] text-white/55">
            {isCommunity ? (
              <a
                href={card.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="no-underline hover:underline text-white/55"
              >
                source: {card.sourceLabel}
              </a>
            ) : (
              card.footer
            )}
          </div>
        </Mot.div>
      );

      return (
        <section id="community" className="relative py-20 md:py-32 px-5 md:px-6 lg:px-16 bg-black">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col items-center text-center mb-14 md:mb-20">
              <div
                className="liquid-glass rounded-full px-3.5 py-1 text-xs font-medium font-body text-white/90"
                style={{ borderColor: 'rgba(229, 50, 45, 0.45)' }}
              >
                Dari komunitas
              </div>
              <BlurText
                as="h2"
                text="Skill yang terus kami tambah."
                className="mt-5 md:mt-6 text-3xl md:text-5xl lg:text-6xl font-heading text-white tracking-tight leading-[1.0] md:leading-[0.95] max-w-3xl"
                style={{ letterSpacing: '-0.04em' }}
                delay={70}
              />
              <p className="mt-5 md:mt-6 max-w-xl text-white/55 font-body font-light text-sm md:text-base leading-relaxed">
                Sebagian sudah jalan, sebagian lagi kami siapkan bareng komunitas.
              </p>
            </div>

            {/* Panel A — sample skills we ship */}
            <div className="mb-12 md:mb-16">
              <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/55 mb-4 md:mb-6">
                Skill bawaan
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
                {skillCards.map((c, i) => (
                  <Card key={`s${i}`} card={c} isCommunity={false} />
                ))}
              </div>
            </div>

            {/* Panel B — real community quotes */}
            <div>
              <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/55 mb-4 md:mb-6">
                Dari komunitas agent
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
                {communityCards.map((c, i) => (
                  <Card key={`c${i}`} card={c} isCommunity={true} />
                ))}
              </div>
            </div>
          </div>
        </section>
      );
    }

    // ─────────────────────── FAQ ───────────────────────
    function FAQ() {
      const items = [
        { q: 'Gak tech-savvy, bisa pakai?',
          a: 'Bisa. Setup otomatis, nggak install apa-apa — cukup chat di Telegram, agent yang ngerjain.' },
        { q: 'Aman buat data bisnis?',
          a: 'Agent jalan di VPS pribadi kamu, bukan shared. Kami nggak baca isi chat kecuali kamu minta bantuan dan kasih izin.' },
        { q: 'Beda sama subscription biasa?',
          a: 'Setup sekali bayar. Hosting Rp 99rb transparan kayak bayar listrik, stop kapan saja.' },
        { q: 'Berapa biaya LLM-nya?',
          a: 'Kredit perkenalan termasuk. Lanjut pakai kunci sendiri — transparan langsung ke penyedia, tanpa markup.' },
        { q: 'Kalau mau berhenti?',
          a: 'Stop kapan saja, tagihan hosting berhenti, setup tetap kamu punya.' },
        { q: 'Bisa demo dulu?',
          a: 'Bisa. Booking 15 menit lewat footer, kami tunjukkan agent live.' },
        { q: 'Kok resepnya dari China?',
          a: 'Tim agent ini dipelajari di Zhejiang University, Hangzhou, lalu dirakit untuk Indonesia.' },
      ];

      const [openIdx, setOpenIdx] = useState(0);

      return (
        <section id="faq" className="relative py-20 md:py-28 px-5 md:px-6 lg:px-16 bg-black">
          <div className="max-w-3xl mx-auto">
            <div className="flex flex-col items-center text-center mb-10 md:mb-14">
              <div className="liquid-glass rounded-full px-3.5 py-1 text-xs font-medium font-body text-white/90">
                FAQ
              </div>
              <BlurText
                as="h2"
                text="Pertanyaan yang sering muncul."
                className="mt-5 md:mt-6 text-3xl md:text-5xl lg:text-6xl font-heading text-white tracking-tight leading-[1.0] md:leading-[0.95]"
                style={{ letterSpacing: '-0.04em' }}
                delay={70}
              />
              <p className="mt-5 max-w-xl text-white/55 font-body font-light text-sm md:text-base leading-relaxed">
                Jawaban jujur, sebelum kamu klik bayar.
              </p>
            </div>

            <Mot.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.7, ease: EASE }}
            >
              {items.map((it, i) => (
                <div key={i} className={`faq-item ${openIdx === i ? 'is-open' : ''}`}>
                  <button
                    type="button"
                    className="faq-trigger"
                    id={`faq-q-${i}`}
                    aria-expanded={openIdx === i}
                    aria-controls={`faq-a-${i}`}
                    onClick={() => setOpenIdx(openIdx === i ? -1 : i)}
                  >
                    <span>{it.q}</span>
                    <span className="faq-icon" aria-hidden="true">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </span>
                  </button>
                  <div className="faq-body" id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`} aria-hidden={openIdx !== i}>
                    <div className="faq-body-inner">{it.a}</div>
                  </div>
                </div>
              ))}
            </Mot.div>

            <div className="mt-9 text-center">
              <a href="/faq" className="faq-all-link">
                Lihat semua pertanyaan
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </a>
            </div>
          </div>
        </section>
      );
    }

    // ─────────────────────── STATS ───────────────────────
    function Stats() {
      const items = [
        { kind: 'plain', n: 8,   suffix: ' mnt', label: 'Dari bayar ke pesan pertama\n(diukur, bukan janji)' },
        { kind: 'plain', n: 10,  suffix: '',  label: 'Persona spesialis\ndi-engineer satu per satu' },
        { kind: 'plain', n: 190, suffix: '+', label: 'Template Indonesia\nPPN · BPJS · KBLI · IDX' },
        { kind: 'plain', n: 24,  suffix: '',  label: 'Playbook multi-langkah\nbriefing pagi sampai laporan' },
      ];
      return (
        <section className="relative overflow-hidden py-20 md:py-28 px-5 md:px-6 lg:px-16" style={{ minHeight: 420 }}>
          <HlsVideo src={HLS_STATS} filter="saturate(0.35) brightness(0.32) contrast(1.06) blur(16px)" />
          <div className="absolute inset-0 z-[1] pointer-events-none" style={{
            background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.65) 55%, rgba(0,0,0,0.88) 100%)'
          }} />
          <FadeTop h={260} /> <FadeBottom h={260} />
          <div className="relative z-10 max-w-5xl mx-auto">
            <div className="liquid-glass rounded-2xl md:rounded-3xl p-8 md:p-16 grid grid-cols-2 md:grid-cols-4 gap-7 md:gap-10 text-center">
              {items.map((it, i) => (
                <Mot.div key={it.label}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.7, ease: EASE, delay: 0.08 * i }}>
                  <div className="text-3xl md:text-5xl lg:text-6xl font-heading leading-none" style={{ letterSpacing: '-0.04em' }}>
                    {it.kind === 'ratio' ? (
                      <>
                        <CountUp to={it.a} duration={1800} delay={120} />
                        <span className="text-white/35"> / </span>
                        <CountUp to={it.b} duration={2200} delay={120} />
                      </>
                    ) : it.kind === 'text' ? (
                      <span style={{ color: '#E5322D' }}>{it.text}</span>
                    ) : (
                      <CountUp to={it.n} suffix={it.suffix} duration={1800} delay={120 + i * 120} />
                    )}
                  </div>
                  <div className="mt-2 md:mt-3 text-white/60 font-body font-light italic text-[11px] md:text-[13px] leading-snug" style={{ whiteSpace: 'pre-line' }}>{it.label}</div>
                </Mot.div>
              ))}
            </div>
          </div>
        </section>
      );
    }

    // ─────────────────────── CTA + FOOTER ───────────────────────
    function CtaFooter() {
      return (
        <footer className="relative overflow-hidden bg-black" style={{ minHeight: 620 }}>
          <DottedVideo
            src="/assets/ascii-wave.mp4"
            color="#E5322D"
            cellSize={6}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 0, background: '#000' }}
          />
          <FadeTop /> <FadeBottom />
          <div className="relative z-10 flex flex-col items-center text-center px-5 md:px-6 pt-28 md:pt-40 pb-10 max-w-5xl mx-auto">
            <BlurText
              as="h2"
              text="Besok pagi jam 7, briefing pertama dari tim kamu masuk."
              className="text-4xl md:text-6xl lg:text-7xl font-heading leading-[0.92] md:leading-[0.85] tracking-tight max-w-4xl"
              delay={90} />
            <p className="mt-6 md:mt-8 max-w-xl text-white/70 font-body font-light text-sm md:text-base px-2">
              Atau besok sama seperti hari ini. Kamu yang pilih.
            </p>
            <div className="mt-8 md:mt-10 flex items-center gap-3 md:gap-4 flex-wrap justify-center">
              <a href="#pricing" className="bg-white text-black rounded-full px-5 md:px-6 py-3 text-sm font-medium flex items-center gap-2 no-underline">
                Aktifkan asisten kamu <ArrowUpRight size={14} stroke={2.2} />
              </a>
              <a href="https://cal.com/weuseai.agent/15min" target="_blank" rel="noopener" className="liquid-glass-strong rounded-full px-5 md:px-6 py-3 text-sm font-medium no-underline text-white">
                Konsultasi gratis (15 menit)
              </a>
            </div>
            <p className="mt-6 text-xs text-white/55 font-body font-light max-w-md mx-auto leading-relaxed">
              Butuh setup custom atau enterprise? Ngobrol dulu —{' '}
              <a href="https://cal.com/weuseai.agent/15min" target="_blank" rel="noopener" className="text-white/75 hover:text-white underline-offset-2 hover:underline">Jadwalkan panggilan</a>
            </p>

            <div className="mt-20 md:mt-28 pt-6 md:pt-8 border-t border-white/10 w-full flex flex-col gap-4 text-[11px] text-white/65 font-body font-light">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
                <span>© 2026 weuseai.agent</span>
                <div className="flex items-center gap-4 md:gap-5 flex-wrap justify-center">
                  <a href="/privacy" className="text-white/65 hover:text-white transition-colors no-underline">privasi</a>
                  <span className="text-white/35">·</span>
                  <a href="/terms" className="text-white/65 hover:text-white transition-colors no-underline">syarat</a>
                  <span className="text-white/35">·</span>
                  <a href="/refund-policy" className="text-white/65 hover:text-white transition-colors no-underline">pengembalian</a>
                  <span className="text-white/35">·</span>
                  <a href="/contact" className="text-white/65 hover:text-white transition-colors no-underline">kontak</a>
                </div>
              </div>
              <p className="text-white/65 text-center sm:text-left leading-relaxed max-w-2xl">
                Dioperasikan oleh Richie Kidnovell, berbasis di Jakarta. Kontak: <a href="mailto:support@weuseai.agent" className="text-white/85 hover:text-white no-underline">support@weuseai.agent</a>.
              </p>
            </div>
          </div>
        </footer>
      );
    }

    // ─────────────── INTEGRATIONS SPINE (the centerpiece) ───────────────
    // The #1 value prop: the agent works INSIDE real apps. R2 Content / R2 Fit /
    // R2 Finance are LIVE (founder-confirmed, operated outside this repo) → tiles
    // pulse "Aktif". Gmail/Sekolah is "Segera" (dashed, future-tense, "siapkan
    // tugas" = prepares, never "kerjakan"). An Aktif chip only ever pulses for a
    // genuinely-live tile (no animated lie). Copy is the founder's confirmed-LIVE
    // claim; refine the exact value-prop lines anytime (data-driven below).
    function IntegrationsSpine() {
      const apps = [
        { key: 'content', name: 'R2 Content', status: 'live',
          line: 'Susun & jadwalkan konten kamu.',
          micro: '7 post terjadwal minggu ini',
          ask: 'Atur konten minggu ini dong',
          msg: 'Sudah aku susun 7 post minggu ini di R2 Content, lengkap dengan draf caption gaya kamu.',
          shots: ['/assets/r2-content-1.png', '/assets/r2-content-2.png', '/assets/r2-content-3.png'] },
        { key: 'fit', name: 'R2 Fit', status: 'live',
          line: 'Atur program latihan, catat progres.',
          micro: 'Streak 12 hari berjalan',
          ask: 'Susun program latihanku',
          msg: 'Program latihan kamu aku tata di R2 Fit, dan progres hari ini sudah tercatat.',
          shots: ['/assets/r2-fit-1.png', '/assets/r2-fit-2.png', '/assets/r2-fit-3.png'] },
        { key: 'finance', name: 'R2 Finance', status: 'live',
          line: 'Rapikan cashflow, kasih ringkasan.',
          micro: 'Ringkasan cashflow tiap minggu',
          ask: 'Rapikan keuangan bulan ini',
          msg: 'Pemasukan dan pengeluaran kamu aku rapikan di R2 Finance — ini ringkasan minggu ini.',
          shots: ['/assets/r2-finance-1.png', '/assets/r2-finance-2.png', '/assets/r2-finance-3.png'] },
        { key: 'school', name: 'School Expert', status: 'segera',
          line: 'Pantau tugas & tenggat sekolah.',
          micro: 'Mata kuliah · checklist · tenggat',
          ask: 'Bantu siapin tugas minggu ini',
          msg: 'Nanti aku bantu rangkum tugas dari portal sekolah kamu — checklist dan tenggat siap sebelum deadline.',
          shots: ['/assets/r2-school-1.png', '/assets/r2-school-2.png', '/assets/r2-school-3.png'] },
      ];
      return (
        <section id="integrasi" className="is-section">
          <div className="is-wrap">
            <div className="is-eyebrow"><span className="live-dot" /><span>Agen kamu nggak cuma menjawab</span></div>
            <BlurText as="h2" text="Dia kerja di app beneran." className="is-headline" delay={70} />
            <p className="is-sub">Konten, keuangan, latihan — dikerjakan langsung di app-nya, bukan cuma diketik balik.</p>
            <div className="is-hub" aria-hidden="true"><span className="live-dot" /><span>Satu agen</span></div>
            <div className="is-grid">
              {apps.map((a, i) => (
                <Mot.div key={a.key}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.5, ease: EASE, delay: 0.06 * i }}
                  className={`is-item is-item--${a.status}`}>
                  {/* Title + desc live OUTSIDE the box for a cleaner, lighter look */}
                  <div className="is-item-head">
                    <span className="is-item-name">{a.name}</span>
                    <span className={`is-chip is-chip--${a.status}`}>
                      {a.status === 'live' ? <><span className="is-chip-dot" />Aktif</> : 'Segera'}
                    </span>
                  </div>
                  <p className="is-item-desc">{a.line}</p>

                  {/* The box: chat flow (mirrors the hero) · divider · app screenshot */}
                  <div className={`is-tile is-tile--${a.status}`}>
                    <div className="is-flow">
                      <div className="is-flow-user">{a.ask}</div>
                      <div className="is-flow-agent">
                        <div className="is-flow-avatar" aria-hidden="true">●</div>
                        <div className="is-flow-bubble">{a.msg}</div>
                      </div>
                    </div>

                    <div className="is-tile-divider" aria-hidden="true" />

                    {/* iPhone portrait frame — slow cross-fading slideshow of the
                        3 real app screenshots (absolute-fill object-fit:cover). */}
                    <div className="is-phone" aria-hidden="true">
                      <div className="is-phone-island" />
                      <div className="is-phone-screen">
                        {a.shots.map((src, n) => (
                          <img key={src} className="is-shot-media is-shot-slide" src={src} alt=""
                            loading="lazy" style={{ animationDelay: `${n * 2}s` }} />
                        ))}
                        {a.status === 'segera' && <span className="is-phone-badge">Segera</span>}
                      </div>
                    </div>

                    <div className="is-tile-micro">{a.micro}</div>
                  </div>
                </Mot.div>
              ))}
            </div>
            <p className="is-foot">Empat app. Satu agen. <strong>Rp 99rb/bulan</strong>.</p>
          </div>
        </section>
      );
    }

    // ─────────────────────── ORIGIN / FOUNDER EDGE ───────────────────────
    // The previous video hero, demoted to a credibility section below the
    // dashboard hero (rev 2026-06-16). NOT id="beranda" — the dashboard hero
    // owns that. Entrance animates on scroll-in; section sizing, not hero.
    function OriginSection() {
      return (
        <section id="asal-usul" className="origin-section">
          {/* Same red-dot halftone language as the hero (rev 2026-06-17): brand red
              dotted video + a clearly-visible CSS halftone grid so it isn't flat. */}
          <DottedVideo
            src="/assets/trade-pro.mp4"
            color="#E5322D"
            cellSize={6}
            threshold={0.05}
            className="absolute inset-0 w-full h-full pointer-events-none origin-dots"
            style={{ zIndex: 0, background: '#000', opacity: 0.7 }}
          />
          <div className="hero-grain" />
          <div className="absolute inset-0 z-[1] pointer-events-none" style={{
            background: 'radial-gradient(ellipse 90% 70% at 50% 78%, rgba(5,5,5,0.12), rgba(5,5,5,0.55) 72%), linear-gradient(180deg, rgba(5,5,5,0.55) 0%, rgba(5,5,5,0.28) 50%, rgba(5,5,5,0.6) 100%)'
          }} />
          {/* Visible brand-red halftone dot grid, masked to a soft pool — keeps the
              section from reading flat while staying on-brand (matches the hero dots). */}
          <div className="origin-halftone" aria-hidden="true" />
          <div className="absolute top-0 left-0 right-0 z-[2] pointer-events-none"
            style={{ height: 120, background: 'linear-gradient(to bottom, #050505, transparent)' }} />
          <div className="absolute bottom-0 left-0 right-0 z-[2] pointer-events-none"
            style={{ height: 180, background: 'linear-gradient(to bottom, transparent, #050505)' }} />

          <div className="relative z-10 flex flex-col items-center text-center px-5 md:px-6 w-full">
            <Mot.div
              initial={{ filter: 'blur(10px)', opacity: 0, y: 20 }}
              whileInView={{ filter: 'blur(0px)', opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6, ease: EASE }}
              className="rounded-full px-1 py-1 flex items-center gap-2 text-xs font-body"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.22)',
                backdropFilter: 'blur(8px)'
              }}>
              <span style={{ background: '#E5322D', color: '#fff' }} className="rounded-full px-3 py-1 text-[10px] font-mono font-medium uppercase tracking-[0.18em]">Resep Hangzhou</span>
              <span className="pr-3 font-mono uppercase tracking-[0.14em] text-[11px] text-white/85">Dirakit untuk Indonesia</span>
            </Mot.div>

            <BlurText
              text="Resep kampus elite China. Aktif 8 menit."
              className="mt-6 md:mt-8 text-[2rem] sm:text-4xl md:text-5xl lg:text-[3.75rem] font-heading leading-[1.02] md:leading-[0.98] max-w-[20ch] md:max-w-[24ch] text-white px-2"
              style={{ letterSpacing: '-0.04em', fontStyle: 'normal' }}
              delay={100} />

            <Mot.p
              initial={{ filter: 'blur(10px)', opacity: 0, y: 20 }}
              whileInView={{ filter: 'blur(0px)', opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.15 }}
              className="mt-5 md:mt-6 max-w-[52ch] text-sm md:text-base font-body font-light leading-[1.5] text-white/85 px-2">
              Satu tim agent di Telegram kamu — riset, surat, slide, laporan. Dirakit di Zhejiang University, dibawa pulang buat kamu.
            </Mot.p>

            <Mot.p
              initial={{ filter: 'blur(10px)', opacity: 0, y: 20 }}
              whileInView={{ filter: 'blur(0px)', opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.25 }}
              className="mt-4 font-mono uppercase tracking-[0.18em] text-[10px] md:text-[11px] text-white/55">
              Setup 5 menit · bayar pakai QRIS · hosting Rp 99rb/bulan · berhenti kapan saja
            </Mot.p>

            <Mot.div
              initial={{ filter: 'blur(10px)', opacity: 0, y: 20 }}
              whileInView={{ filter: 'blur(0px)', opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.35 }}
              className="mt-8 flex flex-col items-center gap-3">
              <div className="flex items-center gap-3 flex-wrap justify-center">
                <a href="#pricing" className="rounded-full px-5 py-2.5 min-h-[44px] text-sm font-medium flex items-center gap-2 no-underline"
                  style={{ background: '#fff', color: '#0a0a0a', border: '1px solid #fff' }}>
                  Aktifkan asisten kamu <ArrowUpRight size={14} stroke={2.2} />
                </a>
                <a href="https://cal.com/weuseai.agent/15min" target="_blank" rel="noopener" className="rounded-full px-5 py-2.5 min-h-[44px] text-sm font-medium flex items-center gap-2 no-underline text-white"
                  style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.22)', backdropFilter: 'blur(8px)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  Konsultasi gratis (15 menit)
                </a>
              </div>
            </Mot.div>

            <div className="mt-10 md:mt-12 w-full max-w-5xl mx-auto">
              <div className="liquid-glass rounded-2xl md:rounded-3xl p-5 md:p-9 grid grid-cols-2 md:grid-cols-4 gap-5 md:gap-6 text-center">
                {[
                  { n: 8,   suffix: ' mnt', label: 'Dari bayar ke pesan pertama\n(diukur, bukan janji)' },
                  { n: 10,  suffix: '',     label: 'Persona spesialis\ndi-engineer satu per satu' },
                  { n: 190, suffix: '+',    label: 'Template Indonesia\nPPN · BPJS · KBLI · IDX' },
                  { n: 24,  suffix: '',     label: 'Playbook multi-langkah\nbriefing pagi sampai laporan' },
                ].map((it, i) => (
                  <Mot.div key={it.label}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ duration: 0.6, ease: EASE, delay: 0.06 * i }}
                    className="flex flex-col items-center">
                    <div className="text-2xl md:text-4xl lg:text-5xl font-heading text-white leading-none" style={{ letterSpacing: '-0.04em' }}>
                      <CountUp to={it.n} suffix={it.suffix} duration={1800} delay={150 + i * 120} />
                    </div>
                    <div className="mt-2 md:mt-2.5 text-white/55 font-body font-light italic text-[11px] md:text-[13px] leading-snug" style={{ whiteSpace: 'pre-line' }}>{it.label}</div>
                  </Mot.div>
                ))}
              </div>
            </div>
          </div>
        </section>
      );
    }

    // ─────────────────────── APP ───────────────────────
    // ─────────────── KONTEN REDESIGN SECTIONS (Iters 4-8) ───────────────
    // New design's mid-page sections. Each replaces the legacy aurora-era
    // sections in the App composition below; the legacy component defs remain
    // in source (unused) until cleanup (Iter 12) prunes them.

    function ExploreSection() {
      // Section 2 — Explore usage: the bundling-value story + an honest,
      // clearly-illustrative time-savings calculator (never a hard claim).
      const [hrs, setHrs] = useState(18);
      const back = Math.round(hrs * 4.33 * 0.6); // illustrative: agent handles ~60% of admin hours
      const days = Math.max(1, Math.round(back / 8));
      const tools = ['Chatbot CS', 'Landing page', 'Notulen rapat', 'Sistem finance', 'Konten sosial', 'Riset pasar'];
      return (
        <section id="explore" className="kt-explore">
          <div className="kt-explore-glow" aria-hidden="true" />
          <div className="kt-explore-inner">
            <div className="kt-explore-left">
              <div className="kt-eyebrow"><span className="kt-eyebrow-dot" />Satu sistem, semua surface</div>
              <h2 className="kt-h2">Tiap tool yang biasanya <span className="kt-grad-text">dijual mahal terpisah</span>, jadi satu.</h2>
              <p className="kt-lead">Chatbot customer support, landing page creator, notulen rapat, sistem finance — biasanya dijual satu-satu. Kami bangun dan pre-fine-tune semuanya jadi <strong>satu agent</strong> buat kamu.</p>
              <div className="kt-badge-100">100+ TUGAS</div>
              <div className="kt-tool-chips">
                {tools.map((t) => <span key={t} className="kt-tool-chip">{t}</span>)}
              </div>
            </div>
            <div className="kt-explore-right">
              <div className="kt-calc">
                <div className="kt-calc-label">Berapa jam kerja administratif kamu per minggu?</div>
                <div className="kt-calc-val"><span className="kt-grad-text">{hrs}</span> jam/minggu</div>
                <input type="range" min="5" max="40" value={hrs} onChange={(e) => setHrs(+e.target.value)} aria-label="Jam kerja administratif per minggu" className="kt-slider" />
                <div className="kt-calc-out">
                  <div className="kt-calc-out-num">≈ {back} jam<span>/bulan</span></div>
                  <div className="kt-calc-out-sub">bisa agent yang pegang — setara {days} hari kerja kamu balik.</div>
                </div>
                <div className="kt-calc-note">Estimasi kasar. Hasil tiap orang beda — kamu yang tetap pegang keputusan.</div>
              </div>
            </div>
          </div>
        </section>
      );
    }

    function MemoryPersonaSection() {
      // Section 3 — Memory & persona: corrections become permanent memory;
      // personas are pre-fine-tuned. Honest framing — the design's "Akurat 99%"
      // hard claim is replaced with the real, verifiable behaviour.
      const flow = [
        { k: '01', t: 'Instruksi baru', tag: 'dari kamu', d: 'Kamu koreksi sekali — misal "tone-nya lebih santai ya".' },
        { k: '02', t: 'Tersimpan permanen', tag: 'permanen', d: 'Ditulis jadi memory permanen, bukan cuma chat sesi ini.' },
        { k: '03', t: 'Dipakai ulang', tag: 'otomatis', d: 'Dipanggil otomatis tiap kerja berikutnya — tanpa kamu ulang.' },
      ];
      const recalls = ['Tone persona', 'Refund SOP', 'Format laporan', 'Gaya nulis kamu'];
      const stats = [
        { t: 'Sekali diajarin', d: 'Koreksi cukup sekali' },
        { t: 'Nempel permanen', d: 'Lintas sesi, bukan sesaat' },
        { t: 'Recall cepat', d: 'Dipanggil saat dibutuhkan' },
        { t: 'Persona konsisten', d: 'Sudah kami fine-tune' },
      ];
      return (
        <section id="memory" className="kt-mem">
          <div className="kt-mem-inner">
            <div className="kt-mem-head">
              <div className="kt-eyebrow"><span className="kt-eyebrow-dot" />Memori &amp; persona</div>
              <h2 className="kt-h2">Ajarin sekali. <span className="kt-grad-text">Dia ingat seterusnya.</span></h2>
              <p className="kt-lead">Tiap koreksi dari kamu langsung jadi memory permanen — bukan cuma chat sesi ini. Persona kerjanya sudah kami fine-tune dari awal, jadi nada dan caranya konsisten.</p>
              <div className="kt-mem-stats">
                {stats.map((s) => <div key={s.t} className="kt-mem-stat"><div className="kt-mem-stat-t">{s.t}</div><div className="kt-mem-stat-d">{s.d}</div></div>)}
              </div>
            </div>
            <div className="kt-mem-flow">
              {flow.map((f, i) => (
                <div key={f.k} className="kt-mem-step">
                  <div className="kt-mem-step-num">{f.k}</div>
                  <div className="kt-mem-step-body">
                    <div className="kt-mem-step-top"><span className="kt-mem-step-t">{f.t}</span><span className="kt-mem-step-tag">{f.tag}</span></div>
                    <div className="kt-mem-step-d">{f.d}</div>
                    {i === 2 && <div className="kt-mem-recalls">{recalls.map((r) => <span key={r} className="kt-tool-chip">{r}</span>)}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    }

    function ProductAppsSection() {
      // Section 4 — one agent covers many work domains (content, fitness,
      // finance, school) from one chat. HONEST: it drafts/prepares real
      // deliverables, kamu approves; the design's fabricated standalone
      // "Harga normal Rp X / Rp Y/bln" anchors are DROPPED (we don't sell
      // these standalone at those prices — shipping them would be deceptive).
      const apps = [
        { name: 'Konten', desc: 'Susun dan jadwalkan konten kamu.', u: 'Atur konten minggu ini dong', a: 'Sudah aku susun 7 post minggu ini, lengkap draf caption gaya kamu.', tag: 'KONTEN', mini: ['7 post', '3 reels', '7 caption'] },
        { name: 'Program latihan', desc: 'Atur program latihan, catat progres.', u: 'Susun program latihanku', a: 'Program latihan kamu aku tata — progres hari ini tercatat.', tag: 'WORKOUT', mini: ['Deadlift 5×5', 'Streak 12 hari', 'Gym day'] },
        { name: 'Keuangan', desc: 'Rapikan cashflow, kasih ringkasan.', u: 'Rapikan keuangan bulan ini', a: 'Pemasukan dan pengeluaran aku rapikan — ini ringkasan minggu ini.', tag: 'CASHFLOW', mini: ['Net minggu ini', 'Pemasukan', 'Ringkasan'] },
        { name: 'Sekolah', desc: 'Pantau tugas dan tenggat sekolah.', u: 'Bantu siapin tugas minggu ini', a: 'Tugas dan tenggat minggu ini aku rapikan — draf jawaban siap kamu cek.', tag: 'SEKOLAH', mini: ['3 tugas', '2 tenggat', 'Draf siap'] },
      ];
      return (
        <section id="apps" className="kt-apps">
          <div className="kt-apps-inner">
            <div className="kt-apps-head">
              <div className="kt-eyebrow"><span className="kt-eyebrow-dot" />Lebih dari chatbot</div>
              <h2 className="kt-h2">Agen kamu nggak cuma menjawab — <span className="kt-grad-text">dia ngerjain kerja beneran.</span></h2>
              <p className="kt-lead">Konten, program latihan, keuangan, tugas sekolah — pekerjaan yang biasanya butuh tool terpisah, dia tangani dari satu chat. Tinggal kamu setujui hasilnya.</p>
            </div>
            <div className="kt-apps-grid">
              {apps.map((ap) => (
                <div key={ap.name} className="kt-app-card">
                  <div className="kt-app-top">
                    <div className="kt-app-name">{ap.name}</div>
                    <span className="kt-app-inc">Termasuk paket</span>
                  </div>
                  <div className="kt-app-desc">{ap.desc}</div>
                  <div className="kt-app-chat">
                    <div className="kt-app-msg user">{ap.u}</div>
                    <div className="kt-app-msg agent">{ap.a}</div>
                  </div>
                  <div className="kt-app-mini">
                    <span className="kt-app-mini-tag">{ap.tag}</span>
                    {ap.mini.map((m) => <span key={m} className="kt-app-mini-chip">{m}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    }

    function SkillsSection() {
      // Section 5 — skill library the agent ships with. Honest: each maps to a
      // real capability (24/7 uptime, decks, memory, ideation, scripts, Excel,
      // research-summarize). The design's "File Management · 128 file" implied
      // filesystem access we lack → reframed to "Riset & Ringkas". Coding is the
      // coming-soon (SEGERA) early-access skill → WhatsApp CTA.
      const skills = [
        { n: '01', tag: 'SKILL', name: 'Siaga 24/7', desc: 'Jam 23:47 kepikiran sesuatu? Chat aja — dia nggak tidur, nggak cuti.', ex: 'selalu online', wide: true },
        { n: '02', tag: 'SKILL', name: 'Pitch Deck', desc: 'Slide deck dengan alur cerita yang jelas.', ex: '12 slide' },
        { n: '03', tag: 'SKILL', name: 'Memori Relasi', desc: 'Ingat klien, konteks, dan janji kamu.', ex: 'tersimpan' },
        { n: '04', tag: 'SKILL', name: 'Radar Ide', desc: 'Ide konten dan angle, lengkap hook pembuka.', ex: '5 ide' },
        { n: '05', tag: 'SKILL', name: 'Script Generator', desc: 'Script video terstruktur, tinggal kamu rekam.', ex: 'hook · body · cta' },
        { n: '06', tag: 'SKILL', name: 'Excel Wizard', desc: 'Formula, pivot, dan rapikan data spreadsheet.', ex: '=SUMIFS' },
        { n: '07', tag: 'SKILL', name: 'Riset & Ringkas', desc: 'Riset topik, rangkum jadi poin penting.', ex: '3 sumber' },
      ];
      return (
        <section id="skills" className="kt-skills">
          <div className="kt-skills-inner">
            <div className="kt-skills-head">
              <div className="kt-eyebrow"><span className="kt-eyebrow-dot" />Skill bawaan</div>
              <h2 className="kt-h2">Skill siap pakai. <span className="kt-grad-text">Langsung dari kotak.</span></h2>
              <p className="kt-lead">Agen kamu datang dengan skill yang sudah kami fine-tune. Tanpa setup ribet — tinggal kamu minta.</p>
            </div>
            <div className="kt-skills-grid">
              {skills.map((s) => (
                <div key={s.n} className={'kt-skill-card' + (s.wide ? ' wide' : '')}>
                  <div className="kt-skill-num">{s.n} · {s.tag}</div>
                  <div className="kt-skill-name">{s.name}</div>
                  <div className="kt-skill-desc">{s.desc}</div>
                  <div className="kt-skill-ex"><span className="kt-skill-ex-chip">{s.ex} <span className="kt-skill-check">✓</span></span></div>
                </div>
              ))}
              <div className="kt-skill-card wide kt-skill-soon">
                <div className="kt-skill-num">08 · <span className="kt-skill-soon-tag">SEGERA</span></div>
                <div className="kt-skill-name">Coding</div>
                <div className="kt-skill-desc">Bikin tool dan automasi kecil langsung dari chat. Masih kami siapkan — kamu bisa coba duluan.</div>
                <a href="https://wa.me/6282154902561?text=Halo%20Richie%2C%20mau%20early%20access%20Code%20Wizard%20agent%20di%20weuseai.agent" target="_blank" rel="noopener" className="kt-skill-cta cta-tactile no-underline">Minta early access <ArrowUpRight size={13} stroke={2.2} /></a>
              </div>
              <a href="use-cases.html" className="kt-skill-card wide kt-skill-uc no-underline">
                <div className="kt-skill-num">CONTOH NYATA</div>
                <div className="kt-skill-name">Lihat cara orang pakai →</div>
                <div className="kt-skill-desc">Contoh nyata dari berbagai usaha dan peran.</div>
              </a>
            </div>
          </div>
        </section>
      );
    }

    function StepperSection() {
      // Section 6 — how it works. id="proses" so the nav "Kerja" anchor lands
      // here. HONESTY: design's "Delapan menit" → "Lima menit" (matches the
      // standing ~5-menit setup claim, CLAUDE.md); step-1 misleading "Rp 99rb"
      // dropped (price lives in Pricing); step-4 "Rangkum email" reframed to a
      // content example (the agent has no live email access — DashboardDemo lock).
      const visual = (type) => {
        if (type === 'plan') return (
          <div className="kt-sv">
            <div className="kt-sv-row"><span className="kt-sv-k">PLAN</span><span className="kt-sv-v">Instance dedicated</span></div>
            <span className="kt-sv-pill">Langsung termasuk</span>
          </div>
        );
        if (type === 'form') return (
          <div className="kt-sv">
            <div className="kt-sv-row"><span className="kt-sv-k">CHANNEL</span><span className="kt-sv-v">Telegram</span></div>
            <div className="kt-sv-row"><span className="kt-sv-k">AI BRAIN</span><span className="kt-sv-v">Hand-picked</span></div>
            <div className="kt-sv-row"><span className="kt-sv-k">BOT TOKEN</span><span className="kt-sv-v">••••••••</span></div>
          </div>
        );
        if (type === 'setup') return (
          <div className="kt-sv">
            {['VPS provisioned', 'Tools tersambung', 'Voice tuned'].map((x) => <div key={x} className="kt-sv-check"><span className="kt-skill-check">✓</span>{x}</div>)}
          </div>
        );
        return (
          <div className="kt-sv kt-sv-chat">
            <div className="kt-app-msg user">Susun kalender konten minggu ini</div>
            <div className="kt-app-msg agent">Beres — 7 post, draf caption gaya kamu.</div>
          </div>
        );
      };
      const steps = [
        { n: '01', t: 'Pilih plan kamu', d: 'Satu instance dedicated, khusus buat kamu — langsung termasuk.', v: 'plan' },
        { n: '02', t: 'Isi informasi', d: 'Pilih channel Telegram, isi bot token. AI brain-nya kami yang pilihkan.', v: 'form' },
        { n: '03', t: 'Sistem auto-setup', d: 'Server, persona, dan template — kami siapkan otomatis.', v: 'setup' },
        { n: '04', t: 'Mulai pakai', d: 'Buka Telegram, kirim pesan, beres.', v: 'chat' },
      ];
      return (
        <section id="proses" className="kt-steps">
          <div className="kt-steps-inner">
            <div className="kt-steps-head">
              <div className="kt-eyebrow"><span className="kt-eyebrow-dot" />Cara kerjanya</div>
              <h2 className="kt-h2">Empat langkah. <span className="kt-grad-text">Lima menit.</span></h2>
            </div>
            <div className="kt-steps-grid">
              {steps.map((s) => (
                <div key={s.n} className="kt-step">
                  <div className="kt-step-num">{s.n}</div>
                  <div className="kt-step-t">{s.t}</div>
                  <div className="kt-step-d">{s.d}</div>
                  <div className="kt-step-visual">{visual(s.v)}</div>
                </div>
              ))}
            </div>
            <div className="kt-steps-cta">
              <a href="#pricing" className="kt-cta-primary cta-tactile no-underline">Aktifkan asisten kamu <ArrowUpRight size={14} stroke={2.2} /></a>
            </div>
          </div>
        </section>
      );
    }

    function App() {
      return (
        <div className="bg-black">
          <div className="relative z-10">
            <Navbar />
            <main id="main">
              <DashboardDemo />
              <div className="bg-black">
                {/* Konten redesign sections. Legacy aurora-era sections retired
                    from the composition; defs pruned at cleanup (Iter 12). */}
                <ExploreSection />
                <MemoryPersonaSection />
                <ProductAppsSection />
                <SkillsSection />
                <StepperSection />
                <Pricing />
                <FAQ />
              </div>
            </main>
            <CtaFooter />
          </div>
        </div>
      );
    }

    // Catch any render error so a single bad component degrades gracefully
    // instead of white-screening the whole page.
    class ErrorBoundary extends React.Component {
      constructor(p) { super(p); this.state = { failed: false }; }
      static getDerivedStateFromError() { return { failed: true }; }
      componentDidCatch(err) { try { console.error('Landing render error:', err); } catch (e) {} }
      render() {
        if (this.state.failed) {
          return React.createElement('div', { style: { minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px', color: '#f5f5f5', fontFamily: 'Inter, sans-serif' } },
            React.createElement('div', null,
              React.createElement('p', { style: { fontSize: '18px', marginBottom: '16px' } }, 'Lagi ada kendala memuat halaman.'),
              React.createElement('a', { href: 'checkout.html?plan=library-full', style: { color: '#E5322D', textDecoration: 'underline' } }, 'Lanjut ke checkout →')));
        }
        return this.props.children;
      }
    }

    ReactDOM.createRoot(document.getElementById('app')).render(<ErrorBoundary><App /></ErrorBoundary>);
