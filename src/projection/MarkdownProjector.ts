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
import { CanonicalPage } from "../model/CanonicalPage";
import { AssetId } from "../model/Ids";

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
  public static project(
    page: CanonicalPage,
    options: MarkdownProjectionOptions = {}
  ): string {
    const lines: string[] = [];

    // 1. YAML Frontmatter
    if (options.includeFrontmatter !== false) {
      lines.push("---");
      lines.push(`onenote_page_id: "${page.id}"`);
      lines.push(`onenote_title: "${this.escapeYamlString(page.title || "Untitled")}"`);
      lines.push(`created: ${new Date(page.createdTime).toISOString()}`);
      lines.push(`modified: ${new Date(page.modifiedTime).toISOString()}`);
      if (options.sidecarRelativePath) {
        lines.push(`spatial_sidecar: "${options.sidecarRelativePath}"`);
      }
      const tags = options.customTags ?? ["onenote-import"];
      lines.push("tags:");
      for (const t of tags) {
        lines.push(`  - ${t}`);
      }
      lines.push("---");
      lines.push("");
    }

    // 2. Spatial Callout Banner
    if (options.includeSpatialBanner !== false) {
      lines.push("> [!spatial]+ OneNote Spatial Canvas");
      lines.push("> This note originated as a freeform spatial OneNote document.");
      lines.push(`> [Open in OneNote Spatial Viewer](obsidian://onenote-spatial?page=${page.id})`);
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

    // 5. Project all elements
    for (const el of sortedElements) {
      const elMarkdown = this.projectElement(el, options);
      if (elMarkdown.trim()) {
        lines.push(elMarkdown);
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  private static projectElement(
    el: CanonicalElement,
    options: MarkdownProjectionOptions
  ): string {
    switch (el.type) {
      case "outline":
        return this.projectOutline(el);
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
    const content = p.runs.map((r) => this.projectRun(r)).join("").trim();

    if (!content) return "";

    // 1. Heading Detection Heuristic
    const primaryRun = p.runs[0];
    const fontSize = primaryRun?.style?.fontSize ?? 11;
    const isBold = primaryRun?.style?.bold ?? false;

    if (p.indentLevel === 0 && !p.bulletType) {
      const headingContent = content
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
      return `${indent}- ${check} ${content}`;
    }

    // 3. Bullet & Numbered Lists
    if (p.bulletType === "disc") {
      return `${indent}- ${content}`;
    } else if (p.bulletType === "number") {
      return `${indent}1. ${content}`;
    }

    // 4. Standard Paragraph
    return `${indent}${content}`;
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
    }

    if (run.hyperlink) {
      const target = run.hyperlink.target;
      text = `[${text}](${target})`;
    }

    return text;
  }

  private static projectImage(
    img: CanonicalImage,
    options: MarkdownProjectionOptions
  ): string {
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

  private static projectTable(
    table: CanonicalTable,
    options: MarkdownProjectionOptions
  ): string {
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
