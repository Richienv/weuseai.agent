function canShareFile(file) {
  try {
    return Boolean(navigator.canShare && navigator.canShare({ files: [file] }));
  } catch {
    return false;
  }
}

function revokeNextTick(url) {
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function saveVideoFile(file) {
  if (!file) return { method: 'tab', ok: false };
  const ua = navigator.userAgent || '';
  const mobile = /iPad|iPhone|iPod|Android/i.test(ua);
  const ios = /iPad|iPhone|iPod/.test(ua);
  if (mobile && canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: 'Video' });
      return { method: 'share', ok: true };
    } catch {
      return { method: 'share', ok: false };
    }
  }
  const url = URL.createObjectURL(file);
  try {
    if (ios) {
      const tab = window.open(url, '_blank');
      if (tab) {
        try { tab.opener = null; } catch {}
        return { method: 'tab', ok: true };
      }
      return { method: 'tab', ok: false };
    }
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name || 'video.mp4';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    return { method: 'download', ok: true };
  } catch {
    return { method: ios ? 'tab' : 'download', ok: false };
  } finally {
    revokeNextTick(url);
  }
}

export function teardownVideo(videoEl) {
  if (!videoEl) return;
  videoEl.pause();
  videoEl.removeAttribute('src');
  videoEl.load();
}

export function playerProps() {
  return { playsInline: true, 'webkit-playsinline': 'true', controls: true, preload: 'metadata' };
}
