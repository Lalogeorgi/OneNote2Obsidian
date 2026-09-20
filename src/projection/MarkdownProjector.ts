import {
  CanonicalElement,
  CanonicalImage,
  CanonicalInkStrokeGroup,
  CanonicalOutline,
  CanonicalParagraph,
  CanonicalShape,
  CanonicalTable,
  CanonicalTextRun,
} from "../model/CanonicalElements";
import { CanonicalStickyNote } from "../model/CanonicalStickyNote";
import { CanonicalPage } from "../model/CanonicalPage";
import { AssetId } from "../model/Ids";

import { FrontmatterManager } from "../obsidian/frontmatter/FrontmatterManager";

export interface MarkdownProjectionOptions {
  readonly sidecarRelativePath?: string;
  readonly includeSpatialBanner?: boolean;
  readonly includeFrontmatter?: boolean;
  readonly assetPathResolver?: (assetId: AssetId) => string | undefined;
  readonly customTags?: readonly string[];
}

export class MarkdownProjector {
  /**
   * Projects a CanonicalPage into clean, searchable GitHub Flavored Markdown with Obsidian conventions.
   */
  public static project(page: CanonicalPage, options: MarkdownProjectionOptions = {}): string {
    const lines: string[] = [];

    // 1. YAML Frontmatter
    if (options.includeFrontmatter !== false) {
      lines.push("---");
      lines.push(`onenote_page_id: "${page.id}"`);
      lines.push(`onenote_title: "${this.escapeYamlString(page.title || "Untitled")}"`);
      lines.push(`created: ${FrontmatterManager.formatObsidianDate(page.createdTime)}`);
      lines.push(`modified: ${FrontmatterManager.formatObsidianDate(page.modifiedTime)}`);
      if (options.sidecarRelativePath) {
        lines.push(`spatial_sidecar: "${options.sidecarRelativePath}"`);
      }
      const baseTags = options.customTags ?? ["onenote-import"];
      const metaTags = Array.isArray(page.metadata?.tags) ? (page.metadata?.tags as string[]) : [];
      const tags = Array.from(new Set([...baseTags, ...metaTags]));
      lines.push("tags:");
      for (const t of tags) {
        lines.push(`  - ${t}`);
      }

      // Merge any custom metadata properties
      if (page.metadata) {
        const reservedKeys = new Set([
          "onenote_page_id",
          "onenote_title",
          "created",
          "modified",
          "spatial_sidecar",
          "tags",
        ]);
        for (const [key, val] of Object.entries(page.metadata)) {
          if (!reservedKeys.has(key) && val !== undefined) {
            if (Array.isArray(val)) {
              lines.push(`${key}:`);
              for (const item of val) {
                lines.push(`  - ${item}`);
              }
            } else if (typeof val === "boolean" || typeof val === "number") {
              lines.push(`${key}: ${val}`);
            } else {
              lines.push(`${key}: "${this.escapeYamlString(String(val))}"`);
            }
          }
        }
      }

      lines.push("---");
      lines.push("");
    }

    // 2. Spatial Callout Banner
    if (options.includeSpatialBanner !== false) {
      lines.push("> [!spatial]+ Canvas");
      lines.push("> This note originated as a freeform canvas document.");
      const sidecarParam = options.sidecarRelativePath
        ? `&sidecar=${encodeURIComponent(options.sidecarRelativePath)}`
        : "";
      lines.push(`> [Open in Canvas](obsidian://onenote-spatial?page=${page.id}${sidecarParam})`);
      lines.push("");
    }

    // 3. Document Title
    if (page.title) {
      lines.push(`# ${page.title}`);
      lines.push("");
    }

    // 4. Sort elements top-to-bottom, left-to-right for logical reading order
    const sortedElements = [...page.elements].sort((a, b) => {
      // Primary sort by vertical Y coordinate, secondary by X
      if (Math.abs(a.bounds.y - b.bounds.y) > 20) {
        return a.bounds.y - b.bounds.y;
      }
      return a.bounds.x - b.bounds.x;
    });

    // 5. Project all elements (skipping title_banner to avoid duplicate title heading)
    let pendingInkStrokes = 0;
    let pendingInkIsHighlighter = false;

    const flushPendingInk = () => {
      if (pendingInkStrokes > 0) {
        const kind = pendingInkIsHighlighter ? "Highlighter Annotation" : "Handwriting / Drawing";
        lines.push(
          `> [!note] ✍️ **${kind}**\n> Contains ${pendingInkStrokes} ink stroke${pendingInkStrokes === 1 ? "" : "s"}. Preserved in spatial sidecar.`
        );
        lines.push("");
        pendingInkStrokes = 0;
        pendingInkIsHighlighter = false;
      }
    };

    for (const el of sortedElements) {
      if (el.id.includes("title_banner")) continue;
      if (el.type === "ink") {
        pendingInkStrokes += el.strokes.length;
        if (el.isHighlighter) pendingInkIsHighlighter = true;
        continue;
      }

      flushPendingInk();
      const elMarkdown = this.projectElement(el, options);
      if (elMarkdown.trim()) {
        lines.push(elMarkdown);
        lines.push("");
      }
    }
    flushPendingInk();

    return lines.join("\n");
  }

  private static projectElement(el: CanonicalElement, options: MarkdownProjectionOptions): string {
    switch (el.type) {
      case "outline":
        return this.projectOutline(el);
      case "stickyNote":
        return this.projectStickyNote(el as CanonicalStickyNote);
      case "image":
        return this.projectImage(el, options);
      case "ink":
        return this.projectInk(el);
      case "table":
        return this.projectTable(el, options);
      case "shape":
        return this.projectShape(el);
      case "attachment":
        return `> 📎 **Attachment**: \`${el.fileName}\` (${(el.fileSizeBytes / 1024).toFixed(1)} KB)`;
      default:
        return "";
    }
  }

  private static projectStickyNote(note: CanonicalStickyNote): string {
    const lines: string[] = [];
    const titleStr = note.title ? `: ${note.title}` : "";
    const pinStr = note.spatialMeta?.isPinned ? " 📌" : "";
    lines.push(`> [!note] 📝 **Sticky Note${titleStr}**${pinStr}`);

    let contentLines: string[] = [];
    if (note.paragraphs && note.paragraphs.length > 0) {
      for (const p of note.paragraphs) {
        const pText = this.projectParagraph(p);
        if (pText.trim()) {
          contentLines.push(pText);
        }
      }
    } else if (note.content) {
      contentLines = note.content.split("\n");
    }

    if (contentLines.length === 0) {
      lines.push(`> *(empty note)*`);
    } else {
      for (const cl of contentLines) {
        lines.push(`> ${cl}`);
      }
    }

    // Append durable block reference anchor for native Obsidian graph linking
    lines.push(`> ^${note.id}`);

    return lines.join("\n");
  }

  private static projectOutline(outline: CanonicalOutline): string {
    const lines: string[] = [];

    for (const p of outline.paragraphs) {
      const pText = this.projectParagraph(p);
      if (pText.trim()) {
        lines.push(pText);
      }
    }

    return lines.join("\n");
  }

  private static projectParagraph(p: CanonicalParagraph): string {
    const indent = "  ".repeat(p.indentLevel || 0);
    const rawContent = p.runs.map((r) => this.projectRun(r)).join("");

    if (!rawContent.trim()) return "";

    // 1. Heading Detection Heuristic
    const primaryRun = p.runs[0];
    const fontSize = primaryRun?.style?.fontSize ?? 11;
    const isBold = primaryRun?.style?.bold ?? false;
    const isMonospace = Boolean(
      primaryRun?.style?.fontFamily && /consolas|courier|mono/i.test(primaryRun.style.fontFamily)
    );

    if (p.indentLevel === 0 && !p.bulletType && !isMonospace) {
      const headingContent = rawContent
        .replace(/^\*\*([\s\S]+)\*\*$/, "$1")
        .replace(/^\*([\s\S]+)\*$/, "$1")
        .trim();

      if (fontSize >= 18) {
        return `# ${headingContent}`;
      } else if (fontSize >= 14 || (fontSize >= 13 && isBold)) {
        return `## ${headingContent}`;
      } else if (fontSize >= 12 && isBold) {
        return `### ${headingContent}`;
      }
    }

    // 2. Task Checkboxes
    if (p.bulletType === "checkbox") {
      const check = p.isTaskChecked ? "[x]" : "[ ]";
      return `${indent}- ${check} ${rawContent.trim()}`;
    }

    // 3. Bullet & Numbered Lists
    if (
      p.bulletType === "disc" ||
      p.bulletType === "circle" ||
      p.bulletType === "square" ||
      p.bulletType === "diamond" ||
      p.bulletType === "arrow" ||
      p.bulletType === "dash" ||
      p.bulletType === "star"
    ) {
      return `${indent}- ${rawContent.trim()}`;
    } else if (p.bulletType === "number" || p.bulletType === "letter" || p.bulletType === "roman") {
      const prefix = p.bulletChar || "1.";
      return `${indent}${prefix} ${rawContent.trim()}`;
    }

    // 4. Standard Paragraph / Code Line:
    // Preserve leading whitespace for non-bullet indented code lines
    const cleanContent = rawContent.replace(/\r?\n$/, "");
    return `${indent}${cleanContent}`;
  }

  private static projectRun(run: CanonicalTextRun): string {
    let text = run.text;
    if (!text) return "";

    const style = run.style;
    if (style) {
      if (style.bold && style.italic) {
        text = `***${text}***`;
      } else if (style.bold) {
        text = `**${text}**`;
      } else if (style.italic) {
        text = `*${text}*`;
      }

      if (style.strikethrough) {
        text = `~~${text}~~`;
      }

      if (style.highlightColor) {
        text = `==${text}==`;
      }

      if (style.fontColor) {
        text = `<span style="color:${style.fontColor}">${text}</span>`;
      }
    }

    if (run.hyperlink) {
      const target = run.hyperlink.target;
      text = `[${text}](${target})`;
    }

    return text;
  }

  private static projectImage(img: CanonicalImage, options: MarkdownProjectionOptions): string {
    const resolvedPath = options.assetPathResolver
      ? options.assetPathResolver(img.assetId)
      : undefined;

    if (resolvedPath) {
      return `![[${resolvedPath}]]`;
    }
    return `> 🖼️ *[Embedded Image - Asset ID: \`${img.assetId}\`]*`;
  }

  private static projectInk(ink: CanonicalInkStrokeGroup): string {
    const kind = ink.isHighlighter ? "Highlighter Annotation" : "Handwriting / Drawing";
    const strokeCount = ink.strokes.length;
    return `> [!note] ✍️ **${kind}**\n> Contains ${strokeCount} ink stroke${strokeCount === 1 ? "" : "s"}. Preserved in spatial sidecar.`;
  }

  private static projectShape(shape: CanonicalShape): string {
    return `> [!example] 📐 **Shape: ${shape.shapeKind.toUpperCase()}**\n> Position: (${shape.bounds.x}, ${shape.bounds.y}) | Size: ${shape.bounds.width}×${shape.bounds.height}`;
  }

  private static projectTable(table: CanonicalTable, options: MarkdownProjectionOptions): string {
    if (table.rows.length === 0) return "";

    const colCount = Math.max(1, table.columns.length);
    const mdLines: string[] = [];

    // Header Row
    const firstRow = table.rows[0];
    const headerCells: string[] = [];
    for (let c = 0; c < colCount; c++) {
      const cell = firstRow?.cells[c];
      const cellText = cell
        ? cell.elements.map((e) => this.projectElement(e, options).trim()).join(" ")
        : "";
      headerCells.push(cellText || `Column ${c + 1}`);
    }
    mdLines.push(`| ${headerCells.join(" | ")} |`);

    // Divider Row
    const dividers = new Array(colCount).fill("---");
    mdLines.push(`| ${dividers.join(" | ")} |`);

    // Body Rows
    for (let r = 1; r < table.rows.length; r++) {
      const row = table.rows[r]!;
      const rowCells: string[] = [];
      for (let c = 0; c < colCount; c++) {
        const cell = row.cells[c];
        const cellText = cell
          ? cell.elements.map((e) => this.projectElement(e, options).trim()).join(" ")
          : "";
        rowCells.push(cellText || " ");
      }
      mdLines.push(`| ${rowCells.join(" | ")} |`);
    }

    return mdLines.join("\n");
  }

  private static escapeYamlString(str: string): string {
    return str.replace(/"/g, '\\"');
  }
}
