import { describe, expect, it } from "vitest";
import { VaultPathResolver } from "../src/projection/VaultPathResolver";

describe("Vault Path Resolver & Hierarchy Rules", () => {
  it("resolves nested folder paths with standard configuration", () => {
    const resolver = new VaultPathResolver({
      rootImportFolder: "OneNote Import",
      attachmentFolder: "attachments",
      flattenHierarchy: false,
    });

    const res = resolver.resolvePagePaths({
      notebookTitle: "Work Notebook",
      sectionGroupNames: ["Q3 Projects"],
      sectionName: "Sprint 1",
      pageTitle: "Planning & Architecture",
    });

    expect(res.markdownPath).toBe("OneNote Import/Work Notebook/Q3 Projects/Sprint 1/Planning & Architecture.md");
    expect(res.sidecarPath).toBe("OneNote Import/Work Notebook/Q3 Projects/Sprint 1/Planning & Architecture.onecanvas.json");
    expect(res.relativeSidecarFromMarkdown).toBe("Planning & Architecture.onecanvas.json");
    expect(res.attachmentFolderPath).toBe("OneNote Import/Work Notebook/attachments");
  });

  it("resolves flattened folder paths when flattenHierarchy is true", () => {
    const resolver = new VaultPathResolver({
      rootImportFolder: "OneNote",
      flattenHierarchy: true,
    });

    const res = resolver.resolvePagePaths({
      notebookTitle: "Work",
      sectionName: "Sprint 1",
      pageTitle: "Tasks",
    });

    expect(res.markdownPath).toBe("OneNote/Work/Work - Sprint 1 - Tasks.md");
    expect(res.sidecarPath).toBe("OneNote/Work/Work - Sprint 1 - Tasks.onecanvas.json");
  });

  it("sanitizes illegal OS characters and reserved device names", () => {
    const resolver = new VaultPathResolver();

    expect(resolver.sanitizeSegment("CON")).toBe("_CON");
    expect(resolver.sanitizeSegment("AUX")).toBe("_AUX");
    expect(resolver.sanitizeSegment("My:Illegal/Path?*<Name>")).toBe("My_Illegal_Path___Name_");
    expect(resolver.sanitizeSegment("Trailing Dots....")).toBe("Trailing Dots");
  });

  it("resolves file collisions deterministically by appending numeric counter", () => {
    const resolver = new VaultPathResolver();

    const res1 = resolver.resolvePagePaths({
      notebookTitle: "Notebook",
      sectionName: "Section",
      pageTitle: "Daily Log",
    });

    const res2 = resolver.resolvePagePaths({
      notebookTitle: "Notebook",
      sectionName: "Section",
      pageTitle: "Daily Log",
    });

    const res3 = resolver.resolvePagePaths({
      notebookTitle: "Notebook",
      sectionName: "Section",
      pageTitle: "Daily Log",
    });

    expect(res1.markdownPath).toBe("OneNote2Obsidian/Notebook/Section/Daily Log.md");
    expect(res2.markdownPath).toBe("OneNote2Obsidian/Notebook/Section/Daily Log (1).md");
    expect(res3.markdownPath).toBe("OneNote2Obsidian/Notebook/Section/Daily Log (2).md");
  });

  it("deduplicates folder hierarchy for single-section imports where notebook matches section", () => {
    const resolver = new VaultPathResolver();

    const res = resolver.resolvePagePaths({
      notebookTitle: "App - Comunidad",
      sectionName: "App - Comunidad",
      pageTitle: "Comunidad de práctica de IA",
    });

    // Should create a single section folder "OneNote2Obsidian/App - Comunidad", NOT "OneNote2Obsidian/App - Comunidad/App - Comunidad"
    expect(res.markdownPath).toBe("OneNote2Obsidian/App - Comunidad/Comunidad de práctica de IA.md");
    expect(res.sidecarPath).toBe("OneNote2Obsidian/App - Comunidad/Comunidad de práctica de IA.onecanvas.json");
    expect(res.attachmentFolderPath).toBe("OneNote2Obsidian/App - Comunidad/attachments");
  });
});
