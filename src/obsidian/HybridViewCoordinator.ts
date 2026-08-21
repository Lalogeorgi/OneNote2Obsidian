import { App, TFile, WorkspaceLeaf } from "obsidian";
import { PageContextManager } from "../context/PageContextManager";
import { PageId } from "../model/Ids";
import { OneNoteItemView, VIEW_TYPE_ONENOTE_SPATIAL } from "./OneNoteItemView";

export class HybridViewCoordinator {
  constructor(
    private app: App,
    private contextManager: PageContextManager = PageContextManager.getInstance()
  ) {}

  /**
   * Opens the PixiJS Spatial Canvas view for a specific PageId or the currently active page.
   */
  public async openSpatialView(
    pageId?: PageId,
    options: { leaf?: WorkspaceLeaf; newLeaf?: boolean | "tab" | "split" } = {}
  ): Promise<OneNoteItemView | null> {
    const targetPageId = pageId ?? this.contextManager.getActivePageId();
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = options.leaf ?? null;

    if (!leaf) {
      const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_ONENOTE_SPATIAL);
      if (existingLeaves.length > 0 && !options.newLeaf) {
        leaf = existingLeaves[0] ?? null;
      } else if (options.newLeaf === "split") {
        leaf = workspace.getLeaf("split", "vertical");
      } else {
        leaf = workspace.getLeaf("tab");
      }
    }

    if (!leaf) return null;

    await leaf.setViewState({
      type: VIEW_TYPE_ONENOTE_SPATIAL,
      active: true,
    });

    workspace.revealLeaf(leaf);

    if (targetPageId) {
      this.contextManager.setActivePage(targetPageId);
      const view = leaf.view instanceof OneNoteItemView ? leaf.view : null;
      if (view) {
        const pageCtx = this.contextManager.getPageContext(targetPageId);
        if (pageCtx?.canonicalPage) {
          view.loadPage(pageCtx.canonicalPage);
        }
      }
      return view;
    }

    const view = leaf.view instanceof OneNoteItemView ? leaf.view : null;
    return view;
  }

  /**
   * Opens the semantic Markdown note associated with the specified PageId.
   */
  public async openMarkdownView(
    pageId?: PageId,
    options: { leaf?: WorkspaceLeaf; newLeaf?: boolean | "tab" | "split" } = {}
  ): Promise<void> {
    const targetPageId = pageId ?? this.contextManager.getActivePageId();
    if (!targetPageId) return;

    const pageCtx = this.contextManager.getPageContext(targetPageId);
    if (!pageCtx || !pageCtx.markdownPath) return;

    const file = this.app.vault.getAbstractFileByPath(pageCtx.markdownPath);
    if (!(file instanceof TFile)) return;

    let leaf: WorkspaceLeaf | null = options.leaf ?? null;
    if (!leaf) {
      if (options.newLeaf === "split") {
        leaf = this.app.workspace.getLeaf("split", "vertical");
      } else {
        leaf = this.app.workspace.getLeaf("tab");
      }
    }

    if (leaf) {
      await leaf.openFile(file, { active: true });
      this.app.workspace.revealLeaf(leaf);
      this.contextManager.setActivePage(targetPageId);
    }
  }

  /**
   * Opens a side-by-side split view with Spatial Canvas on one side and Markdown on the other.
   */
  public async openSplitView(pageId?: PageId): Promise<void> {
    const targetPageId = pageId ?? this.contextManager.getActivePageId();
    const { workspace } = this.app;

    // 1. Get or create left leaf for Spatial View
    const leftLeaf = workspace.getLeaf("tab");
    await leftLeaf.setViewState({
      type: VIEW_TYPE_ONENOTE_SPATIAL,
      active: true,
    });

    const spatialView = leftLeaf.view instanceof OneNoteItemView ? leftLeaf.view : null;

    if (targetPageId) {
      this.contextManager.setActivePage(targetPageId);
      const pageCtx = this.contextManager.getPageContext(targetPageId);
      if (pageCtx?.canonicalPage && spatialView) {
        spatialView.loadPage(pageCtx.canonicalPage);
      }

      // 2. Split vertically to create right leaf for Markdown View
      const rightLeaf = workspace.createLeafBySplit(leftLeaf, "vertical");
      if (pageCtx?.markdownPath) {
        const file = this.app.vault.getAbstractFileByPath(pageCtx.markdownPath);
        if (file instanceof TFile) {
          await rightLeaf.openFile(file, { active: false });
        }
      }
    }

    workspace.revealLeaf(leftLeaf);
  }

  /**
   * Handles obsidian://onenote-spatial custom URI navigation.
   */
  public async handleUri(params: Record<string, string>): Promise<void> {
    const pageId = (params.page || params.pageId) as PageId | undefined;
    const action = params.action;

    if (action === "split") {
      await this.openSplitView(pageId);
    } else if (action === "markdown") {
      await this.openMarkdownView(pageId);
    } else {
      await this.openSpatialView(pageId);
    }
  }
}
