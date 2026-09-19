import { App, Modal, Notice, TFile } from "obsidian";
import { PageId } from "../../model/Ids";
import { PageContextManager } from "../../context/PageContextManager";
import { FrontmatterManager } from "../frontmatter/FrontmatterManager";

export class PagePropertiesModal extends Modal {
  private properties: Record<string, any> = {};
  private deletedKeys = new Set<string>();
  private markdownFile: TFile | null = null;
  private tableContainerEl!: HTMLElement;

  constructor(
    app: App,
    private pageId: PageId,
    private onSave?: (updatedProps: Record<string, any>) => void
  ) {
    super(app);
  }

  public async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("onenote-properties-modal");

    const ctx = PageContextManager.getInstance().getPageContext(this.pageId);
    const title = ctx?.pageTitle || "Page Properties";

    // Modal Header
    const header = contentEl.createDiv({ cls: "onenote-properties-header" });
    const titleEl = header.createEl("h2", { text: `Properties: ${title}` });
    titleEl.addClass("onenote-properties-title");

    const subtitle = header.createEl("p", {
      text: "View, edit, or add frontmatter properties. Changes are synchronized with the Markdown note and Canvas.",
    });
    subtitle.addClass("onenote-properties-subtitle");

    // Load current frontmatter from markdown file
    if (ctx?.markdownPath) {
      const file = this.app.vault.getAbstractFileByPath(ctx.markdownPath);
      if (file instanceof TFile) {
        this.markdownFile = file;
        try {
          const content = await this.app.vault.read(file);
          this.properties = FrontmatterManager.parseFrontmatter(content);
        } catch {
          this.properties = {};
        }
      }
    }

    // Default system keys if missing
    if (!this.properties.onenote_page_id) {
      this.properties.onenote_page_id = this.pageId;
    }
    if (!this.properties.onenote_title && ctx?.pageTitle) {
      this.properties.onenote_title = ctx.pageTitle;
    }
    if (!this.properties.tags) {
      this.properties.tags = ["onenote-import"];
    }

    // Properties Table Container
    this.tableContainerEl = contentEl.createDiv({ cls: "onenote-properties-table" });
    this.renderPropertyRows();

    // Add New Property Bar
    this.renderAddPropertyBar(contentEl);

    // Modal Footer Actions
    const footer = contentEl.createDiv({ cls: "onenote-properties-footer" });

    const cancelBtn = footer.createEl("button", { text: "Cancel", cls: "onenote-btn" });
    cancelBtn.onclick = () => this.close();

    const saveBtn = footer.createEl("button", {
      text: "Save Properties",
      cls: "onenote-btn mod-cta",
    });
    saveBtn.onclick = async () => {
      await this.saveChanges();
    };
  }

  private renderPropertyRows(): void {
    this.tableContainerEl.empty();

    // 1. Fixed / Core properties: onenote_page_id
    this.createPropertyRow(
      "onenote_page_id",
      this.properties.onenote_page_id,
      "Page ID",
      true, // Readonly
      "system"
    );

    // 2. Title
    this.createPropertyRow(
      "onenote_title",
      this.properties.onenote_title || "",
      "Title",
      false,
      "text"
    );

    // 3. Tags
    const tagsVal = Array.isArray(this.properties.tags)
      ? this.properties.tags.join(", ")
      : String(this.properties.tags || "");
    this.createPropertyRow("tags", tagsVal, "Tags (comma separated)", false, "tags");

    // 4. Dates
    if (this.properties.created) {
      this.createPropertyRow("created", this.properties.created, "Created Date", false, "date");
    }
    if (this.properties.modified) {
      this.createPropertyRow("modified", this.properties.modified, "Modified Date", false, "date");
    }

    // 5. Custom properties
    const coreKeys = new Set([
      "onenote_page_id",
      "onenote_title",
      "tags",
      "created",
      "modified",
      "spatial_sidecar",
    ]);
    for (const [key, val] of Object.entries(this.properties)) {
      if (!coreKeys.has(key) && !this.deletedKeys.has(key)) {
        this.createPropertyRow(key, val, key, false, "custom");
      }
    }
  }

  private createPropertyRow(
    key: string,
    value: any,
    label: string,
    readonly: boolean,
    type: "system" | "text" | "tags" | "date" | "custom"
  ): void {
    const row = this.tableContainerEl.createDiv({ cls: "onenote-property-row" });

    // Key label
    const keyEl = row.createDiv({ cls: "onenote-property-key" });
    keyEl.createEl("span", { text: label });

    if (type === "system") {
      const badge = keyEl.createEl("span", { text: "ID", cls: "onenote-prop-badge" });
      badge.title = "Internal canonical page identifier";
    }

    // Value input
    const valContainer = row.createDiv({ cls: "onenote-property-val" });
    if (readonly) {
      const displayVal = valContainer.createEl("span", {
        text: String(value),
        cls: "onenote-prop-readonly-val",
      });
      displayVal.title = String(value);
    } else {
      const input = valContainer.createEl("input", {
        type: "text",
        cls: "onenote-prop-input",
      });
      input.value = Array.isArray(value) ? value.join(", ") : String(value ?? "");

      input.oninput = () => {
        if (key === "tags") {
          this.properties.tags = input.value
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
        } else {
          this.properties[key] = input.value;
        }
      };
    }

    // Delete action for custom properties
    const actionEl = row.createDiv({ cls: "onenote-property-actions" });
    if (type === "custom") {
      const delBtn = actionEl.createEl("button", {
        cls: "onenote-prop-del-btn",
        text: "🗑️",
      });
      delBtn.title = `Delete property "${key}"`;
      delBtn.setAttribute("aria-label", `Delete property ${key}`);
      delBtn.onclick = () => {
        delete this.properties[key];
        this.deletedKeys.add(key);
        this.renderPropertyRows();
      };
    }
  }

  private renderAddPropertyBar(container: HTMLElement): void {
    const addSection = container.createDiv({ cls: "onenote-add-property-section" });
    addSection.createEl("h4", { text: "Add New Property", cls: "onenote-add-prop-heading" });

    const row = addSection.createDiv({ cls: "onenote-add-property-row" });

    const keyInput = row.createEl("input", {
      type: "text",
      cls: "onenote-prop-input onenote-new-key-input",
      placeholder: "Property Name (e.g. status, author)",
    });

    const valInput = row.createEl("input", {
      type: "text",
      cls: "onenote-prop-input onenote-new-val-input",
      placeholder: "Value",
    });

    const addBtn = row.createEl("button", {
      text: "+ Add Property",
      cls: "onenote-btn onenote-add-prop-btn",
    });

    addBtn.onclick = () => {
      const key = keyInput.value.trim().toLowerCase().replace(/\s+/g, "_");
      const val = valInput.value.trim();

      if (!key) {
        new Notice("Please enter a valid property name.");
        return;
      }

      this.properties[key] = val;
      this.deletedKeys.delete(key);
      keyInput.value = "";
      valInput.value = "";
      this.renderPropertyRows();
    };
  }

  private async saveChanges(): Promise<void> {
    if (!this.markdownFile) {
      new Notice("Markdown file not found for this page.");
      this.close();
      return;
    }

    try {
      // Ensure modified date is updated
      this.properties.modified = FrontmatterManager.formatObsidianDate(Date.now());

      const deletions = Array.from(this.deletedKeys);
      const updatedProps = await FrontmatterManager.updateFileProperties(
        this.app,
        this.markdownFile,
        this.properties,
        deletions
      );

      // Synchronize in-memory context manager
      PageContextManager.getInstance().updatePageMetadata(this.pageId, updatedProps);

      // If title was modified, notify context manager
      if (updatedProps.onenote_title) {
        PageContextManager.getInstance().updatePageTitle(this.pageId, updatedProps.onenote_title);
      }

      if (this.onSave) {
        this.onSave(updatedProps);
      }

      new Notice("Page properties updated successfully.");
      this.close();
    } catch (err: any) {
      new Notice(`Failed to save properties: ${err?.message || err}`);
    }
  }

  public onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
