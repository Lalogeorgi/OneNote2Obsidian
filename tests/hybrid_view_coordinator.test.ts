import { describe, expect, it, vi } from "vitest";
import { App, TFile, WorkspaceLeaf } from "obsidian";
import { PageContextManager } from "../src/context/PageContextManager";
import { IdGenerator } from "../src/model/Ids";
import { HybridViewCoordinator } from "../src/obsidian/HybridViewCoordinator";

describe("Hybrid View Coordinator & Bidirectional Switching", () => {
  const createMockApp = () => {
    const leaf = new WorkspaceLeaf();
    const splitLeaf = new WorkspaceLeaf();

    const app = new App();
    app.workspace.getLeavesOfType = vi.fn().mockReturnValue([]);
    app.workspace.getLeaf = vi.fn().mockReturnValue(leaf);
    app.workspace.revealLeaf = vi.fn();
    app.workspace.createLeafBySplit = vi.fn().mockReturnValue(splitLeaf);

    const tfile = new (TFile as any)("OneNote/Notebook/Section/Page.md");
    app.vault.getAbstractFileByPath = vi.fn().mockReturnValue(tfile);

    return { app, leaf, splitLeaf, tfile };
  };

  it("opens spatial view and activates leaf", async () => {
    const { app, leaf } = createMockApp();
    const manager = PageContextManager.getInstance();
    manager.clear();

    const coordinator = new HybridViewCoordinator(app, manager);
    const pageId = IdGenerator.pageId("p_spatial");

    manager.registerPage({
      pageId,
      pageTitle: "Spatial Page",
      notebookTitle: "Notebook",
      sectionName: "Section",
      markdownPath: "OneNote/Notebook/Section/Spatial Page.md",
      sidecarPath: "OneNote/Notebook/Section/Spatial Page.onecanvas.json",
    });

    await coordinator.openSpatialView(pageId, { leaf });

    expect(app.workspace.revealLeaf).toHaveBeenCalledWith(leaf);
    expect(manager.getActivePageId()).toBe(pageId);
  });

  it("opens markdown view for registered page", async () => {
    const { app, leaf, tfile } = createMockApp();
    const manager = PageContextManager.getInstance();
    manager.clear();

    const coordinator = new HybridViewCoordinator(app, manager);
    const pageId = IdGenerator.pageId("p_md");

    manager.registerPage({
      pageId,
      pageTitle: "Note",
      notebookTitle: "Notebook",
      sectionName: "Section",
      markdownPath: "OneNote/Notebook/Section/Note.md",
      sidecarPath: "OneNote/Notebook/Section/Note.onecanvas.json",
    });

    const openFileSpy = vi.spyOn(leaf, "openFile");

    await coordinator.openMarkdownView(pageId, { leaf });

    expect(app.vault.getAbstractFileByPath).toHaveBeenCalledWith("OneNote/Notebook/Section/Note.md");
    expect(openFileSpy).toHaveBeenCalledWith(tfile, { active: true });
  });

  it("handles obsidian:// URI actions for spatial, markdown, and split views", async () => {
    const { app } = createMockApp();
    const manager = PageContextManager.getInstance();
    const coordinator = new HybridViewCoordinator(app, manager);

    const openSpatialSpy = vi.spyOn(coordinator, "openSpatialView").mockResolvedValue(null);
    const openMarkdownSpy = vi.spyOn(coordinator, "openMarkdownView").mockResolvedValue();
    const openSplitSpy = vi.spyOn(coordinator, "openSplitView").mockResolvedValue();

    await coordinator.handleUri({ page: "page_123" });
    expect(openSpatialSpy).toHaveBeenCalledWith("page_123");

    await coordinator.handleUri({ page: "page_123", action: "markdown" });
    expect(openMarkdownSpy).toHaveBeenCalledWith("page_123");

    await coordinator.handleUri({ page: "page_123", action: "split" });
    expect(openSplitSpy).toHaveBeenCalledWith("page_123");
  });
});
