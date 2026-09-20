import { Rectangle } from "../geometry/Rectangle";
import {
  CanonicalElement,
  CanonicalOutline,
  CanonicalParagraph,
  CanonicalTextRun,
} from "../model/CanonicalElements";
import { CanonicalStickyNote } from "../model/CanonicalStickyNote";
import { ResolvedStickyNoteColors, StickyNoteUtils } from "../model/StickyNoteUtils";
import {
  STICKY_NOTE_ICONS,
  STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT,
} from "../constants/StickyNoteConstants";
import { KnowledgeObjectUtils } from "../knowledge/KnowledgeObject";
import { CanonicalPage } from "../model/CanonicalPage";
import {
  PageScene,
  PageSceneNode,
  SceneAttachmentNode,
  SceneImageNode,
  SceneInkNode,
  SceneOptions,
  SceneOutlineNode,
  SceneShapeNode,
  SceneStickyNoteNode,
  SceneTableNode,
} from "./PageScene";

export function formatOneNoteDate(timestamp?: number): string {
  if (!timestamp) return "";
  try {
    const d = new Date(timestamp);
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export class SceneBuilder {
  /**
   * Build an immutable, deterministically sorted PageScene display list from a CanonicalPage.
   */
  public static build(page: CanonicalPage, options: SceneOptions = {}): PageScene {
    const nodes: PageSceneNode[] = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    // Process all elements into typed SceneNodes with AABBs
    for (const el of page.elements) {
      let aabb = Rectangle.create(el.bounds.x, el.bounds.y, el.bounds.width, el.bounds.height);
      if (el.type === "ink") {
        const strokePadding = Math.max(el.strokes[0]?.width ?? 2, el.isHighlighter ? 8 : 4);
        aabb = Rectangle.create(
          el.bounds.x - strokePadding,
          el.bounds.y - strokePadding,
          el.bounds.width + strokePadding * 2,
          el.bounds.height + strokePadding * 2
        );
      }

      // Expand content bounds dynamically from elements
      minX = Math.min(minX, aabb.minX);
      minY = Math.min(minY, aabb.minY);
      maxX = Math.max(maxX, aabb.maxX);
      maxY = Math.max(maxY, aabb.maxY);

      const node = SceneBuilder.convertElement(el, aabb);
      if (node) {
        nodes.push(node);
      }
    }

    // Include page title block in content bounds if shown
    if (options.showPageTitle !== false) {
      const marginX = page.canvasStyle?.ruleLines?.marginX ?? 48;
      const titleTop = 36;
      const titleWidth = 300;
      const titleHeight = 75;
      minX = Math.min(minX, marginX);
      minY = Math.min(minY, titleTop);
      maxX = Math.max(maxX, marginX + titleWidth);
      maxY = Math.max(maxY, titleTop + titleHeight);
    }

    if (!isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = 800;
      maxY = 600;
    }

    // Sort display list strictly and deterministically by zIndex and ID
    nodes.sort((a, b) => {
      if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
      return a.id.localeCompare(b.id);
    });

    const contentWidth = Math.max(100, maxX - minX);
    const contentHeight = Math.max(100, maxY - minY);
    const contentBounds = new Rectangle(minX, minY, contentWidth, contentHeight);

    return {
      pageId: page.id,
      title: page.title,
      createdTime: page.createdTime,
      canvasBounds: contentBounds,
      contentBounds,
      canvasStyle: page.canvasStyle,
      nodes,
      version: 1,
      sceneOptions: options,
    };
  }

  private static convertElement(el: CanonicalElement, aabb: Rectangle): PageSceneNode | null {
    switch (el.type) {
      case "outline": {
        const renderedHtml = SceneBuilder.renderOutlineHtml(el);
        const node: SceneOutlineNode = {
          id: el.id,
          layer: "text",
          bounds: el.bounds,
          aabb,
          zIndex: el.bounds.zIndex,
          visible: true,
          element: el,
          renderedHtml,
        };
        return node;
      }
      case "image": {
        const node: SceneImageNode = {
          id: el.id,
          layer: "images",
          bounds: el.bounds,
          aabb,
          zIndex: el.bounds.zIndex,
          visible: true,
          element: el,
          assetId: el.assetId,
          mimeType: el.mimeType,
        };
        return node;
      }
      case "ink": {
        const primaryStroke = el.strokes[0];
        const color = primaryStroke?.color || (el.isHighlighter ? "#FFFF00" : "#000000");
        const strokeWidth = primaryStroke?.width || (el.isHighlighter ? 8 : 2);

        const node: SceneInkNode = {
          id: el.id,
          layer: el.isHighlighter ? "bottomInk" : "topInk",
          bounds: el.bounds,
          aabb,
          zIndex: el.bounds.zIndex,
          visible: true,
          element: el,
          isHighlighter: el.isHighlighter,
          color,
          strokeWidth,
          opacity: 1.0,
        };
        return node;
      }
      case "table": {
        const node: SceneTableNode = {
          id: el.id,
          layer: "tables",
          bounds: el.bounds,
          aabb,
          zIndex: el.bounds.zIndex,
          visible: true,
          element: el,
        };
        return node;
      }
      case "shape": {
        const node: SceneShapeNode = {
          id: el.id,
          layer: "shapes",
          bounds: el.bounds,
          aabb,
          zIndex: el.bounds.zIndex,
          visible: true,
          element: el,
        };
        return node;
      }
      case "stickyNote": {
        const note = el as CanonicalStickyNote;
        const colors = StickyNoteUtils.resolveStickyNoteColors(note.color, note.theme);
        const renderedHtml = SceneBuilder.renderStickyNoteHtml(note, colors);
        const node: SceneStickyNoteNode = {
          id: note.id,
          layer: "stickyNotes",
          bounds: note.bounds,
          aabb,
          zIndex: note.bounds.zIndex,
          visible: true,
          element: note,
          title: note.title,
          text: note.content,
          renderedHtml,
          color: colors.background,
          headerColor: colors.header,
          textColor: colors.text,
          borderColor: colors.border,
          opacity: StickyNoteUtils.clampOpacity(note.opacity),
          isPinned: note.spatialMeta?.isPinned,
          isFolded: note.spatialMeta?.isFolded,
          anchor: note.anchor,
        };
        return node;
      }
      case "attachment": {
        const node: SceneAttachmentNode = {
          id: el.id,
          layer: "attachments",
          bounds: el.bounds,
          aabb,
          zIndex: el.bounds.zIndex,
          visible: true,
          element: el,
          fileName: el.fileName,
          fileSizeBytes: el.fileSizeBytes,
        };
        return node;
      }
      default:
        return null;
    }
  }

  public static renderOutlineHtml(outline: CanonicalOutline): string {
    return outline.paragraphs.map((p) => SceneBuilder.renderParagraphHtml(p)).join("");
  }

  public static renderStickyNoteHtml(
    note: CanonicalStickyNote,
    colors: ResolvedStickyNoteColors
  ): string {
    const titleHtml = note.title
      ? `<div class="onenote-sticky-header" style="font-weight:${STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.HEADER_FONT_WEIGHT}; font-size:${STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.HEADER_FONT_SIZE}; margin-bottom:${STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.HEADER_MARGIN_BOTTOM}; color:${colors.text}; border-bottom: ${STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.HEADER_BORDER_BOTTOM}; padding-bottom:${STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.HEADER_PADDING_BOTTOM}; display:flex; justify-content:space-between; align-items:center;">
          <span>${SceneBuilder.escapeHtml(note.title)}</span>
          ${note.spatialMeta?.isPinned ? `<span style="font-size:${STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.PIN_FONT_SIZE}; opacity:${STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.PIN_OPACITY};">${STICKY_NOTE_ICONS.PIN}</span>` : ""}
        </div>`
      : "";

    let bodyHtml = "";
    if (note.paragraphs && note.paragraphs.length > 0) {
      bodyHtml = note.paragraphs.map((p) => SceneBuilder.renderParagraphHtml(p)).join("");
    } else if (note.content.includes("<") && note.content.includes(">")) {
      bodyHtml = KnowledgeObjectUtils.renderInteractiveLinks(note.content);
    } else {
      const lines = note.content.split("\n");
      bodyHtml = lines
        .map(
          (line) =>
            `<div class="onenote-sticky-line" style="min-height:${STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.BODY_LINE_MIN_HEIGHT}; margin-bottom:${STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.BODY_LINE_MARGIN_BOTTOM};">${KnowledgeObjectUtils.renderInteractiveLinks(line) || "&nbsp;"}</div>`
        )
        .join("");
    }

    return `<div class="onenote-sticky-content" style="color:${colors.text}; font-size:${STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.CONTENT_FONT_SIZE}; line-height:${STICKY_NOTE_TYPOGRAPHY_AND_LAYOUT.CONTENT_LINE_HEIGHT};">${titleHtml}<div class="onenote-sticky-body">${bodyHtml}</div></div>`;
  }

  public static escapeHtml(text: string): string {
    return text
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  private static renderParagraphHtml(p: CanonicalParagraph): string {
    const indentPx = p.indentLevel * 24;
    let bulletHtml = "";

    if (p.bulletType === "checkbox") {
      const checked = p.isTaskChecked ? "checked" : "";
      bulletHtml = `<input type="checkbox" ${checked} class="onenote-task-checkbox" style="margin-right:8px; cursor:pointer;" />`;
    } else if (p.bulletChar) {
      const isNum =
        p.bulletType === "number" || p.bulletType === "letter" || p.bulletType === "roman";
      const style = isNum
        ? "margin-right:8px; font-variant-numeric:tabular-nums;"
        : "margin-right:8px; display:inline-block; width:14px; text-align:center;";
      bulletHtml = `<span class="onenote-bullet" style="${style}">${SceneBuilder.escapeHtml(p.bulletChar)}</span>`;
    } else if (p.bulletType === "disc") {
      bulletHtml = `<span class="onenote-bullet" style="margin-right:8px; display:inline-block; width:14px; text-align:center;">•</span>`;
    } else if (p.bulletType === "circle") {
      bulletHtml = `<span class="onenote-bullet" style="margin-right:8px; display:inline-block; width:14px; text-align:center;">○</span>`;
    } else if (p.bulletType === "square") {
      bulletHtml = `<span class="onenote-bullet" style="margin-right:8px; display:inline-block; width:14px; text-align:center;">■</span>`;
    } else if (p.bulletType === "diamond") {
      bulletHtml = `<span class="onenote-bullet" style="margin-right:8px; display:inline-block; width:14px; text-align:center;">◆</span>`;
    } else if (p.bulletType === "arrow") {
      bulletHtml = `<span class="onenote-bullet" style="margin-right:8px; display:inline-block; width:14px; text-align:center;">➢</span>`;
    } else if (p.bulletType === "dash") {
      bulletHtml = `<span class="onenote-bullet" style="margin-right:8px; display:inline-block; width:14px; text-align:center;">–</span>`;
    } else if (p.bulletType === "star") {
      bulletHtml = `<span class="onenote-bullet" style="margin-right:8px; display:inline-block; width:14px; text-align:center;">★</span>`;
    } else if (p.bulletType === "number" || p.bulletType === "letter" || p.bulletType === "roman") {
      bulletHtml = `<span class="onenote-bullet" style="margin-right:8px; font-variant-numeric:tabular-nums;">1.</span>`;
    }

    const runsHtml = p.runs.map((r) => SceneBuilder.renderRunHtml(r)).join("");

    return `<div class="onenote-paragraph" style="margin-left:${indentPx}px; margin-bottom:4px; min-height:1.2em; white-space:pre-wrap; word-break:break-word;">${bulletHtml}${runsHtml}</div>`;
  }

  private static renderRunHtml(run: CanonicalTextRun): string {
    let style = "";
    if (run.style?.fontFamily) style += `font-family:${run.style.fontFamily};`;
    if (run.style?.fontSize) style += `font-size:${run.style.fontSize}pt;`;
    if (run.style?.fontColor) style += `color:${run.style.fontColor};`;
    if (run.style?.highlightColor) style += `background-color:${run.style.highlightColor};`;
    if (run.style?.bold) style += `font-weight:bold;`;
    if (run.style?.italic) style += `font-style:italic;`;
    if (run.style?.underline) style += `text-decoration:underline;`;
    if (run.style?.strikethrough) style += `text-decoration:line-through;`;

    // Escape text content
    const escaped = SceneBuilder.escapeHtml(run.text);

    let content = `<span style="${style}">${escaped}</span>`;

    if (run.hyperlink) {
      content = `<a href="${run.hyperlink.target}" data-type="${run.hyperlink.type}">${content}</a>`;
    }

    return content;
  }
}
