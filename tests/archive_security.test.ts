import { describe, expect, it } from "vitest";
import { MemoryPlatformAdapter } from "../src/platform/MemoryPlatformAdapter";
import { OneNoteParserAdapter } from "../src/parser/binary/OneNoteParserAdapter";
import { OnepkgImporter } from "../src/parser/archive/OnepkgImporter";
import { PathSanitizer } from "../src/parser/archive/PathSanitizer";
import { AdversarialCabGenerator } from "./fixtures/AdversarialCabGenerator";

describe("Archive Security, Path Sanitization & Adversarial Ingestion", () => {
  const adapter = new OneNoteParserAdapter();

  describe("PathSanitizer unit checks", () => {
    it("sanitizes valid relative paths", () => {
      const res = PathSanitizer.sanitize("Notebook/Section1.one");
      expect(res.isValid).toBe(true);
      expect(res.sanitizedPath).toBe("Notebook/Section1.one");
    });

    it("rejects path traversal attempts", () => {
      expect(PathSanitizer.sanitize("../escape.one").isValid).toBe(false);
      expect(PathSanitizer.sanitize("a/../../escape.one").isValid).toBe(false);
      expect(PathSanitizer.sanitize("..\\escape.one").isValid).toBe(false);
    });

    it("rejects absolute paths and drive letters", () => {
      expect(PathSanitizer.sanitize("/etc/passwd").isValid).toBe(false);
      expect(PathSanitizer.sanitize("C:/Windows/cmd.exe").isValid).toBe(false);
      expect(PathSanitizer.sanitize("//server/share/file").isValid).toBe(false);
    });

    it("rejects null bytes and control characters", () => {
      expect(PathSanitizer.sanitize("note\x00hidden.one").isValid).toBe(false);
      expect(PathSanitizer.sanitize("note\x1fbad.one").isValid).toBe(false);
    });

    it("rejects Windows reserved device names", () => {
      expect(PathSanitizer.sanitize("CON.one").isValid).toBe(false);
      expect(PathSanitizer.sanitize("sub/PRN.txt").isValid).toBe(false);
      expect(PathSanitizer.sanitize("NUL").isValid).toBe(false);
      expect(PathSanitizer.sanitize("COM1.one").isValid).toBe(false);
    });

    it("rejects illegal filename characters", () => {
      expect(PathSanitizer.sanitize("invalid<name>.one").isValid).toBe(false);
      expect(PathSanitizer.sanitize("invalid|pipe.one").isValid).toBe(false);
      expect(PathSanitizer.sanitize("invalid?mark.one").isValid).toBe(false);
    });
  });

  describe("Adversarial .onepkg ingestion", () => {
    it("rejects path traversal CAB archives with structured ParserError", async () => {
      const maliciousCab = AdversarialCabGenerator.createPathTraversalPackage();
      await expect(adapter.parsePackage(maliciousCab)).rejects.toThrow(/rejected|traversal/i);
    });

    it("rejects absolute path CAB archives", async () => {
      const maliciousCab = AdversarialCabGenerator.createAbsolutePathPackage();
      await expect(adapter.parsePackage(maliciousCab)).rejects.toThrow();
    });

    it("rejects Windows reserved device names inside CABs", async () => {
      const maliciousCab = AdversarialCabGenerator.createWindowsReservedDevicePackage();
      await expect(adapter.parsePackage(maliciousCab)).rejects.toThrow();
    });

    it("rejects illegal filename characters inside CABs", async () => {
      const maliciousCab = AdversarialCabGenerator.createIllegalFilenamePackage();
      await expect(adapter.parsePackage(maliciousCab)).rejects.toThrow();
    });

    it("rejects archives exceeding file count security threshold", async () => {
      const maliciousCab = AdversarialCabGenerator.createExcessiveFilesPackage();
      await expect(adapter.parsePackage(maliciousCab)).rejects.toThrow(/exceeds/i);
    });

    it("rejects archives with corrupted or invalid signature headers", async () => {
      const maliciousCab = AdversarialCabGenerator.createCorruptedHeaderPackage();
      await expect(adapter.parsePackage(maliciousCab)).rejects.toThrow();
    });
  });

  describe("Staging directory isolation & guaranteed cleanup", () => {
    it("cleans up staging directory even when extraction fails", async () => {
      const memAdapter = new MemoryPlatformAdapter();
      const importer = new OnepkgImporter(adapter, memAdapter);

      const maliciousCab = AdversarialCabGenerator.createPathTraversalPackage();

      await expect(
        importer.importPackage(maliciousCab, { stagingDirectoryPrefix: "test-fail-" })
      ).rejects.toThrow();

      // Ensure no dangling staging directories remain
      const remaining = await memAdapter.listStagedFiles("/virtual-staging");
      expect(remaining.length).toBe(0);
    });
  });
});
