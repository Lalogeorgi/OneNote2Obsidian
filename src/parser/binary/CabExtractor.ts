import { DiagnosticCode } from "../../diagnostics/DiagnosticTypes";
import { logger } from "../../diagnostics/Logger";
import { IPlatformAdapter } from "../../platform/IPlatformAdapter";
import { ArchiveSecurityPolicy, DEFAULT_SECURITY_POLICY } from "../archive/ArchiveSecurityPolicy";
import { PathSanitizer } from "../archive/PathSanitizer";
import { CancellationToken } from "../Cancellation";
import { ParserError } from "../ParserAdapter";
import { BinaryReader } from "./BinaryReader";

export interface CabFileEntry {
  readonly fileName: string;
  readonly uncompressedSize: number;
  readonly folderIndex: number;
  readonly data: Uint8Array;
}

export interface StagedCabEntry {
  readonly fileName: string;
  readonly stagedRelativePath: string;
  readonly uncompressedSize: number;
}

export class CabExtractor {
  /**
   * Decompress a Microsoft Cabinet (.onepkg) buffer in memory with full security policy enforcement.
   */
  public static async extract(
    buffer: ArrayBuffer | Uint8Array,
    policy: ArchiveSecurityPolicy = DEFAULT_SECURITY_POLICY,
    cancellationToken?: CancellationToken
  ): Promise<CabFileEntry[]> {
    const reader = new BinaryReader(buffer);

    cancellationToken?.throwIfCancelled();

    // 1. Read & Validate CFHEADER
    if (reader.totalLength < 36) {
      throw new ParserError(
        "Invalid Cabinet archive: Buffer too small for CFHEADER",
        DiagnosticCode.PARSER_CAB_EXTRACTION_FAILED
      );
    }

    const signature = reader.readAsciiString(4);
    if (signature !== "MSCF") {
      throw new ParserError(
        `Invalid Cabinet header signature: "${signature}"`,
        DiagnosticCode.PARSER_INVALID_MAGIC,
        { signature }
      );
    }

    reader.position += 4; // reserved1
    reader.readUint32();  // cbCabinet
    reader.position += 4; // reserved2
    const coffFiles = reader.readUint32();
    reader.position += 4; // reserved3
    const versionMinor = reader.readUint8();
    const versionMajor = reader.readUint8();
    const cFolders = reader.readUint16();
    const cFiles = reader.readUint16();
    const flags = reader.readUint16();
    reader.readUint16();  // setID
    reader.readUint16();  // iCabinet

    if (versionMajor !== 1 || (versionMinor !== 3 && versionMinor !== 0)) {
      logger.warn(
        DiagnosticCode.PARSER_UNSUPPORTED_VERSION,
        `Unexpected CAB version ${versionMajor}.${versionMinor}`
      );
    }

    // 2. Validate Security Policy on declared counts
    if (cFiles > policy.maxFiles) {
      throw new ParserError(
        `Archive file count (${cFiles}) exceeds security policy limit (${policy.maxFiles})`,
        DiagnosticCode.PARSER_CAB_EXTRACTION_FAILED,
        { cFiles, maxFiles: policy.maxFiles }
      );
    }

    if (cFolders > 1000) {
      throw new ParserError(
        `Archive folder count (${cFolders}) exceeds safety limit`,
        DiagnosticCode.PARSER_CAB_EXTRACTION_FAILED
      );
    }

    let cbCFHeader = 0;
    let cbCFFolder = 0;
    let cbCFData = 0;

    // Check if reserved fields are present
    const cfhdrRESERVE_PRESENT = 0x0004;
    if ((flags & cfhdrRESERVE_PRESENT) !== 0) {
      cbCFHeader = reader.readUint16();
      cbCFFolder = reader.readUint8();
      cbCFData = reader.readUint8();
      reader.position += cbCFHeader;
    }

    // Read CFFOLDER entries
    const folders: Array<{
      coffCabStart: number;
      cCFData: number;
      typeCompress: number;
    }> = [];

    for (let i = 0; i < cFolders; i++) {
      const coffCabStart = reader.readUint32();
      const cCFData = reader.readUint16();
      const typeCompress = reader.readUint16();
      if (cbCFFolder > 0) {
        reader.position += cbCFFolder;
      }

      if (coffCabStart <= 0 || coffCabStart >= reader.totalLength) {
        throw new ParserError(
          `Invalid CFFOLDER coffCabStart pointer (${coffCabStart})`,
          DiagnosticCode.PARSER_CAB_EXTRACTION_FAILED
        );
      }

      folders.push({ coffCabStart, cCFData, typeCompress });
    }

    // Read CFFILE entries
    if (coffFiles <= 0 || coffFiles >= reader.totalLength) {
      throw new ParserError(
        `Invalid CFFILE coffFiles pointer (${coffFiles})`,
        DiagnosticCode.PARSER_CAB_EXTRACTION_FAILED
      );
    }

    reader.position = coffFiles;
    const fileHeaders: Array<{
      cbFile: number;
      uoffFolderStart: number;
      iFolder: number;
      fileName: string;
    }> = [];

    let totalDeclaredBytes = 0;

    for (let i = 0; i < cFiles; i++) {
      cancellationToken?.throwIfCancelled();

      const cbFile = reader.readUint32();
      const uoffFolderStart = reader.readUint32();
      const iFolder = reader.readUint16();
      reader.position += 6; // date, time, attribs

      // Read null-terminated string safely with bounds check
      let rawName = "";
      let charsRead = 0;
      while (reader.hasBytes(1)) {
        const charCode = reader.readUint8();
        if (charCode === 0) break;
        rawName += String.fromCharCode(charCode);
        charsRead++;
        if (charsRead > 1024) {
          throw new ParserError(
            "Archive filename exceeds maximum length threshold",
            DiagnosticCode.PARSER_CAB_EXTRACTION_FAILED
          );
        }
      }

      // Assert Path Safety
      const safePath = PathSanitizer.assertSafe(rawName);

      if (cbFile > policy.maxFileBytes) {
        throw new ParserError(
          `Declared file size (${cbFile} bytes) for "${safePath}" exceeds maximum allowed file size (${policy.maxFileBytes} bytes)`,
          DiagnosticCode.PARSER_CAB_EXTRACTION_FAILED,
          { fileName: safePath, cbFile, maxFileBytes: policy.maxFileBytes }
        );
      }

      totalDeclaredBytes += cbFile;
      if (totalDeclaredBytes > policy.maxTotalBytes) {
        throw new ParserError(
          `Cumulative declared archive size (${totalDeclaredBytes} bytes) exceeds limit (${policy.maxTotalBytes} bytes)`,
          DiagnosticCode.PARSER_CAB_EXTRACTION_FAILED,
          { totalDeclaredBytes, maxTotalBytes: policy.maxTotalBytes }
        );
      }

      fileHeaders.push({
        cbFile,
        uoffFolderStart,
        iFolder,
        fileName: safePath,
      });
    }

    // 3. Decompress folder data streams with live decompression bomb detection
    const folderStreams: Map<number, Uint8Array> = new Map();
    let totalExtractedBytes = 0;

    for (let fIdx = 0; fIdx < folders.length; fIdx++) {
      cancellationToken?.throwIfCancelled();
      const folder = folders[fIdx]!;
      reader.position = folder.coffCabStart;

      const uncompressedChunks: Uint8Array[] = [];
      let totalFolderUncompressedLen = 0;

      for (let d = 0; d < folder.cCFData; d++) {
        cancellationToken?.throwIfCancelled();

        reader.position += 4; // cbChecksum
        const cbData = reader.readUint16();
        const cbUncomp = reader.readUint16();
        if (cbCFData > 0) {
          reader.position += cbCFData;
        }

        if (cbData > reader.remainingBytes) {
          throw new ParserError(
            `Corrupted CFDATA block: declared size ${cbData} exceeds remaining buffer ${reader.remainingBytes}`,
            DiagnosticCode.PARSER_CORRUPT_CHUNK
          );
        }

        const compData = reader.readBytes(cbData);

        if ((folder.typeCompress & 0x000f) === 0) {
          // Uncompressed
          uncompressedChunks.push(compData.slice(0, cbUncomp));
          totalFolderUncompressedLen += cbUncomp;
          totalExtractedBytes += cbUncomp;
        } else if ((folder.typeCompress & 0x000f) === 1) {
          // MSZIP (Deflate with 0x43 0x4B header)
          let rawDeflate = compData;
          if (compData.length >= 2 && compData[0] === 0x43 && compData[1] === 0x4b) {
            rawDeflate = compData.subarray(2);
          }
          const decompressed = await CabExtractor.inflateRaw(rawDeflate);

          // Check decompression expansion ratio
          if (compData.length > 0 && decompressed.length / compData.length > policy.maxCompressionRatio) {
            throw new ParserError(
              `Decompression bomb detected: expansion ratio (${(decompressed.length / compData.length).toFixed(1)}x) exceeds limit (${policy.maxCompressionRatio}x)`,
              DiagnosticCode.PARSER_CAB_EXTRACTION_FAILED
            );
          }

          uncompressedChunks.push(decompressed);
          totalFolderUncompressedLen += decompressed.length;
          totalExtractedBytes += decompressed.length;
        } else {
          // Fallback uncompressed slice
          uncompressedChunks.push(compData.slice(0, cbUncomp));
          totalFolderUncompressedLen += cbUncomp;
          totalExtractedBytes += cbUncomp;
        }

        if (totalExtractedBytes > policy.maxTotalBytes) {
          throw new ParserError(
            `Total extracted payload (${totalExtractedBytes} bytes) exceeded security ceiling (${policy.maxTotalBytes} bytes)`,
            DiagnosticCode.PARSER_CAB_EXTRACTION_FAILED
          );
        }
      }

      // Combine uncompressed folder stream
      const folderBuffer = new Uint8Array(totalFolderUncompressedLen);
      let offset = 0;
      for (const chunk of uncompressedChunks) {
        folderBuffer.set(chunk, offset);
        offset += chunk.length;
      }
      folderStreams.set(fIdx, folderBuffer);
    }

    // 4. Extract individual files from folder data
    const extractedFiles: CabFileEntry[] = [];
    for (const file of fileHeaders) {
      const folderData = folderStreams.get(file.iFolder);
      if (!folderData) continue;

      if (file.uoffFolderStart + file.cbFile > folderData.length) {
        throw new ParserError(
          `Corrupt archive: File "${file.fileName}" bounds (${file.uoffFolderStart} + ${file.cbFile}) exceed folder payload (${folderData.length})`,
          DiagnosticCode.PARSER_CORRUPT_CHUNK
        );
      }

      const fileData = folderData.subarray(
        file.uoffFolderStart,
        file.uoffFolderStart + file.cbFile
      );

      extractedFiles.push({
        fileName: file.fileName,
        uncompressedSize: file.cbFile,
        folderIndex: file.iFolder,
        data: fileData,
      });
    }

    return extractedFiles;
  }

  /**
   * Stream extract a Cabinet (.onepkg) buffer directly into a staging directory via IPlatformAdapter.
   */
  public static async extractToStaging(
    buffer: ArrayBuffer | Uint8Array,
    stagingDir: string,
    adapter: IPlatformAdapter,
    policy: ArchiveSecurityPolicy = DEFAULT_SECURITY_POLICY,
    cancellationToken?: CancellationToken
  ): Promise<StagedCabEntry[]> {
    const extracted = await this.extract(buffer, policy, cancellationToken);
    const stagedEntries: StagedCabEntry[] = [];

    for (const entry of extracted) {
      cancellationToken?.throwIfCancelled();
      const targetPath = adapter.joinPath(stagingDir, entry.fileName);
      await adapter.writeStagedFile(targetPath, entry.data);

      stagedEntries.push({
        fileName: entry.fileName,
        stagedRelativePath: entry.fileName,
        uncompressedSize: entry.uncompressedSize,
      });
    }

    return stagedEntries;
  }

  private static async inflateRaw(data: Uint8Array): Promise<Uint8Array> {
    if (typeof DecompressionStream !== "undefined") {
      try {
        const stream = new DecompressionStream("deflate-raw");
        const writer = stream.writable.getWriter();
        writer.write(data as unknown as BufferSource);
        writer.close();

        const chunks: Uint8Array[] = [];
        const reader = stream.readable.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }

        const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
        const result = new Uint8Array(totalLen);
        let offset = 0;
        for (const c of chunks) {
          result.set(c, offset);
          offset += c.length;
        }
        return result;
      } catch (err) {
        throw new ParserError(
          "Failed to decompress MSZIP Deflate stream",
          DiagnosticCode.PARSER_CORRUPT_CHUNK,
          undefined,
          err as Error
        );
      }
    }

    // Fallback: return raw data if DecompressionStream not supported
    return data;
  }
}
