import { describe, expect, it } from "vitest";
import { CanonicalPage } from "../src/model/CanonicalPage";
import { IdGenerator } from "../src/model/Ids";
import { MarkdownProjector } from "../src/projection/MarkdownProjector";

describe("Semantic Markdown Projector", () => {
  it("projects YAML frontmatter and spatial callout banner", () => {
    const page: CanonicalPage = {
      id: IdGenerator.pageId("p1"),
      title: "Project Strategy",
      pageLevel: 0,
      createdTime: 1724218800000,
      modifiedTime: 1724222400000,
      canvasStyle: { backgroundColor: "#FFFFFF" },
      elements: [],
    };

    const markdown = MarkdownProjector.project(page, {
      sidecarRelativePath: "Project Strategy.onecanvas.json",
      customTags: ["onenote-import", "quarterly"],
    });

    expect(markdown).toContain("---");
    expect(markdown).toContain('onenote_page_id: "p1"');
    expect(markdown).toContain('onenote_title: "Project Strategy"');
    expect(markdown).toContain('spatial_sidecar: "Project Strategy.onecanvas.json"');
    expect(markdown).toContain("  - onenote-import");
    expect(markdown).toContain("  - quarterly");
    expect(markdown).toContain("> [!spatial]+ Canvas");
    expect(markdown).toContain("[Open in Canvas](obsidian://onenote-spatial?page=p1&sidecar=Project%20Strategy.onecanvas.json)");
    expect(markdown).toContain("# Project Strategy");
  });

  it("confidently detects H1, H2, and H3 headings based on typography", () => {
    const page: CanonicalPage = {
      id: IdGenerator.pageId("p2"),
      title: "Typography Tests",
      pageLevel: 0,
      createdTime: 1724218800000,
      modifiedTime: 1724222400000,
      canvasStyle: { backgroundColor: "#FFFFFF" },
      elements: [
        {
          type: "outline",
          id: IdGenerator.objectId("out1"),
          bounds: { x: 10, y: 10, width: 500, height: 150, zIndex: 1 },
          paragraphs: [
            {
              id: IdGenerator.objectId("p_h1"),
              indentLevel: 0,
              runs: [{ text: "Major Heading", style: { fontSize: 20 } }],
            },
            {
              id: IdGenerator.objectId("p_h2"),
              indentLevel: 0,
              runs: [{ text: "Section Subheading", style: { fontSize: 14 } }],
            },
            {
              id: IdGenerator.objectId("p_h3"),
              indentLevel: 0,
              runs: [{ text: "Subsection Title", style: { fontSize: 12, bold: true } }],
            },
            {
              id: IdGenerator.objectId("p_body"),
              indentLevel: 0,
              runs: [{ text: "Regular paragraph body text.", style: { fontSize: 11 } }],
            },
          ],
        },
      ],
    };

    const markdown = MarkdownProjector.project(page, { includeFrontmatter: false, includeSpatialBanner: false });

    expect(markdown).toContain("# Major Heading");
    expect(markdown).toContain("## Section Subheading");
    expect(markdown).toContain("### Subsection Title");
    expect(markdown).toContain("Regular paragraph body text.");
  });

  it("projects formatted text, hyperlinks, tasks, and nested lists", () => {
    const page: CanonicalPage = {
      id: IdGenerator.pageId("p3"),
      title: "Tasks and Formats",
      pageLevel: 0,
      createdTime: 1724218800000,
      modifiedTime: 1724222400000,
      canvasStyle: { backgroundColor: "#FFFFFF" },
      elements: [
        {
          type: "outline",
          id: IdGenerator.objectId("out2"),
          bounds: { x: 10, y: 10, width: 500, height: 200, zIndex: 1 },
          paragraphs: [
            {
              id: IdGenerator.objectId("p_fmt"),
              indentLevel: 0,
              runs: [
                { text: "Bold ", style: { bold: true } },
                { text: "Italic ", style: { italic: true } },
                { text: "Strikethrough ", style: { strikethrough: true } },
                { text: "Highlighted", style: { highlightColor: "#FFFF00" } },
                { text: " and a Link", hyperlink: { type: "external", target: "https://obsidian.md" } },
              ],
            },
            {
              id: IdGenerator.objectId("p_t1"),
              indentLevel: 0,
              bulletType: "checkbox",
              isTaskChecked: false,
              runs: [{ text: "Incomplete action item" }],
            },
            {
              id: IdGenerator.objectId("p_t2"),
              indentLevel: 0,
              bulletType: "checkbox",
              isTaskChecked: true,
              runs: [{ text: "Completed action item" }],
            },
            {
              id: IdGenerator.objectId("p_list1"),
              indentLevel: 1,
              bulletType: "disc",
              runs: [{ text: "Nested bullet point" }],
            },
          ],
        },
      ],
    };

    const markdown = MarkdownProjector.project(page, { includeFrontmatter: false, includeSpatialBanner: false });

    expect(markdown).toContain("**Bold **");
    expect(markdown).toContain("*Italic *");
    expect(markdown).toContain("~~Strikethrough ~~");
    expect(markdown).toContain("==Highlighted==");
    expect(markdown).toContain("[ and a Link](https://obsidian.md)");
    expect(markdown).toContain("- [ ] Incomplete action item");
    expect(markdown).toContain("- [x] Completed action item");
    expect(markdown).toContain("  - Nested bullet point");
  });

  it("projects tables and non-text visual callouts without lossy flattening", () => {
    const page: CanonicalPage = {
      id: IdGenerator.pageId("p4"),
      title: "Visual Elements",
      pageLevel: 0,
      createdTime: 1724218800000,
      modifiedTime: 1724222400000,
      canvasStyle: { backgroundColor: "#FFFFFF" },
      elements: [
        {
          type: "image",
          id: IdGenerator.objectId("img1"),
          bounds: { x: 10, y: 10, width: 200, height: 100, zIndex: 1 },
          assetId: IdGenerator.assetId("asset_photo"),
          mimeType: "image/png",
        },
        {
          type: "ink",
          id: IdGenerator.objectId("ink1"),
          bounds: { x: 20, y: 20, width: 100, height: 50, zIndex: 2 },
          isHighlighter: false,
          strokes: [
            { id: IdGenerator.objectId("s1"), color: "#FF0000", width: 2, points: [{ x: 20, y: 20 }, { x: 50, y: 50 }] },
            { id: IdGenerator.objectId("s2"), color: "#FF0000", width: 2, points: [{ x: 50, y: 50 }, { x: 80, y: 20 }] },
          ],
        },
        {
          type: "shape",
          id: IdGenerator.objectId("shape1"),
          bounds: { x: 100, y: 200, width: 150, height: 80, zIndex: 3 },
          shapeKind: "arrow",
          strokeWidth: 2,
        },
      ],
    };

    const markdown = MarkdownProjector.project(page, {
      includeFrontmatter: false,
      includeSpatialBanner: false,
      assetPathResolver: (id) => `attachments/img_${id}.png`,
    });

    expect(markdown).toContain("![[attachments/img_asset_photo.png]]");
    expect(markdown).toContain("> [!note] ✍️ **Handwriting / Drawing**");
    expect(markdown).toContain("Contains 2 ink strokes. Preserved in spatial sidecar.");
    expect(markdown).toContain("> [!example] 📐 **Shape: ARROW**");
  });
});
