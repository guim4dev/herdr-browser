import { expect, test } from "bun:test";

import { parseSgrMouseInput, type MouseRenderState } from "./mouse";

const state: MouseRenderState = {
  columns: 100,
  rows: 40,
  viewport: {
    width: 1000,
    height: 800,
  },
};

function parseViewportInput(input: string, renderState: MouseRenderState = state) {
  const { mouseEvents: _mouseEvents, ...result } = parseSgrMouseInput(input, renderState);
  return result;
}

test("parseSgrMouseInput maps released left click to viewport pixels", () => {
  expect(parseViewportInput("\x1b[<0;50;20m")).toEqual({
    clicks: [{ x: 495, y: 390 }],
    wheels: [],
    moves: [],
    keys: [],
    remainder: "",
  });
});

test("parseSgrMouseInput maps clicks below a reserved row offset", () => {
  expect(parseViewportInput("\x1b[<0;50;21m", {
    ...state,
    rowOffset: 1,
  })).toEqual({
    clicks: [{ x: 495, y: 390 }],
    wheels: [],
    moves: [],
    keys: [],
    remainder: "",
  });
});

test("parseSgrMouseInput ignores clicks outside the image grid", () => {
  expect(parseSgrMouseInput("\x1b[<0;101;20m", state).clicks).toEqual([]);
  expect(parseSgrMouseInput("\x1b[<0;50;41m", state).clicks).toEqual([]);
});

test("parseSgrMouseInput ignores non-left buttons", () => {
  expect(parseViewportInput("\x1b[<1;50;20m")).toEqual({
    clicks: [],
    wheels: [],
    moves: [],
    keys: [],
    remainder: "",
  });
});

test("parseSgrMouseInput handles press and release in one chunk", () => {
  expect(parseViewportInput("\x1b[<0;50;20M\x1b[<0;50;20m")).toEqual({
    clicks: [{ x: 495, y: 390 }],
    wheels: [],
    moves: [],
    keys: [],
    remainder: "",
  });
});

test("parseSgrMouseInput carries partial escape sequences across chunks", () => {
  const first = parseSgrMouseInput("\x1b[<0;50;", state);
  const { mouseEvents: _firstMouseEvents, ...firstViewport } = first;
  expect(firstViewport).toEqual({
    clicks: [],
    wheels: [],
    moves: [],
    keys: [],
    remainder: "\x1b[<0;50;",
  });

  expect(parseViewportInput(`${first.remainder}20m`)).toEqual({
    clicks: [{ x: 495, y: 390 }],
    wheels: [],
    moves: [],
    keys: [],
    remainder: "",
  });
});

test("parseSgrMouseInput maps wheel events", () => {
  expect(parseViewportInput("\x1b[<64;50;20M\x1b[<65;50;20M")).toEqual({
    clicks: [],
    wheels: [
      { x: 495, y: 390, deltaX: 0, deltaY: -120 },
      { x: 495, y: 390, deltaX: 0, deltaY: 120 },
    ],
    moves: [],
    keys: [],
    remainder: "",
  });
});

test("parseSgrMouseInput maps motion events to viewport pixels", () => {
  expect(parseViewportInput("\x1b[<35;50;20M")).toEqual({
    clicks: [],
    wheels: [],
    moves: [{ x: 495, y: 390, column: 50, row: 20 }],
    keys: [],
    remainder: "",
  });
});

test("parseSgrMouseInput maps motion below a reserved row offset", () => {
  expect(parseViewportInput("\x1b[<35;50;21M", {
    ...state,
    rowOffset: 1,
  })).toEqual({
    clicks: [],
    wheels: [],
    moves: [{ x: 495, y: 390, column: 50, row: 20 }],
    keys: [],
    remainder: "",
  });
});

test("parseSgrMouseInput maps text and basic keys", () => {
  expect(parseViewportInput("a\t\r\x7f\x1b[A")).toEqual({
    clicks: [],
    wheels: [],
    moves: [],
    keys: [
      { kind: "text", text: "a" },
      { kind: "key", key: "Tab" },
      { kind: "key", key: "Enter" },
      { kind: "key", key: "Backspace" },
      { kind: "key", key: "ArrowUp" },
    ],
    remainder: "",
  });
});

test("parseSgrMouseInput coalesces a run of printable text into one key", () => {
  expect(parseViewportInput("hello")).toEqual({
    clicks: [],
    wheels: [],
    moves: [],
    keys: [{ kind: "text", text: "hello" }],
    remainder: "",
  });
});

test("parseSgrMouseInput flushes buffered text before a non-text key and starts a new run", () => {
  expect(parseViewportInput("ab\tcd")).toEqual({
    clicks: [],
    wheels: [],
    moves: [],
    keys: [
      { kind: "text", text: "ab" },
      { kind: "key", key: "Tab" },
      { kind: "text", text: "cd" },
    ],
    remainder: "",
  });
});

test("parseSgrMouseInput flushes buffered text before a mouse event", () => {
  expect(parseViewportInput("ab\x1b[<0;50;20m")).toEqual({
    clicks: [{ x: 495, y: 390 }],
    wheels: [],
    moves: [],
    keys: [{ kind: "text", text: "ab" }],
    remainder: "",
  });
});

test("parseSgrMouseInput flushes buffered text before carrying a partial escape across chunks", () => {
  const first = parseSgrMouseInput("ab\x1b[", state);
  const { mouseEvents: _firstMouseEvents, ...firstViewport } = first;
  expect(firstViewport).toEqual({
    clicks: [],
    wheels: [],
    moves: [],
    keys: [{ kind: "text", text: "ab" }],
    remainder: "\x1b[",
  });

  expect(parseViewportInput(`${first.remainder}A`)).toEqual({
    clicks: [],
    wheels: [],
    moves: [],
    keys: [{ kind: "key", key: "ArrowUp" }],
    remainder: "",
  });
});

test("parseSgrMouseInput carries partial key escape sequences across chunks", () => {
  const first = parseSgrMouseInput("\x1b[", state);
  const { mouseEvents: _firstMouseEvents, ...firstViewport } = first;
  expect(firstViewport).toEqual({
    clicks: [],
    wheels: [],
    moves: [],
    keys: [],
    remainder: "\x1b[",
  });

  expect(parseViewportInput(`${first.remainder}A`)).toEqual({
    clicks: [],
    wheels: [],
    moves: [],
    keys: [{ kind: "key", key: "ArrowUp" }],
    remainder: "",
  });
});

test("parseSgrMouseInput exposes decoded mouse cell events", () => {
  expect(parseSgrMouseInput("\x1b[<0;17;1m", state).mouseEvents).toEqual([
    {
      button: 0,
      column: 17,
      row: 1,
      released: true,
    },
  ]);
});

// Herdr answers the viewer's own `CSI 16t` cell-size probe with `CSI 6;h;w t`
// on the pane's stdin. Parsed as keys, that reply typed "[6;17;8t" into the
// focused page field on every render and triggered the next render.
test("parseSgrMouseInput drops a terminal cell-size reply instead of typing it", () => {
  expect(parseViewportInput("\x1b[6;17;8t")).toEqual({
    clicks: [],
    wheels: [],
    moves: [],
    keys: [],
    remainder: "",
  });
});

test("parseSgrMouseInput drops terminal replies around typed text", () => {
  expect(parseViewportInput("ab\x1b[?62;22c\x1b[12;40R\x1b_Gi=31;OK\x1b\\\x1b]11;rgb:0000/0000/0000\x07\x1bP1$r0m\x1b\\cd")).toEqual({
    clicks: [],
    wheels: [],
    moves: [],
    keys: [
      { kind: "text", text: "ab" },
      { kind: "text", text: "cd" },
    ],
    remainder: "",
  });
});

test("parseSgrMouseInput drops unmapped CSI keys instead of typing their bytes", () => {
  expect(parseViewportInput("\x1b[1;5C\x1b[15~\x1b[I")).toEqual({
    clicks: [],
    wheels: [],
    moves: [],
    keys: [],
    remainder: "",
  });
});

test("parseSgrMouseInput carries a terminal reply split across chunks", () => {
  const first = parseSgrMouseInput("\x1b[6;17", state);
  expect(first.keys).toEqual([]);
  expect(first.remainder).toBe("\x1b[6;17");
  expect(parseViewportInput(`${first.remainder};8t`)).toEqual({
    clicks: [],
    wheels: [],
    moves: [],
    keys: [],
    remainder: "",
  });

  const apc = parseSgrMouseInput("\x1b_Gi=31;O", state);
  expect(apc.keys).toEqual([]);
  expect(apc.remainder).toBe("\x1b_Gi=31;O");
  expect(parseViewportInput(`${apc.remainder}K\x1b\\x`).keys).toEqual([{ kind: "text", text: "x" }]);
});
