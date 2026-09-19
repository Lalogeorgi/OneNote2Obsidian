import { RegisteredPageContext } from "../context/PageContextManager";
import { CanonicalPage } from "../model/CanonicalPage";
import { CanonicalStickyNote } from "../model/CanonicalStickyNote";
import { PageId, StickyNoteId } from "../model/Ids";
import { StickyNoteUtils } from "../model/StickyNoteUtils";
import { KnowledgeObjectUtils, StickyNoteKnowledgeObject } from "./KnowledgeObject";

/**
 * Search options for finding Sticky Notes in the knowledge graph.
 */
export interface KnowledgeSearchOptions {
  readonly tag?: string;
  readonly color?: string;
  readonly pageId?: PageId;
  readonly limit?: number;
}

/**
 * Knowledge Object Manager: Indexes, manages, and exposes Sticky Notes as first-class Obsidian graph citizens.
 */
export class KnowledgeObjectManager {
  private static instance: KnowledgeObjectManager | null = null;

  // Primary store by durable ID
  private notesById = new Map<StickyNoteId, StickyNoteKnowledgeObject>();
  private notesByPage = new Map<PageId, Set<StickyNoteId>>();

  // Inverted Indices
  private tagIndex = new Map<string, Set<StickyNoteId>>();
  private forwardLinksIndex = new Map<StickyNoteId, Set<string>>();
  private backlinksIndex = new Map<string, Set<StickyNoteId>>(); // targetFile -> noteIds

  public static getInstance(): KnowledgeObjectManager {
    if (!KnowledgeObjectManager.instance) {
      KnowledgeObjectManager.instance = new KnowledgeObjectManager();
    }
    return KnowledgeObjectManager.instance;
  }

  /**
   * Index all sticky notes discovered within a CanonicalPage.
   */
  public indexPage(context: RegisteredPageContext, page: CanonicalPage): void {
    // 1. Clean previous index for this page if exists
    this.unindexPage(page.id);

    const pageNoteIds = new Set<StickyNoteId>();

    for (const el of page.elements) {
      if (el.type === "stickyNote") {
        const note = el as CanonicalStickyNote;
        const normalized = StickyNoteUtils.normalizeStickyNote(note);
        const obj = this.createKnowledgeObject(context, normalized);

        this.notesById.set(obj.id, obj);
        pageNoteIds.add(obj.id);

        // Index tags
        for (const tag of obj.tags) {
          const lowerTag = tag.toLowerCase();
          if (!this.tagIndex.has(lowerTag)) {
            this.tagIndex.set(lowerTag, new Set());
          }
          this.tagIndex.get(lowerTag)!.add(obj.id);
        }

        // Index forward links and backlinks
        const forwardTargets = new Set<string>();
        for (const link of obj.parsedWikilinks) {
          const targetKey = link.targetFile.toLowerCase();
          forwardTargets.add(targetKey);

          if (!this.backlinksIndex.has(targetKey)) {
            this.backlinksIndex.set(targetKey, new Set());
          }
          this.backlinksIndex.get(targetKey)!.add(obj.id);
        }
        this.forwardLinksIndex.set(obj.id, forwardTargets);
      }
    }

    this.notesByPage.set(page.id, pageNoteIds);
  }

  /**
   * Unindex a page when it is closed, renamed, or deleted.
   */
  public unindexPage(pageId: PageId): void {
    const existingNoteIds = this.notesByPage.get(pageId);
    if (!existingNoteIds) return;

    for (const noteId of existingNoteIds) {
      const obj = this.notesById.get(noteId);
      if (obj) {
        // Remove from tag index
        for (const tag of obj.tags) {
          const lowerTag = tag.toLowerCase();
          this.tagIndex.get(lowerTag)?.delete(noteId);
          if (this.tagIndex.get(lowerTag)?.size === 0) {
            this.tagIndex.delete(lowerTag);
          }
        }

        // Remove from backlinks index
        const targets = this.forwardLinksIndex.get(noteId);
        if (targets) {
          for (const t of targets) {
            this.backlinksIndex.get(t)?.delete(noteId);
            if (this.backlinksIndex.get(t)?.size === 0) {
              this.backlinksIndex.delete(t);
            }
          }
          this.forwardLinksIndex.delete(noteId);
        }

        this.notesById.delete(noteId);
      }
    }

    this.notesByPage.delete(pageId);
  }

  /**
   * Look up a Sticky Note Knowledge Object by its durable ID.
   */
  public getNoteById(id: StickyNoteId): StickyNoteKnowledgeObject | undefined {
    return this.notesById.get(id);
  }

  /**
   * Retrieve all sticky notes residing on a specific page.
   */
  public getNotesByPage(pageId: PageId): StickyNoteKnowledgeObject[] {
    const noteIds = this.notesByPage.get(pageId);
    if (!noteIds) return [];
    const results: StickyNoteKnowledgeObject[] = [];
    for (const id of noteIds) {
      const note = this.notesById.get(id);
      if (note) results.push(note);
    }
    return results;
  }

  /**
   * Discovers all Sticky Notes that contain links pointing to a specific Obsidian note/file.
   */
  public getBacklinksForTarget(targetFile: string): StickyNoteKnowledgeObject[] {
    const cleanTarget = targetFile.replace(/\.md$/, "").toLowerCase();
    const noteIds = this.backlinksIndex.get(cleanTarget);
    if (!noteIds) return [];

    const results: StickyNoteKnowledgeObject[] = [];
    for (const id of noteIds) {
      const note = this.notesById.get(id);
      if (note) results.push(note);
    }
    return results;
  }

  /**
   * Discovers all Sticky Notes associated with a specific markdown path or page title.
   */
  public getNotesForFile(targetFile: string): StickyNoteKnowledgeObject[] {
    const cleanTarget = targetFile.replace(/\.md$/, "").toLowerCase();
    const results: StickyNoteKnowledgeObject[] = [];
    for (const note of this.notesById.values()) {
      if (
        note.markdownPath.toLowerCase().includes(cleanTarget) ||
        note.pageTitle.toLowerCase() === cleanTarget
      ) {
        results.push(note);
      }
    }
    return results;
  }

  /**
   * Search all Sticky Notes across the vault by text query, tag, color, or page.
   */
  public searchNotes(
    query: string,
    options: KnowledgeSearchOptions = {}
  ): StickyNoteKnowledgeObject[] {
    const cleanQuery = query.trim().toLowerCase();
    const limit = options.limit ?? 50;
    const results: StickyNoteKnowledgeObject[] = [];

    for (const note of this.notesById.values()) {
      if (results.length >= limit) break;

      // Page filter
      if (options.pageId && note.pageId !== options.pageId) {
        continue;
      }

      // Color filter
      if (options.color && note.color.toLowerCase() !== options.color.toLowerCase()) {
        continue;
      }

      // Tag filter
      if (options.tag) {
        const tagMatch = note.tags.some((t) =>
          t.toLowerCase().includes(options.tag!.toLowerCase())
        );
        if (!tagMatch) continue;
      }

      // Text query match (title, content, tags, wikilinks)
      if (cleanQuery) {
        const titleMatch = note.title?.toLowerCase().includes(cleanQuery);
        const contentMatch = note.content.toLowerCase().includes(cleanQuery);
        const tagMatch = note.tags.some((t) => t.toLowerCase().includes(cleanQuery));
        const linkMatch = note.wikilinks.some((l) => l.toLowerCase().includes(cleanQuery));

        if (!titleMatch && !contentMatch && !tagMatch && !linkMatch) {
          continue;
        }
      }

      results.push(note);
    }

    return results;
  }

  /**
   * Retrieve all indexed Sticky Notes.
   */
  public getAllNotes(): StickyNoteKnowledgeObject[] {
    return Array.from(this.notesById.values());
  }

  /**
   * Clears the entire knowledge index (e.g. on plugin unload).
   */
  public clear(): void {
    this.notesById.clear();
    this.notesByPage.clear();
    this.tagIndex.clear();
    this.forwardLinksIndex.clear();
    this.backlinksIndex.clear();
  }

  private createKnowledgeObject(
    context: RegisteredPageContext,
    note: CanonicalStickyNote
  ): StickyNoteKnowledgeObject {
    const rawWikilinks = StickyNoteUtils.extractWikilinks(note.content);
    const parsedWikilinks = rawWikilinks.map((w) => KnowledgeObjectUtils.parseWikilink(w));
    const blockReferences = StickyNoteUtils.extractBlockReferences(note.content);
    const tags = KnowledgeObjectUtils.extractTags(note.content);
    const blockAnchor = `^${note.id}`;
    const uri = `${context.markdownPath}#${blockAnchor}`;

    return {
      id: note.id,
      pageId: context.pageId,
      pageTitle: context.pageTitle,
      notebookTitle: context.notebookTitle,
      sectionName: context.sectionName,
      sectionGroupNames: context.sectionGroupNames,
      markdownPath: context.markdownPath,
      sidecarPath: context.sidecarPath,
      title: note.title,
      content: note.content,
      color: note.color,
      opacity: note.opacity,
      isPinned: !!note.spatialMeta?.isPinned,
      bounds: note.bounds,
      createdTime: note.createdTime,
      modifiedTime: note.modifiedTime,
      author: note.author,
      source: note.source,
      wikilinks: rawWikilinks,
      parsedWikilinks,
      blockReferences,
      tags,
      blockAnchor,
      uri,
    };
  }
}
