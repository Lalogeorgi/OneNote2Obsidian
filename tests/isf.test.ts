import { describe, expect, it } from "vitest";
import { IsfParser } from "../src/parser/binary/IsfParser";

describe("ISF (Ink Serialized Format) Vector Decoding", () => {
  it("decodes drawing attributes, colors, and highlighter flags", () => {
    // Drawing attributes block (tag 0x00) with Yellow highlighter (RGB: 255, 255, 0 / BGR: 0, 255, 255)
    // and highlighter flag (0x01)
    const isfBytes = new Uint8Array([
      0x00, 0x04, 0x00, 0xff, 0xff, 0x01, // Tag 0x00, 4 bytes BGR+Flags
      0x08, 0x02, 0x00,                   // Tag 0x08, 2 points
      0x14, 0x00, 0x28, 0x00, 0xff,       // x=20, y=40, pressure=255
      0x32, 0x00, 0x46, 0x00, 0x80,       // x=50, y=70, pressure=128
    ]);

    const result = IsfParser.parse(isfBytes);

    expect(result.isHighlighter).toBe(true);
    expect(result.color).toBe("#ffff00");
    expect(result.strokes.length).toBe(1);

    const stroke = result.strokes[0]!;
    expect(stroke.points.length).toBe(2);
    expect(stroke.points[0]?.x).toBe(2); // 20 / 10
    expect(stroke.points[0]?.y).toBe(4); // 40 / 10
    expect(stroke.points[0]?.pressure).toBe(1); // 255 / 255
  });

  it("handles empty or corrupt ISF buffers safely", () => {
    const emptyBytes = new Uint8Array([0x00, 0x00]);
    const result = IsfParser.parse(emptyBytes);

    expect(result.strokes.length).toBe(0);
    expect(result.isHighlighter).toBe(false);
  });
});
