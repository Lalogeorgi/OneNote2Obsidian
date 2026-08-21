import { DiagnosticCode } from "../../diagnostics/DiagnosticTypes";
import { logger } from "../../diagnostics/Logger";
import { CanonicalNotebook } from "../../model/CanonicalNotebook";
import { CancellationToken } from "../Cancellation";
import {
  IOneNoteParserAdapter,
  ParserError,
  ParserOptions,
  ParserResult,
} from "../ParserAdapter";
import { ProgressReporter, ProgressStage } from "../Progress";
import { OnepkgImporter } from "../archive/OnepkgImporter";
import { FormatDetector, OneNoteFileType } from "./FormatDetector";
import { MsOneDocumentBuilder } from "./MsOneDocumentBuilder";
import { MsOneStoreParser } from "./MsOneStoreParser";

export class OneNoteParserAdapter implements IOneNoteParserAdapter {
  public async parseSection(
    buffer: ArrayBuffer,
    _options: ParserOptions = {},
    progress?: ProgressReporter,
    cancellationToken?: CancellationToken
  ): Promise<ParserResult> {
    cancellationToken?.throwIfCancelled();
    progress?.report(ProgressStage.READING_FILE, "Validating OneNote section file...", 10);

    const validation = FormatDetector.detect(buffer);
    if (!validation.isValid) {
      throw new ParserError(
        validation.error || "Invalid OneNote file format",
        DiagnosticCode.PARSER_INVALID_MAGIC,
        { guid: validation.guidFileType }
      );
    }

    if (validation.isLegacy) {
      logger.warn(
        DiagnosticCode.PARSER_UNSUPPORTED_VERSION,
        "Legacy OneNote 2007 format detected. Converting with fallback compatibility."
      );
    }

    cancellationToken?.throwIfCancelled();
    progress?.report(ProgressStage.PARSING_OBJECT_SPACES, "Parsing revision store and object spaces...", 30);

    const storeParser = new MsOneStoreParser(buffer);
    storeParser.parse();

    cancellationToken?.throwIfCancelled();
    progress?.report(ProgressStage.BUILDING_CANONICAL_MODEL, "Reconstructing canonical document model...", 70);

    const builder = new MsOneDocumentBuilder();
    const page = builder.buildPage(storeParser);
    const assets = builder.getExtractedAssets();

    progress?.report(ProgressStage.COMPLETE, "OneNote section parsed successfully.", 100);

    return {
      page,
      assets,
      warnings: builder.getWarnings(),
    };
  }

  public async parseTableOfContents(
    buffer: ArrayBuffer,
    _options: ParserOptions = {},
    progress?: ProgressReporter,
    cancellationToken?: CancellationToken
  ): Promise<CanonicalNotebook> {
    cancellationToken?.throwIfCancelled();
    progress?.report(ProgressStage.READING_FILE, "Validating OneNote Table of Contents (.onetoc2)...", 10);

    const validation = FormatDetector.detect(buffer);
    if (!validation.isValid || validation.fileType !== OneNoteFileType.TOC_2010_2016) {
      throw new ParserError(
        "Invalid or unsupported Table of Contents file",
        DiagnosticCode.PARSER_INVALID_MAGIC
      );
    }

    progress?.report(ProgressStage.PARSING_OBJECT_SPACES, "Parsing notebook hierarchy...", 50);

    const storeParser = new MsOneStoreParser(buffer);
    storeParser.parse();

    const builder = new MsOneDocumentBuilder();
    const notebook = builder.buildNotebook(storeParser, "OneNote Notebook");

    progress?.report(ProgressStage.COMPLETE, "Table of Contents parsed successfully.", 100);
    return notebook;
  }

  public async parsePackage(
    buffer: ArrayBuffer,
    options: ParserOptions = {},
    progress?: ProgressReporter,
    cancellationToken?: CancellationToken
  ): Promise<CanonicalNotebook> {
    const importer = new OnepkgImporter(this);
    return importer.importPackage(buffer, options, progress, cancellationToken);
  }
}
