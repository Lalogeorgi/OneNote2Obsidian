import { describe, expect, it } from "vitest";
import { IdGenerator } from "../src/model/Ids";
import { DEFAULT_SECURITY_POLICY } from "../src/parser/archive/ArchiveSecurityPolicy";
import { PathSanitizer } from "../src/parser/archive/PathSanitizer";
import { FormatDetector } from "../src/parser/binary/FormatDetector";
import { IsfParser } from "../src/parser/binary/IsfParser";
import { MsOneStoreParser } from "../src/parser/binary/MsOneStoreParser";
import { CancellationTokenSource } from "../src/parser/Cancellation";
import { ParserError } from "../src/parser/ParserAdapter";
import { AssetExtractor } from "../src/projection/AssetExtractor";

describe("Application Security, Parser Hardening & Adversarial Ingestion", () => {
  describe("1. Binary Parser Robustness & Malformed .one Ingestion", () => {
    it("rejects empty or truncated binary headers (< 32 bytes) safely", () => {
      const truncated = new Uint8Array([0x01, 0x02, 0x03]);
      const result = FormatDetector.detect(truncated);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Buffer too small");
    });

    it("rejects invalid GUID file signatures with structured error", () => {
      const badHeader = new Uint8Array(64);
      badHeader.fill(0xaa);
      const result = FormatDetector.detect(badHeader);

      expect(result.isValid).toBe(false);
      expect(result.fileType).toBe("UNKNOWN");
    });

    it("handles truncated FileNodeList gracefully without infinite loops", () => {
      // Valid MS-ONE header with point to non-existent root
      const fakeHeader = new Uint8Array(128);
      // Valid GUID
      const headerGuid = [
        0xe4, 0x52, 0x5c, 0x7b, 0x8c, 0xd8, 0xa7, 0x4d, 0xae, 0xb1, 0x53, 0x78,
        0xd0, 0x29, 0x96, 0xd3,
      ];
      fakeHeader.set(headerGuid, 0);

      // Root FCR points beyond file size
      const view = new DataView(fakeHeader.buffer);
      view.setUint32(76, 5000, true); // fcrFileNodeListRoot.offset = 5000 (out of bounds)
      view.setUint32(84, 100, true);  // fcrFileNodeListRoot.cb = 100

      const parser = new MsOneStoreParser(fakeHeader);
      // Should not throw or enter infinite loop
      expect(() => parser.parse()).not.toThrow();
      expect(parser.objectSpaces.size).toBe(0);
    });

    it("safely parses malformed ISF ink packets without crashing", () => {
      // Malformed tag bytes with truncated coordinate streams
      const badIsf = new Uint8Array([
        0x01, 0x04, 0xff, 0x00, // drawing attributes
        0x08, 0xff, 0x00,       // 255 points declared, but 0 bytes following
      ]);

      const parsed = IsfParser.parse(badIsf);
      expect(parsed).toBeDefined();
      expect(Array.isArray(parsed.strokes)).toBe(true);
      expect(parsed.strokes.length).toBe(0); // Safely aborted packet loop
    });
  });

  describe("2. Path Traversal & Windows Injection Defenses", () => {
    it("rejects path traversal sequences (../ and ..\\)", () => {
      const vectors = [
        "../../etc/passwd",
        "..\\..\\Windows\\System32\\cmd.exe",
        "nested/../../secret.txt",
        "foo/bar/../../../root.key",
      ];

      for (const v of vectors) {
        const res = PathSanitizer.sanitize(v);
        expect(res.isValid).toBe(false);
        expect(res.error).toContain("Path traversal");
        expect(() => PathSanitizer.assertSafe(v)).toThrow(ParserError);
      }
    });

    it("rejects absolute paths and drive letters", () => {
      const vectors = [
        "C:\\Users\\Admin\\evil.one",
        "D:/notebook/section.one",
        "/etc/shadow",
        "//server/share/payload.one",
      ];

      for (const v of vectors) {
        const res = PathSanitizer.sanitize(v);
        expect(res.isValid).toBe(false);
        expect(res.error).toContain("Absolute paths");
      }
    });

    it("rejects Windows reserved device names", () => {
      const reserved = ["CON.one", "PRN.txt", "AUX.png", "NUL.dat", "COM1.one", "LPT1.one"];

      for (const name of reserved) {
        const res = PathSanitizer.sanitize(`notebook/${name}`);
        expect(res.isValid).toBe(false);
        expect(res.error).toContain("Reserved device name");
      }
    });

    it("rejects null bytes and ASCII control characters", () => {
      const vectors = [
        "notebook/page\x00.one",
        "section\x1f/page.one",
        "notes\x08/my_page.one",
      ];

      for (const v of vectors) {
        const res = PathSanitizer.sanitize(v);
        expect(res.isValid).toBe(false);
        expect(res.error).toContain("control characters");
      }
    });
  });

  describe("3. Archive Bomb, Expansion Ratio & Payload Limits", () => {
    it("enforces archive security policy limits on file count and total size", () => {
      expect(DEFAULT_SECURITY_POLICY.maxFiles).toBe(5000);
      expect(DEFAULT_SECURITY_POLICY.maxCompressionRatio).toBe(100);
      expect(DEFAULT_SECURITY_POLICY.maxFileBytes).toBe(2 * 1024 * 1024 * 1024);
      expect(DEFAULT_SECURITY_POLICY.maxNestingDepth).toBe(16);
    });

    it("rejects archive paths exceeding max directory nesting depth", () => {
      let deepPath = "root";
      for (let i = 0; i < 20; i++) {
        deepPath += `/level_${i}`;
      }
      deepPath += "/page.one";

      const res = PathSanitizer.sanitize(deepPath, 16);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain("nesting depth");
    });
  });

  describe("4. Corrupt Images & Asset Sanitization", () => {
    it("handles corrupt image binaries gracefully with fallback names", async () => {
      const corruptAssets = new Map();
      const randomGarbage = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22]);

      corruptAssets.set(IdGenerator.assetId("corrupt_img"), {
        id: IdGenerator.assetId("corrupt_img"),
        mimeType: "image/unknown-corrupt",
        fileName: "broken:file*name?.bin",
        data: randomGarbage,
      });

      const processed = await AssetExtractor.processAssets(corruptAssets);
      expect(processed.size).toBe(1);

      const record = processed.get(IdGenerator.assetId("corrupt_img"))!;
      expect(record.fileName).not.toContain(":");
      expect(record.fileName).not.toContain("*");
      expect(record.fileName).not.toContain("?");
      expect(record.sha256).toBeDefined();
    });
  });

  describe("5. Cancellation & Graceful Abort Loop", () => {
    it("aborts processing cleanly when CancellationToken is triggered", () => {
      const cts = new CancellationTokenSource();
      expect(cts.token.isCancellationRequested).toBe(false);

      cts.cancel();
      expect(cts.token.isCancellationRequested).toBe(true);
      expect(() => cts.token.throwIfCancelled()).toThrow("Operation was cancelled");
    });
  });
});
