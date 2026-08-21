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
  (HTMLElement.prototype as any).setText = function (text: string) {
    this.textContent = text;
  };
}

export class TFile {
  public path: string;
  public basename: string;
  public extension: string;

  constructor(path = "note.md") {
    this.path = path;
    const parts = path.split("/");
    const last = parts[parts.length - 1] || "note.md";
    const subParts = last.split(".");
    this.extension = subParts.length > 1 ? subParts.pop()! : "";
    this.basename = subParts.join(".");
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

  public async onOpen(): Promise<void> {}
  public async onClose(): Promise<void> {}
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
  public workspace: any = {
    getLeavesOfType: () => [],
    getLeaf: () => new WorkspaceLeaf(),
    revealLeaf: () => {},
    createLeafBySplit: () => new WorkspaceLeaf(),
    on: () => ({}),
  };
  public vault: any = {
    getAbstractFileByPath: (p: string) => new TFile(p),
    read: async () => "",
  };
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
  public async loadData(): Promise<any> {
    return {};
  }
  public async saveData(_data: any): Promise<void> {}
}
