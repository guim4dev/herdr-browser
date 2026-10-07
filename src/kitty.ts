const KITTY_CHUNK_BYTES = 3072;
const DEFAULT_IMAGE_ID = 424242;

export type KittyRenderOptions = {
  imageId?: number;
  columns?: number;
  rows?: number;
  deletePrevious?: boolean;
};

export function encodeKittyPng(
  pngBase64: string,
  options: KittyRenderOptions = {},
): string {
  const imageId = options.imageId ?? DEFAULT_IMAGE_ID;
  const chunks = chunkString(pngBase64, KITTY_CHUNK_BYTES);
  let output = options.deletePrevious === false
    ? ""
    : `\x1b_Ga=d,i=${imageId},q=2\x1b\\`;

  for (let index = 0; index < chunks.length; index += 1) {
    const more = index < chunks.length - 1 ? 1 : 0;
    if (index === 0) {
      output += `\x1b_Ga=T,f=100,t=d,i=${imageId},m=${more},q=2${placementParams(options)};${chunks[index]}\x1b\\`;
    } else {
      output += `\x1b_Gm=${more},q=2;${chunks[index]}\x1b\\`;
    }
  }

  return output;
}

export function terminalImageSize(): { columns: number; rows: number } {
  const stdoutColumns = process.stdout.columns;
  const stdoutRows = process.stdout.rows;
  const envColumns = Number.parseInt(process.env.COLUMNS ?? "", 10);
  const envRows = Number.parseInt(process.env.LINES ?? "", 10);
  const columns = positiveInteger(stdoutColumns) ?? positiveInteger(envColumns) ?? 100;
  const rows = positiveInteger(stdoutRows) ?? positiveInteger(envRows) ?? 41;

  return {
    columns,
    rows,
  };
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

function chunkString(value: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += chunkSize) {
    chunks.push(value.slice(index, index + chunkSize));
  }
  return chunks.length > 0 ? chunks : [""];
}

function placementParams(options: KittyRenderOptions): string {
  const params: string[] = [];
  if (options.columns && options.columns > 0) {
    params.push(`c=${Math.floor(options.columns)}`);
  }
  if (options.rows && options.rows > 0) {
    params.push(`r=${Math.floor(options.rows)}`);
  }
  return params.length > 0 ? `,${params.join(",")}` : "";
}

// Double-buffered frame writer for a pane whose output may travel over a remote
// attach. Re-transmitting under one image id makes the outer terminal drop the
// placement until the new data arrives, which shows as flicker on a slow link.
// The new frame goes under the other id first, and the old one is deleted after.
// Identical frames (hover, clicks that change nothing) are not re-sent.
export class KittyFrameWriter {
  private readonly imageIds: [number, number];
  private shownId: number | null = null;
  private lastKey: string | null = null;

  constructor(options: { imageIds?: [number, number] } = {}) {
    this.imageIds = options.imageIds ?? [DEFAULT_IMAGE_ID, DEFAULT_IMAGE_ID + 1];
  }

  encode(pngBase64: string, options: { columns: number; rows: number; force?: boolean }): string | null {
    const key = `${options.columns}x${options.rows}:${Bun.hash(pngBase64)}`;
    if (!options.force && key === this.lastKey) {
      return null;
    }
    const nextId = this.shownId === this.imageIds[0] ? this.imageIds[1] : this.imageIds[0];
    let output = encodeKittyPng(pngBase64, {
      imageId: nextId,
      columns: options.columns,
      rows: options.rows,
      deletePrevious: false,
    });
    if (this.shownId !== null) {
      output += `\x1b_Ga=d,d=I,i=${this.shownId},q=2\x1b\\`;
    }
    this.shownId = nextId;
    this.lastKey = key;
    return output;
  }
}
