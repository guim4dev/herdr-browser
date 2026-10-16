export type CellPixels = { width: number; height: number };

const DEFAULT_MISS_RETRY_MS = 10_000;

// The CSI 16t cell-size probe costs a terminal round trip (and an 80 ms wait
// when nothing answers). Cell pixels only change with the font, which also
// changes the pane size, so one probe per size is enough.
export class TerminalCellCache {
  private entry: {
    key: string;
    value: Promise<CellPixels | null>;
    expiresAt: number;
  } | null = null;

  constructor(
    private readonly probe: () => Promise<CellPixels | null>,
    private readonly options: { missRetryMs?: number; now?: () => number } = {},
  ) {}

  get(size: { columns: number; rows: number }): Promise<CellPixels | null> {
    const key = `${size.columns}x${size.rows}`;
    const now = this.options.now?.() ?? Date.now();
    if (this.entry && this.entry.key === key && now < this.entry.expiresAt) {
      return this.entry.value;
    }

    const entry = {
      key,
      value: this.probe(),
      expiresAt: Number.POSITIVE_INFINITY,
    };
    this.entry = entry;
    void entry.value.then((cell) => {
      if (!cell) {
        entry.expiresAt = (this.options.now?.() ?? Date.now()) + (this.options.missRetryMs ?? DEFAULT_MISS_RETRY_MS);
      }
    });
    return entry.value;
  }
}
