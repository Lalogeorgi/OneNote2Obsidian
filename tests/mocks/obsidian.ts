// Obsidian prototype augmentations for DOM testing in jsdom
if (typeof HTMLElement !== "undefined") {
  (HTMLElement.prototype as any).empty = function () {
    this.innerHTML = "";
  };
  (HTMLElement.prototype as any).addClass = function (...cls: string[]) {
    this.classList.add(...cls);
  };
  (HTMLElement.prototype as any).removeClass = function (...cls: string[]) {
    this.classList.remove(...cls);
  };
  (HTMLElement.prototype as any).createDiv = function (opts?: any) {
    const div = document.createElement("div");
    if (opts?.cls) div.className = opts.cls;
    if (opts?.text) div.textContent = opts.text;
    this.appendChild(div);
    return div;
  };
  (HTMLElement.prototype as any).createEl = function (tag: string, opts?: any) {
    const el = document.createElement(tag);
    if (opts?.cls) el.className = opts.cls;
    if (opts?.text) el.textContent = opts.text;
    this.appendChild(el);
    return el;
  };
  (HTMLElement.prototype as any).createSpan = function (opts?: any) {
    const el = document.createElement("span");
    if (opts?.cls) el.className = opts.cls;
    if (opts?.text) el.textContent = opts.text;
    this.appendChild(el);
    return el;
  };
  (HTMLElement.prototype as any).setText = function (text: string) {
    this.textContent = text;
  };
}

export class TFile {
  public path: string;
  public name: string;
  public basename: string;
  public extension: string;
  public parent: { path: string } | null = null;

  constructor(path = "note.md") {
    this.path = path;
    const parts = path.split("/");
    const last = parts[parts.length - 1] || "note.md";
    this.name = last;
    const subParts = last.split(".");
    this.extension = subParts.length > 1 ? subParts.pop()! : "";
    this.basename = subParts.join(".");
    this.parent = parts.length > 1 ? { path: parts.slice(0, -1).join("/") } : null;
  }
}

export class ItemView {
  public contentEl: HTMLElement;
  public containerEl: HTMLElement;

  constructor(public leaf: WorkspaceLeaf) {
    this.contentEl = document.createElement("div");
    this.containerEl = document.createElement("div");
    this.containerEl.appendChild(this.contentEl);
  }

  public getViewType(): string {
    return "";
  }

  public getDisplayText(): string {
    return "";
  }

  public getIcon(): string {
    return "";
  }

  public getState(): Record<string, unknown> {
    return {};
  }

  public async setState(_state: any, _result: any): Promise<void> {}

  public addAction(icon: string, title: string, callback: (evt: MouseEvent) => any): HTMLElement {
    const btn = document.createElement("button");
    btn.className = "clickable-icon view-action";
    btn.setAttribute("aria-label", title);
    btn.setAttribute("data-icon", icon);
    btn.addEventListener("click", callback);
    return btn;
  }

  public async onOpen(): Promise<void> {}
  public async onClose(): Promise<void> {}
}

export function setIcon(el: HTMLElement, iconId: string): void {
  if (el) {
    el.setAttribute("data-icon", iconId);
  }
}

export class WorkspaceLeaf {
  public view: any = null;
  public containerEl: HTMLElement = document.createElement("div");

  public async open(): Promise<void> {}
  public async setViewState(state: any): Promise<void> {
    if (state.type) {
      this.view = { getViewType: () => state.type };
    }
  }
  public async openFile(_file: any, _options?: any): Promise<void> {}
}

export class App {
  public workspace: any;
  public vault: any;
  public fileManager: any;
  public metadataCache: any;

  constructor() {
    this.workspace = {
      getLeavesOfType: () => [],
      getLeaf: () => new WorkspaceLeaf(),
      revealLeaf: () => {},
      createLeafBySplit: () => new WorkspaceLeaf(),
      getActiveFile: () => null,
      openLinkText: () => {},
      on: () => ({}),
    };
    this.vault = {
      getAbstractFileByPath: (p: string) => new TFile(p),
      getFiles: () => [],
      read: async () => "",
      modify: async () => {},
      on: () => ({}),
    };
    this.fileManager = {
      renameFile: async () => {},
      processFrontMatter: async (file: TFile, fn: (frontmatter: any) => void) => {
        const content = await this.vault.read(file);
        const parsed: Record<string, any> = {};
        let body = content;
        if (content.startsWith("---")) {
          const endMatch = content.slice(3).match(/\r?\n---\r?\n?/);
          if (endMatch && endMatch.index !== undefined) {
            const fmText = content.slice(3, 3 + endMatch.index);
            body = content.slice(3 + endMatch.index + endMatch[0].length);
            const lines = fmText.split(/\r?\n/);
            for (const l of lines) {
              const idx = l.indexOf(":");
              if (idx !== -1) {
                const k = l.slice(0, idx).trim();
                const v = l.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
                if (k) parsed[k] = v;
              }
            }
          }
        }
        fn(parsed);
        const newFm = ["---"];
        for (const [k, v] of Object.entries(parsed)) {
          if (Array.isArray(v)) {
            newFm.push(`${k}:`);
            for (const item of v) newFm.push(`  - ${item}`);
          } else if (typeof v === "number" || typeof v === "boolean") {
            newFm.push(`${k}: ${v}`);
          } else {
            newFm.push(`${k}: "${v}"`);
          }
        }
        newFm.push("---");
        const updated = `${newFm.join("\n")}\n\n${body.trimStart()}`;
        await this.vault.modify(file, updated);
      },
    };
    this.metadataCache = {
      on: () => ({}),
      getFileCache: () => null,
    };
  }
}

export class Notice {
  constructor(public message: string) {}
}

export class Modal {
  public contentEl: HTMLElement = document.createElement("div");
  public containerEl: HTMLElement = document.createElement("div");

  constructor(public app: any) {
    this.containerEl.appendChild(this.contentEl);
  }

  public open(): void {
    this.onOpen();
  }

  public close(): void {
    this.onClose();
  }

  public onOpen(): void {}
  public onClose(): void {}
}

export class Setting {
  constructor(public containerEl: HTMLElement) {}
  public setName(_name: string): this {
    return this;
  }
  public setDesc(_desc: string): this {
    return this;
  }
  public addText(cb: (text: any) => any): this {
    cb({
      setPlaceholder: () => ({ setValue: () => ({ onChange: () => {} }) }),
      setValue: () => ({ onChange: () => {} }),
      onChange: () => {},
    });
    return this;
  }
  public addDropdown(cb: (dropdown: any) => any): this {
    const dropdown = {
      addOption: () => dropdown,
      setValue: () => dropdown,
      onChange: () => dropdown,
    };
    cb(dropdown);
    return this;
  }
  public addToggle(cb: (toggle: any) => any): this {
    const toggle = {
      setValue: () => toggle,
      onChange: () => toggle,
    };
    cb(toggle);
    return this;
  }
  public addButton(cb: (btn: any) => any): this {
    const btn = {
      setButtonText: () => btn,
      setCta: () => btn,
      onClick: () => btn,
    };
    cb(btn);
    return this;
  }
}

export class PluginSettingTab {
  public containerEl: HTMLElement = document.createElement("div");
  constructor(public app: any, public plugin: any) {}
  public display(): void {}
  public hide(): void {}
}

export class Plugin {
  public app: any = new App();
  public registerView(): void {}
  public addRibbonIcon(): void {}
  public addCommand(): void {}
  public addSettingTab(): void {}
  public registerEvent(): void {}
  public registerObsidianProtocolHandler(): void {}
  public registerDomEvent(el: any, type: string, callback: (...args: any[]) => any): void {
    el?.addEventListener?.(type, callback);
  }
  public registerMarkdownPostProcessor(_postProcessor: (el: HTMLElement, ctx: any) => void): any {
    return {};
  }
  public async loadData(): Promise<any> {
    return {};
  }
  public async saveData(_data: any): Promise<void> {}
}

export function normalizePath(path: string): string {
  return path ? path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "") : "";
}

export class MenuItem {
  public title: string = "";
  public icon: string = "";
  public clickCallback?: (evt?: any) => any;

  public setTitle(title: string): this {
    this.title = title;
    return this;
  }

  public setIcon(icon: string): this {
    this.icon = icon;
    return this;
  }

  public onClick(cb: (evt?: any) => any): this {
    this.clickCallback = cb;
    return this;
  }
}

export class Menu {
  public items: MenuItem[] = [];
  public hasSeparator: boolean = false;

  public addItem(cb: (item: MenuItem) => any): this {
    const item = new MenuItem();
    cb(item);
    this.items.push(item);
    return this;
  }

  public addSeparator(): this {
    this.hasSeparator = true;
    return this;
  }

  public showAtMouseEvent(_evt: MouseEvent): this {
    return this;
  }

  public showAtPosition(_pos: { x: number; y: number }): this {
    return this;
  }
}
