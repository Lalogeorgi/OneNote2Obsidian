import { App, normalizePath, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { PageContextManager } from "../context/PageContextManager";
import { CanonicalPage } from "../model/CanonicalPage";
import { IdGenerator, PageId } from "../model/Ids";
import { PageSceneSerializer } from "../pagescene/PageSceneSerializer";
import { SceneBuilder } from "../pagescene/SceneBuilder";
import { MarkdownProjector } from "../projection/MarkdownProjector";
import { OneNoteItemView, VIEW_TYPE_ONENOTE_SPATIAL } from "./OneNoteItemView";

export class HybridViewCoordinator {
  constructor(
    private app: App,
    private contextManager: PageContextManager = PageContextManager.getInstance()
  ) {}

  /**
   * Resolves a CanonicalPage from in-memory context, specified sidecar path,
   * active note frontmatter, or by searching vault sidecar JSON files.
   */
  public async resolveCanonicalPage(
    pageId?: PageId,
    sidecarHint?: string
  ): Promise<CanonicalPage | null> {
    // 1. In-memory check
    if (pageId) {
      const memCtx = this.contextManager.getPageContext(pageId);
      if (memCtx?.canonicalPage) {
        return memCtx.canonicalPage;
      }
    }

    const { vault } = this.app;

    // Helper: read and deserialize a sidecar file into a CanonicalPage
    const loadFromSidecarFile = async (sidecarFile: TFile): Promise<CanonicalPage | null> => {
      try {
        const json = await vault.read(sidecarFile);
        const scene = PageSceneSerializer.deserialize(json);
        const canon: CanonicalPage = {
          id: scene.pageId,
          title: scene.title,
          pageLevel: 0,
          createdTime: Date.now(),
          modifiedTime: Date.now(),
          pageWidth: scene.canvasBounds.width,
          pageHeight: scene.canvasBounds.height,
          canvasStyle: scene.canvasStyle,
          elements: scene.nodes.map((n) => (n as any).element).filter(Boolean),
        };
        // Register in context manager so future lookups are instant
        const parentPath = sidecarFile.parent?.path ? `${sidecarFile.parent.path}/` : "";
        const mdName = sidecarFile.name.replace(".onecanvas.json", ".md");
        this.contextManager.registerPage({
          pageId: canon.id,
          pageTitle: canon.title || "Untitled",
          notebookTitle: "OneNote2Obsidian",
          sectionName: sidecarFile.parent?.name || "General",
          markdownPath: `${parentPath}${mdName}`,
          sidecarPath: sidecarFile.path,
          canonicalPage: canon,
        });
        return canon;
      } catch {
        return null;
      }
    };

    // 2. Check explicit sidecar hint
    if (sidecarHint) {
      const decodedHint = decodeURIComponent(sidecarHint);
      let file = vault.getAbstractFileByPath(decodedHint);
      if (file instanceof TFile) {
        const loaded = await loadFromSidecarFile(file);
        if (loaded) return loaded;
      }

      // Try relative to active file parent
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile?.parent) {
        const relPath = `${activeFile.parent.path}/${decodedHint}`;
        file = vault.getAbstractFileByPath(relPath);
        if (file instanceof TFile) {
          const loaded = await loadFromSidecarFile(file);
          if (loaded) return loaded;
        }
      }
    }

    // 3. Check active Markdown file frontmatter
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile instanceof TFile && activeFile.extension === "md") {
      try {
        const content = await vault.read(activeFile);
        const foundPageId = this.contextManager.parseFrontmatterForPageId(content);
        if (!pageId || foundPageId === pageId) {
          const parentPath = activeFile.parent?.path ? `${activeFile.parent.path}/` : "";
          const expectedSidecar = `${parentPath}${activeFile.basename}.onecanvas.json`;
          const sidecarFile = vault.getAbstractFileByPath(expectedSidecar);
          if (sidecarFile instanceof TFile) {
            const loaded = await loadFromSidecarFile(sidecarFile);
            if (loaded) return loaded;
          }
        }
      } catch {
        // ignore
      }
    }

    // 4. Vault-wide fallback search for matching sidecar
    const files = vault.getFiles();
    const sidecars = files.filter((f) => f.name.endsWith(".onecanvas.json"));

    // Fast check by filename or pageId substring
    for (const sc of sidecars) {
      if (pageId && sc.name.includes(pageId)) {
        const loaded = await loadFromSidecarFile(sc);
        if (loaded) return loaded;
      }
    }

    for (const sc of sidecars) {
      try {
        const json = await vault.read(sc);
        if (!pageId || json.includes(pageId)) {
          const scene = PageSceneSerializer.deserialize(json);
          if (!pageId || scene.pageId === pageId) {
            const loaded = await loadFromSidecarFile(sc);
            if (loaded) return loaded;
          }
        }
      } catch {
        // ignore
      }
    }

    return null;
  }

  /**
   * Opens the PixiJS Spatial Canvas view for a specific PageId or the currently active page.
   */
  public async openSpatialView(
    pageId?: PageId,
    options: {
      leaf?: WorkspaceLeaf;
      newLeaf?: boolean | "tab" | "split";
      sidecarPath?: string;
    } = {}
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

    await workspace.revealLeaf(leaf);

    const canonicalPage = await this.resolveCanonicalPage(
      targetPageId || undefined,
      options.sidecarPath
    );

    const view = leaf.view instanceof OneNoteItemView ? leaf.view : null;

    if (canonicalPage) {
      this.contextManager.setActivePage(canonicalPage.id);
      if (view) {
        view.loadPage(canonicalPage);
      }
      return view;
    } else if (targetPageId) {
      this.contextManager.setActivePage(targetPageId);
    }

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
      await this.app.workspace.revealLeaf(leaf);
      this.contextManager.setActivePage(targetPageId);
    }
  }

  /**
   * Opens a side-by-side split view with Spatial Canvas on one side and Markdown on the other.
   */
  public async openSplitView(pageId?: PageId, sidecarHint?: string): Promise<void> {
    const targetPageId = pageId ?? this.contextManager.getActivePageId();
    const { workspace } = this.app;

    // 1. Get or create left leaf for Spatial View
    const leftLeaf = workspace.getLeaf("tab");
    await leftLeaf.setViewState({
      type: VIEW_TYPE_ONENOTE_SPATIAL,
      active: true,
    });

    const spatialView = leftLeaf.view instanceof OneNoteItemView ? leftLeaf.view : null;

    const canonicalPage = await this.resolveCanonicalPage(targetPageId || undefined, sidecarHint);

    if (canonicalPage) {
      this.contextManager.setActivePage(canonicalPage.id);
      if (spatialView) {
        spatialView.loadPage(canonicalPage);
      }

      // 2. Split vertically to create right leaf for Markdown View
      const rightLeaf = workspace.createLeafBySplit(leftLeaf, "vertical");
      const pageCtx = this.contextManager.getPageContext(canonicalPage.id);
      if (pageCtx?.markdownPath) {
        const file = this.app.vault.getAbstractFileByPath(pageCtx.markdownPath);
        if (file instanceof TFile) {
          await rightLeaf.openFile(file, { active: false });
        }
      }
    }

    await workspace.revealLeaf(leftLeaf);
  }

  /**
   * Handles obsidian://onenote-spatial custom URI navigation.
   */
  public async handleUri(params: Record<string, string>): Promise<void> {
    const pageId = (params.page || params.pageId) as PageId | undefined;
    const sidecar = params.sidecar || params.file;
    const action = params.action;

    if (action === "split") {
      if (sidecar) {
        await this.openSplitView(pageId, sidecar);
      } else {
        await this.openSplitView(pageId);
      }
    } else if (action === "markdown") {
      await this.openMarkdownView(pageId);
    } else if (sidecar) {
      await this.openSpatialView(pageId, { sidecarPath: sidecar });
    } else {
      await this.openSpatialView(pageId);
    }
  }

  /**
   * Creates a new blank Canvas document (both Markdown note and .onecanvas.json sidecar),
   * registers it in PageContextManager, and opens it in the PixiJS spatial view.
   */
  public async createNewCanvas(
    options: {
      title?: string;
      folder?: string;
    } = {}
  ): Promise<CanonicalPage> {
    const targetFolder = options.folder ? normalizePath(options.folder) : "OneNote2Obsidian";
    const vault = this.app.vault;

    // 1. Ensure target folder exists if not root
    if (targetFolder && targetFolder !== "/" && targetFolder !== ".") {
      const parts = targetFolder.split("/").filter(Boolean);
      let cur = "";
      for (const part of parts) {
        cur = cur ? `${cur}/${part}` : part;
        if (vault.adapter && typeof vault.adapter.exists === "function") {
          const exists = await vault.adapter.exists(cur);
          if (!exists) {
            await vault.adapter.mkdir(cur);
          }
        }
      }
    }

    // 2. Determine unique collision-free title and paths
    const baseTitle = options.title?.trim() || "Untitled Canvas";
    let candidateTitle = baseTitle;
    let counter = 1;

    const getPaths = (t: string) => {
      const prefix =
        targetFolder && targetFolder !== "/" && targetFolder !== "." ? `${targetFolder}/` : "";
      return {
        mdPath: normalizePath(`${prefix}${t}.md`),
        sidecarPath: normalizePath(`${prefix}${t}.onecanvas.json`),
      };
    };

    let paths = getPaths(candidateTitle);
    while (
      (vault.adapter &&
        typeof vault.adapter.exists === "function" &&
        (await vault.adapter.exists(paths.mdPath))) ||
      (vault.adapter &&
        typeof vault.adapter.exists === "function" &&
        (await vault.adapter.exists(paths.sidecarPath))) ||
      vault.getAbstractFileByPath(paths.mdPath) ||
      vault.getAbstractFileByPath(paths.sidecarPath)
    ) {
      candidateTitle = `${baseTitle} ${counter++}`;
      paths = getPaths(candidateTitle);
    }

    // 3. Create CanonicalPage
    const pageId = IdGenerator.pageId();
    const now = Date.now();
    const newPage: CanonicalPage = {
      id: pageId,
      title: candidateTitle,
      pageLevel: 0,
      createdTime: now,
      modifiedTime: now,
      canvasStyle: {
        backgroundColor: "#FFFFFF",
      },
      elements: [],
    };

    // 4. Generate sidecar JSON & Markdown note
    const scene = SceneBuilder.build(newPage, { showPageTitle: true });
    const sidecarJson = PageSceneSerializer.serialize(scene);
    const sidecarFileName = `${candidateTitle}.onecanvas.json`;
    const markdown = MarkdownProjector.project(newPage, {
      sidecarRelativePath: sidecarFileName,
      includeSpatialBanner: true,
      includeFrontmatter: true,
    });

    // 5. Write files to vault
    if (vault.adapter && typeof vault.adapter.write === "function") {
      await vault.adapter.write(paths.mdPath, markdown);
      await vault.adapter.write(paths.sidecarPath, sidecarJson);
    } else if (typeof (vault as any).create === "function") {
      await (vault as any).create(paths.mdPath, markdown);
      await (vault as any).create(paths.sidecarPath, sidecarJson);
    }

    // 6. Register in PageContextManager
    this.contextManager.registerPage({
      pageId: newPage.id,
      pageTitle: newPage.title,
      notebookTitle: targetFolder || "OneNote2Obsidian",
      sectionName: "General",
      markdownPath: paths.mdPath,
      sidecarPath: paths.sidecarPath,
      canonicalPage: newPage,
    });

    // 7. Open the newly created canvas in Spatial View
    await this.openSpatialView(newPage.id, {
      sidecarPath: paths.sidecarPath,
    });

    try {
      new Notice(`Created new canvas: ${candidateTitle}`);
    } catch {
      // ignore if Notice unavailable in unit test environment
    }

    return newPage;
  }
}
