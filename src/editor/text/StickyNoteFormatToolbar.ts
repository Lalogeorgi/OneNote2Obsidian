/**
 * OneNote-Authentic Bottom Docked Text Formatting Toolbar.
 * Matches Microsoft Sticky Notes with Bold, Italic, Underline, Strikethrough,
 * Bullet List, Task Checklist, and Image Insertion.
 */

import {
  STICKY_NOTE_FORMAT_TOOLS,
  STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT,
} from "../../constants/StickyNoteConstants";
import { emptyElement, setSvgContent } from "../../dom/DomUtils";

export interface StickyNoteFormatToolbarOptions {
  readonly onImageSelect?: (file: File) => void;
  readonly onMutate?: () => void;
}

export class StickyNoteFormatToolbar {
  public readonly el: HTMLElement;
  private activeBodyEl: HTMLElement | null = null;
  private btnMap = new Map<string, HTMLButtonElement>();
  private savedRange: Range | null = null;
  private boundSelectionUpdate: (() => void) | null = null;
  private boundKeyDown: ((e: KeyboardEvent) => void) | null = null;

  private get doc(): Document {
    return (
      this.activeBodyEl?.ownerDocument ||
      (typeof document !== "undefined" ? document : ({} as Document))
    );
  }

  private get win(): Window {
    return this.doc.defaultView || (typeof window !== "undefined" ? window : ({} as Window));
  }

  constructor(private options: StickyNoteFormatToolbarOptions = {}) {
    this.el = document.createElement("div");
    this.el.className = "onenote-sticky-bottom-toolbar";
    this.buildToolbar();
  }

  public attachTo(bodyEl: HTMLElement): void {
    this.detach();
    this.activeBodyEl = bodyEl;

    this.boundSelectionUpdate = () => {
      this.saveSelection();
      this.updateActiveStates();
    };

    this.boundKeyDown = (e: KeyboardEvent) => {
      this.handleKeyDown(e);
    };

    bodyEl.addEventListener("keyup", this.boundSelectionUpdate);
    bodyEl.addEventListener("input", this.boundSelectionUpdate);
    bodyEl.addEventListener("pointerup", this.boundSelectionUpdate);
    bodyEl.addEventListener("mouseup", this.boundSelectionUpdate);
    bodyEl.addEventListener("keydown", this.boundKeyDown);

    this.updateActiveStates();
  }

  public detach(): void {
    if (this.activeBodyEl) {
      if (this.boundSelectionUpdate) {
        this.activeBodyEl.removeEventListener("keyup", this.boundSelectionUpdate);
        this.activeBodyEl.removeEventListener("input", this.boundSelectionUpdate);
        this.activeBodyEl.removeEventListener("pointerup", this.boundSelectionUpdate);
        this.activeBodyEl.removeEventListener("mouseup", this.boundSelectionUpdate);
      }
      if (this.boundKeyDown) {
        this.activeBodyEl.removeEventListener("keydown", this.boundKeyDown);
      }
    }
    this.activeBodyEl = null;
    this.boundSelectionUpdate = null;
    this.boundKeyDown = null;
    this.savedRange = null;
    this.clearActiveStates();
  }

  public saveSelection(): void {
    const win = this.win;
    if (!win?.getSelection) return;
    const sel = win.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (this.activeBodyEl && this.activeBodyEl.contains(range.commonAncestorContainer)) {
        this.savedRange = range.cloneRange();
      }
    }
  }

  public restoreSelection(): void {
    if (!this.savedRange) return;
    const win = this.win;
    if (!win?.getSelection) return;
    const sel = win.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(this.savedRange);
    }
  }

  public getActiveBody(): HTMLElement | null {
    return this.activeBodyEl;
  }

  public updateActiveStates(): void {
    if (!this.activeBodyEl) return;
    const doc = this.doc;

    const safeQueryState = (cmd: string): boolean => {
      try {
        return doc?.queryCommandState ? doc.queryCommandState(cmd) : false;
      } catch {
        return false;
      }
    };

    this.setBtnActive("bold", safeQueryState("bold"));
    this.setBtnActive("italic", safeQueryState("italic"));
    this.setBtnActive("underline", safeQueryState("underline"));
    this.setBtnActive("strike", safeQueryState("strikeThrough"));
    this.setBtnActive("bullet", safeQueryState("insertUnorderedList"));

    try {
      const win = this.win;
      if (win?.getSelection) {
        const sel = win.getSelection();
        let activeRange: Range | null = null;
        if (sel && sel.rangeCount > 0) {
          const r = sel.getRangeAt(0);
          if (this.activeBodyEl.contains(r.commonAncestorContainer)) {
            activeRange = r;
          }
        }
        if (!activeRange) {
          activeRange = this.savedRange;
        }
        const containerNode = activeRange?.startContainer;
        const isChecklist = !!(
          containerNode &&
          this.activeBodyEl.contains(containerNode) &&
          this.findClosestChecklistItem(containerNode)
        );
        this.setBtnActive("checklist", isChecklist);
      }
    } catch {
      // Safe fallback
    }
  }

  private setBtnActive(id: string, active: boolean): void {
    const btn = this.btnMap.get(id);
    if (!btn) return;
    if (active) {
      btn.classList.add("is-active");
    } else {
      btn.classList.remove("is-active");
    }
  }

  private clearActiveStates(): void {
    for (const btn of this.btnMap.values()) {
      btn.classList.remove("is-active");
    }
  }

  private buildToolbar(): void {
    for (const tool of STICKY_NOTE_FORMAT_TOOLS) {
      const btn = document.createElement("button");
      btn.className = "onenote-sticky-format-btn";
      btn.type = "button";
      if (tool.id === "bold") {
        const b = document.createElement("b");
        b.textContent = "B";
        btn.appendChild(b);
      } else if (tool.id === "italic") {
        const i = document.createElement("i");
        i.textContent = "I";
        btn.appendChild(i);
      } else if (tool.id === "underline") {
        const u = document.createElement("u");
        u.textContent = "U";
        btn.appendChild(u);
      } else if (tool.id === "strike") {
        const s = document.createElement("s");
        s.textContent = "S";
        btn.appendChild(s);
      } else if (tool.svgIcon) {
        setSvgContent(btn, tool.svgIcon);
      } else {
        btn.textContent = tool.title;
      }
      btn.title = tool.title;
      btn.setAttribute("data-command", tool.id);
      btn.setAttribute("aria-label", tool.title);

      // Prevent losing selection in contenteditable across mouse and touch/pen
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (tool.kind === "checklist") {
          this.insertChecklistItem();
        } else if (tool.kind === "image") {
          this.triggerImageUpload();
        } else if (tool.command) {
          this.exec(tool.command);
        }
        this.updateActiveStates();
      });

      this.btnMap.set(tool.id, btn);
      this.el.appendChild(btn);
    }
  }

  public destroy(): void {
    this.detach();
    this.el.remove();
  }

  private exec(command: string, value: string | undefined = undefined): void {
    if (!this.activeBodyEl) return;
    const doc = this.doc;
    if (!doc?.execCommand) return;

    const prevHtml = this.activeBodyEl.innerHTML;

    const isAlreadyFocused =
      doc.activeElement === this.activeBodyEl ||
      (this.activeBodyEl.contains(doc.activeElement) && doc.activeElement !== this.el);

    if (!isAlreadyFocused) {
      this.restoreSelection();
      this.activeBodyEl.focus({ preventScroll: true });
    }

    doc.execCommand(command, false, value);
    this.saveSelection();

    // Only notify mutation if the content was actually altered (e.g. selected text formatted)
    if (this.activeBodyEl.innerHTML !== prevHtml) {
      this.options.onMutate?.();
    }
  }

  private insertChecklistItem(): void {
    if (!this.activeBodyEl) return;
    const doc = this.doc;
    const win = this.win;

    const isAlreadyFocused =
      doc.activeElement === this.activeBodyEl ||
      (this.activeBodyEl.contains(doc.activeElement) && doc.activeElement !== this.el);

    if (!isAlreadyFocused) {
      this.restoreSelection();
      this.activeBodyEl.focus({ preventScroll: true });
    }

    const selection = win.getSelection ? win.getSelection() : null;
    const isSelectionInside = !!(
      selection &&
      selection.rangeCount > 0 &&
      this.activeBodyEl.contains(selection.getRangeAt(0).commonAncestorContainer)
    );

    if (!selection || selection.rangeCount === 0 || !isSelectionInside) {
      const item = this.createChecklistElement("<br>");
      this.activeBodyEl.appendChild(item);
      this.focusTextSpan(item);
      this.options.onMutate?.();
      return;
    }

    const range = selection.getRangeAt(0);

    // 1. If caret or selection is already inside a checklist item -> TOGGLE OFF
    const currentCheckItem = this.findClosestChecklistItem(range.startContainer);
    if (currentCheckItem && this.activeBodyEl.contains(currentCheckItem)) {
      this.toggleOffChecklistItem(currentCheckItem);
      return;
    }

    // 2. If inside a paragraph / block element -> convert the entire block to a checklist item
    const enclosingBlock = this.findEnclosingBlock(range.startContainer);
    if (
      enclosingBlock &&
      enclosingBlock !== this.activeBodyEl &&
      this.activeBodyEl.contains(enclosingBlock)
    ) {
      const content = enclosingBlock.innerHTML.trim();
      const item = this.createChecklistElement(content || "<br>");
      enclosingBlock.replaceWith(item);
      this.focusTextSpan(item);
      this.options.onMutate?.();
      return;
    }

    // 3. If there is a non-collapsed text selection -> convert selected content
    if (!range.collapsed) {
      const frag = range.extractContents();
      const tempDiv = doc.createElement("div");
      tempDiv.appendChild(frag);
      const content = tempDiv.innerHTML.trim();
      const item = this.createChecklistElement(content || "<br>");
      range.insertNode(item);
      this.focusTextSpan(item);
      this.options.onMutate?.();
      return;
    }

    // 4. Collapsed caret inside text node of activeBodyEl
    const node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE && node.parentElement === this.activeBodyEl) {
      const text = node.textContent || "";
      const item = this.createChecklistElement(text.trim() || "<br>");
      if (node.parentElement) {
        node.parentElement.replaceChild(item, node);
      } else {
        (node as any).replaceWith?.(item);
      }
      this.focusTextSpan(item);
      this.options.onMutate?.();
      return;
    }

    // 5. Default insertion at current range
    const item = this.createChecklistElement("<br>");
    range.insertNode(item);
    this.focusTextSpan(item);
    this.options.onMutate?.();
  }

  private createChecklistElement(initialHtml: string): HTMLElement {
    const doc = this.doc;
    const checkContainer = doc.createElement("div");
    checkContainer.className = "onenote-sticky-checklist-item";

    const wrapper = doc.createElement("span");
    wrapper.className = "onenote-sticky-checkbox-wrapper";
    wrapper.contentEditable = "false";
    wrapper.setAttribute("contenteditable", "false");

    const checkbox = doc.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "onenote-sticky-checkbox";
    checkbox.tabIndex = -1;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        checkContainer.classList.add("is-completed");
        checkbox.setAttribute("checked", "checked");
      } else {
        checkContainer.classList.remove("is-completed");
        checkbox.removeAttribute("checked");
      }
      this.options.onMutate?.();
    });

    wrapper.appendChild(checkbox);

    const textSpan = doc.createElement("span");
    textSpan.className = "onenote-sticky-check-text";
    textSpan.contentEditable = "true";
    textSpan.setAttribute("contenteditable", "true");
    if (
      initialHtml &&
      initialHtml.trim() &&
      initialHtml.trim() !== "&nbsp;" &&
      initialHtml.trim() !== "\u00A0"
    ) {
      const parsed = new DOMParser().parseFromString(initialHtml, "text/html");
      while (parsed.body.firstChild) {
        textSpan.appendChild(doc.importNode(parsed.body.firstChild, true));
      }
    } else {
      textSpan.appendChild(doc.createElement("br"));
    }

    checkContainer.appendChild(wrapper);
    checkContainer.appendChild(textSpan);
    return checkContainer;
  }

  private toggleOffChecklistItem(checkItem: HTMLElement): void {
    const doc = this.doc;
    const win = this.win;
    const textSpan = checkItem.querySelector(".onenote-sticky-check-text") as HTMLElement | null;
    const p = doc.createElement("div");
    if (textSpan && textSpan.hasChildNodes()) {
      while (textSpan.firstChild) {
        p.appendChild(textSpan.firstChild);
      }
    } else {
      p.appendChild(doc.createElement("br"));
    }
    checkItem.replaceWith(p);

    if (win?.getSelection) {
      const sel = win.getSelection();
      if (sel) {
        const newRange = doc.createRange();
        newRange.selectNodeContents(p);
        newRange.collapse(false);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
    }
    this.updateActiveStates();
    this.options.onMutate?.();
  }

  private findClosestChecklistItem(node: Node | null): HTMLElement | null {
    if (!node) return null;
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
    return el?.closest(".onenote-sticky-checklist-item") || null;
  }

  private findEnclosingBlock(node: Node | null): HTMLElement | null {
    if (!node) return null;
    let curr: HTMLElement | null =
      node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
    while (curr && curr !== this.activeBodyEl) {
      const tag = curr.tagName.toUpperCase();
      if (
        tag === "P" ||
        tag === "DIV" ||
        tag === "LI" ||
        tag === "H1" ||
        tag === "H2" ||
        tag === "H3" ||
        tag === "H4" ||
        tag === "H5" ||
        tag === "H6"
      ) {
        return curr;
      }
      curr = curr.parentElement;
    }
    return null;
  }

  private focusTextSpan(checkItem: HTMLElement): void {
    const textSpan = checkItem.querySelector(".onenote-sticky-check-text") as HTMLElement | null;
    if (!textSpan) return;
    const win = this.win;
    const doc = this.doc;
    if (!win?.getSelection) return;

    if (this.activeBodyEl) {
      this.activeBodyEl.focus({ preventScroll: true });
    }
    textSpan.focus?.({ preventScroll: true });

    const sel = win.getSelection();
    if (sel) {
      const newRange = doc.createRange();
      if (textSpan.firstChild && textSpan.firstChild.nodeType === Node.TEXT_NODE) {
        newRange.setStart(textSpan.firstChild, 0);
        newRange.setEnd(textSpan.firstChild, 0);
      } else {
        newRange.setStart(textSpan, 0);
        newRange.setEnd(textSpan, 0);
      }
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      this.saveSelection();
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const win = this.win;
    const doc = this.doc;

    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      if (!win?.getSelection) return;
      const sel = win.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const checkItem = this.findClosestChecklistItem(range.startContainer);
      if (checkItem && this.activeBodyEl?.contains(checkItem)) {
        e.preventDefault();
        e.stopPropagation();

        const textSpan = checkItem.querySelector(
          ".onenote-sticky-check-text"
        ) as HTMLElement | null;
        const fullText = textSpan?.textContent?.replace(/\u00A0/g, " ").trim() || "";

        if (fullText === "") {
          // Empty checklist item -> convert back to regular empty block
          this.toggleOffChecklistItem(checkItem);
          return;
        }

        // Split text at caret position if caret is inside textSpan
        let trailingHtml = "<br>";
        if (
          textSpan &&
          range.commonAncestorContainer &&
          (range.commonAncestorContainer === textSpan ||
            textSpan.contains(range.commonAncestorContainer))
        ) {
          try {
            const tailRange = doc.createRange();
            tailRange.setStart(range.endContainer, range.endOffset);
            tailRange.setEndAfter(textSpan.lastChild || textSpan);
            const extracted = tailRange.extractContents();
            const temp = doc.createElement("div");
            temp.appendChild(extracted);
            const html = temp.innerHTML.trim();
            if (html && html !== "&nbsp;" && html !== "\u00A0" && html !== "<br>") {
              trailingHtml = html;
            }
            if (
              !textSpan.innerHTML.trim() ||
              textSpan.innerHTML === "&nbsp;" ||
              textSpan.innerHTML === "\u00A0"
            ) {
              emptyElement(textSpan);
              textSpan.appendChild(doc.createElement("br"));
            }
          } catch {
            trailingHtml = "<br>";
          }
        }

        const newItem = this.createChecklistElement(trailingHtml);
        checkItem.after(newItem);
        this.focusTextSpan(newItem);
        if (win) {
          const scheduleFn = win.requestAnimationFrame || ((cb: () => void) => setTimeout(cb, 0));
          scheduleFn(() => {
            this.focusTextSpan(newItem);
          });
        }
        this.updateActiveStates();
        this.options.onMutate?.();
      }
    } else if (e.key === "Backspace") {
      if (!win?.getSelection) return;
      const sel = win.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed && range.startOffset === 0) {
        const checkItem = this.findClosestChecklistItem(range.startContainer);
        if (checkItem && this.activeBodyEl?.contains(checkItem)) {
          const textSpan = checkItem.querySelector(
            ".onenote-sticky-check-text"
          ) as HTMLElement | null;
          const text = textSpan?.textContent?.replace(/\u00A0/g, " ").trim() || "";
          if (text === "") {
            e.preventDefault();
            e.stopPropagation();
            this.toggleOffChecklistItem(checkItem);
          }
        }
      }
    } else if (
      (e.ctrlKey || e.metaKey) &&
      (e.key === "t" ||
        e.key === "T" ||
        (e.shiftKey && (e.key === "x" || e.key === "X" || e.key === "s" || e.key === "S")))
    ) {
      e.preventDefault();
      e.stopPropagation();
      this.exec("strikeThrough");
      this.updateActiveStates();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "l" || e.key === "L")) {
      e.preventDefault();
      e.stopPropagation();
      this.exec("insertUnorderedList");
      this.updateActiveStates();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "c" || e.key === "C")) {
      e.preventDefault();
      e.stopPropagation();
      this.insertChecklistItem();
      this.updateActiveStates();
    }
  }

  private triggerImageUpload(): void {
    const doc = this.doc;
    if (!doc?.createElement) return;

    const input = doc.createElement("input");
    input.type = "file";
    input.accept = STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.IMAGE_INPUT_ACCEPT;
    input.className = "onenote-hidden-file-input";
    doc.body.appendChild(input);

    const cleanup = () => {
      try {
        input.remove();
      } catch {}
    };

    input.onchange = () => {
      if (input.files && input.files[0]) {
        const file = input.files[0];
        if (this.options.onImageSelect) {
          this.options.onImageSelect(file);
        } else {
          // Default fallback: insert data URL directly into active note body
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string" && this.activeBodyEl) {
              this.insertImageSrc(reader.result);
            }
          };
          reader.readAsDataURL(file);
        }
      }
      cleanup();
    };

    (input as any).oncancel = () => {
      cleanup();
    };

    // Trigger native file picker dialog
    input.click();
  }

  public insertImageSrc(src: string): void {
    if (!this.activeBodyEl) return;
    const doc = this.doc;
    const win = this.win;

    const isAlreadyFocused =
      doc.activeElement === this.activeBodyEl ||
      (this.activeBodyEl.contains(doc.activeElement) && doc.activeElement !== this.el);

    if (!isAlreadyFocused) {
      this.restoreSelection();
      this.activeBodyEl.focus({ preventScroll: true });
    }

    const container = doc.createElement("div");
    container.className = "onenote-sticky-image-wrapper";
    container.contentEditable = "false";
    container.setAttribute("contenteditable", "false");

    const img = doc.createElement("img");
    img.src = src;
    img.className = "onenote-sticky-embedded-image";
    img.alt = STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.IMAGE_ALT_TEXT;
    container.appendChild(img);

    // Follow with an editable paragraph so typing can continue immediately below
    const nextP = doc.createElement("p");
    nextP.appendChild(doc.createElement("br"));

    const selection = win?.getSelection ? win.getSelection() : null;
    if (
      selection &&
      selection.rangeCount > 0 &&
      this.activeBodyEl.contains(selection.getRangeAt(0).startContainer)
    ) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(container);
      container.after(nextP);
    } else {
      this.activeBodyEl.appendChild(container);
      this.activeBodyEl.appendChild(nextP);
    }

    // Move caret to next paragraph
    if (win?.getSelection) {
      const sel = win.getSelection();
      if (sel) {
        const r = doc.createRange();
        r.selectNodeContents(nextP);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
    }

    this.options.onMutate?.();
  }
}
