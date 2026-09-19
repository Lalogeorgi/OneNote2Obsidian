import { DuplicateStrategy } from "../projection/ImportManifest";

export type DefaultViewMode = "spatial" | "markdown" | "split";

export interface OneNotePluginSettings {
  defaultViewMode: DefaultViewMode;
  rootImportFolder: string;
  attachmentFolder: string;
  flattenHierarchy: boolean;
  autoOpenSpatialOnMarkdownOpen: boolean;
  duplicateStrategy: DuplicateStrategy;
  enableHighDpi: boolean;
  enableTextDomOverlay: boolean;
  customTags: string;
  defaultStickyNoteColor: string;
  defaultStickyNoteOpacity: number;
}

export const DEFAULT_SETTINGS: OneNotePluginSettings = {
  defaultViewMode: "spatial",
  rootImportFolder: "OneNote2Obsidian",
  attachmentFolder: "attachments",
  flattenHierarchy: false,
  autoOpenSpatialOnMarkdownOpen: false,
  duplicateStrategy: "skip",
  enableHighDpi: true,
  enableTextDomOverlay: true,
  customTags: "import",
  defaultStickyNoteColor: "yellow",
  defaultStickyNoteOpacity: 1.0,
};
