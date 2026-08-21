import { describe, expect, it } from "vitest";
import { IdGenerator } from "../src/model/Ids";
import { ImportManifest } from "../src/projection/ImportManifest";

describe("Import Manifest & Provenance Tracking", () => {
  it("serializes and deserializes manifest JSON correctly", () => {
    const manifest = new ImportManifest({
      pluginVersion: "1.0.0",
      notebooks: {},
    });

    manifest.recordImport({
      notebookId: IdGenerator.notebookId("nb_123"),
      notebookTitle: "Personal Notebook",
      sourcePath: "/path/to/Personal.onepkg",
      sourceSha256: "abcdef1234567890",
      firstImportedAt: 1724218800000,
      lastImportedAt: 1724222400000,
      pages: [
        {
          pageId: IdGenerator.pageId("p_1"),
          pageTitle: "Page 1",
          sectionId: IdGenerator.sectionId("sec_1"),
          markdownPath: "OneNote/Personal/Section 1/Page 1.md",
          sidecarPath: "OneNote/Personal/Section 1/Page 1.onecanvas.json",
          importedAt: 1724222400000,
        },
      ],
    });

    const json = manifest.toJSON();
    const loaded = ImportManifest.fromJSON(json);

    expect(loaded.isDuplicate("abcdef1234567890")).toBe(true);
    expect(loaded.isDuplicate("different_hash")).toBe(false);

    const nb = loaded.getNotebook(IdGenerator.notebookId("nb_123"));
    expect(nb?.notebookTitle).toBe("Personal Notebook");
    expect(nb?.pages.length).toBe(1);
  });
});
