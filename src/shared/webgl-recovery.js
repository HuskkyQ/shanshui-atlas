/**
 * Adds a small, local recovery message for a lost WebGL context.
 * The browser owns context restoration; this helper only prevents the default
 * loss handling, tells the user what happened, and removes the message when
 * rendering is restored.
 */
export function attachWebGLRecovery(
  canvas,
  {
    document = globalThis.document,
    reload = () => globalThis.location?.reload(),
    onLost,
    onRestored,
  } = {},
) {
  if (!canvas?.addEventListener) return () => {};
  let notice = null;

  function showNotice() {
    if (!document?.createElement || !canvas.parentNode || notice) return;
    notice = document.createElement('div');
    notice.className = 'webgl-recovery-notice';
    notice.setAttribute('role', 'alert');
    notice.textContent = '画面暂时失去响应，正在尝试恢复…';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = '重新加载';
    retry.addEventListener('click', reload);
    notice.append(retry);
    canvas.parentNode.append(notice);
  }

  function clearNotice() {
    notice?.remove();
    notice = null;
  }

  function onContextLost(event) {
    event.preventDefault?.();
    showNotice();
    onLost?.(event);
  }

  function onContextRestored(event) {
    clearNotice();
    onRestored?.(event);
  }

  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);
  return () => {
    canvas.removeEventListener('webglcontextlost', onContextLost, false);
    canvas.removeEventListener('webglcontextrestored', onContextRestored, false);
    clearNotice();
  };
}
