export interface VaultPathConfig {
  readonly rootImportFolder?: string; // e.g. "OneNote"
  readonly attachmentFolder?: string; // e.g. "attachments" or "_resources"
  readonly flattenHierarchy?: boolean; // false: nested folders, true: [Notebook] - [Section] - [Page].md
  readonly sidecarExtension?: string; // default: ".onecanvas.json"
}

export interface PagePathResolution {
  readonly markdownPath: string; // e.g. "OneNote/My Notebook/General/Overview.md"
  readonly sidecarPath: string; // e.g. "OneNote/My Notebook/General/Overview.onecanvas.json"
  readonly relativeSidecarFromMarkdown: string; // e.g. "Overview.onecanvas.json"
  readonly attachmentFolderPath: string; // e.g. "OneNote/My Notebook/attachments"
}

export class VaultPathResolver {
  private config: Required<VaultPathConfig>;
  private existingPaths = new Set<string>();

  constructor(config: VaultPathConfig = {}) {
    this.config = {
      rootImportFolder: config.rootImportFolder ?? "OneNote2Obsidian",
      attachmentFolder: config.attachmentFolder ?? "attachments",
      flattenHierarchy: config.flattenHierarchy ?? false,
      sidecarExtension: config.sidecarExtension ?? ".onecanvas.json",
    };
  }

  /**
   * Sanitizes a segment string removing OS-illegal characters.
   */
  public sanitizeSegment(name: string): string {
    if (!name || !name.trim()) return "Untitled";

    let sanitized = name
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/\.+$/, "") // Strip trailing dots
      .trim();

    if (!sanitized) sanitized = "Untitled";

    // Handle Windows reserved device names
    const reserved = new Set([
      "CON",
      "PRN",
      "AUX",
      "NUL",
      "COM1",
      "COM2",
      "COM3",
      "COM4",
      "COM5",
      "COM6",
      "COM7",
      "COM8",
      "COM9",
      "LPT1",
      "LPT2",
      "LPT3",
      "LPT4",
      "LPT5",
      "LPT6",
      "LPT7",
      "LPT8",
      "LPT9",
    ]);

    if (reserved.has(sanitized.toUpperCase())) {
      sanitized = `_${sanitized}`;
    }

    return sanitized.slice(0, 200);
  }

  /**
   * Resolves vault paths for a specific page within a notebook hierarchy.
   */
  public resolvePagePaths(params: {
    notebookTitle: string;
    sectionGroupNames?: string[];
    sectionName: string;
    pageTitle: string;
  }): PagePathResolution {
    const root = this.sanitizeSegment(this.config.rootImportFolder);
    const nb = this.sanitizeSegment(params.notebookTitle);
    const sec = this.sanitizeSegment(params.sectionName);
    const page = this.sanitizeSegment(params.pageTitle);

    const groupSegments = (params.sectionGroupNames || []).map((g) => this.sanitizeSegment(g));

    // Single section import: if notebook title is identical to section name and there are no section groups,
    // do not create a redundant nested subfolder (e.g. use "Imports/Section", not "Imports/Section/Section").
    const isSingleSectionImport = groupSegments.length === 0 && (!nb || nb === sec);

    let folderPath: string;
    let baseFileName: string;

    if (this.config.flattenHierarchy) {
      folderPath = root ? `${root}/${nb}` : nb;
      const prefixParts = isSingleSectionImport
        ? [sec]
        : [nb, ...groupSegments, sec].filter(Boolean);
      baseFileName = `${prefixParts.join(" - ")} - ${page}`;
    } else {
      const parts = isSingleSectionImport
        ? [root, sec].filter(Boolean)
        : [root, nb, ...groupSegments, sec].filter(Boolean);
      folderPath = parts.join("/");
      baseFileName = page;
    }

    // Resolve collision
    const uniqueBase = this.getUniqueBaseName(folderPath, baseFileName);
    const markdownPath = `${folderPath}/${uniqueBase}.md`;
    const sidecarPath = `${folderPath}/${uniqueBase}${this.config.sidecarExtension}`;
    const relativeSidecarFromMarkdown = `${uniqueBase}${this.config.sidecarExtension}`;
    const targetFolderSegment = isSingleSectionImport ? sec : nb;
    const attachmentFolderPath = root
      ? `${root}/${targetFolderSegment}/${this.config.attachmentFolder}`
      : `${targetFolderSegment}/${this.config.attachmentFolder}`;

    this.existingPaths.add(markdownPath);
    this.existingPaths.add(sidecarPath);

    return {
      markdownPath,
      sidecarPath,
      relativeSidecarFromMarkdown,
      attachmentFolderPath,
    };
  }

  private getUniqueBaseName(folderPath: string, baseName: string): string {
    let candidate = baseName;
    let counter = 1;

    while (
      this.existingPaths.has(`${folderPath}/${candidate}.md`) ||
      this.existingPaths.has(`${folderPath}/${candidate}${this.config.sidecarExtension}`)
    ) {
      candidate = `${baseName} (${counter})`;
      counter++;
    }

    return candidate;
  }

  public clear(): void {
    this.existingPaths.clear();
  }
}
