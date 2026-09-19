import { App, Modal, Notice, Setting } from "obsidian";
import { DiagnosticCode } from "../diagnostics/DiagnosticTypes";
import { logger } from "../diagnostics/Logger";
import { CancellationTokenSource } from "../parser/Cancellation";
import { ProgressCallback, ProgressUpdate } from "../parser/Progress";
import { PARSER_METRICS_DEFAULTS } from "../constants/ParserConstants";

export interface ImportModalOptions {
  onStartImport: (
    file: File,
    targetFolder: string,
    cancellationToken: CancellationTokenSource,
    onProgress: ProgressCallback
  ) => Promise<void>;
  onSuccess?: () => void;
}

export class ImportProgressModal extends Modal {
  private selectedFile: File | null = null;
  private targetFolder: string = PARSER_METRICS_DEFAULTS.DEFAULT_IMPORT_FOLDER;
  private isImporting = false;
  private cts: CancellationTokenSource | null = null;

  // DOM Elements
  private formContainerEl!: HTMLElement;
  private progressContainerEl!: HTMLElement;
  private progressBarEl!: HTMLElement;
  private progressTextEl!: HTMLElement;
  private progressStageEl!: HTMLElement;
  private cancelButtonEl!: HTMLButtonElement;
  private errorContainerEl!: HTMLElement;

  constructor(
    app: App,
    private options: ImportModalOptions
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("onenote-import-modal");

    contentEl.createEl("h2", { text: "Import Notebook or Section" });

    this.formContainerEl = contentEl.createDiv({ cls: "onenote-import-form" });
    this.renderForm();

    this.progressContainerEl = contentEl.createDiv({
      cls: "onenote-import-progress",
    });
    this.progressContainerEl.style.display = "none";
    this.renderProgress();

    this.errorContainerEl = contentEl.createDiv({ cls: "onenote-import-error" });
    this.errorContainerEl.style.display = "none";
  }

  private renderForm(): void {
    this.formContainerEl.empty();

    new Setting(this.formContainerEl)
      .setName("Select File or Package")
      .setDesc("Choose a .one section or a .onepkg notebook archive")
      .addButton((btn) => {
        btn.setButtonText("Choose File").onClick(() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".one,.onepkg,.onetoc2";
          input.onchange = () => {
            if (input.files && input.files[0]) {
              this.selectedFile = input.files[0];
              btn.setButtonText(this.selectedFile.name);
            }
          };
          input.click();
        });
      });

    new Setting(this.formContainerEl)
      .setName("Destination Folder")
      .setDesc("Relative vault folder path where imported notes and assets will be stored")
      .addText((text) => {
        text.setValue(this.targetFolder).onChange((val) => {
          this.targetFolder = val.trim() || PARSER_METRICS_DEFAULTS.DEFAULT_IMPORT_FOLDER;
        });
      });

    new Setting(this.formContainerEl).addButton((btn) => {
      btn
        .setButtonText("Start Import")
        .setCta()
        .onClick(async () => {
          if (!this.selectedFile) {
            new Notice("Please select a file (.one or .onepkg) first.");
            return;
          }
          await this.startImportProcess();
        });
    });
  }

  private renderProgress(): void {
    this.progressContainerEl.empty();

    this.progressStageEl = this.progressContainerEl.createEl("div", {
      cls: "onenote-progress-stage",
      text: "Preparing import pipeline...",
    });

    const barWrapper = this.progressContainerEl.createDiv({ cls: "onenote-progress-bar-wrapper" });
    this.progressBarEl = barWrapper.createDiv({ cls: "onenote-progress-bar-fill" });
    this.progressBarEl.style.width = "0%";

    this.progressTextEl = this.progressContainerEl.createDiv({
      cls: "onenote-progress-text",
      text: "0% complete",
    });

    const actionRow = this.progressContainerEl.createDiv({ cls: "onenote-progress-actions" });
    this.cancelButtonEl = actionRow.createEl("button", {
      text: "Cancel Import",
      cls: "mod-warning",
    });
    this.cancelButtonEl.onclick = () => {
      if (this.cts) {
        this.cts.cancel();
        this.progressStageEl.setText("Cancelling operation and cleaning up staging area...");
        this.cancelButtonEl.disabled = true;
      }
    };
  }

  private async startImportProcess(): Promise<void> {
    if (!this.selectedFile || this.isImporting) return;

    this.isImporting = true;
    this.formContainerEl.style.display = "none";
    this.progressContainerEl.style.display = "block";
    this.errorContainerEl.style.display = "none";

    this.cts = new CancellationTokenSource();

    try {
      await this.options.onStartImport(
        this.selectedFile,
        this.targetFolder,
        this.cts,
        (report: ProgressUpdate) => {
          this.updateProgress(report);
        }
      );

      new Notice(`Successfully imported "${this.selectedFile.name}"!`);
      this.options.onSuccess?.();
      this.close();
    } catch (err: any) {
      this.handleImportError(err);
    } finally {
      this.isImporting = false;
      this.cts = null;
    }
  }

  public updateProgress(report: ProgressUpdate): void {
    const percent = Math.min(100, Math.max(0, Math.round(report.percent)));
    this.progressBarEl.style.width = `${percent}%`;
    this.progressTextEl.setText(`${percent}% complete`);

    let status = `${report.stage}: ${report.message}`;
    if (report.currentItem) {
      status += ` (${report.currentItem})`;
    }
    this.progressStageEl.setText(status);
  }

  private handleImportError(err: Error): void {
    this.progressContainerEl.style.display = "none";
    this.errorContainerEl.style.display = "block";
    this.errorContainerEl.empty();

    const isCancelled = err.message.includes("cancelled") || err.message.includes("aborted");

    if (isCancelled) {
      this.errorContainerEl.createEl("h3", { text: "Import Cancelled" });
      this.errorContainerEl.createEl("p", {
        text: "The import operation was cancelled. All temporary staging files have been safely removed.",
      });
    } else {
      logger.error(DiagnosticCode.PARSER_CORRUPT_CHUNK, "Import failed during execution", {
        error: err.message,
      });

      this.errorContainerEl.createEl("h3", { text: "Import Failed" });
      this.errorContainerEl.createEl("p", {
        cls: "onenote-error-msg",
        text:
          err.message ||
          "An unexpected error occurred during binary parsing or archive extraction.",
      });

      const suggestions = this.errorContainerEl.createEl("ul");
      suggestions.createEl("li", {
        text: "If this is a password-protected section, unlock and export it first.",
      });
      suggestions.createEl("li", {
        text: "If this is an older legacy format, upgrade the notebook to 2010-2016 format before importing.",
      });
      suggestions.createEl("li", {
        text: "Ensure you have sufficient disk space in your Obsidian vault directory.",
      });
    }

    const retryBtn = this.errorContainerEl.createEl("button", {
      text: "Try Again",
      cls: "mod-cta",
    });
    retryBtn.onclick = () => {
      this.errorContainerEl.style.display = "none";
      this.formContainerEl.style.display = "block";
    };
  }

  onClose(): void {
    if (this.cts && this.isImporting) {
      this.cts.cancel();
    }
    const { contentEl } = this;
    contentEl.empty();
  }
}
