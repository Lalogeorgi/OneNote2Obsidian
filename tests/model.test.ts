import { describe, expect, it } from "vitest";
import { IdGenerator } from "../src/model/Ids";
import { CanonicalPage } from "../src/model/CanonicalPage";
import { CanonicalNotebook } from "../src/model/CanonicalNotebook";

describe("Canonical OneNote Domain Model", () => {
  it("generates stable, branded nominal IDs", () => {
    const nbId = IdGenerator.notebookId();
    const secId = IdGenerator.sectionId();
    const pageId = IdGenerator.pageId();
    const objId = IdGenerator.objectId("outline");
    const assetId = IdGenerator.assetId();

    expect(nbId.startsWith("nb_")).toBe(true);
    expect(secId.startsWith("sec_")).toBe(true);
    expect(pageId.startsWith("page_")).toBe(true);
    expect(objId.startsWith("outline_")).toBe(true);
    expect(assetId.startsWith("asset_")).toBe(true);
  });

  it("constructs a fully-typed, UI-independent CanonicalPage", () => {
    const page: CanonicalPage = {
      id: IdGenerator.pageId("p1"),
      title: "Test Page",
      pageLevel: 0,
      createdTime: 1724218800000,
      modifiedTime: 1724222400000,
      canvasStyle: {
        backgroundColor: "#FFFFFF",
        ruleLines: { kind: "narrow", color: "#CCCCCC", spacing: 20 },
      },
      elements: [
        {
          type: "outline",
          id: IdGenerator.objectId("out_1"),
          bounds: { x: 50, y: 100, width: 400, height: 200, zIndex: 1 },
          paragraphs: [
            {
              id: IdGenerator.objectId("par_1"),
              indentLevel: 0,
              runs: [
                {
                  text: "Hello OneNote",
                  style: { bold: true, fontSize: 16, fontColor: "#000000" },
                },
              ],
            },
          ],
        },
      ],
    };

    expect(page.title).toBe("Test Page");
    expect(page.elements.length).toBe(1);
    expect(page.elements[0]?.type).toBe("outline");
  });

  it("constructs a CanonicalNotebook hierarchy", () => {
    const notebook: CanonicalNotebook = {
      id: IdGenerator.notebookId("nb_root"),
      title: "My Work Notebook",
      sectionGroups: [],
      sections: [
        {
          id: IdGenerator.sectionId("sec_1"),
          name: "Project Planning",
          isEncrypted: false,
          pages: [],
        },
      ],
    };

    expect(notebook.title).toBe("My Work Notebook");
    expect(notebook.sections.length).toBe(1);
    expect(notebook.sections[0]?.name).toBe("Project Planning");
  });
});
