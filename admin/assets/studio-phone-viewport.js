export function bindVisualViewport() {
  const root = document.documentElement;
  const vv = window.visualViewport;
  function sync() {
    const height = vv ? vv.height : window.innerHeight;
    const kb = Math.max(0, window.innerHeight - height - (vv ? vv.offsetTop : 0));
    root.style.setProperty('--vvh', height + 'px');
    root.style.setProperty('--kb', kb + 'px');
    document.body.classList.toggle('is-kb', kb > 80);
  }
  if (vv) {
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
  }
  addEventListener('resize', sync);
  sync();
  return () => {
    if (vv) {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    }
    removeEventListener('resize', sync);
  };
}

export function scrollIntoVisual(el) {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const vv = window.visualViewport;
  const top = vv ? vv.offsetTop : 0;
  const left = vv ? vv.offsetLeft : 0;
  const height = vv ? vv.height : window.innerHeight;
  const width = vv ? vv.width : window.innerWidth;
  let dy = 0;
  let dx = 0;
  if (rect.bottom > top + height) dy = rect.bottom - top - height;
  if (rect.top - dy < top) dy = rect.top - top;
  if (rect.right > left + width) dx = rect.right - left - width;
  if (rect.left - dx < left) dx = rect.left - left;
  if (dx || dy) scrollBy(dx, dy);
}
