import { DiagnosticCode } from "../../diagnostics/DiagnosticTypes";
import { logger } from "../../diagnostics/Logger";
import { CanonicalNotebook, CanonicalSection, CanonicalSectionGroup } from "../../model/CanonicalNotebook";
import { IdGenerator } from "../../model/Ids";
import { IPlatformAdapter } from "../../platform/IPlatformAdapter";
import { PlatformManager } from "../../platform/PlatformManager";
import { CancellationToken } from "../Cancellation";
import { IOneNoteParserAdapter, ParserError, ParserOptions } from "../ParserAdapter";
import { ProgressReporter, ProgressStage } from "../Progress";
import { CabExtractor } from "../binary/CabExtractor";
import { FormatDetector } from "../binary/FormatDetector";
import { ArchiveSecurityPolicy, DEFAULT_SECURITY_POLICY } from "./ArchiveSecurityPolicy";

export interface OnepkgImportOptions extends ParserOptions {
  readonly stagingDirectoryPrefix?: string;
  readonly securityPolicy?: ArchiveSecurityPolicy;
  readonly targetVaultDir?: string;
}

export class OnepkgImporter {
  constructor(
    private parserAdapter: IOneNoteParserAdapter,
    private platformAdapter: IPlatformAdapter = PlatformManager.getAdapter()
  ) {}

  /**
   * Securely import a .onepkg archive into a CanonicalNotebook with bounded staging,
   * path validation, hierarchy discovery, and guaranteed cleanup.
   */
  public async importPackage(
    buffer: ArrayBuffer,
    options: OnepkgImportOptions = {},
    progress?: ProgressReporter,
    cancellationToken?: CancellationToken
  ): Promise<CanonicalNotebook> {
    cancellationToken?.throwIfCancelled();
    progress?.report(ProgressStage.READING_FILE, "Validating OneNote package archive (.onepkg)...", 5);

    // 1. Sniff & Validate Container
    const validation = FormatDetector.detect(buffer);
    if (!validation.isValid || !validation.isPackage) {
      throw new ParserError(
        "Invalid OneNote Package (.onepkg) header signature",
        DiagnosticCode.PARSER_CAB_EXTRACTION_FAILED
      );
    }

    const policy = options.securityPolicy || DEFAULT_SECURITY_POLICY;
    const prefix = options.stagingDirectoryPrefix || "onenote-staging-";

    // 2. Allocate Isolated Staging Directory
    let stagingDir = "";
    try {
      stagingDir = await this.platformAdapter.createStagingDirectory(prefix);
      logger.info(DiagnosticCode.GENERAL_INFO, `Created isolated staging directory`, { stagingDir });

      cancellationToken?.throwIfCancelled();
      progress?.report(ProgressStage.EXTRACTING_CAB, "Decompressing package into isolated staging area...", 15);

      // 3. Extract to staging area with path sanitization and decompression bounds
      const stagedEntries = await CabExtractor.extractToStaging(
        buffer,
        stagingDir,
        this.platformAdapter,
        policy,
        cancellationToken
      );

      cancellationToken?.throwIfCancelled();
      progress?.report(
        ProgressStage.PARSING_OBJECT_SPACES,
        `Extracted ${stagedEntries.length} entries. Discovering notebook hierarchy...`,
        35
      );

      // 4. Discover TOC and build structure
      const stagedFilePaths = await this.platformAdapter.listStagedFiles(stagingDir);
      const notebook = await this.reconstructHierarchy(
        stagingDir,
        stagedFilePaths,
        options,
        progress,
        cancellationToken
      );

      // 5. Optional Atomic Publication to Vault Target
      if (options.targetVaultDir) {
        cancellationToken?.throwIfCancelled();
        progress?.report(ProgressStage.PUBLISHING_VAULT, "Atomically publishing to Obsidian vault...", 90);
        await this.platformAdapter.atomicPublish(stagingDir, options.targetVaultDir);
      }

      progress?.report(ProgressStage.COMPLETE, "OneNote Package successfully ingested.", 100);
      return notebook;
    } finally {
      // 6. Guaranteed Cleanup of Staging Directory
      if (stagingDir) {
        try {
          await this.platformAdapter.removeDirectory(stagingDir);
          logger.info(DiagnosticCode.GENERAL_INFO, `Cleaned up staging directory`, { stagingDir });
        } catch (err) {
          logger.warn(
            DiagnosticCode.GENERAL_INFO,
            `Failed to remove staging directory during cleanup`,
            { stagingDir },
            err as Error
          );
        }
      }
    }
  }

  /**
   * Reconstructs notebook, section groups, and sections from staged files.
   */
  private async reconstructHierarchy(
    stagingDir: string,
    files: string[],
    options: OnepkgImportOptions,
    progress?: ProgressReporter,
    cancellationToken?: CancellationToken
  ): Promise<CanonicalNotebook> {
    const sectionGroups: CanonicalSectionGroup[] = [];
    const rootSections: CanonicalSection[] = [];

    // Check for root .onetoc2
    const rootToc = files.find((f) => f.toLowerCase() === "onetoc2.onetoc2" || f.toLowerCase().endsWith(".onetoc2"));
    let notebookTitle = "Imported Notebook";

    if (rootToc) {
      try {
        const tocPath = this.platformAdapter.joinPath(stagingDir, rootToc);
        const tocBuffer = await this.platformAdapter.readStagedFile(tocPath);
        const parsedToc = await this.parserAdapter.parseTableOfContents(tocBuffer, options, undefined, cancellationToken);
        if (parsedToc.title) {
          notebookTitle = parsedToc.title;
        }
      } catch (err) {
        logger.warn(
          DiagnosticCode.PARSER_CORRUPT_CHUNK,
          `Failed to parse Table of Contents ${rootToc}; falling back to directory layout`,
          { rootToc },
          err as Error
        );
      }
    }

    // Group files by directory hierarchy
    const filesByDir = new Map<string, string[]>();
    for (const f of files) {
      if (!f.toLowerCase().endsWith(".one")) continue;

      const parts = f.split("/");
      const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
      if (!filesByDir.has(dir)) {
        filesByDir.set(dir, []);
      }
      filesByDir.get(dir)!.push(f);
    }

    const totalSectionFiles = Array.from(filesByDir.values()).reduce((acc, l) => acc + l.length, 0);
    let sectionsProcessed = 0;

    // Process Root Sections (dir === "")
    const rootSectionFiles = filesByDir.get("") || [];
    for (const relPath of rootSectionFiles) {
      cancellationToken?.throwIfCancelled();
      sectionsProcessed++;
      const pct = 35 + Math.floor((sectionsProcessed / (totalSectionFiles || 1)) * 50);

      const sectionName = this.extractSectionName(relPath);
      progress?.report(
        ProgressStage.PARSING_OBJECT_SPACES,
        `Parsing section "${sectionName}" (${sectionsProcessed}/${totalSectionFiles})...`,
        pct,
        { currentItem: sectionName, itemsProcessed: sectionsProcessed, totalItems: totalSectionFiles }
      );

      const section = await this.parseStagedSection(stagingDir, relPath, sectionName, options, cancellationToken);
      if (section) {
        rootSections.push(section);
      }
    }

    // Process Nested Section Groups (dir !== "")
    for (const [dir, dirFiles] of filesByDir.entries()) {
      if (!dir) continue;

      const groupSections: CanonicalSection[] = [];
      for (const relPath of dirFiles) {
        cancellationToken?.throwIfCancelled();
        sectionsProcessed++;
        const pct = 35 + Math.floor((sectionsProcessed / (totalSectionFiles || 1)) * 50);

        const sectionName = this.extractSectionName(relPath);
        progress?.report(
          ProgressStage.PARSING_OBJECT_SPACES,
          `Parsing section "${sectionName}" (${sectionsProcessed}/${totalSectionFiles})...`,
          pct,
          { currentItem: sectionName, itemsProcessed: sectionsProcessed, totalItems: totalSectionFiles }
        );

        const section = await this.parseStagedSection(stagingDir, relPath, sectionName, options, cancellationToken);
        if (section) {
          groupSections.push(section);
        }
      }

      const groupName = dir.split("/").pop() || "Section Group";
      sectionGroups.push({
        id: IdGenerator.sectionGroupId(dir),
        name: groupName,
        sections: groupSections,
        subGroups: [],
      });
    }

    return {
      id: IdGenerator.notebookId(),
      title: notebookTitle,
      sectionGroups,
      sections: rootSections,
    };
  }

  private async parseStagedSection(
    stagingDir: string,
    relPath: string,
    sectionName: string,
    options: OnepkgImportOptions,
    cancellationToken?: CancellationToken
  ): Promise<CanonicalSection | null> {
    try {
      const fullPath = this.platformAdapter.joinPath(stagingDir, relPath);
      const sectionBuffer = await this.platformAdapter.readStagedFile(fullPath);

      const result = await this.parserAdapter.parseSection(sectionBuffer, options, undefined, cancellationToken);
      if (!result.page) return null;

      return {
        id: IdGenerator.sectionId(relPath),
        name: sectionName,
        isEncrypted: false,
        pages: [result.page],
      };
    } catch (err) {
      logger.warn(
        DiagnosticCode.PARSER_CORRUPT_CHUNK,
        `Failed to parse section "${relPath}"`,
        { relPath },
        err as Error
      );
      return null;
    }
  }

  private extractSectionName(relPath: string): string {
    const base = relPath.split("/").pop() || "Untitled Section";
    return base.replace(/\.one$/i, "");
  }
}
