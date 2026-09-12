import { referenceMentions } from '../../api/_shared/ai-video-operator.ts';
const { useRef, useState, useEffect, useLayoutEffect, useImperativeHandle, forwardRef } = React;

function HighlightedPrompt({ value, references }) {
  const parts = []; let cursor = 0;
  for (const mention of referenceMentions(value)) {
    parts.push(value.slice(cursor, mention.start));
    const row = references.find((item) => item.tag === mention.tag);
    parts.push(<mark key={mention.start} className={'sv-mention ' + (row ? row.kind : 'missing')}>{value.slice(mention.start, mention.end)}</mark>);
    cursor = mention.end;
  }
  parts.push(value.slice(cursor) + '\n');
  return parts;
}

export const ReferencePrompt = forwardRef(function ReferencePrompt({ value, onChange, references, disabled, onSubmit, onFiles }, control) {
  const input = useRef(null), mirror = useRef(null), selection = useRef({ start: value.length, end: value.length }), composing = useRef(false);
  const pendingCursor = useRef(null);
  function syncMirror() {
    if (!input.current || !mirror.current) return;
    mirror.current.style.width = input.current.clientWidth + 'px';
    mirror.current.scrollTop = input.current.scrollTop; mirror.current.scrollLeft = input.current.scrollLeft;
  }
  useLayoutEffect(() => {
    if (pendingCursor.current !== null && input.current) {
      const position = pendingCursor.current; pendingCursor.current = null;
      input.current.focus({ preventScroll: true }); input.current.setSelectionRange(position, position);
    }
    syncMirror();
  }, [value]);
  useEffect(() => {
    const observer = new ResizeObserver(syncMirror); observer.observe(input.current);
    return () => observer.disconnect();
  }, []);
  const [query, setQuery] = useState(null), [active, setActive] = useState(0);
  const candidates = query ? references.filter((row) => (row.tag + ' ' + row.name).toLowerCase().includes(query.text.toLowerCase())) : [];
  function track(element, text = element.value) {
    const start = element.selectionStart, end = element.selectionEnd;
    selection.current = { start, end };
    const match = start === end && /(?:^|[\s([{=,:])@([A-Za-z0-9_]*)$/.exec(text.slice(0, start));
    setQuery(match ? { start: start - match[1].length - 1, end: start, text: match[1] } : null); setActive(0);
  }
  function insert(tag) {
    const current = input.current;
    if (!current || disabled) return;
    const start = query?.start ?? selection.current.start, end = query?.end ?? selection.current.end;
    const before = value.slice(0, start), after = value.slice(end);
    const insertion = (before && !/[\s([{=,:]$/.test(before) ? ' ' : '') + tag + ' ';
    const position = before.length + insertion.length;
    selection.current = { start: position, end: position }; pendingCursor.current = position;
    onChange(before + insertion + after); setQuery(null);
  }
  useImperativeHandle(control, () => ({ insert, focus: () => input.current?.focus() }));
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
    if (event.key === 'Escape') { event.preventDefault(); setQuery(null); return; }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') onSubmit(event);
  }
  return <>
    <div className="sv-reference-editor">
      <label className="sv-sr-only" htmlFor="studio-prompt">Prompt video</label>
      <div className="sv-prompt-highlight" ref={mirror} aria-hidden="true"><HighlightedPrompt value={value} references={references}/></div>
      <textarea id="studio-prompt" ref={input} value={value} onChange={(event) => { onChange(event.target.value); if (!composing.current) track(event.target); }} onSelect={(event) => { if (document.activeElement === event.target && !composing.current) track(event.target); }} onBlur={() => setQuery(null)} onScroll={syncMirror} onCompositionStart={() => { composing.current = true; setQuery(null); }} onCompositionEnd={(event) => { composing.current = false; track(event.target); }} onKeyDown={keyDown} onPaste={(event) => { if (event.clipboardData.files.length) { event.preventDefault(); onFiles(event.clipboardData.files); } }} placeholder="Mau bikin video apa?" spellCheck="false" disabled={disabled} aria-autocomplete="list" aria-controls={query ? 'reference-options' : undefined} aria-activedescendant={query && candidates.length ? 'reference-option-' + active : undefined}/>
    </div>
    {query ? <div className="sv-tag-menu" id="reference-options" role="listbox" aria-label="Pilih referensi">{candidates.length ? candidates.map((row, index) => <button key={row.id} id={'reference-option-' + index} type="button" role="option" aria-selected={index === active} aria-disabled={row.status !== 'ready'} className={row.kind} onPointerDown={(event) => event.preventDefault()} onClick={() => { if (row.status === 'ready') insert(row.tag); }}>{row.kind !== 'audio' && row.preview ? <img src={row.preview} alt=""/> : <span className="sv-tag-kind">{row.kind === 'audio' ? 'A' : 'V'}</span>}<span><strong>{row.tag}</strong><small>{row.status === 'uploading' ? 'Menyiapkan…' : row.status === 'failed' ? 'Upload belum selesai' : row.name}</small></span></button>) : <p>{references.length ? 'Referensi tidak ditemukan.' : 'Upload foto, video, atau audio untuk memakai tag.'}</p>}</div> : null}
  </>;
});
