import { describe, expect, it, vi } from "vitest";
import { ImportProgressModal } from "../src/obsidian/ImportProgressModal";
import { ProgressStage } from "../src/parser/Progress";

describe("ImportProgressModal UI, Cancellation and Recovery", () => {
  it("renders modal elements and updates progress report", () => {
    const mockApp = {} as any;
    const modal = new ImportProgressModal(mockApp, {
      onStartImport: vi.fn(),
    });

    modal.open();
    expect(modal.contentEl).toBeDefined();

    modal.updateProgress({
      stage: ProgressStage.EXTRACTING_CAB,
      message: "Extracting MSCF Cabinet blocks",
      percent: 45,
      currentItem: "section1.one",
    });

    expect(modal.contentEl.innerHTML).toContain("45% complete");
    expect(modal.contentEl.innerHTML).toContain("EXTRACTING_CAB: Extracting MSCF Cabinet blocks (section1.one)");

    modal.close();
  });

  it("handles cancellation gracefully", async () => {
    const mockApp = {} as any;

    const modal = new ImportProgressModal(mockApp, {
      onStartImport: async (_file, _targetFolder, cts, onProgress) => {
        onProgress({ stage: ProgressStage.PARSING_OBJECT_SPACES, message: "Parsing", percent: 20 });
        cts.cancel();
        cts.token.throwIfCancelled();
      },
    });

    modal.open();
    const fakeFile = new File([new Uint8Array(100)], "test.onepkg");
    (modal as any).selectedFile = fakeFile;

    await (modal as any).startImportProcess();

    expect(modal.contentEl.innerHTML).toContain("Import Cancelled");
    expect(modal.contentEl.innerHTML).toContain("safely removed");

    modal.close();
  });
});
