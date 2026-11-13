// Debug frame-time readout, shown only with ?fps in the URL.
// Reports FPS and the slowest frame over each second, so hitches are visible.

export function createFpsMeter(): { frame(now: number): void } | null {
  if (!new URLSearchParams(location.search).has('fps')) return null;

  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed', left: '10px', bottom: '10px', zIndex: '3', pointerEvents: 'none',
    font: '12px ui-monospace, monospace', color: '#111', background: 'rgba(255,255,255,0.8)',
    padding: '4px 6px', borderRadius: '4px', whiteSpace: 'pre',
  });
  document.body.append(el);

  let last = 0, windowStart = 0, frames = 0, worst = 0;
  return {
    frame(now) {
      if (last) {
        frames++;
        worst = Math.max(worst, now - last);
      } else {
        windowStart = now;
      }
      last = now;
      if (now - windowStart >= 1000) {
        const fps = (frames * 1000) / (now - windowStart);
        el.textContent = `${fps.toFixed(0)} fps · worst ${worst.toFixed(1)} ms · ${devicePixelRatio}x`;
        windowStart = now;
        frames = 0;
        worst = 0;
      }
    },
  };
}
