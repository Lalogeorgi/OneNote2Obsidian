import { CanonicalParagraph } from "../../model/CanonicalElements";
import {
  CanonicalStickyNote,
  StickyNoteColorPreset,
  StickyNoteTheme,
} from "../../model/CanonicalStickyNote";
import { StickyNoteUtils } from "../../model/StickyNoteUtils";
import { PageScene, SceneStickyNoteNode } from "../../pagescene/PageScene";
import { SceneBuilder } from "../../pagescene/SceneBuilder";
import { IEditorCommand } from "./IEditorCommand";

/**
 * Command to insert a new Sticky Note onto the canvas scene.
 */
export class CreateStickyNoteCommand implements IEditorCommand {
  public readonly id = `cmd_create_sticky_${Date.now()}_${Math.random()}`;
  public readonly timestamp = Date.now();
  public readonly description = "Create Sticky Note";

  constructor(
    private scene: PageScene,
    private newNode: SceneStickyNoteNode,
    private onMutate?: () => void
  ) {}

  public execute(): void {
    this.scene.nodes.push(this.newNode);
    this.scene.nodes.sort((a, b) => a.zIndex - b.zIndex);
    this.onMutate?.();
  }

  public undo(): void {
    this.scene.nodes = this.scene.nodes.filter((n) => n.id !== this.newNode.id);
    this.onMutate?.();
  }
}

/**
 * Command to update the text content and/or title of an existing Sticky Note.
 */
export class UpdateStickyNoteContentCommand implements IEditorCommand {
  public readonly id = `cmd_update_sticky_${Date.now()}_${Math.random()}`;
  public readonly timestamp = Date.now();
  public readonly description: string;

  private previousTitle?: string;
  private previousContent: string;
  private previousParagraphs?: readonly CanonicalParagraph[];

  constructor(
    private node: SceneStickyNoteNode,
    private newContent: string,
    private newTitle?: string,
    private newParagraphs?: readonly CanonicalParagraph[],
    private onMutate?: () => void
  ) {
    this.description = `Update Sticky Note ${node.id}`;
    this.previousTitle = node.element.title;
    this.previousContent = node.element.content;
    this.previousParagraphs = node.element.paragraphs;
  }

  public execute(): void {
    const el = this.node.element;
    const colors = StickyNoteUtils.resolveStickyNoteColors(el.color, el.theme);

    const updatedElement: CanonicalStickyNote = {
      ...el,
      title: this.newTitle,
      content: this.newContent,
      paragraphs: this.newParagraphs,
      modifiedTime: Date.now(),
      backlinks: {
        ...el.backlinks,
        wikilinks: StickyNoteUtils.extractWikilinks(this.newContent),
        blockReferences: StickyNoteUtils.extractBlockReferences(this.newContent),
      },
    };

    (this.node as any).element = updatedElement;
    (this.node as any).title = this.newTitle;
    (this.node as any).text = this.newContent;
    (this.node as any).renderedHtml = SceneBuilder.renderStickyNoteHtml(updatedElement, colors);
    this.onMutate?.();
  }

  public undo(): void {
    const el = this.node.element;
    const colors = StickyNoteUtils.resolveStickyNoteColors(el.color, el.theme);

    const restoredElement: CanonicalStickyNote = {
      ...el,
      title: this.previousTitle,
      content: this.previousContent,
      paragraphs: this.previousParagraphs,
      modifiedTime: Date.now(),
      backlinks: {
        ...el.backlinks,
        wikilinks: StickyNoteUtils.extractWikilinks(this.previousContent),
        blockReferences: StickyNoteUtils.extractBlockReferences(this.previousContent),
      },
    };

    (this.node as any).element = restoredElement;
    (this.node as any).title = this.previousTitle;
    (this.node as any).text = this.previousContent;
    (this.node as any).renderedHtml = SceneBuilder.renderStickyNoteHtml(restoredElement, colors);
    this.onMutate?.();
  }
}

/**
 * Command to modify the color, theme, or opacity of a Sticky Note.
 */
export class ChangeStickyNoteStyleCommand implements IEditorCommand {
  public readonly id = `cmd_style_sticky_${Date.now()}_${Math.random()}`;
  public readonly timestamp = Date.now();
  public readonly description: string;

  private previousColor: StickyNoteColorPreset | string;
  private previousTheme?: StickyNoteTheme;
  private previousOpacity: number;

  constructor(
    private node: SceneStickyNoteNode,
    private newStyle: {
      color?: StickyNoteColorPreset | string;
      theme?: StickyNoteTheme;
      opacity?: number;
    },
    private onMutate?: () => void
  ) {
    this.description = `Change Sticky Note Style ${node.id}`;
    this.previousColor = node.element.color;
    this.previousTheme = node.element.theme;
    this.previousOpacity = node.opacity;
  }

  public execute(): void {
    const el = this.node.element;
    const color = this.newStyle.color ?? el.color;
    const theme = this.newStyle.theme ?? el.theme;
    const opacity =
      this.newStyle.opacity !== undefined
        ? StickyNoteUtils.clampOpacity(this.newStyle.opacity)
        : el.opacity;

    const colors = StickyNoteUtils.resolveStickyNoteColors(color, theme);

    const updatedElement: CanonicalStickyNote = {
      ...el,
      color,
      theme,
      opacity,
      modifiedTime: Date.now(),
    };

    (this.node as any).element = updatedElement;
    (this.node as any).color = colors.background;
    (this.node as any).headerColor = colors.header;
    (this.node as any).textColor = colors.text;
    (this.node as any).borderColor = colors.border;
    (this.node as any).opacity = opacity;
    (this.node as any).renderedHtml = SceneBuilder.renderStickyNoteHtml(updatedElement, colors);
    this.onMutate?.();
  }

  public undo(): void {
    const el = this.node.element;
    const colors = StickyNoteUtils.resolveStickyNoteColors(this.previousColor, this.previousTheme);

    const restoredElement: CanonicalStickyNote = {
      ...el,
      color: this.previousColor,
      theme: this.previousTheme,
      opacity: this.previousOpacity,
      modifiedTime: Date.now(),
    };

    (this.node as any).element = restoredElement;
    (this.node as any).color = colors.background;
    (this.node as any).headerColor = colors.header;
    (this.node as any).textColor = colors.text;
    (this.node as any).borderColor = colors.border;
    (this.node as any).opacity = this.previousOpacity;
    (this.node as any).renderedHtml = SceneBuilder.renderStickyNoteHtml(restoredElement, colors);
    this.onMutate?.();
  }
}

/**
 * Command to toggle spatial pinning on a Sticky Note.
 */
export class ToggleStickyNotePinCommand implements IEditorCommand {
  public readonly id = `cmd_pin_sticky_${Date.now()}_${Math.random()}`;
  public readonly timestamp = Date.now();
  public readonly description: string;

  constructor(
    private node: SceneStickyNoteNode,
    private onMutate?: () => void
  ) {
    this.description = `Toggle Pin Sticky Note ${node.id}`;
  }

  public execute(): void {
    const el = this.node.element;
    const isPinned = !el.spatialMeta?.isPinned;
    const colors = StickyNoteUtils.resolveStickyNoteColors(el.color, el.theme);

    const updatedElement: CanonicalStickyNote = {
      ...el,
      spatialMeta: {
        ...el.spatialMeta,
        isPinned,
      },
      modifiedTime: Date.now(),
    };

    (this.node as any).element = updatedElement;
    (this.node as any).isPinned = isPinned;
    (this.node as any).renderedHtml = SceneBuilder.renderStickyNoteHtml(updatedElement, colors);
    this.onMutate?.();
  }

  public undo(): void {
    this.execute(); // Toggle back
  }
}
