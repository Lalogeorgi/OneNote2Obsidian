import { AssetId } from "../model/Ids";
import { CanonicalNotebook } from "../model/CanonicalNotebook";
import { CanonicalPage } from "../model/CanonicalPage";
import { CancellationToken } from "./Cancellation";
import { ProgressReporter } from "./Progress";

export interface ExtractedAsset {
  readonly id: AssetId;
  readonly mimeType: string;
  readonly fileName?: string;
  readonly data: Uint8Array;
}

export interface ParserOptions {
  readonly extractImages?: boolean;
  readonly extractInk?: boolean;
  readonly extractAttachments?: boolean;
  readonly password?: string;
}

export interface ParserResult {
  readonly notebook?: CanonicalNotebook;
  readonly page?: CanonicalPage;
  readonly assets: ReadonlyMap<AssetId, ExtractedAsset>;
  readonly warnings: readonly string[];
}

export class ParserError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
    override readonly cause?: Error
  ) {
    super(message);
    this.name = "ParserError";
  }
}

/**
 * Universal OneNote parser adapter interface.
 * Decouples ingestion sources (.one, .onetoc2, .onepkg) and backend parser implementations (WASM, worker, etc.)
 */
export interface IOneNoteParserAdapter {
  /**
   * Parse a single OneNote `.one` section binary buffer.
   */
  parseSection(
    buffer: ArrayBuffer,
    options?: ParserOptions,
    progress?: ProgressReporter,
    cancellationToken?: CancellationToken
  ): Promise<ParserResult>;

  /**
   * Parse a `.onetoc2` Table of Contents binary buffer.
   */
  parseTableOfContents(
    buffer: ArrayBuffer,
    options?: ParserOptions,
    progress?: ProgressReporter,
    cancellationToken?: CancellationToken
  ): Promise<CanonicalNotebook>;

  /**
   * Parse a `.onepkg` Microsoft Cabinet archive container.
   */
  parsePackage(
    buffer: ArrayBuffer,
    options?: ParserOptions,
    progress?: ProgressReporter,
    cancellationToken?: CancellationToken
  ): Promise<CanonicalNotebook>;
}
