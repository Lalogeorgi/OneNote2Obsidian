import { App, Modal, Notice } from "obsidian";
import {
  STICKY_NOTE_COLOR_PRESETS,
  STICKY_NOTE_STRINGS,
  STICKY_NOTE_SVG_ICONS,
  STICKY_NOTE_ACCESSIBILITY_STRINGS,
} from "../constants/StickyNoteConstants";
import { PageContextManager, RegisteredPageContext } from "../context/PageContextManager";
import { CanonicalPage } from "../model/CanonicalPage";
import { CanonicalStickyNote, StickyNoteColorPreset } from "../model/CanonicalStickyNote";
import { IdGenerator } from "../model/Ids";
import { StickyNoteUtils } from "../model/StickyNoteUtils";
import { PageSceneSerializer } from "../pagescene/PageSceneSerializer";
import { FloatingStickyNoteManager } from "./FloatingStickyNoteManager";

export class StickyNotesHubModal extends Modal {
  private searchQuery = "";
  private selectedColor: string | null = null;
  private notesGridEl!: HTMLElement;
  private allNotes: CanonicalStickyNote[] = [];

  constructor(app: App) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("onenote-sticky-hub-modal");

    this.loadAllNotes();
    this.renderHeader();
    this.renderColorFilter();
    this.notesGridEl = contentEl.createDiv({ cls: "onenote-sticky-hub-grid" });
    this.renderNotes();
  }

  private loadAllNotes(): void {
    const notesMap = new Map<string, CanonicalStickyNote>();

    // 1. Collect sticky notes across all registered pages
    const allPages = PageContextManager.getInstance().getAllPages();
    for (const ctx of allPages) {
      if (ctx.canonicalPage?.elements) {
        for (const el of ctx.canonicalPage.elements) {
          if (el.type === "stickyNote") {
            notesMap.set(el.id, el as CanonicalStickyNote);
          }
        }
      }
    }

    // 2. Also check active page context (if any)
    const activeCtx = PageContextManager.getInstance().getActivePageContext();
    if (activeCtx?.canonicalPage?.elements) {
      for (const el of activeCtx.canonicalPage.elements) {
        if (el.type === "stickyNote") {
          notesMap.set(el.id, el as CanonicalStickyNote);
        }
      }
    }

    // 3. Include any currently active floating or popout notes
    const activeNotes = FloatingStickyNoteManager.getInstance().getAllActiveNotes();
    for (const note of activeNotes) {
      notesMap.set(note.id, note);
    }

    // 4. Also scan vault for any sidecars not yet loaded into PageContextManager
    if (this.app?.vault && typeof this.app.vault.getFiles === "function") {
      try {
        const files = this.app.vault.getFiles();
        for (const f of files) {
          if (f.name.endsWith(".onecanvas.json")) {
            const parentPath = f.parent?.path ? `${f.parent.path}/` : "";
            const mdPath = `${parentPath}${f.name.replace(".onecanvas.json", ".md")}`;
            if (PageContextManager.getInstance().getPageContextByMarkdownPath(mdPath)) {
              continue;
            }
            this.app.vault
              .read(f)
              .then((content) => {
                try {
                  const scene = PageSceneSerializer.deserialize(content);
                  if (scene && scene.nodes) {
                    let added = false;
                    for (const n of scene.nodes) {
                      if (n.layer === "stickyNotes" && (n as any).element) {
                        const stickyEl = (n as any).element as CanonicalStickyNote;
                        if (!notesMap.has(stickyEl.id)) {
                          notesMap.set(stickyEl.id, stickyEl);
                          added = true;
                        }
                      }
                    }
                    if (added) {
                      this.allNotes = Array.from(notesMap.values());
                      this.renderNotes();
                    }
                  }
                } catch {
                  // Ignore parse error
                }
              })
              .catch(() => {});
          }
        }
      } catch {
        // Safe containment
      }
    }

    this.allNotes = Array.from(notesMap.values());
  }

  private renderHeader(): void {
    const headerEl = this.contentEl.createDiv({ cls: "onenote-sticky-hub-header" });

    const titleEl = headerEl.createEl("h2", { text: STICKY_NOTE_STRINGS.HUB_TITLE });
    titleEl.className = "onenote-sticky-hub-title";

    const searchInput = headerEl.createEl("input", {
      type: "text",
      placeholder: STICKY_NOTE_STRINGS.HUB_SEARCH_PLACEHOLDER,
      cls: "onenote-sticky-hub-search",
    });
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value.toLowerCase().trim();
      this.renderNotes();
    });

    const newBtn = headerEl.createEl("button", {
      text: STICKY_NOTE_STRINGS.HUB_NEW_NOTE_BTN,
      cls: "onenote-sticky-hub-new-btn",
    });
    newBtn.addEventListener("click", () => {
      this.createNewNote();
    });
  }

  private renderColorFilter(): void {
    const filterContainer = this.contentEl.createDiv({ cls: "onenote-sticky-hub-filters" });

    const allPill = filterContainer.createEl("button", {
      text: STICKY_NOTE_STRINGS.HUB_ALL_FILTER,
      cls: `onenote-filter-pill ${this.selectedColor === null ? "is-active" : ""}`,
    });
    allPill.addEventListener("click", () => {
      this.selectedColor = null;
      this.updateFilterPillStates(filterContainer);
      this.renderNotes();
    });

    for (const preset of STICKY_NOTE_COLOR_PRESETS) {
      const pal = StickyNoteUtils.resolveStickyNoteColors(preset);
      const pill = filterContainer.createEl("button", {
        cls: `onenote-filter-pill ${this.selectedColor === preset ? "is-active" : ""}`,
      });
      pill.setAttribute("data-color", preset);
      pill.title = preset.charAt(0).toUpperCase() + preset.slice(1);
      pill.style.backgroundColor = pal.background;
      pill.style.borderColor = pal.border;
      pill.setAttribute(
        "aria-label",
        `${STICKY_NOTE_ACCESSIBILITY_STRINGS.FILTER_PRESET_PREFIX}${preset}`
      );

      pill.addEventListener("click", () => {
        this.selectedColor = this.selectedColor === preset ? null : preset;
        this.updateFilterPillStates(filterContainer);
        this.renderNotes();
      });
    }
  }

  private updateFilterPillStates(container: HTMLElement): void {
    const pills = container.querySelectorAll(".onenote-filter-pill");
    pills.forEach((p, idx) => {
      if (idx === 0) {
        if (this.selectedColor === null) p.classList.add("is-active");
        else p.classList.remove("is-active");
      } else {
        const color = p.getAttribute("data-color");
        if (this.selectedColor === color) p.classList.add("is-active");
        else p.classList.remove("is-active");
      }
    });
  }

  private renderNotes(): void {
    this.notesGridEl.empty();

    const filtered = this.allNotes.filter((note) => {
      if (this.selectedColor && note.color !== this.selectedColor) {
        return false;
      }
      if (this.searchQuery) {
        const titleMatch = (note.title || "").toLowerCase().includes(this.searchQuery);
        const contentMatch = (note.content || "").toLowerCase().includes(this.searchQuery);
        if (!titleMatch && !contentMatch) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      const emptyEl = this.notesGridEl.createDiv({ cls: "onenote-sticky-hub-empty" });
      emptyEl.setText(
        this.searchQuery
          ? STICKY_NOTE_STRINGS.HUB_NO_SEARCH_MATCHES
          : STICKY_NOTE_STRINGS.HUB_EMPTY_STATE
      );
      return;
    }

    // Sort by modified time descending (newest first)
    filtered.sort((a, b) => (b.modifiedTime || 0) - (a.modifiedTime || 0));

    for (const note of filtered) {
      const card = this.notesGridEl.createDiv({ cls: "onenote-sticky-hub-card" });
      const pal = StickyNoteUtils.resolveStickyNoteColors(note.color as StickyNoteColorPreset);
      card.style.backgroundColor = pal.background;
      card.style.borderColor = pal.border;
      card.style.color = pal.text;

      // Card Header
      const cardHeader = card.createDiv({ cls: "onenote-hub-card-header" });
      cardHeader.style.backgroundColor = pal.header;

      cardHeader.createEl("span", {
        text: note.title || STICKY_NOTE_STRINGS.UNTITLED_NOTE,
        cls: "onenote-hub-card-title",
      });

      const delBtn = cardHeader.createEl("button", {
        cls: "onenote-hub-card-del",
      });
      delBtn.innerHTML = STICKY_NOTE_SVG_ICONS.CLOSE;
      delBtn.title = STICKY_NOTE_STRINGS.DELETE_TOOLTIP;
      delBtn.setAttribute("aria-label", STICKY_NOTE_ACCESSIBILITY_STRINGS.DELETE_NOTE);
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.deleteNote(note.id);
      });

      // Card Content Excerpt
      const body = card.createDiv({ cls: "onenote-hub-card-body" });
      // Strip HTML tags for clean excerpt
      const plainText = note.content.replace(/<[^>]*>?/gm, "").trim();
      body.setText(plainText || STICKY_NOTE_STRINGS.HUB_EMPTY_NOTE_EXCERPT);

      // Card Footer with Date
      const footer = card.createDiv({ cls: "onenote-hub-card-footer" });
      const dateStr = note.modifiedTime
        ? new Date(note.modifiedTime).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";
      footer.setText(dateStr);

      // Card click opens floating note or focuses note
      card.addEventListener("click", () => {
        this.openNote(note);
      });
    }
  }

  private createNewNote(): void {
    let targetCtx: RegisteredPageContext | null | undefined =
      PageContextManager.getInstance().getActivePageContext();
    if (!targetCtx || !targetCtx.canonicalPage) {
      const allPages = PageContextManager.getInstance().getAllPages();
      if (allPages.length > 0 && allPages[0]!.canonicalPage) {
        targetCtx = allPages[0]!;
      }
    }

    const newNote = StickyNoteUtils.createDefaultStickyNote({
      color: (this.selectedColor as StickyNoteColorPreset) || "yellow",
      title: "",
      content: "",
    });

    if (targetCtx?.canonicalPage) {
      const updatedElements = [...targetCtx.canonicalPage.elements, newNote];
      const updatedPage = {
        ...targetCtx.canonicalPage,
        elements: updatedElements,
        modifiedTime: Date.now(),
      };
      PageContextManager.getInstance().registerPage({
        ...targetCtx,
        canonicalPage: updatedPage,
      });
      if (this.app && targetCtx.sidecarPath) {
        FloatingStickyNoteManager.getInstance().schedulePageSave(
          this.app,
          targetCtx.canonicalPage.id,
          targetCtx.sidecarPath,
          updatedPage
        );
      }
      this.allNotes.unshift(newNote);
      this.renderNotes();
    } else {
      // If no canvas page exists in memory, create a dedicated Quick Notes canvas page
      const pageId = IdGenerator.pageId();
      const now = Date.now();
      const quickNotesPage: CanonicalPage = {
        id: pageId,
        title: "Quick Notes",
        pageLevel: 0,
        createdTime: now,
        modifiedTime: now,
        canvasStyle: { backgroundColor: "#FFFFFF" },
        elements: [newNote],
      };
      const rootFolder = "OneNote2Obsidian";
      const mdPath = `${rootFolder}/Quick Notes.md`;
      const sidecarPath = `${rootFolder}/Quick Notes.onecanvas.json`;
      const newCtx = {
        pageId,
        pageTitle: "Quick Notes",
        notebookTitle: rootFolder,
        sectionName: "General",
        markdownPath: mdPath,
        sidecarPath: sidecarPath,
        canonicalPage: quickNotesPage,
      };
      PageContextManager.getInstance().registerPage(newCtx);
      if (this.app) {
        FloatingStickyNoteManager.getInstance().schedulePageSave(
          this.app,
          pageId,
          sidecarPath,
          quickNotesPage
        );
      }
      this.allNotes.unshift(newNote);
      this.renderNotes();
      targetCtx = newCtx;
    }

    // Open immediately
    const pageId = targetCtx?.canonicalPage?.id;
    if (FloatingStickyNoteManager.getInstance().canOpenNativePopout(this.app)) {
      FloatingStickyNoteManager.getInstance().openPopoutWindow(this.app, newNote, pageId);
    } else {
      FloatingStickyNoteManager.getInstance().openNote(this.app, newNote, pageId);
    }
    this.close();
  }

  private openNote(note: CanonicalStickyNote): void {
    let pageId = PageContextManager.getInstance().getActivePageContext()?.canonicalPage?.id;
    if (!pageId) {
      const parentCtx = PageContextManager.getInstance().getAllPages().find(
        (ctx) => ctx.canonicalPage?.elements.some((el) => el.id === note.id)
      );
      pageId = parentCtx?.pageId;
    }
    if (FloatingStickyNoteManager.getInstance().canOpenNativePopout(this.app)) {
      FloatingStickyNoteManager.getInstance().openPopoutWindow(this.app, note, pageId);
    } else {
      FloatingStickyNoteManager.getInstance().openNote(this.app, note, pageId);
    }
    this.close();
  }

  private deleteNote(noteId: string): void {
    let targetCtx: RegisteredPageContext | null | undefined =
      PageContextManager.getInstance().getActivePageContext();
    if (!targetCtx?.canonicalPage?.elements.some((el) => el.id === noteId)) {
      targetCtx = PageContextManager.getInstance().getAllPages().find(
        (ctx) => ctx.canonicalPage?.elements.some((el) => el.id === noteId)
      );
    }

    if (targetCtx?.canonicalPage) {
      const updatedElements = targetCtx.canonicalPage.elements.filter((el) => el.id !== noteId);
      const updatedPage = {
        ...targetCtx.canonicalPage,
        elements: updatedElements,
        modifiedTime: Date.now(),
      };
      PageContextManager.getInstance().registerPage({
        ...targetCtx,
        canonicalPage: updatedPage,
      });
      if (this.app && targetCtx.sidecarPath) {
        FloatingStickyNoteManager.getInstance().schedulePageSave(
          this.app,
          targetCtx.canonicalPage.id,
          targetCtx.sidecarPath,
          updatedPage
        );
      }
    }
    this.allNotes = this.allNotes.filter((n) => n.id !== noteId);
    FloatingStickyNoteManager.getInstance().closeNote(noteId as any);
    this.renderNotes();
    new Notice(STICKY_NOTE_STRINGS.DELETED_NOTICE);
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
