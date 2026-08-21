import { NotebookId, PageId, SectionId } from "../model/Ids";

export type DuplicateStrategy = "skip" | "overwrite" | "version";

export interface ImportedPageEntry {
  readonly pageId: PageId;
  readonly pageTitle: string;
  readonly sectionId: SectionId;
  readonly markdownPath: string;
  readonly sidecarPath: string;
  readonly importedAt: number;
}

export interface ImportedNotebookEntry {
  readonly notebookId: NotebookId;
  readonly notebookTitle: string;
  readonly sourcePath?: string;
  readonly sourceSha256: string;
  readonly firstImportedAt: number;
  readonly lastImportedAt: number;
  readonly pages: ImportedPageEntry[];
}

export interface ImportManifestData {
  readonly version: "1.0.0";
  readonly pluginVersion: string;
  readonly lastUpdated: number;
  readonly notebooks: Record<string, ImportedNotebookEntry>; // keyed by notebookId or sourceSha256
}

export class ImportManifest {
  private data: ImportManifestData;

  constructor(initialData?: Partial<ImportManifestData>) {
    this.data = {
      version: "1.0.0",
      pluginVersion: initialData?.pluginVersion ?? "0.1.0",
      lastUpdated: initialData?.lastUpdated ?? Date.now(),
      notebooks: initialData?.notebooks ?? {},
    };
  }

  public toJSON(): string {
    return JSON.stringify(this.data, null, 2);
  }

  public static fromJSON(jsonStr: string): ImportManifest {
    try {
      const parsed = JSON.parse(jsonStr);
      return new ImportManifest(parsed);
    } catch {
      return new ImportManifest();
    }
  }

  public isDuplicate(sourceSha256: string): boolean {
    return Object.values(this.data.notebooks).some(
      (nb) => nb.sourceSha256 === sourceSha256
    );
  }

  public findNotebookByHash(sourceSha256: string): ImportedNotebookEntry | undefined {
    return Object.values(this.data.notebooks).find(
      (nb) => nb.sourceSha256 === sourceSha256
    );
  }

  public recordImport(entry: ImportedNotebookEntry): void {
    this.data = {
      ...this.data,
      lastUpdated: Date.now(),
      notebooks: {
        ...this.data.notebooks,
        [entry.notebookId]: entry,
      },
    };
  }

  public getNotebook(notebookId: NotebookId): ImportedNotebookEntry | undefined {
    return this.data.notebooks[notebookId];
  }

  public getAllNotebooks(): ImportedNotebookEntry[] {
    return Object.values(this.data.notebooks);
  }
}
