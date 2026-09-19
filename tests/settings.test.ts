import { describe, expect, it } from "vitest";
import { App } from "obsidian";
import OneNotePlugin from "../src/index";
import { DEFAULT_SETTINGS } from "../src/settings/OneNoteSettings";
import { OneNoteSettingsTab } from "../src/settings/OneNoteSettingsTab";

describe("OneNote Settings & Tab", () => {
  it("provides valid default configuration", () => {
    expect(DEFAULT_SETTINGS.defaultViewMode).toBe("spatial");
    expect(DEFAULT_SETTINGS.rootImportFolder).toBe("OneNote2Obsidian");
    expect(DEFAULT_SETTINGS.attachmentFolder).toBe("attachments");
    expect(DEFAULT_SETTINGS.duplicateStrategy).toBe("skip");
    expect(DEFAULT_SETTINGS.enableHighDpi).toBe(true);
  });

  it("renders Settings Tab elements into containerEl without errors", () => {
    const app = new App();
    const plugin = new OneNotePlugin(app as any, { id: "onenote-plugin" } as any);
    const tab = new OneNoteSettingsTab(app, plugin);

    tab.display();

    expect(tab.containerEl.querySelector("h2")).not.toBeNull();
    expect(tab.containerEl.textContent).toContain("Canvas Settings");
  });
});
