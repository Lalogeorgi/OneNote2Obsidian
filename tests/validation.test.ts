import { describe, expect, it } from "vitest";
import { FormatDetector, OneNoteFileType } from "../src/parser/binary/FormatDetector";
import { OneNoteParserAdapter } from "../src/parser/binary/OneNoteParserAdapter";

describe("Malformed-Input Protection & Format Validation", () => {
  const adapter = new OneNoteParserAdapter();

  it("rejects buffers smaller than 16 bytes", () => {
    const smallBuffer = new ArrayBuffer(8);
    const result = FormatDetector.detect(smallBuffer);
    expect(result.isValid).toBe(false);
    expect(result.fileType).toBe(OneNoteFileType.UNKNOWN);
  });

  it("rejects files with invalid header signatures", async () => {
    const randomBuffer = new Uint8Array(256);
    randomBuffer.fill(0xff);

    await expect(adapter.parseSection(randomBuffer.buffer)).rejects.toThrow();
  });

  it("safely handles truncated FileNodeLists without throwing uncaught exceptions", async () => {
    const truncatedBuffer = new Uint8Array(600);
    // Write valid header GUID
    truncatedBuffer.set(
      [0xe4, 0x52, 0x5c, 0x7b, 0x8c, 0xd8, 0xa7, 0x4d, 0xae, 0xb1, 0x53, 0x78, 0xd0, 0x29, 0x96, 0xd3],
      0
    );
    // Point fcrFileNodeListRoot to offset 512, but truncate file right after
    const view = new DataView(truncatedBuffer.buffer);
    view.setBigUint64(140, BigInt(512), true);
    view.setUint32(148, 1024, true);

    const result = await adapter.parseSection(truncatedBuffer.buffer);
    expect(result).toBeDefined();
    expect(result.page).toBeDefined();
  });
});
