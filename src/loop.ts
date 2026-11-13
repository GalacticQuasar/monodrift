// Fixed-timestep loop: physics always advances in identical steps regardless of
// display refresh rate; rendering happens once per frame with an interpolation factor.

export function startLoop(opts: {
  hz: number;
  maxFrameTime: number;
  update: (dt: number) => void;
  render: (alpha: number) => void;
}): void {
  const dt = 1 / opts.hz;
  let acc = 0;
  let last = performance.now();

  function frame(now: number) {
    acc += Math.min(opts.maxFrameTime, Math.max(0, (now - last) / 1000));
    last = now;
    while (acc >= dt) {
      opts.update(dt);
      acc -= dt;
    }
    opts.render(acc / dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
