import { referenceMentions } from '../../api/_shared/ai-video-operator.ts';
const { useRef, useState, useEffect, useLayoutEffect, useImperativeHandle, forwardRef } = React;

function HighlightedPrompt({ value, references, onMissing }) {
  const parts = []; let cursor = 0;
  for (const mention of referenceMentions(value)) {
    parts.push(value.slice(cursor, mention.start));
    const row = references.find((item) => item.tag === mention.tag);
    const missing = !row;
    parts.push(<mark key={mention.start} className={'sv-mention ' + (row ? row.kind : 'missing')} style={missing ? { pointerEvents: 'auto' } : undefined} onPointerDown={missing ? (event) => { event.preventDefault(); onMissing?.(mention); } : undefined}>{value.slice(mention.start, mention.end)}</mark>);
    cursor = mention.end;
  }
  parts.push(value.slice(cursor) + '\n');
  return parts;
}

export const ReferencePrompt = forwardRef(function ReferencePrompt({ value, onChange, references, disabled, onSubmit, onFiles }, control) {
  const input = useRef(null), mirror = useRef(null), menu = useRef(null);
  const selection = useRef({ start: value.length, end: value.length }), composing = useRef(false), pendingCursor = useRef(null);
  const queryRef = useRef(null), valueRef = useRef(value), frozen = useRef(false), lastInsert = useRef({ tag: '', at: 0 });
  const [query, setQuery] = useState(null), [active, setActive] = useState(0);
  valueRef.current = value;
  const candidates = query ? references.filter((row) => (row.tag + ' ' + row.name).toLowerCase().includes(query.text.toLowerCase())) : [];
  function syncMirror() {
    if (!input.current || !mirror.current) return;
    mirror.current.style.width = input.current.clientWidth + 'px';
    mirror.current.scrollTop = input.current.scrollTop; mirror.current.scrollLeft = input.current.scrollLeft;
  }
  function placeCaret(position) {
    selection.current = { start: position, end: position };
    pendingCursor.current = position;
    input.current?.focus({ preventScroll: true });
  }
  useLayoutEffect(() => {
    if (pendingCursor.current !== null && input.current) {
      const position = pendingCursor.current; pendingCursor.current = null;
      input.current.focus({ preventScroll: true }); input.current.setSelectionRange(position, position);
    }
    syncMirror();
    if (menu.current) menu.current.style.setProperty('--sv-tag-menu-top', (menu.current.getBoundingClientRect().top + 12) + 'px');
  }, [value, query]);
  useEffect(() => {
    const observer = new ResizeObserver(syncMirror); observer.observe(input.current);
    function onPointerDown(event) {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (!target || !input.current) return;
      if (target === input.current || input.current.contains(target)) { frozen.current = false; return; }
      frozen.current = true;
      const chip = target.closest('.sv-reference-preview');
      if (chip && !chip.disabled && chip.closest('.sv-prompt-box') && document.activeElement === input.current) event.preventDefault();
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => { observer.disconnect(); document.removeEventListener('pointerdown', onPointerDown, true); };
  }, []);
  function track(element, text = element.value) {
    if (frozen.current) return;
    const start = element.selectionStart, end = element.selectionEnd;
    selection.current = { start, end };
    const match = start === end && /(?:^|[\s([{=,:])@([A-Za-z0-9_]*)$/.exec(text.slice(0, start));
    const next = match ? { start: start - match[1].length - 1, end: start, text: match[1] } : null;
    queryRef.current = next; setQuery(next); setActive(0);
  }
  function insert(tag) {
    const current = input.current;
    if (!current || disabled) return;
    const now = Date.now();
    if (lastInsert.current.tag === tag && now - lastInsert.current.at < 300) return;
    lastInsert.current = { tag, at: now };
    const text = valueRef.current;
    const range = queryRef.current;
    const start = Math.max(0, Math.min(range?.start ?? selection.current.start, text.length));
    const end = Math.max(start, Math.min(range?.end ?? selection.current.end, text.length));
    const before = text.slice(0, start), after = text.slice(end);
    const insertion = (before && !/[\s([{=,:]$/.test(before) ? ' ' : '') + tag + ' ';
    const position = before.length + insertion.length;
    frozen.current = false; queryRef.current = null; setQuery(null);
    placeCaret(position);
    onChange(before + insertion + after);
  }
  function selectMissing(mention) {
    const current = input.current;
    if (!current || disabled) return;
    frozen.current = false; queryRef.current = null; setQuery(null);
    current.focus({ preventScroll: true });
    if (selection.current.start === mention.start && selection.current.end === mention.end) {
      placeCaret(mention.start);
      onChange(valueRef.current.slice(0, mention.start) + valueRef.current.slice(mention.end));
      return;
    }
    current.setSelectionRange(mention.start, mention.end);
    selection.current = { start: mention.start, end: mention.end };
  }
  useImperativeHandle(control, () => ({ insert, focus: () => input.current?.focus({ preventScroll: true }) }));
  function keyDown(event) {
    if (composing.current || event.nativeEvent.isComposing) return;
    if (query && candidates.length) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next = (active + (event.key === 'ArrowDown' ? 1 : -1) + candidates.length) % candidates.length;
        setActive(next); document.getElementById('reference-option-' + next)?.scrollIntoView({ block: 'nearest' }); return;
      }
      if ((event.key === 'Enter' && !event.metaKey && !event.ctrlKey) || event.key === 'Tab') {
        if (candidates[active]?.status === 'ready') { event.preventDefault(); insert(candidates[active].tag); }
        return;
      }
    }
    if (event.key === 'Escape') { event.preventDefault(); queryRef.current = null; setQuery(null); return; }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') onSubmit(event);
  }
  return <>
    <style>{`#studio-prompt{-webkit-text-fill-color:transparent;overflow-wrap:break-word}#studio-prompt::placeholder{-webkit-text-fill-color:#8a909b;color:#8a909b}#studio-prompt::selection,#studio-prompt::-moz-selection{background:#829aff55;color:transparent;-webkit-text-fill-color:transparent}.sv-prompt-highlight{overflow-wrap:break-word}`}</style>
    <div className="sv-reference-editor">
      <label className="sv-sr-only" htmlFor="studio-prompt">Prompt video</label>
      <div className="sv-prompt-highlight" ref={mirror} aria-hidden="true" style={{ overflowWrap: 'break-word' }}><HighlightedPrompt value={value} references={references} onMissing={selectMissing}/></div>
      <textarea id="studio-prompt" ref={input} value={value} enterKeyHint="done" inputMode="text" style={{ WebkitTextFillColor: 'transparent', overflowWrap: 'break-word' }} onChange={(event) => { frozen.current = false; valueRef.current = event.target.value; onChange(event.target.value); if (!composing.current) track(event.target); }} onSelect={(event) => { if (document.activeElement === event.target && !composing.current) track(event.target); }} onFocus={() => { frozen.current = false; }} onBlur={() => { setQuery(null); const saved = queryRef.current; window.setTimeout(() => { if (queryRef.current === saved && document.activeElement !== input.current) queryRef.current = null; }, 400); }} onScroll={syncMirror} onCompositionStart={() => { composing.current = true; queryRef.current = null; setQuery(null); }} onCompositionEnd={(event) => { composing.current = false; track(event.target); }} onKeyDown={keyDown} onPaste={(event) => { if (event.clipboardData.files.length) { event.preventDefault(); onFiles(event.clipboardData.files); } }} placeholder="Mau bikin video apa?" spellCheck="false" disabled={disabled} aria-autocomplete="list" aria-controls={query ? 'reference-options' : undefined} aria-activedescendant={query && candidates.length ? 'reference-option-' + active : undefined}/>
    </div>
    {query ? <div className="sv-tag-menu" id="reference-options" ref={menu} role="listbox" aria-label="Pilih referensi" style={{ maxHeight: 'min(180px, max(48px, calc(var(--vvh, 100svh) - var(--sv-tag-menu-top, 0px))))' }}>{candidates.length ? candidates.map((row, index) => <button key={row.id} id={'reference-option-' + index} type="button" role="option" aria-selected={index === active} aria-disabled={row.status !== 'ready'} className={row.kind} onPointerDown={(event) => event.preventDefault()} onClick={() => { if (row.status === 'ready') insert(row.tag); }}>{row.kind !== 'audio' && row.preview ? <img src={row.preview} alt=""/> : <span className="sv-tag-kind">{row.kind === 'audio' ? 'A' : 'V'}</span>}<span><strong>{row.tag}</strong><small>{row.status === 'uploading' ? 'Menyiapkan…' : row.status === 'failed' ? 'Upload belum selesai' : row.name}</small></span></button>) : <p>{references.length ? 'Referensi tidak ditemukan.' : 'Upload foto, video, atau audio untuk memakai tag.'}</p>}</div> : null}
  </>;
});
