export type MouseRenderState = {
  columns: number;
  rows: number;
  rowOffset?: number;
  viewport: {
    width: number;
    height: number;
  };
};

export type MouseClick = {
  x: number;
  y: number;
};

export type MouseWheel = {
  x: number;
  y: number;
  deltaX: number;
  deltaY: number;
};

export type MouseMove = {
  x: number;
  y: number;
  column: number;
  row: number;
};

export type SgrMouseEvent = {
  button: number;
  column: number;
  row: number;
  released: boolean;
};

export type TerminalKeyInput =
  | {
    kind: "text";
    text: string;
  }
  | {
    kind: "key";
    key:
      | "Enter"
      | "Tab"
      | "Backspace"
      | "Escape"
      | "ArrowUp"
      | "ArrowDown"
      | "ArrowLeft"
      | "ArrowRight";
  };

export type SgrMouseParseResult = {
  clicks: MouseClick[];
  wheels: MouseWheel[];
  moves: MouseMove[];
  mouseEvents: SgrMouseEvent[];
  keys: TerminalKeyInput[];
  remainder: string;
};

export function parseSgrMouseInput(
  input: string,
  state: MouseRenderState,
): SgrMouseParseResult {
  const clicks: MouseClick[] = [];
  const wheels: MouseWheel[] = [];
  const moves: MouseMove[] = [];
  const mouseEvents: SgrMouseEvent[] = [];
  const keys: TerminalKeyInput[] = [];
  let index = 0;
  // Consecutive printable code points are buffered and pushed as a single
  // "text" key so a typed burst or a paste becomes one dispatched key input
  // instead of one per code point.
  let textBuffer = "";
  const flushText = () => {
    if (textBuffer) {
      keys.push({ kind: "text", text: textBuffer });
      textBuffer = "";
    }
  };

  while (index < input.length) {
    if (input.startsWith("\x1b[<", index)) {
      const match = input.slice(index).match(/^\x1b\[<([0-9]+);([0-9]+);([0-9]+)([mM])/);
      if (!match) {
        const suffix = input.slice(index);
        if (isIncompleteMousePrefix(suffix)) {
          flushText();
          return { clicks, wheels, moves, mouseEvents, keys, remainder: suffix };
        }
      } else {
        flushText();
        index += match[0].length;
        const mouseEvent = mouseEventFromMatch(match);
        mouseEvents.push(mouseEvent);
        const event = viewportEventFromMouseEvent(mouseEvent, state);
        if (event?.kind === "click") {
          clicks.push(event.click);
        } else if (event?.kind === "wheel") {
          wheels.push(event.wheel);
        } else if (event?.kind === "move") {
          moves.push(event.move);
        }
        continue;
      }
    }

    const control = controlSequenceAt(input, index);
    if (control === "incomplete") {
      flushText();
      return { clicks, wheels, moves, mouseEvents, keys, remainder: input.slice(index) };
    }
    if (control) {
      flushText();
      if (control.key) {
        keys.push(control.key);
      }
      index += control.length;
      continue;
    }

    const suffix = input.slice(index);
    if (isIncompleteKeyPrefix(suffix)) {
      flushText();
      return { clicks, wheels, moves, mouseEvents, keys, remainder: suffix };
    }

    const key = keyInputAt(input, index);
    if (key) {
      flushText();
      keys.push(key.input);
      index += key.length;
      continue;
    }

    const text = printableTextAt(input, index);
    if (text) {
      textBuffer += text.value;
      index += text.length;
      continue;
    }

    flushText();
    index += 1;
  }

  flushText();
  return { clicks, wheels, moves, mouseEvents, keys, remainder: "" };
}

function mouseEventFromMatch(match: RegExpMatchArray): SgrMouseEvent {
  return {
    button: Number.parseInt(match[1], 10),
    column: Number.parseInt(match[2], 10),
    row: Number.parseInt(match[3], 10),
    released: match[4] === "m",
  };
}

function viewportEventFromMouseEvent(
  event: SgrMouseEvent,
  state: MouseRenderState,
): { kind: "click"; click: MouseClick } | { kind: "wheel"; wheel: MouseWheel } | { kind: "move"; move: MouseMove } | null {
  const { button, column, row, released } = event;
  const gridRow = row - (state.rowOffset ?? 0);
  if (gridRow < 1 || gridRow > state.rows || column < 1 || column > state.columns) {
    return null;
  }

  const point = {
    x: Math.floor(((column - 0.5) / state.columns) * state.viewport.width),
    y: Math.floor(((gridRow - 0.5) / state.rows) * state.viewport.height),
  };
  const buttonCode = button & 3;
  if (!released && (button & 64) === 64) {
    if (buttonCode === 0) {
      return { kind: "wheel", wheel: { ...point, deltaX: 0, deltaY: -120 } };
    }
    if (buttonCode === 1) {
      return { kind: "wheel", wheel: { ...point, deltaX: 0, deltaY: 120 } };
    }
    if (buttonCode === 2) {
      return { kind: "wheel", wheel: { ...point, deltaX: -120, deltaY: 0 } };
    }
    return { kind: "wheel", wheel: { ...point, deltaX: 120, deltaY: 0 } };
  }

  if (!released && (button & 32) === 32) {
    return {
      kind: "move",
      move: {
        ...point,
        column,
        row: gridRow,
      },
    };
  }

  if (!released || buttonCode !== 0 || (button & 64) === 64) {
    return null;
  }

  return { kind: "click", click: point };
}

const CSI_ARROW_KEYS: Record<string, TerminalKeyInput> = {
  A: { kind: "key", key: "ArrowUp" },
  B: { kind: "key", key: "ArrowDown" },
  C: { kind: "key", key: "ArrowRight" },
  D: { kind: "key", key: "ArrowLeft" },
};

// Terminal replies (cell-size, DA, DSR, kitty graphics, OSC colour queries) arrive
// on stdin like keys. A whole CSI/APC/OSC/DCS sequence is consumed here so its
// bytes never reach the page as typed text; only plain arrows map to a key.
function controlSequenceAt(
  input: string,
  index: number,
): { key: TerminalKeyInput | null; length: number } | "incomplete" | null {
  const sequence = input.slice(index);
  if (sequence.startsWith("\x1b[")) {
    const match = sequence.match(/^\x1b\[([0-?]*)[ -\/]*[@-~]/);
    if (match) {
      const final = match[0][match[0].length - 1];
      const key = match[1] === "" && match[0].length === 3 ? CSI_ARROW_KEYS[final] ?? null : null;
      return { key, length: match[0].length };
    }
    return /^\x1b\[[0-?]*[ -\/]*$/.test(sequence) ? "incomplete" : null;
  }
  if (/^\x1b[_\]P^X]/.test(sequence)) {
    const end = stringTerminatorAt(sequence);
    if (end === null) {
      return "incomplete";
    }
    return { key: null, length: end };
  }
  return null;
}

function stringTerminatorAt(sequence: string): number | null {
  for (let index = 2; index < sequence.length; index += 1) {
    if (sequence[index] === "\x07") {
      return index + 1;
    }
    if (sequence[index] === "\x1b" && sequence[index + 1] === "\\") {
      return index + 2;
    }
  }
  return null;
}

function keyInputAt(input: string, index: number): { input: TerminalKeyInput; length: number } | null {
  const sequence = input.slice(index);
  const named: Array<[string, TerminalKeyInput]> = [
    ["\r", { kind: "key", key: "Enter" }],
    ["\n", { kind: "key", key: "Enter" }],
    ["\t", { kind: "key", key: "Tab" }],
    ["\x7f", { kind: "key", key: "Backspace" }],
    ["\b", { kind: "key", key: "Backspace" }],
    ["\x1b", { kind: "key", key: "Escape" }],
  ];

  for (const [prefix, value] of named) {
    if (sequence.startsWith(prefix)) {
      return { input: value, length: prefix.length };
    }
  }
  return null;
}

function printableTextAt(input: string, index: number): { value: string; length: number } | null {
  const codePoint = input.codePointAt(index);
  if (codePoint === undefined || codePoint < 0x20 || codePoint === 0x7f) {
    return null;
  }
  const value = String.fromCodePoint(codePoint);
  return {
    value,
    length: value.length,
  };
}

function isIncompleteMousePrefix(input: string): boolean {
  return "\x1b[<".startsWith(input) || /^\x1b\[<[0-9;]*$/.test(input);
}

function isIncompleteKeyPrefix(input: string): boolean {
  return input === "\x1b";
}
