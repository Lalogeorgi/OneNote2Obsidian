/**
 * Floating Contextual Text Formatting Toolbar for OneNote Note Containers.
 * Provides instant rich text formatting (Bold, Italic, Underline, Strikethrough, Lists, To-Do, Colors).
 */

export class FloatingTextFormatBar {
  private barEl: HTMLElement | null = null;
  private activeContainerEl: HTMLElement | null = null;
  private onMutate?: () => void;

  constructor(
    private rootContainer: HTMLElement,
    options?: { onMutate?: () => void }
  ) {
    this.onMutate = options?.onMutate;
    this.init();
  }

  private init(): void {
    this.barEl = document.createElement("div");
    this.barEl.className = "onenote-floating-text-format-bar is-hidden";

    // Format buttons definitions
    const items: Array<{
      id: string;
      label: string;
      title: string;
      action: () => void;
    }> = [
      {
        id: "bold",
        label: "<b>B</b>",
        title: "Bold (Ctrl+B)",
        action: () => this.exec("bold"),
      },
      {
        id: "italic",
        label: "<i>I</i>",
        title: "Italic (Ctrl+I)",
        action: () => this.exec("italic"),
      },
      {
        id: "underline",
        label: "<u>U</u>",
        title: "Underline (Ctrl+U)",
        action: () => this.exec("underline"),
      },
      {
        id: "strike",
        label: "<s>S</s>",
        title: "Strikethrough",
        action: () => this.exec("strikeThrough"),
      },
      {
        id: "bullet",
        label: "• List",
        title: "Bulleted List",
        action: () => this.exec("insertUnorderedList"),
      },
      {
        id: "number",
        label: "1. List",
        title: "Numbered List",
        action: () => this.exec("insertOrderedList"),
      },
      {
        id: "todo",
        label: "☑ To-Do",
        title: "To-Do Tag (Checkbox)",
        action: () => this.insertTodoCheckbox(),
      },
      {
        id: "highlight",
        label: "🖍️",
        title: "Text Highlight",
        action: () => this.exec("hiliteColor", "#FEF08A"),
      },
    ];

    for (const item of items) {
      const btn = document.createElement("button");
      btn.className = "onenote-format-btn";
      btn.innerHTML = item.label;
      btn.title = item.title;
      btn.type = "button";
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault(); // Keep selection focus in editable container
        item.action();
      });
      this.barEl.appendChild(btn);
    }
  }

  public attachTo(containerEl: HTMLElement): void {
    this.activeContainerEl = containerEl;
    if (this.barEl && !this.barEl.parentElement) {
      this.rootContainer.appendChild(this.barEl);
    }
    this.updatePosition();
    this.show();
  }

  public detach(): void {
    this.activeContainerEl = null;
    this.hide();
    if (this.barEl && this.barEl.parentElement) {
      this.barEl.parentElement.removeChild(this.barEl);
    }
  }

  public updatePosition(): void {
    if (!this.barEl || !this.activeContainerEl) return;

    const parentRect = this.rootContainer.getBoundingClientRect();
    const containerRect = this.activeContainerEl.getBoundingClientRect();

    const left = containerRect.left - parentRect.left;
    const top = Math.max(8, containerRect.top - parentRect.top - 42);

    this.barEl.style.left = `${left}px`;
    this.barEl.style.top = `${top}px`;
  }

  public show(): void {
    this.barEl?.classList.remove("is-hidden");
  }

  public hide(): void {
    this.barEl?.classList.add("is-hidden");
  }

  private exec(command: string, value: string | undefined = undefined): void {
    document.execCommand(command, false, value);
    this.onMutate?.();
  }

  private insertTodoCheckbox(): void {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "onenote-todo-checkbox";
    checkbox.style.marginRight = "6px";
    checkbox.style.verticalAlign = "middle";

    range.insertNode(checkbox);
    range.setStartAfter(checkbox);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    this.onMutate?.();
  }

  public destroy(): void {
    if (this.barEl && this.barEl.parentElement) {
      this.barEl.parentElement.removeChild(this.barEl);
      this.barEl = null;
    }
  }
}
