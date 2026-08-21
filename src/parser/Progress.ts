/**
 * Granular ingestion progress reporting types and stages.
 */

export enum ProgressStage {
  READING_FILE = "READING_FILE",
  EXTRACTING_CAB = "EXTRACTING_CAB",
  PARSING_HEADER = "PARSING_HEADER",
  PARSING_OBJECT_SPACES = "PARSING_OBJECT_SPACES",
  EXTRACTING_IMAGES = "EXTRACTING_IMAGES",
  EXTRACTING_INK = "EXTRACTING_INK",
  BUILDING_CANONICAL_MODEL = "BUILDING_CANONICAL_MODEL",
  BUILDING_PAGESCENE = "BUILDING_PAGESCENE",
  WRITING_VAULT_FILES = "WRITING_VAULT_FILES",
  PUBLISHING_VAULT = "PUBLISHING_VAULT",
  COMPLETE = "COMPLETE",
}

export interface ProgressUpdate {
  readonly stage: ProgressStage;
  readonly message: string;
  readonly percent: number; // 0.0 to 100.0
  readonly currentItem?: string;
  readonly itemsProcessed?: number;
  readonly totalItems?: number;
}

export type ProgressCallback = (update: ProgressUpdate) => void;

export class ProgressReporter {
  private listeners: Set<ProgressCallback> = new Set();
  private lastUpdate: ProgressUpdate = {
    stage: ProgressStage.READING_FILE,
    message: "Initializing...",
    percent: 0,
  };

  constructor(callback?: ProgressCallback) {
    if (callback) {
      this.listeners.add(callback);
    }
  }

  public report(
    stage: ProgressStage,
    message: string,
    percent: number,
    extra?: { currentItem?: string; itemsProcessed?: number; totalItems?: number }
  ): void {
    this.lastUpdate = {
      stage,
      message,
      percent: Math.min(100, Math.max(0, percent)),
      ...extra,
    };

    for (const listener of this.listeners) {
      try {
        listener(this.lastUpdate);
      } catch (err) {
        console.error("Error in progress listener:", err);
      }
    }
  }

  public subscribe(callback: ProgressCallback): () => void {
    this.listeners.add(callback);
    callback(this.lastUpdate);
    return () => this.listeners.delete(callback);
  }

  public get current(): ProgressUpdate {
    return this.lastUpdate;
  }
}
