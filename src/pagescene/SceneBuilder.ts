import { Rectangle } from "../geometry/Rectangle";
import {
  CanonicalElement,
  CanonicalOutline,
  CanonicalParagraph,
  CanonicalTextRun,
} from "../model/CanonicalElements";
import { CanonicalPage } from "../model/CanonicalPage";
import {
  PageScene,
  PageSceneNode,
  SceneAttachmentNode,
  SceneImageNode,
  SceneInkNode,
  SceneOutlineNode,
  SceneShapeNode,
  SceneTableNode,
} from "./PageScene";

export class SceneBuilder {
  /**
   * Build an immutable, deterministically sorted PageScene display list from a CanonicalPage.
   */
  public static build(page: CanonicalPage): PageScene {
    const nodes: PageSceneNode[] = [];
    let minX = 0;
    let minY = 0;
    let maxX = page.pageWidth || 1200;
    let maxY = page.pageHeight || 1600;

    // Process all elements into typed SceneNodes with AABBs
    for (const el of page.elements) {
      const aabb = Rectangle.create(
        el.bounds.x,
        el.bounds.y,
        el.bounds.width,
        el.bounds.height
      );

      // Expand page bounds dynamically if content extends further
      minX = Math.min(minX, aabb.minX);
      minY = Math.min(minY, aabb.minY);
      maxX = Math.max(maxX, aabb.maxX);
      maxY = Math.max(maxY, aabb.maxY);

      const node = SceneBuilder.convertElement(el, aabb);
      if (node) {
        nodes.push(node);
      }
    }

    // Sort display list strictly and deterministically by zIndex and ID
    nodes.sort((a, b) => {
      if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
      return a.id.localeCompare(b.id);
    });

    const canvasWidth = Math.max(800, maxX - minX + 200);
    const canvasHeight = Math.max(600, maxY - minY + 200);

    return {
      pageId: page.id,
      title: page.title,
      canvasBounds: new Rectangle(minX, minY, canvasWidth, canvasHeight),
      canvasStyle: page.canvasStyle,
      nodes,
      version: 1,
    };
  }

  private static convertElement(
    el: CanonicalElement,
    aabb: Rectangle
  ): PageSceneNode | null {
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
          opacity: el.isHighlighter ? 0.35 : 1.0,
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

  private static renderOutlineHtml(outline: CanonicalOutline): string {
    return outline.paragraphs
      .map((p) => SceneBuilder.renderParagraphHtml(p))
      .join("");
  }

  private static renderParagraphHtml(p: CanonicalParagraph): string {
    const indentPx = p.indentLevel * 24;
    let bulletHtml = "";

    if (p.bulletType === "checkbox") {
      const checked = p.isTaskChecked ? "checked" : "";
      bulletHtml = `<input type="checkbox" ${checked} disabled />`;
    } else if (p.bulletType === "disc") {
      bulletHtml = `<span style="margin-right:8px;">•</span>`;
    } else if (p.bulletType === "number") {
      bulletHtml = `<span style="margin-right:8px;">1.</span>`;
    }

    const runsHtml = p.runs.map((r) => SceneBuilder.renderRunHtml(r)).join("");

    return `<div class="onenote-paragraph" style="margin-left:${indentPx}px; margin-bottom:4px; min-height:1.2em;">${bulletHtml}${runsHtml}</div>`;
  }

  private static renderRunHtml(run: CanonicalTextRun): string {
    let style = "";
    if (run.style?.fontFamily) style += `font-family:${run.style.fontFamily};`;
    if (run.style?.fontSize) style += `font-size:${run.style.fontSize}pt;`;
    if (run.style?.fontColor) style += `color:${run.style.fontColor};`;
    if (run.style?.highlightColor)
      style += `background-color:${run.style.highlightColor};`;
    if (run.style?.bold) style += `font-weight:bold;`;
    if (run.style?.italic) style += `font-style:italic;`;
    if (run.style?.underline) style += `text-decoration:underline;`;
    if (run.style?.strikethrough) style += `text-decoration:line-through;`;

    // Escape text content
    const escaped = run.text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    let content = `<span style="${style}">${escaped}</span>`;

    if (run.hyperlink) {
      content = `<a href="${run.hyperlink.target}" data-type="${run.hyperlink.type}">${content}</a>`;
    }

    return content;
  }
}
