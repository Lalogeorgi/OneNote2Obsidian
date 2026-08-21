import { describe, expect, it } from "vitest";
import { CanonicalNotebook } from "../src/model/CanonicalNotebook";
import { CanonicalPage } from "../src/model/CanonicalPage";
import { IdGenerator } from "../src/model/Ids";
import { ExtractedAsset } from "../src/parser/ParserAdapter";
import { ImportManifest } from "../src/projection/ImportManifest";
import { SemanticVaultPublisher } from "../src/projection/SemanticVaultPublisher";

describe("Semantic Vault Publisher End-to-End Pipeline", () => {
  const createMockNotebook = (): CanonicalNotebook => {
    const page1: CanonicalPage = {
      id: IdGenerator.pageId("page_1"),
      title: "Sprint Planning",
      pageLevel: 0,
      createdTime: 1724218800000,
      modifiedTime: 1724222400000,
      canvasStyle: { backgroundColor: "#FCFCFA" },
      elements: [
        {
          type: "outline",
          id: IdGenerator.objectId("out_1"),
          bounds: { x: 50, y: 50, width: 400, height: 100, zIndex: 1 },
          paragraphs: [
            {
              id: IdGenerator.objectId("p1"),
              indentLevel: 0,
              runs: [{ text: "Sprint Goals", style: { fontSize: 18 } }],
            },
            {
              id: IdGenerator.objectId("p2"),
              indentLevel: 0,
              bulletType: "checkbox",
              isTaskChecked: true,
              runs: [{ text: "Launch Spatial Canvas" }],
            },
          ],
        },
        {
          type: "image",
          id: IdGenerator.objectId("img_1"),
          bounds: { x: 50, y: 160, width: 300, height: 200, zIndex: 2 },
          assetId: IdGenerator.assetId("asset_diagram"),
          mimeType: "image/png",
        },
      ],
    };

    const page2: CanonicalPage = {
      id: IdGenerator.pageId("page_2"),
      title: "Architecture Decisions",
      pageLevel: 0,
      createdTime: 1724218800000,
      modifiedTime: 1724222400000,
      canvasStyle: { backgroundColor: "#FFFFFF" },
      elements: [],
    };

    return {
      id: IdGenerator.notebookId("nb_project"),
      title: "Engineering",
      sectionGroups: [
        {
          id: IdGenerator.sectionGroupId("sg_1"),
          name: "Q3 Strategy",
          subGroups: [],
          sections: [
            {
              id: IdGenerator.sectionId("sec_arch"),
              name: "Architecture",
              isEncrypted: false,
              pages: [page2],
            },
          ],
        },
      ],
      sections: [
        {
          id: IdGenerator.sectionId("sec_sprint"),
          name: "Sprints",
          isEncrypted: false,
          pages: [page1],
        },
      ],
    };
  };

  it("publishes complete dual-representation vault hierarchy with Markdown, sidecars, and manifest", async () => {
    const notebook = createMockNotebook();
    const diagramAssetId = IdGenerator.assetId("asset_diagram");
    const assets = new Map<any, ExtractedAsset>([
      [
        diagramAssetId,
        {
          id: diagramAssetId,
          data: new Uint8Array([1, 2, 3, 4]),
          mimeType: "image/png",
          fileName: "diagram.png",
        },
      ],
    ]);

    const result = await SemanticVaultPublisher.publish({
      notebook,
      extractedAssets: assets,
      sourceSha256: "hash_engineering_v1",
      sourcePath: "C:/Notes/Engineering.onepkg",
    });

    expect(result.skipped).toBe(false);
    expect(result.importedPages).toBe(2);
    expect(result.extractedAssets).toBe(1);

    // Verify Markdown notes
    const sprintMd = result.files.find((f) => f.path.endsWith("Sprint Planning.md"));
    expect(sprintMd).toBeDefined();
    expect(sprintMd?.content).toContain("# Sprint Goals");
    expect(sprintMd?.content).toContain("- [x] Launch Spatial Canvas");
    expect(sprintMd?.content).toContain("![[attachments/diagram.png]]");
    expect(sprintMd?.content).toContain('spatial_sidecar: "Sprint Planning.onecanvas.json"');

    // Verify Spatial Sidecars
    const sprintSidecar = result.files.find((f) => f.path.endsWith("Sprint Planning.onecanvas.json"));
    expect(sprintSidecar).toBeDefined();
    const sidecarJson = JSON.parse(sprintSidecar?.content as string);
    expect(sidecarJson.canvas.backgroundColor).toBe("#FCFCFA");
    expect(sidecarJson.nodes.length).toBe(2);

    // Verify Manifest
    const manifestFile = result.files.find((f) => f.path.endsWith("manifest.json"));
    expect(manifestFile).toBeDefined();
    const manifest = ImportManifest.fromJSON(manifestFile?.content as string);
    expect(manifest.isDuplicate("hash_engineering_v1")).toBe(true);
  });

  it("skips publishing when duplicateStrategy is 'skip' and package hash already exists", async () => {
    const notebook = createMockNotebook();
    const existingManifest = new ImportManifest();
    existingManifest.recordImport({
      notebookId: notebook.id,
      notebookTitle: notebook.title,
      sourceSha256: "duplicate_hash_999",
      firstImportedAt: 1000,
      lastImportedAt: 2000,
      pages: [],
    });

    const result = await SemanticVaultPublisher.publish({
      notebook,
      sourceSha256: "duplicate_hash_999",
      existingManifest,
      duplicateStrategy: "skip",
    });

    expect(result.skipped).toBe(true);
    expect(result.files.length).toBe(0);
    expect(result.importedPages).toBe(0);
  });
});
