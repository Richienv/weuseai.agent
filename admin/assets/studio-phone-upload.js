export function rafProgress(emit) {
  let frame = 0;
  let lastInt = 0;
  return function (percent) {
    lastInt = Math.round(Number(percent) || 0);
    if (lastInt >= 100) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      emit(100);
      return;
    }
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      emit(lastInt);
    });
  };
}

export function bindPageLifecycle({ onHide, onShow }) {
  function hide() { onHide(); }
  function show() { onShow(); }
  function onVisibility() {
    if (document.visibilityState === 'hidden') onHide();
    else if (document.visibilityState === 'visible') onShow();
  }
  addEventListener('pagehide', hide);
  addEventListener('pageshow', show);
  document.addEventListener('freeze', hide);
  document.addEventListener('visibilitychange', onVisibility);
  return function () {
    removeEventListener('pagehide', hide);
    removeEventListener('pageshow', show);
    document.removeEventListener('freeze', hide);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

export function markUploadingFailed(refs, patchRef) {
  for (const ref of refs) {
    if (ref.status === 'uploading') patchRef(ref.id, { status: 'failed', error: 'Upload terhenti. Ketuk Ulangi.' });
  }
}
