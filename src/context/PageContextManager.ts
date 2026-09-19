import { CanonicalNotebook } from "../model/CanonicalNotebook";
import { CanonicalPage } from "../model/CanonicalPage";
import { ObjectId, PageId } from "../model/Ids";
import { KnowledgeObjectManager } from "../knowledge/KnowledgeObjectManager";
import { VaultPathResolver } from "../projection/VaultPathResolver";

export interface RegisteredPageContext {
  readonly pageId: PageId;
  readonly pageTitle: string;
  readonly notebookTitle: string;
  readonly sectionName: string;
  readonly sectionGroupNames?: string[];
  readonly markdownPath: string;
  readonly sidecarPath: string;
  readonly sourceSha256?: string;
  readonly sourcePath?: string;
  readonly canonicalPage?: CanonicalPage;
  readonly sidecarJson?: string;
}

export type PageContextChangeListener = (page: RegisteredPageContext | null) => void;
export type SelectionChangeListener = (nodeId: ObjectId | null) => void;

export class PageContextManager {
  private static instance: PageContextManager | null = null;

  private pages = new Map<PageId, RegisteredPageContext>();
  private markdownPathToPageId = new Map<string, PageId>();
  private sidecarPathToPageId = new Map<string, PageId>();

  private activePageId: PageId | null = null;
  private selectedNodeId: ObjectId | null = null;

  private pageChangeListeners = new Set<PageContextChangeListener>();
  private selectionListeners = new Set<SelectionChangeListener>();

  public static getInstance(): PageContextManager {
    if (!PageContextManager.instance) {
      PageContextManager.instance = new PageContextManager();
    }
    return PageContextManager.instance;
  }

  public static resetInstanceForTesting(): void {
    PageContextManager.instance = null;
  }

  public registerPage(context: RegisteredPageContext): void {
    this.pages.set(context.pageId, context);
    this.markdownPathToPageId.set(this.normalizePath(context.markdownPath), context.pageId);
    this.sidecarPathToPageId.set(this.normalizePath(context.sidecarPath), context.pageId);
    if (context.canonicalPage) {
      KnowledgeObjectManager.getInstance().indexPage(context, context.canonicalPage);
    }
  }

  public registerNotebook(
    notebook: CanonicalNotebook,
    sourceInfo?: { sha256: string; path?: string; targetFolder?: string }
  ): void {
    const rootFolder = sourceInfo?.targetFolder || "OneNote2Obsidian";
    const resolver = new VaultPathResolver({ rootImportFolder: rootFolder });
    const processPage = (p: CanonicalPage, secName: string, groupNames?: string[]) => {
      const paths = resolver.resolvePagePaths({
        notebookTitle: notebook.title,
        sectionGroupNames: groupNames,
        sectionName: secName,
        pageTitle: p.title || "Untitled",
      });

      this.registerPage({
        pageId: p.id,
        pageTitle: p.title || "Untitled",
        notebookTitle: notebook.title,
        sectionName: secName,
        sectionGroupNames: groupNames,
        markdownPath: paths.markdownPath,
        sidecarPath: paths.sidecarPath,
        sourceSha256: sourceInfo?.sha256,
        sourcePath: sourceInfo?.path,
        canonicalPage: p,
      });
    };

    for (const sec of notebook.sections) {
      for (const p of sec.pages) {
        processPage(p, sec.name);
      }
    }

    for (const group of notebook.sectionGroups) {
      for (const sec of group.sections) {
        for (const p of sec.pages) {
          processPage(p, sec.name, [group.name]);
        }
      }
    }
  }

  public getPageContext(pageId: PageId): RegisteredPageContext | undefined {
    return this.pages.get(pageId);
  }

  public getPageContextByMarkdownPath(path: string): RegisteredPageContext | undefined {
    const normalized = this.normalizePath(path);
    const pageId = this.markdownPathToPageId.get(normalized);
    return pageId ? this.pages.get(pageId) : undefined;
  }

  public getPageContextBySidecarPath(path: string): RegisteredPageContext | undefined {
    const normalized = this.normalizePath(path);
    const pageId = this.sidecarPathToPageId.get(normalized);
    return pageId ? this.pages.get(pageId) : undefined;
  }

  public getAllPages(): RegisteredPageContext[] {
    return Array.from(this.pages.values());
  }

  public getActivePageId(): PageId | null {
    return this.activePageId;
  }

  public getActivePageContext(): RegisteredPageContext | null {
    return this.activePageId ? this.pages.get(this.activePageId) || null : null;
  }

  public setActivePage(pageId: PageId | null): void {
    if (this.activePageId !== pageId) {
      this.activePageId = pageId;
      const context = this.getActivePageContext();
      for (const listener of this.pageChangeListeners) {
        listener(context);
      }
    }
  }

  public updatePageTitle(
    pageId: PageId,
    newTitle: string,
    newMarkdownPath?: string,
    newSidecarPath?: string
  ): void {
    const ctx = this.pages.get(pageId);
    if (!ctx) return;

    if (ctx.markdownPath) {
      this.markdownPathToPageId.delete(this.normalizePath(ctx.markdownPath));
    }
    if (ctx.sidecarPath) {
      this.sidecarPathToPageId.delete(this.normalizePath(ctx.sidecarPath));
    }

    const baseCanonical: CanonicalPage = ctx.canonicalPage ?? {
      id: pageId,
      title: newTitle,
      pageLevel: 0,
      createdTime: Date.now(),
      modifiedTime: Date.now(),
      canvasStyle: { backgroundColor: "#FFFFFF" },
      elements: [],
    };

    const updatedCanonical: CanonicalPage = {
      ...baseCanonical,
      title: newTitle,
      modifiedTime: Date.now(),
    };

    const updatedCtx: RegisteredPageContext = {
      ...ctx,
      pageTitle: newTitle,
      markdownPath: newMarkdownPath ?? ctx.markdownPath,
      sidecarPath: newSidecarPath ?? ctx.sidecarPath,
      canonicalPage: updatedCanonical,
    };

    this.pages.set(pageId, updatedCtx);

    if (updatedCtx.markdownPath) {
      this.markdownPathToPageId.set(this.normalizePath(updatedCtx.markdownPath), pageId);
    }
    if (updatedCtx.sidecarPath) {
      this.sidecarPathToPageId.set(this.normalizePath(updatedCtx.sidecarPath), pageId);
    }

    KnowledgeObjectManager.getInstance().indexPage(updatedCtx, updatedCanonical);

    if (this.activePageId === pageId) {
      for (const listener of this.pageChangeListeners) {
        listener(updatedCtx);
      }
    }
  }

  public getSelectedNodeId(): ObjectId | null {
    return this.selectedNodeId;
  }

  public setSelectedNode(nodeId: ObjectId | null): void {
    if (this.selectedNodeId !== nodeId) {
      this.selectedNodeId = nodeId;
      for (const listener of this.selectionListeners) {
        listener(nodeId);
      }
    }
  }

  public onPageChange(listener: PageContextChangeListener): () => void {
    this.pageChangeListeners.add(listener);
    return () => this.pageChangeListeners.delete(listener);
  }

  public onSelectionChange(listener: SelectionChangeListener): () => void {
    this.selectionListeners.add(listener);
    return () => this.selectionListeners.delete(listener);
  }

  public parseFrontmatterForPageId(content: string): PageId | undefined {
    if (!content.startsWith("---")) return undefined;
    const match = content.slice(3).match(/\r?\n---\r?\n?/);
    if (!match || match.index === undefined) return undefined;

    const frontmatter = content.slice(3, 3 + match.index);
    const idMatch = frontmatter.match(/onenote_page_id:\s*["']?([^\s"'\r\n]+)["']?/);
    if (idMatch && idMatch[1]) {
      return idMatch[1] as PageId;
    }
    return undefined;
  }

  public updatePageMetadata(pageId: PageId, metadata: Record<string, any>): void {
    const ctx = this.getPageContext(pageId);
    if (ctx) {
      const currentCanon = ctx.canonicalPage || {
        id: pageId,
        title: ctx.pageTitle || "Untitled",
        pageLevel: 0,
        createdTime: Date.now(),
        modifiedTime: Date.now(),
        canvasStyle: { backgroundColor: "#FFFFFF" },
        elements: [],
      };
      const updatedCanon: CanonicalPage = {
        ...currentCanon,
        title: metadata.onenote_title || currentCanon.title,
        metadata: {
          ...(currentCanon.metadata || {}),
          ...metadata,
        },
      };
      this.registerPage({
        ...ctx,
        pageTitle: updatedCanon.title,
        canonicalPage: updatedCanon,
      });
    }
  }

  public getPageMetadata(pageId: PageId): Record<string, any> {
    const ctx = this.getPageContext(pageId);
    return ctx?.canonicalPage?.metadata ? { ...ctx.canonicalPage.metadata } : {};
  }

  public clear(): void {
    this.pages.clear();
    this.markdownPathToPageId.clear();
    this.sidecarPathToPageId.clear();
    this.activePageId = null;
    this.selectedNodeId = null;
    KnowledgeObjectManager.getInstance().clear();
  }

  private normalizePath(path: string | undefined): string {
    if (!path) return "";
    return path.replace(/\\/g, "/").replace(/^\/+/, "");
  }
}
