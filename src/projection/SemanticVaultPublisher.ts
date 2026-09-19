import { CanonicalNotebook } from "../model/CanonicalNotebook";
import { CanonicalPage } from "../model/CanonicalPage";
import { AssetId } from "../model/Ids";
import { PageSceneSerializer } from "../pagescene/PageSceneSerializer";
import { SceneBuilder } from "../pagescene/SceneBuilder";
import { ExtractedAsset } from "../parser/ParserAdapter";
import { AssetExtractor } from "./AssetExtractor";
import {
  DuplicateStrategy,
  ImportedNotebookEntry,
  ImportedPageEntry,
  ImportManifest,
} from "./ImportManifest";
import { MarkdownProjector } from "./MarkdownProjector";
import { VaultPathConfig, VaultPathResolver } from "./VaultPathResolver";

export interface GeneratedVaultFile {
  readonly path: string;
  readonly content: string | Uint8Array;
  readonly type: "markdown" | "sidecar" | "asset" | "manifest";
}

export interface PublishResult {
  readonly skipped: boolean;
  readonly files: GeneratedVaultFile[];
  readonly importedPages: number;
  readonly extractedAssets: number;
  readonly manifestJson: string;
}

export class SemanticVaultPublisher {
  /**
   * Projects a CanonicalNotebook into a complete set of vault files (Markdown notes,
   * spatial sidecars, assets, and updated manifest).
   */
  public static async publish(params: {
    notebook: CanonicalNotebook;
    extractedAssets?: ReadonlyMap<AssetId, ExtractedAsset>;
    sourceSha256: string;
    sourcePath?: string;
    existingManifest?: ImportManifest;
    pathConfig?: VaultPathConfig;
    duplicateStrategy?: DuplicateStrategy;
  }): Promise<PublishResult> {
    const manifest = params.existingManifest ?? new ImportManifest();
    const strategy = params.duplicateStrategy ?? "skip";

    // 1. Duplicate Detection
    if (strategy === "skip" && manifest.isDuplicate(params.sourceSha256)) {
      return {
        skipped: true,
        files: [],
        importedPages: 0,
        extractedAssets: 0,
        manifestJson: manifest.toJSON(),
      };
    }

    const pathResolver = new VaultPathResolver(params.pathConfig);
    const files: GeneratedVaultFile[] = [];

    // 2. Process Binary Assets
    const rawAssets = params.extractedAssets ?? new Map<AssetId, ExtractedAsset>();
    const assetRecords = await AssetExtractor.processAssets(rawAssets);

    // Asset Path Resolver for Markdown & Sidecars
    const assetMap = new Map<AssetId, string>();
    for (const [id, record] of assetRecords.entries()) {
      assetMap.set(id, record.relativeVaultPath);
      files.push({
        path: record.relativeVaultPath,
        content: record.data,
        type: "asset",
      });
    }

    const importedPageEntries: ImportedPageEntry[] = [];

    // Helper for processing a page
    const processPage = (page: CanonicalPage, secName: string, groupNames?: string[]) => {
      const paths = pathResolver.resolvePagePaths({
        notebookTitle: params.notebook.title,
        sectionGroupNames: groupNames,
        sectionName: secName,
        pageTitle: page.title || "Untitled",
      });

      // A. Build Spatial Scene & Sidecar JSON
      const scene = SceneBuilder.build(page);
      const sidecarJson = PageSceneSerializer.serialize(scene);
      files.push({
        path: paths.sidecarPath,
        content: sidecarJson,
        type: "sidecar",
      });

      // B. Project Semantic Markdown
      const markdown = MarkdownProjector.project(page, {
        sidecarRelativePath: paths.relativeSidecarFromMarkdown,
        includeSpatialBanner: true,
        includeFrontmatter: true,
        assetPathResolver: (assetId) => assetMap.get(assetId),
      });

      files.push({
        path: paths.markdownPath,
        content: markdown,
        type: "markdown",
      });

      importedPageEntries.push({
        pageId: page.id,
        pageTitle: page.title || "Untitled",
        sectionId: "" as any,
        markdownPath: paths.markdownPath,
        sidecarPath: paths.sidecarPath,
        importedAt: Date.now(),
      });
    };

    // 3. Process Root Sections
    for (const sec of params.notebook.sections) {
      for (const p of sec.pages) {
        processPage(p, sec.name);
      }
    }

    // 4. Process Section Groups
    for (const group of params.notebook.sectionGroups) {
      for (const sec of group.sections) {
        for (const p of sec.pages) {
          processPage(p, sec.name, [group.name]);
        }
      }
    }

    // 5. Update Manifest
    const notebookEntry: ImportedNotebookEntry = {
      notebookId: params.notebook.id,
      notebookTitle: params.notebook.title,
      sourcePath: params.sourcePath,
      sourceSha256: params.sourceSha256,
      firstImportedAt: manifest.getNotebook(params.notebook.id)?.firstImportedAt ?? Date.now(),
      lastImportedAt: Date.now(),
      pages: importedPageEntries,
    };

    manifest.recordImport(notebookEntry);

    // 6. Include Root Manifest file
    const rootFolder = params.pathConfig?.rootImportFolder ?? "OneNote2Obsidian";
    const manifestPath = rootFolder ? `${rootFolder}/manifest.json` : "manifest.json";

    files.push({
      path: manifestPath,
      content: manifest.toJSON(),
      type: "manifest",
    });

    return {
      skipped: false,
      files,
      importedPages: importedPageEntries.length,
      extractedAssets: assetRecords.size,
      manifestJson: manifest.toJSON(),
    };
  }
}
