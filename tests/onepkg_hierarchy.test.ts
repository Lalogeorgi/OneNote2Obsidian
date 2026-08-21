import { describe, expect, it } from "vitest";
import { MemoryPlatformAdapter } from "../src/platform/MemoryPlatformAdapter";
import { CancellationTokenSource } from "../src/parser/Cancellation";
import { ProgressReporter } from "../src/parser/Progress";
import { OnepkgImporter } from "../src/parser/archive/OnepkgImporter";
import { OneNoteParserAdapter } from "../src/parser/binary/OneNoteParserAdapter";
import { AdversarialCabGenerator } from "./fixtures/AdversarialCabGenerator";

describe("OneNote .onepkg Multi-Section & Nested Hierarchy Discovery", () => {
  const parserAdapter = new OneNoteParserAdapter();

  it("reconstructs multi-section packages with root sections and nested section groups", async () => {
    const pkgBuffer = AdversarialCabGenerator.createNestedMultiSectionPackage();
    const memPlatform = new MemoryPlatformAdapter();
    const importer = new OnepkgImporter(parserAdapter, memPlatform);

    const notebook = await importer.importPackage(pkgBuffer, {
      stagingDirectoryPrefix: "test-nested-",
    });

    expect(notebook).toBeDefined();
    expect(notebook.sections.length).toBe(1);
    expect(notebook.sections[0]?.name).toBe("QuickNotes");
    expect(notebook.sections[0]?.pages.length).toBe(1);

    // Validate Nested Section Groups
    expect(notebook.sectionGroups.length).toBe(1);
    const group = notebook.sectionGroups[0]!;
    expect(group.name).toBe("Projects");
    expect(group.sections.length).toBe(2);
    expect(group.sections[0]?.name).toBe("ProjectAlpha");
    expect(group.sections[1]?.name).toBe("ProjectBeta");
  });

  it("atomically publishes staged files to the vault destination directory", async () => {
    const pkgBuffer = AdversarialCabGenerator.createNestedMultiSectionPackage();
    const memPlatform = new MemoryPlatformAdapter();
    const importer = new OnepkgImporter(parserAdapter, memPlatform);

    await importer.importPackage(pkgBuffer, {
      stagingDirectoryPrefix: "test-publish-",
      targetVaultDir: "/vault/OneNote_Import",
    });

    const vaultFiles = await memPlatform.listStagedFiles("/vault/OneNote_Import");
    expect(vaultFiles.length).toBeGreaterThanOrEqual(4);
    expect(vaultFiles).toContain("QuickNotes.one");
    expect(vaultFiles).toContain("Projects/ProjectAlpha.one");
    expect(vaultFiles).toContain("Projects/ProjectBeta.one");
  });

  it("supports cooperative cancellation during multi-section import", async () => {
    const pkgBuffer = AdversarialCabGenerator.createNestedMultiSectionPackage();
    const cts = new CancellationTokenSource();
    const reporter = new ProgressReporter();

    // Cancel on first progress update
    reporter.subscribe(() => {
      cts.cancel();
    });

    const memPlatform = new MemoryPlatformAdapter();
    const importer = new OnepkgImporter(parserAdapter, memPlatform);

    await expect(
      importer.importPackage(pkgBuffer, {}, reporter, cts.token)
    ).rejects.toThrow();
  });
});
