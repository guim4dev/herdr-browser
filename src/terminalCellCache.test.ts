import { expect, test } from "bun:test";

import { TerminalCellCache } from "./terminalCellCache";

const size = { columns: 100, rows: 40 };

function countingProbe(answer: { width: number; height: number } | null) {
  const calls = { count: 0 };
  const probe = async () => {
    calls.count += 1;
    return answer;
  };
  return { calls, probe };
}

test("TerminalCellCache probes once per pane size", async () => {
  const { calls, probe } = countingProbe({ width: 8, height: 17 });
  const cache = new TerminalCellCache(probe);

  expect(await cache.get(size)).toEqual({ width: 8, height: 17 });
  expect(await cache.get(size)).toEqual({ width: 8, height: 17 });
  expect(calls.count).toBe(1);

  await cache.get({ columns: 120, rows: 40 });
  expect(calls.count).toBe(2);
});

test("TerminalCellCache shares one probe between concurrent renders", async () => {
  const { calls, probe } = countingProbe({ width: 8, height: 17 });
  const cache = new TerminalCellCache(probe);

  await Promise.all([cache.get(size), cache.get(size), cache.get(size)]);
  expect(calls.count).toBe(1);
});

test("TerminalCellCache retries an unanswered probe only after the retry interval", async () => {
  let now = 1_000;
  const { calls, probe } = countingProbe(null);
  const cache = new TerminalCellCache(probe, { missRetryMs: 10_000, now: () => now });

  expect(await cache.get(size)).toBeNull();
  now += 9_999;
  expect(await cache.get(size)).toBeNull();
  expect(calls.count).toBe(1);

  now += 1;
  await cache.get(size);
  expect(calls.count).toBe(2);
});
