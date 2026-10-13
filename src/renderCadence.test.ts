import { expect, test } from "bun:test";

import { minRenderIntervalMs } from "./renderCadence";

test("PTY fallback renders are spaced to keep full-PNG frames off a slow link", () => {
  expect(minRenderIntervalMs("kitty-pty")).toBe(200);
});

test("graphics transports keep the fast render cadence", () => {
  expect(minRenderIntervalMs("daemon-stream")).toBe(50);
  expect(minRenderIntervalMs("native")).toBe(50);
  expect(minRenderIntervalMs(null)).toBe(50);
});
