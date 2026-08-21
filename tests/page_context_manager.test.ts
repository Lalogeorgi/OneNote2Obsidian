import { beforeEach, describe, expect, it, vi } from "vitest";
import { PageContextManager } from "../src/context/PageContextManager";
import { CanonicalNotebook } from "../src/model/CanonicalNotebook";
import { CanonicalPage } from "../src/model/CanonicalPage";
import { IdGenerator } from "../src/model/Ids";

describe("Page Context Manager & Registry", () => {
  let manager: PageContextManager;

  beforeEach(() => {
    manager = PageContextManager.getInstance();
    manager.clear();
  });

  it("registers and retrieves page contexts by pageId, markdown path, and sidecar path", () => {
    const pageId = IdGenerator.pageId("p_demo");

    manager.registerPage({
      pageId,
      pageTitle: "Project Overview",
      notebookTitle: "Work Notebook",
      sectionName: "General",
      markdownPath: "OneNote/Work Notebook/General/Project Overview.md",
      sidecarPath: "OneNote/Work Notebook/General/Project Overview.onecanvas.json",
      sourceSha256: "sha256_mock_123",
    });

    expect(manager.getPageContext(pageId)?.pageTitle).toBe("Project Overview");
    expect(manager.getPageContextByMarkdownPath("OneNote/Work Notebook/General/Project Overview.md")?.pageId).toBe(pageId);
    expect(manager.getPageContextBySidecarPath("OneNote/Work Notebook/General/Project Overview.onecanvas.json")?.pageId).toBe(pageId);
  });

  it("registers a full CanonicalNotebook hierarchy into discrete page contexts", () => {
    const page1: CanonicalPage = {
      id: IdGenerator.pageId("p1"),
      title: "Sprint 1",
      pageLevel: 0,
      createdTime: 1000,
      modifiedTime: 2000,
      canvasStyle: { backgroundColor: "#FFFFFF" },
      elements: [],
    };

    const notebook: CanonicalNotebook = {
      id: IdGenerator.notebookId("nb1"),
      title: "Dev Notebook",
      sectionGroups: [],
      sections: [
        {
          id: IdGenerator.sectionId("sec1"),
          name: "Sprints",
          isEncrypted: false,
          pages: [page1],
        },
      ],
    };

    manager.registerNotebook(notebook, { sha256: "hash_nb1" });

    const ctx = manager.getPageContext(page1.id);
    expect(ctx).toBeDefined();
    expect(ctx?.notebookTitle).toBe("Dev Notebook");
    expect(ctx?.sectionName).toBe("Sprints");
    expect(ctx?.markdownPath).toBe("OneNote/Dev Notebook/Sprints/Sprint 1.md");
  });

  it("emits events when active page or selected node changes", () => {
    const pageId = IdGenerator.pageId("p_active");
    const objectId = IdGenerator.objectId("obj_focus");

    manager.registerPage({
      pageId,
      pageTitle: "Active Focus",
      notebookTitle: "Notebook",
      sectionName: "Section",
      markdownPath: "OneNote/Notebook/Section/Active Focus.md",
      sidecarPath: "OneNote/Notebook/Section/Active Focus.onecanvas.json",
    });

    const pageListener = vi.fn();
    const selectionListener = vi.fn();

    const unsubPage = manager.onPageChange(pageListener);
    const unsubSelection = manager.onSelectionChange(selectionListener);

    manager.setActivePage(pageId);
    expect(pageListener).toHaveBeenCalledWith(expect.objectContaining({ pageId }));

    manager.setSelectedNode(objectId);
    expect(selectionListener).toHaveBeenCalledWith(objectId);

    unsubPage();
    unsubSelection();
  });

  it("parses YAML frontmatter to extract onenote_page_id", () => {
    const markdownContent = `---
onenote_page_id: "page_abc_999"
onenote_title: "My Note"
tags:
  - onenote-import
---

# My Note Body`;

    const parsedId = manager.parseFrontmatterForPageId(markdownContent);
    expect(parsedId).toBe("page_abc_999");

    const noFrontmatter = "# Just Header";
    expect(manager.parseFrontmatterForPageId(noFrontmatter)).toBeUndefined();
  });
});
