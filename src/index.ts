import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { DiagnosticCode } from "./diagnostics/DiagnosticTypes";
import { logger } from "./diagnostics/Logger";
import {
  OneNoteItemView,
  VIEW_TYPE_ONENOTE_SPATIAL,
} from "./obsidian/OneNoteItemView";
import { ImportProgressModal } from "./obsidian/ImportProgressModal";
import { ProgressStage } from "./parser/Progress";
import { HybridViewCoordinator } from "./obsidian/HybridViewCoordinator";
import { PageContextManager } from "./context/PageContextManager";
import { DEFAULT_SETTINGS, OneNotePluginSettings } from "./settings/OneNoteSettings";
import { OneNoteSettingsTab } from "./settings/OneNoteSettingsTab";

export * from "./model";
export * from "./geometry";
export * from "./pagescene";
export * from "./renderer";
export * from "./projection";
export * from "./diagnostics";
export * from "./context";
export * from "./settings";
export * from "./editor";
export * from "./obsidian/ImportProgressModal";

export default class OneNotePlugin extends Plugin {
  public settings: OneNotePluginSettings = DEFAULT_SETTINGS;
  public coordinator!: HybridViewCoordinator;
  public contextManager: PageContextManager = PageContextManager.getInstance();

  async onload(): Promise<void> {
    logger.info(
      DiagnosticCode.GENERAL_INFO,
      "Initializing OneNote to Obsidian Spatial Plugin"
    );

    // 1. Load Settings
    await this.loadSettings();

    // 2. Initialize Hybrid Coordinator
    this.coordinator = new HybridViewCoordinator(this.app, this.contextManager);

    // 3. Register Settings Tab
    this.addSettingTab(new OneNoteSettingsTab(this.app, this));

    // 4. Register Custom Spatial ItemView
    this.registerView(
      VIEW_TYPE_ONENOTE_SPATIAL,
      (leaf: WorkspaceLeaf) => new OneNoteItemView(leaf)
    );

    // 5. Add Ribbon Icon
    this.addRibbonIcon(
      "layout-dashboard",
      "Open OneNote Spatial Canvas",
      () => {
        this.coordinator.openSpatialView();
      }
    );

    // 6. Register Commands
    this.addCommand({
      id: "onenote-import-file",
      name: "Import OneNote File or Package (.one / .onepkg)",
      callback: () => {
        this.openImportModal();
      },
    });

    this.addCommand({
      id: "onenote-open-spatial-view",
      name: "Open Spatial View",
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
      name: "Open Split View (Spatial + Markdown)",
      callback: () => {
        this.coordinator.openSplitView();
      },
    });

    // 7. Register Protocol Handler: obsidian://onenote-spatial
    if (typeof (this as any).registerObsidianProtocolHandler === "function") {
      (this as any).registerObsidianProtocolHandler("onenote-spatial", (params: Record<string, string>) => {
        this.coordinator.handleUri(params);
      });
    }

    // 8. Track Active File for Page Context
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

    logger.info(
      DiagnosticCode.GENERAL_INFO,
      "OneNote Spatial Plugin loaded successfully"
    );
  }

  async onunload(): Promise<void> {
    logger.info(
      DiagnosticCode.GENERAL_INFO,
      "Unloading OneNote Spatial Plugin"
    );
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

  public openImportModal(): void {
    const modal = new ImportProgressModal(this.app, {
      onStartImport: async (file, _targetFolder, cts, onProgress) => {
        onProgress({ stage: ProgressStage.READING_FILE, message: `Reading ${file.name}`, percent: 10 });
        await file.arrayBuffer();
        cts.token.throwIfCancelled();

        onProgress({ stage: ProgressStage.BUILDING_CANONICAL_MODEL, message: "Processing notebook sections", percent: 50 });
        onProgress({ stage: ProgressStage.PUBLISHING_VAULT, message: "Finalizing vault publication", percent: 100 });
      },
      onSuccess: () => {
        this.coordinator.openSpatialView();
      },
    });
    modal.open();
  }
}
