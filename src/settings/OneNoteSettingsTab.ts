import { App, PluginSettingTab, Setting } from "obsidian";
import type OneNotePlugin from "../index";
import { DefaultViewMode } from "./OneNoteSettings";
import { DuplicateStrategy } from "../projection/ImportManifest";

export class OneNoteSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: OneNotePlugin
  ) {
    super(app, plugin);
  }

  public display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Canvas Settings").setHeading();

    // 1. Default View Mode
    new Setting(containerEl)
      .setName("Default View Mode")
      .setDesc("Choose which representation to open by default when clicking imported notes.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("spatial", "Canvas (Visual 2.5D)")
          .addOption("markdown", "Markdown Note (Semantic Text)")
          .addOption("split", "Split View (Side-by-Side Canvas + Markdown)")
          .setValue(this.plugin.settings.defaultViewMode)
          .onChange(async (val) => {
            this.plugin.settings.defaultViewMode = val as DefaultViewMode;
            await this.plugin.saveSettings();
          })
      );

    // 2. Root Import Folder
    new Setting(containerEl)
      .setName("Root Import Folder")
      .setDesc("Vault folder path where imported notes will be stored.")
      .addText((text) =>
        text
          .setPlaceholder("OneNote2Obsidian")
          .setValue(this.plugin.settings.rootImportFolder)
          .onChange(async (val) => {
            this.plugin.settings.rootImportFolder = val.trim() || "OneNote2Obsidian";
            await this.plugin.saveSettings();
          })
      );

    // 3. Attachments Subfolder
    new Setting(containerEl)
      .setName("Attachments Subfolder")
      .setDesc("Folder name for storing extracted images and attachments.")
      .addText((text) =>
        text
          .setPlaceholder("attachments")
          .setValue(this.plugin.settings.attachmentFolder)
          .onChange(async (val) => {
            this.plugin.settings.attachmentFolder = val.trim() || "attachments";
            await this.plugin.saveSettings();
          })
      );

    // 4. Duplicate Ingestion Strategy
    new Setting(containerEl)
      .setName("Duplicate Ingestion Strategy")
      .setDesc("How to handle re-importing a .one or .onepkg package with identical checksums.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("skip", "Skip (Prevent duplicate writes)")
          .addOption("overwrite", "Overwrite (Update existing files)")
          .addOption("version", "Version (Create numbered copies)")
          .setValue(this.plugin.settings.duplicateStrategy)
          .onChange(async (val) => {
            this.plugin.settings.duplicateStrategy = val as DuplicateStrategy;
            await this.plugin.saveSettings();
          })
      );

    // 5. Flatten Hierarchy
    new Setting(containerEl)
      .setName("Flatten Folder Hierarchy")
      .setDesc("If enabled, creates single-level files instead of nested section folders.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.flattenHierarchy).onChange(async (val) => {
          this.plugin.settings.flattenHierarchy = val;
          await this.plugin.saveSettings();
        })
      );

    // 6. High DPI Rendering
    new Setting(containerEl)
      .setName("High-DPI Retina Rendering")
      .setDesc("Enables device pixel ratio auto-scaling for ultra-crisp ink lines and textures.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableHighDpi).onChange(async (val) => {
          this.plugin.settings.enableHighDpi = val;
          await this.plugin.saveSettings();
        })
      );
  }
}
