const MIN_RENDER_INTERVAL_MS = 50;
// Without pane graphics every render writes a full base64 PNG to the PTY.
// At 50 ms a scroll burst pushes several MB/s through a remote attach and the
// whole Herdr client lags behind it; five frames a second keeps it responsive.
const PTY_MIN_RENDER_INTERVAL_MS = 200;

export function minRenderIntervalMs(transport: string | null): number {
  return transport === "kitty-pty" ? PTY_MIN_RENDER_INTERVAL_MS : MIN_RENDER_INTERVAL_MS;
}
