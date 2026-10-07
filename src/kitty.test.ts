import { expect, test } from "bun:test";

import { encodeKittyPng, KittyFrameWriter } from "./kitty";

test("encodeKittyPng emits delete and transmit escapes", () => {
  const output = encodeKittyPng("abcd", {
    imageId: 7,
    columns: 80,
    rows: 24,
  });

  expect(output).toContain("\x1b_Ga=d,i=7,q=2\x1b\\");
  expect(output).toContain("\x1b_Ga=T,f=100,t=d,i=7,m=0,q=2,c=80,r=24;abcd\x1b\\");
});

test("encodeKittyPng can transmit without deleting previous image", () => {
  const output = encodeKittyPng("abcd", {
    imageId: 7,
    deletePrevious: false,
  });

  expect(output).not.toContain("\x1b_Ga=d,i=7,q=2\x1b\\");
  expect(output).toContain("\x1b_Ga=T,f=100,t=d,i=7,m=0,q=2;abcd\x1b\\");
});

test("KittyFrameWriter skips a frame identical to the last one sent", () => {
  const writer = new KittyFrameWriter({ imageIds: [7, 8] });

  expect(writer.encode("abcd", { columns: 80, rows: 24 })).not.toBeNull();
  expect(writer.encode("abcd", { columns: 80, rows: 24 })).toBeNull();
});

test("KittyFrameWriter re-sends an identical frame when the placement changes", () => {
  const writer = new KittyFrameWriter({ imageIds: [7, 8] });

  writer.encode("abcd", { columns: 80, rows: 24 });
  expect(writer.encode("abcd", { columns: 100, rows: 24 })).not.toBeNull();
});

test("KittyFrameWriter transmits the new frame before deleting the previous one", () => {
  const writer = new KittyFrameWriter({ imageIds: [7, 8] });

  const first = writer.encode("aaaa", { columns: 80, rows: 24 })!;
  expect(first).not.toContain("a=d");
  expect(first).toContain("\x1b_Ga=T,f=100,t=d,i=7,m=0,q=2,c=80,r=24;aaaa\x1b\\");

  const second = writer.encode("bbbb", { columns: 80, rows: 24 })!;
  const transmitAt = second.indexOf("a=T,f=100,t=d,i=8,");
  const deleteAt = second.indexOf("\x1b_Ga=d,d=I,i=7,q=2\x1b\\");
  expect(transmitAt).toBeGreaterThanOrEqual(0);
  expect(deleteAt).toBeGreaterThan(transmitAt);

  const third = writer.encode("cccc", { columns: 80, rows: 24 })!;
  expect(third.indexOf("a=T,f=100,t=d,i=7,")).toBeGreaterThanOrEqual(0);
  expect(third.indexOf("\x1b_Ga=d,d=I,i=8,q=2\x1b\\")).toBeGreaterThan(third.indexOf("a=T,f=100,t=d,i=7,"));
});

test("KittyFrameWriter force re-sends an identical frame", () => {
  const writer = new KittyFrameWriter({ imageIds: [7, 8] });

  writer.encode("abcd", { columns: 80, rows: 24 });
  expect(writer.encode("abcd", { columns: 80, rows: 24, force: true })).not.toBeNull();
});
