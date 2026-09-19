import { Menu, normalizePath, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { DiagnosticCode } from "./diagnostics/DiagnosticTypes";
import { logger } from "./diagnostics/Logger";
import { OneNoteItemView, VIEW_TYPE_ONENOTE_SPATIAL } from "./obsidian/OneNoteItemView";
import { ImportProgressModal } from "./obsidian/ImportProgressModal";
import { ProgressReporter, ProgressStage } from "./parser/Progress";
import { HybridViewCoordinator } from "./obsidian/HybridViewCoordinator";
import { PageContextManager } from "./context/PageContextManager";
import { DEFAULT_SETTINGS, OneNotePluginSettings } from "./settings/OneNoteSettings";
import { OneNoteSettingsTab } from "./settings/OneNoteSettingsTab";
import { FloatingStickyNoteManager } from "./obsidian/FloatingStickyNoteManager";
import { OneNoteParserAdapter } from "./parser/binary/OneNoteParserAdapter";
import { CanonicalNotebook } from "./model/CanonicalNotebook";
import { CanonicalPage } from "./model/CanonicalPage";
import { AssetId, IdGenerator, PageId } from "./model/Ids";
import { ExtractedAsset } from "./parser/ParserAdapter";
import { SemanticVaultPublisher } from "./projection/SemanticVaultPublisher";
import { OneNoteStickyNoteView } from "./obsidian/OneNoteStickyNoteView";
import { VIEW_TYPE_STICKY_NOTE } from "./constants/StickyNoteConstants";
import { StickyNotesHubModal } from "./obsidian/StickyNotesHubModal";
import { StickyNoteUtils } from "./model/StickyNoteUtils";
import { PagePropertiesModal } from "./obsidian/modal/PagePropertiesModal";
import { FrontmatterManager } from "./obsidian/frontmatter/FrontmatterManager";

export * from "./model";
export * from "./geometry";
export * from "./pagescene";
export * from "./renderer";
export * from "./projection";
export * from "./diagnostics";
export * from "./context";
export * from "./knowledge";
export * from "./settings";
export * from "./editor";
export * from "./editor/text/StickyNoteFormatToolbar";
export * from "./obsidian/ImportProgressModal";
export * from "./obsidian/FloatingStickyNoteManager";
export * from "./obsidian/FloatingStickyNoteWindow";
export * from "./obsidian/OneNoteStickyNoteView";
export * from "./obsidian/StickyNotesHubModal";
export * from "./constants/StickyNoteConstants";
export * from "./constants/ParserConstants";

export default class OneNotePlugin extends Plugin {
  public settings: OneNotePluginSettings = DEFAULT_SETTINGS;
  public coordinator!: HybridViewCoordinator;
  public contextManager: PageContextManager = PageContextManager.getInstance();

  async onload(): Promise<void> {
    logger.info(DiagnosticCode.GENERAL_INFO, "Initializing OneNote to Obsidian Spatial Plugin");

    // 1. Load Settings
    await this.loadSettings();

    // 2. Initialize Hybrid Coordinator
    this.coordinator = new HybridViewCoordinator(this.app, this.contextManager);

    // 3. Register Settings Tab
    this.addSettingTab(new OneNoteSettingsTab(this.app, this));

    // 4. Register Custom Spatial ItemView and Sticky Note Popout View
    this.registerView(
      VIEW_TYPE_ONENOTE_SPATIAL,
      (leaf: WorkspaceLeaf) => new OneNoteItemView(leaf)
    );

    this.registerView(
      VIEW_TYPE_STICKY_NOTE,
      (leaf: WorkspaceLeaf) => new OneNoteStickyNoteView(leaf, this.app)
    );

    // 5. Add Ribbon Icon with Option Menu (New Canvas vs Notes list vs Import File vs Open Current)
    const ribbonIcon = this.addRibbonIcon("layout-dashboard", "On2Od", (evt: MouseEvent) => {
      const menu = new Menu();

      menu.addItem((item) => {
        item
          .setTitle("New Canvas")
          .setIcon("plus-circle")
          .onClick(async () => {
            await this.createNewCanvas();
          });
      });

      menu.addItem((item) => {
        item
          .setTitle("Notes list")
          .setIcon("sticky-note")
          .onClick(() => {
            new StickyNotesHubModal(this.app).open();
          });
      });

      menu.addItem((item) => {
        item
          .setTitle("Import File or Package (.one / .onepkg)")
          .setIcon("folder-input")
          .onClick(() => {
            this.openImportModal();
          });
      });

      const activeCtx = this.contextManager.getActivePageContext();
      if (activeCtx) {
        menu.addSeparator();
        menu.addItem((item) => {
          item
            .setTitle(`Open Current Canvas (${activeCtx.pageTitle})`)
            .setIcon("layout-dashboard")
            .onClick(() => {
              this.coordinator.openSpatialView();
            });
        });
      }

      if (evt && typeof evt.clientX === "number") {
        menu.showAtMouseEvent(evt);
      } else if (ribbonIcon && typeof ribbonIcon.getBoundingClientRect === "function") {
        const rect = ribbonIcon.getBoundingClientRect();
        menu.showAtPosition({ x: rect.right + 4, y: rect.top });
      }
    });

    // 6. Register Commands
    this.addCommand({
      id: "onenote-new-canvas",
      name: "Create New Canvas",
      callback: async () => {
        await this.createNewCanvas();
      },
    });

    this.addCommand({
      id: "onenote-import-file",
      name: "Import File or Package (.one / .onepkg)",
      callback: () => {
        this.openImportModal();
      },
    });

    this.addCommand({
      id: "onenote-open-spatial-view",
      name: "Open Canvas View",
      callback: () => {
        this.coordinator.openSpatialView();
      },
    });

    this.addCommand({
      id: "onenote-open-markdown-view",
      name: "Open Markdown Note",
      callback: () => {
        this.coordinator.openMarkdownView();
      },
    });

    this.addCommand({
      id: "onenote-open-split-view",
      name: "Open Split View (Canvas + Markdown)",
      callback: () => {
        this.coordinator.openSplitView();
      },
    });

    this.addCommand({
      id: "onenote-popout-active-sticky-note",
      name: "Pop Out Active Sticky Note as Desktop Quick Note",
      callback: () => {
        const activeCtx = this.contextManager.getActivePageContext();
        if (activeCtx?.canonicalPage) {
          const selectedId = this.contextManager.getSelectedNodeId();
          const note =
            (activeCtx.canonicalPage.elements.find(
              (e) => (selectedId ? e.id === selectedId : true) && e.type === "stickyNote"
            ) as import("./model/CanonicalStickyNote").CanonicalStickyNote | undefined) || null;

          if (note) {
            FloatingStickyNoteManager.getInstance().openPopoutWindow(
              this.app,
              note,
              activeCtx.pageId
            );
          }
        }
      },
    });

    this.addCommand({
      id: "onenote-close-all-floating-notes",
      name: "Close All Floating Sticky Notes",
      callback: () => {
        FloatingStickyNoteManager.getInstance().closeAll();
      },
    });

    this.addCommand({
      id: "onenote-open-sticky-notes-hub",
      name: "Open Sticky Notes Hub (Notes List)",
      hotkeys: [{ modifiers: ["Mod"], key: "h" }],
      callback: () => {
        new StickyNotesHubModal(this.app).open();
      },
    });

    this.addCommand({
      id: "onenote-notes-list",
      name: "Notes list",
      callback: () => {
        new StickyNotesHubModal(this.app).open();
      },
    });

    this.addCommand({
      id: "onenote-new-sticky-note",
      name: "Create New Sticky Note",
      hotkeys: [{ modifiers: ["Mod"], key: "n" }],
      callback: () => {
        const activeCtx = this.contextManager.getActivePageContext();
        const newNote = StickyNoteUtils.createDefaultStickyNote();
        FloatingStickyNoteManager.getInstance().openPopoutWindow(
          this.app,
          newNote,
          activeCtx?.pageId
        );
      },
    });

    this.addCommand({
      id: "onenote-page-properties",
      name: "View and Edit Page Properties",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "p" }],
      callback: () => {
        const activePageId = this.contextManager.getActivePageId();
        if (activePageId) {
          new PagePropertiesModal(this.app, activePageId).open();
        } else {
          const activeFile = this.app.workspace.getActiveFile();
          if (activeFile instanceof TFile && activeFile.extension === "md") {
            this.app.vault.read(activeFile).then((content) => {
              const pageId = this.contextManager.parseFrontmatterForPageId(content);
              if (pageId) {
                new PagePropertiesModal(this.app, pageId).open();
              } else {
                new Notice("Active note is not an imported page.");
              }
            });
          } else {
            new Notice("No active canvas or markdown note found.");
          }
        }
      },
    });

    // 7. Register Protocol Handler: obsidian://onenote-spatial
    if (typeof (this as any).registerObsidianProtocolHandler === "function") {
      (this as any).registerObsidianProtocolHandler(
        "onenote-spatial",
        (params: Record<string, string>) => {
          this.coordinator.handleUri(params);
        }
      );
    }

    // 8. Intercept in-app DOM clicks on obsidian://onenote-spatial links
    this.registerDomEvent(document, "click", (evt: MouseEvent) => {
      const target = evt.target as HTMLElement | null;
      const anchor = target?.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href") || anchor.href || "";
      if (
        href.startsWith("obsidian://onenote-spatial") ||
        href.startsWith("onenote-spatial://") ||
        href.includes("onenote-spatial?page=")
      ) {
        evt.preventDefault();
        evt.stopPropagation();
        this.handleSpatialUri(href);
      }
    });

    // 9. Enhance [!spatial] callout banners with interactive launch button
    this.registerMarkdownPostProcessor((element, _context) => {
      const callouts: HTMLElement[] = [];
      if (element.getAttribute?.("data-callout") === "spatial") {
        callouts.push(element);
      }
      element.querySelectorAll<HTMLElement>('[data-callout="spatial"]').forEach((el) => {
        if (!callouts.includes(el)) callouts.push(el);
      });
      callouts.forEach((callout) => {
        if (callout.querySelector(".onenote-callout-spatial-btn")) return;

        const link = callout.querySelector<HTMLAnchorElement>('a[href*="onenote-spatial"]');
        const href = link?.getAttribute("href") || "";

        const btn = document.createElement("button");
        btn.className = "onenote-callout-spatial-btn mod-cta";
        btn.innerHTML = `<span class="onenote-btn-icon">🗺️</span> <span>Open Canvas</span>`;

        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (href) {
            this.handleSpatialUri(href);
          } else {
            this.coordinator.openSpatialView();
          }
        });

        callout.appendChild(btn);
      });
    });

    // 10. Context menu actions on files and editor
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile) {
          if (file.name.endsWith(".onecanvas.json")) {
            menu.addItem((item) => {
              item
                .setTitle("Open Canvas")
                .setIcon("layout-dashboard")
                .onClick(() => {
                  this.coordinator.openSpatialView(undefined, { sidecarPath: file.path });
                });
            });
          } else if (file.extension === "md") {
            menu.addItem((item) => {
              item
                .setTitle("Open Canvas")
                .setIcon("layout-dashboard")
                .onClick(async () => {
                  try {
                    const content = await this.app.vault.read(file);
                    const pageId = this.contextManager.parseFrontmatterForPageId(content);
                    const sidecar = `${file.parent?.path ? file.parent.path + "/" : ""}${file.basename}.onecanvas.json`;
                    this.coordinator.openSpatialView(pageId || undefined, { sidecarPath: sidecar });
                  } catch {
                    this.coordinator.openSpatialView();
                  }
                });
            });

            menu.addItem((item) => {
              item
                .setTitle("Edit Page Properties")
                .setIcon("file-text")
                .onClick(async () => {
                  try {
                    const content = await this.app.vault.read(file);
                    const pageId = this.contextManager.parseFrontmatterForPageId(content);
                    if (pageId) {
                      new PagePropertiesModal(this.app, pageId).open();
                    } else {
                      new Notice("File is not an imported page.");
                    }
                  } catch {
                    // ignore
                  }
                });
            });
          }
        }
      })
    );

    // 11. Track Active File for Page Context
    this.registerEvent(
      this.app.workspace.on("file-open", async (file) => {
        if (file instanceof TFile && file.extension === "md") {
          try {
            const content = await this.app.vault.read(file);
            const pageId = this.contextManager.parseFrontmatterForPageId(content);
            if (pageId) {
              this.contextManager.setActivePage(pageId);
            }
          } catch {
            // Ignore file read error in hook
          }
        }
      })
    );

    // 12. Track Frontmatter / Metadata Modifications for Two-Way Sync
    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        if (file instanceof TFile && file.extension === "md") {
          try {
            const content = await this.app.vault.read(file);
            const pageId = this.contextManager.parseFrontmatterForPageId(content);
            if (pageId) {
              const props = FrontmatterManager.parseFrontmatter(content);
              this.contextManager.updatePageMetadata(pageId, props);
            }
          } catch {
            // Ignore modify read errors
          }
        }
      })
    );

    logger.info(DiagnosticCode.GENERAL_INFO, "OneNote Spatial Plugin loaded successfully");
  }

  public async handleSpatialUri(href: string): Promise<void> {
    try {
      const queryIdx = href.indexOf("?");
      const params: Record<string, string> = {};
      if (queryIdx !== -1) {
        const queryStr = href.slice(queryIdx + 1);
        const searchParams = new URLSearchParams(queryStr);
        searchParams.forEach((val, key) => {
          params[key] = val;
        });
      }
      await this.coordinator.handleUri(params);
    } catch (err) {
      logger.error(DiagnosticCode.GENERAL_INFO, "Failed to handle spatial URI link click", {
        href,
        error: String(err),
      });
    }
  }

  async onunload(): Promise<void> {
    FloatingStickyNoteManager.getInstance().closeAll();
    logger.info(DiagnosticCode.GENERAL_INFO, "Unloading OneNote Spatial Plugin");
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async activateView(): Promise<void> {
    await this.coordinator.openSpatialView();
  }

  public async createNewCanvas(
    options: { title?: string; folder?: string } = {}
  ): Promise<CanonicalPage> {
    const folder = options.folder ?? this.settings.rootImportFolder ?? "OneNote2Obsidian";
    return this.coordinator.createNewCanvas({ ...options, folder });
  }

  public openImportModal(): void {
    let importedFirstPageId: PageId | null = null;

    const modal = new ImportProgressModal(this.app, {
      onStartImport: async (file, targetFolder, cts, onProgress) => {
        onProgress({
          stage: ProgressStage.READING_FILE,
          message: `Reading ${file.name}...`,
          percent: 5,
        });

        const buffer = await file.arrayBuffer();
        cts.token.throwIfCancelled();

        // 1. Calculate SHA-256 fingerprint for deduplication
        let sourceSha256 = "hash_" + Date.now();
        try {
          if (typeof crypto !== "undefined" && crypto.subtle) {
            const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            sourceSha256 = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
          }
        } catch {
          // Fallback to timestamp-based hash if Web Crypto unavailable
        }

        // 2. Parse using OneNoteParserAdapter
        const adapter = new OneNoteParserAdapter();
        const lowerName = file.name.toLowerCase();
        let notebook: CanonicalNotebook;
        let extractedAssets: ReadonlyMap<AssetId, ExtractedAsset> = new Map();

        const progressReporter = new ProgressReporter((update) => {
          onProgress(update);
        });

        if (lowerName.endsWith(".onepkg")) {
          notebook = await adapter.parsePackage(buffer, {}, progressReporter, cts.token);
        } else if (lowerName.endsWith(".onetoc2")) {
          notebook = await adapter.parseTableOfContents(buffer, {}, progressReporter, cts.token);
        } else {
          // .one section file
          const sectionResult = await adapter.parseSection(buffer, {}, progressReporter, cts.token);
          extractedAssets = sectionResult.assets;
          const sectionName = file.name.replace(/\.one$/i, "");
          const pages =
            sectionResult.pages && sectionResult.pages.length > 0
              ? [...sectionResult.pages]
              : sectionResult.page
                ? [sectionResult.page]
                : [];

          if (pages.length === 0) {
            pages.push({
              id: IdGenerator.pageId(),
              title: sectionName,
              pageLevel: 0,
              createdTime: Date.now(),
              modifiedTime: Date.now(),
              canvasStyle: { backgroundColor: "#FFFFFF" },
              elements: [],
            });
          }

          notebook = {
            id: IdGenerator.notebookId(),
            title: sectionName,
            sectionGroups: [],
            sections: [
              {
                id: IdGenerator.sectionId(),
                name: sectionName,
                isEncrypted: false,
                pages,
              },
            ],
          };
        }

        cts.token.throwIfCancelled();

        // 3. Publish to Obsidian Vault
        onProgress({
          stage: ProgressStage.PUBLISHING_VAULT,
          message: "Generating notes, spatial sidecars, and attachments...",
          percent: 80,
        });

        const rootImportFolder = targetFolder.trim() || this.settings.rootImportFolder || "OneNote2Obsidian";
        const publishResult = await SemanticVaultPublisher.publish({
          notebook,
          extractedAssets,
          sourceSha256,
          sourcePath: file.name,
          pathConfig: {
            rootImportFolder,
            attachmentFolder: `${rootImportFolder}/attachments`,
          },
          duplicateStrategy: "overwrite",
        });

        // Write files into Obsidian vault
        const vault = this.app.vault;
        const totalFiles = publishResult.files.length;
        let written = 0;

        for (const genFile of publishResult.files) {
          cts.token.throwIfCancelled();
          const normalized = normalizePath(genFile.path);

          // Ensure parent folders exist
          const parts = normalized.split("/");
          if (parts.length > 1) {
            let currentPath = "";
            for (let i = 0; i < parts.length - 1; i++) {
              currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i]!;
              if (!(await vault.adapter.exists(currentPath))) {
                await vault.adapter.mkdir(currentPath);
              }
            }
          }

          if (typeof genFile.content === "string") {
            await vault.adapter.write(normalized, genFile.content);
          } else {
            const buf =
              genFile.content instanceof Uint8Array
                ? genFile.content.buffer.slice(
                    genFile.content.byteOffset,
                    genFile.content.byteOffset + genFile.content.byteLength
                  )
                : genFile.content;
            await vault.adapter.writeBinary(normalized, buf as ArrayBuffer);
          }

          written++;
          const pct = 80 + Math.round((written / Math.max(1, totalFiles)) * 19);
          onProgress({
            stage: ProgressStage.PUBLISHING_VAULT,
            message: `Writing vault file: ${parts[parts.length - 1]}`,
            percent: Math.min(99, pct),
          });
        }

        // 4. Register in PageContextManager
        this.contextManager.registerNotebook(notebook, {
          sha256: sourceSha256,
          path: file.name,
          targetFolder: rootImportFolder,
        });

        // Track first page to display
        if (notebook.sections[0]?.pages[0]) {
          importedFirstPageId = notebook.sections[0].pages[0].id;
        } else if (notebook.sectionGroups[0]?.sections[0]?.pages[0]) {
          importedFirstPageId = notebook.sectionGroups[0].sections[0].pages[0].id;
        }

        onProgress({
          stage: ProgressStage.COMPLETE,
          message: `Successfully imported ${publishResult.importedPages} pages into "${rootImportFolder}"!`,
          percent: 100,
        });
      },
      onSuccess: () => {
        if (importedFirstPageId) {
          this.coordinator.openSpatialView(importedFirstPageId);
        } else {
          this.coordinator.openSpatialView();
        }
      },
    });
    modal.open();
  }
}
