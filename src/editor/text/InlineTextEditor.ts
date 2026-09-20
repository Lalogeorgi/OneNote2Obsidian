import { Point2D } from "../../geometry/Point";
import { ViewportTransform } from "../../geometry/Transform";
import { CanonicalOutline, CanonicalParagraph } from "../../model/CanonicalElements";
import { IdGenerator } from "../../model/Ids";
import { PageSceneNode } from "../../pagescene/PageScene";

export interface InlineTextEditorViewport {
  getState(): ViewportTransform;
  sceneToScreen(scenePt: Point2D): Point2D;
  screenToScene?(screenPt: Point2D): Point2D;
}

export interface InlineTextEditorOptions {
  containerEl: HTMLElement;
  viewport: InlineTextEditorViewport;
  onCommit: (node: PageSceneNode, newParagraphs: CanonicalParagraph[]) => void;
  onCancel?: () => void;
}

export class InlineTextEditor {
  private editorEl: HTMLTextAreaElement | null = null;
  private activeNode: PageSceneNode | null = null;

  constructor(private options: InlineTextEditorOptions) {}

  public startEditing(node: PageSceneNode): void {
    if (node.element.type !== "outline") return;

    this.destroy();
    this.activeNode = node;

    const el = node.element as CanonicalOutline;
    const plainText = el.paragraphs.map((p) => p.runs.map((r) => r.text).join("")).join("\n");

    const screenPt = this.options.viewport.sceneToScreen({
      x: node.bounds.x,
      y: node.bounds.y,
    });
    const scale = this.options.viewport.getState().scale;

    const textarea = document.createElement("textarea");
    textarea.className = "onenote-inline-text-editor";
    textarea.value = plainText;
    textarea.style.left = `${screenPt.x}px`;
    textarea.style.top = `${screenPt.y}px`;
    textarea.style.width = `${Math.max(120, node.bounds.width * scale)}px`;
    textarea.style.height = `${Math.max(60, node.bounds.height * scale)}px`;
    textarea.style.fontSize = `${14 * scale}px`;

    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.destroy();
        this.options.onCancel?.();
      }
    });

    textarea.addEventListener("blur", () => {
      this.commit();
    });

    this.options.containerEl.appendChild(textarea);
    this.editorEl = textarea;
    textarea.focus();
    textarea.select();
  }

  public commit(): void {
    if (!this.editorEl || !this.activeNode) return;

    const text = this.editorEl.value;
    const lines = text.split("\n");

    const newParagraphs: CanonicalParagraph[] = lines.map((line) => ({
      id: IdGenerator.objectId("p_edit"),
      indentLevel: 0,
      runs: [{ text: line }],
    }));

    const node = this.activeNode;
    this.destroy();
    this.options.onCommit(node, newParagraphs);
  }

  public destroy(): void {
    if (this.editorEl) {
      if (this.editorEl.parentElement) {
        this.editorEl.parentElement.removeChild(this.editorEl);
      }
      this.editorEl = null;
    }
    this.activeNode = null;
  }

  public isEditing(): boolean {
    return this.editorEl !== null;
  }
}
