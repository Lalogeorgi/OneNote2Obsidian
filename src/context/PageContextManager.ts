import { CanonicalNotebook } from "../model/CanonicalNotebook";
import { CanonicalPage } from "../model/CanonicalPage";
import { ObjectId, PageId } from "../model/Ids";

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

  public registerPage(context: RegisteredPageContext): void {
    this.pages.set(context.pageId, context);
    this.markdownPathToPageId.set(this.normalizePath(context.markdownPath), context.pageId);
    this.sidecarPathToPageId.set(this.normalizePath(context.sidecarPath), context.pageId);
  }

  public registerNotebook(
    notebook: CanonicalNotebook,
    sourceInfo?: { sha256: string; path?: string }
  ): void {
    const processPage = (
      p: CanonicalPage,
      secName: string,
      groupNames?: string[]
    ) => {
      const parts = [notebook.title, ...(groupNames || []), secName, p.title || "Untitled"];
      const baseName = parts.join("/");
      const markdownPath = `OneNote/${baseName}.md`;
      const sidecarPath = `OneNote/${baseName}.onecanvas.json`;

      this.registerPage({
        pageId: p.id,
        pageTitle: p.title || "Untitled",
        notebookTitle: notebook.title,
        sectionName: secName,
        sectionGroupNames: groupNames,
        markdownPath,
        sidecarPath,
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
    const endIdx = content.indexOf("---", 3);
    if (endIdx === -1) return undefined;

    const frontmatter = content.slice(3, endIdx);
    const match = frontmatter.match(/onenote_page_id:\s*"([^"]+)"/);
    if (match && match[1]) {
      return match[1] as PageId;
    }
    return undefined;
  }

  public clear(): void {
    this.pages.clear();
    this.markdownPathToPageId.clear();
    this.sidecarPathToPageId.clear();
    this.activePageId = null;
    this.selectedNodeId = null;
  }

  private normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/^\/+/, "");
  }
}
