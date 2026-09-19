import { SpatialBounds } from "../geometry/Bounds";
import { StickyNoteSource } from "../model/CanonicalStickyNote";
import { PageId, StickyNoteId } from "../model/Ids";

/**
 * Parsed Obsidian Wikilink Reference.
 */
export interface ParsedWikilink {
  readonly raw: string;
  readonly targetFile: string;
  readonly subpath?: string; // e.g. "#Heading" or "#^block"
  readonly alias?: string;
}

/**
 * First-class Obsidian Knowledge Object representation of a Sticky Note.
 */
export interface StickyNoteKnowledgeObject {
  readonly id: StickyNoteId;
  readonly pageId: PageId;
  readonly pageTitle: string;
  readonly notebookTitle: string;
  readonly sectionName: string;
  readonly sectionGroupNames?: readonly string[];
  readonly markdownPath: string;
  readonly sidecarPath: string;

  // Note Content & Identity
  readonly title?: string;
  readonly content: string;
  readonly color: string;
  readonly opacity: number;
  readonly isPinned: boolean;
  readonly bounds: SpatialBounds;

  // Provenance & Timestamps
  readonly createdTime: number;
  readonly modifiedTime: number;
  readonly author?: string;
  readonly source?: StickyNoteSource;

  // Knowledge Graph Links & Identifiers
  readonly wikilinks: readonly string[]; // Formatted as 'NoteName' or 'NoteName#Heading'
  readonly parsedWikilinks: readonly ParsedWikilink[];
  readonly blockReferences: readonly string[]; // References to other blocks: ['^ref-1']
  readonly tags: readonly string[]; // Obsidian tags: ['#idea', '#todo']
  readonly blockAnchor: string; // Native block reference anchor: '^sn_...'
  readonly uri: string; // Markdown relative URI with block reference
}

export class KnowledgeObjectUtils {
  /**
   * Extracts Obsidian tags (#tag, #nested/subtag) from note content.
   */
  public static extractTags(text: string): string[] {
    if (!text) return [];
    const tagRegex = /(?:^|\s)(#[a-zA-Z0-9_\-\/]+)(?=\s|$|[.,;:!?])/g;
    const tags = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(text)) !== null) {
      const tag = match[1]!.trim();
      // Exclude hex color codes (e.g. #FFF, #123456)
      if (!/^#[0-9A-Fa-f]{3,8}$/.test(tag)) {
        tags.add(tag);
      }
    }
    return Array.from(tags);
  }

  /**
   * Parses an Obsidian Wikilink string like "[[Note Name#Heading|Alias]]".
   */
  public static parseWikilink(linkStr: string): ParsedWikilink {
    const raw = linkStr.replace(/^\[\[/, "").replace(/\]\]$/, "").trim();
    let targetWithSubpath = raw;
    let alias: string | undefined;

    const pipeIdx = raw.indexOf("|");
    if (pipeIdx !== -1) {
      targetWithSubpath = raw.substring(0, pipeIdx).trim();
      alias = raw.substring(pipeIdx + 1).trim();
    }

    let targetFile = targetWithSubpath;
    let subpath: string | undefined;

    const hashIdx = targetWithSubpath.indexOf("#");
    if (hashIdx !== -1) {
      targetFile = targetWithSubpath.substring(0, hashIdx).trim();
      subpath = targetWithSubpath.substring(hashIdx).trim();
    }

    return {
      raw,
      targetFile,
      subpath,
      alias,
    };
  }

  /**
   * Converts plain wikilinks into HTML hyperlinks with data-href attributes.
   */
  public static renderInteractiveLinks(text: string): string {
    if (!text) return "";

    // 1. Escape all raw text first for XSS safety
    let html = this.escapeHtml(text);

    // 2. Convert [[Target|Alias]] or [[Target]] to <a class="internal-link" data-href="Target">Alias</a>
    const wikilinkRegex = /\[\[([^\]]+)\]\]/g;
    html = html.replace(wikilinkRegex, (_, inner: string) => {
      const parsed = this.parseWikilink(inner);
      const displayText = parsed.alias || parsed.raw;
      const target = parsed.targetFile + (parsed.subpath || "");
      return `<a class="internal-link" data-href="${this.escapeAttr(target)}">${displayText}</a>`;
    });

    // 3. Wrap tags in <span class="tag onenote-tag">#tag</span>
    const tagRegex = /(?:^|\s)(#[a-zA-Z0-9_\-\/]+)(?=\s|$|[.,;:!?])/g;
    html = html.replace(tagRegex, (fullMatch, tag: string) => {
      if (/^#[0-9A-Fa-f]{3,8}$/.test(tag)) {
        return fullMatch;
      }
      return fullMatch.replace(tag, `<span class="tag onenote-tag">${tag}</span>`);
    });

    return html;
  }

  private static escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  private static escapeAttr(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}
