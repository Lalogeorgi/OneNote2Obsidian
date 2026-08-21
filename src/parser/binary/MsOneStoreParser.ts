import { DiagnosticCode } from "../../diagnostics/DiagnosticTypes";
import { logger } from "../../diagnostics/Logger";
import { BinaryReader } from "./BinaryReader";
import { FormatDetector, OneNoteFileType } from "./FormatDetector";

export interface FileChunkReference64 {
  readonly offset: number;
  readonly size: number;
}

export interface OneStoreHeader {
  readonly guidFileType: string;
  readonly guidFile: string;
  readonly guidFileFormat: string;
  readonly fcrTransactionLog: FileChunkReference64;
  readonly fcrFileNodeListRoot: FileChunkReference64;
  readonly fcrFreeChunkList: FileChunkReference64;
  readonly fileType: OneNoteFileType;
}

export interface PropertyValue {
  readonly propertyId: number;
  readonly type: number;
  readonly data: Uint8Array | number | boolean | string;
}

export interface ParsedObjectNode {
  readonly jcid: number;
  readonly compactId: number;
  readonly properties: Map<number, PropertyValue>;
  readonly children: ParsedObjectNode[];
  readonly blobData?: Uint8Array;
}

export interface ParsedObjectSpace {
  readonly guid: string;
  readonly rootObjectId?: number;
  readonly objects: Map<number, ParsedObjectNode>;
}

export class MsOneStoreParser {
  private reader: BinaryReader;
  private header!: OneStoreHeader;
  public objectSpaces: Map<string, ParsedObjectSpace> = new Map();
  public blobs: Map<number, Uint8Array> = new Map();

  constructor(buffer: ArrayBuffer | Uint8Array) {
    this.reader = new BinaryReader(buffer);
  }

  public parse(): void {
    try {
      // 1. Read & Validate Header
      this.parseHeader();

      // 2. Walk FileNodeList graph from root
      if (this.header && this.header.fcrFileNodeListRoot.offset > 0 && this.header.fcrFileNodeListRoot.size > 0) {
        this.parseFileNodeList(this.header.fcrFileNodeListRoot.offset);
      }
    } catch (err) {
      logger.warn(
        DiagnosticCode.PARSER_CORRUPT_CHUNK,
        "Malformed or truncated OneNote file structure",
        { error: String(err) }
      );
    }
  }

  private parseHeader(): void {
    const validation = FormatDetector.detect(this.reader.peekBytes(32));
    if (!validation.isValid) {
      throw new Error(validation.error || "Invalid OneNote file header");
    }

    const guidFileType = this.reader.readGuid();
    const guidFile = this.reader.readGuid();
    this.reader.position += 16; // guidLegacyFileVersion
    const guidFileFormat = this.reader.readGuid();

    this.reader.position += 16; // version codes
    this.reader.position += 8;  // cbLegacyExpectedLength
    this.reader.position += 32; // rgbIdentity
    this.reader.position += 12; // fcrLegacyFree, fcrLegacyRoot, fcrLegacyHeap

    const fcrTransactionLog = this.readFileChunkReference64();
    const fcrFileNodeListRoot = this.readFileChunkReference64();
    const fcrFreeChunkList = this.readFileChunkReference64();

    this.header = {
      guidFileType,
      guidFile,
      guidFileFormat,
      fcrTransactionLog,
      fcrFileNodeListRoot,
      fcrFreeChunkList,
      fileType: validation.fileType,
    };
  }

  private readFileChunkReference64(): FileChunkReference64 {
    const offset = Number(this.reader.readUint64());
    const size = this.reader.readUint32();
    return { offset, size };
  }

  private parseFileNodeList(offset: number): void {
    if (offset <= 0 || offset >= this.reader.totalLength) return;

    this.reader.position = offset;
    this.reader.readUint32(); // headerId
    this.reader.readUint32(); // nFragmentSeq

    const visitedOffsets = new Set<number>();
    visitedOffsets.add(offset);

    let currentSpaceGuid = "{00000000-0000-0000-0000-000000000000}";

    while (this.reader.hasBytes(4)) {
      const nodeHeader = this.reader.readUint32();
      const nodeId = nodeHeader & 0x03ff; // Lower 10 bits
      const nodeSize = (nodeHeader >> 10) & 0x1fff; // Next 13 bits

      if (nodeId === 0x001) {
        // FileNodeEnd
        break;
      }

      const nodeStart = this.reader.position;

      try {
        switch (nodeId) {
          case 0x004:
          case 0x00c: {
            // ObjectSpaceManifestFileNode
            if (this.reader.hasBytes(16)) {
              currentSpaceGuid = this.reader.readGuid();
              if (!this.objectSpaces.has(currentSpaceGuid)) {
                this.objectSpaces.set(currentSpaceGuid, {
                  guid: currentSpaceGuid,
                  objects: new Map(),
                });
              }
            }
            break;
          }
          case 0x010:
          case 0x011:
          case 0x02c:
          case 0x040: {
            // Object Declaration / Property Set
            this.parseObjectDeclaration(currentSpaceGuid);
            break;
          }
          case 0x028: {
            // ObjectDataBLOBFileNode
            const ref = this.readFileChunkReference64();
            if (ref.offset > 0 && ref.size > 0 && ref.offset + ref.size <= this.reader.totalLength) {
              const oldPos = this.reader.position;
              this.reader.position = ref.offset;
              const blobData = this.reader.readBytes(ref.size);
              this.blobs.set(ref.offset, blobData);
              this.reader.position = oldPos;
            }
            break;
          }
        }
      } catch (err) {
        logger.warn(
          DiagnosticCode.PARSER_CORRUPT_CHUNK,
          `Error parsing FileNode 0x${nodeId.toString(16)} at ${nodeStart}`,
          undefined
        );
      }

      // Safely advance to next node
      this.reader.position = Math.min(this.reader.totalLength, nodeStart + nodeSize);
    }
  }

  private parseObjectDeclaration(spaceGuid: string): void {
    if (!this.reader.hasBytes(8)) return;

    const compactId = this.reader.readUint32();
    const jcid = this.reader.readUint32();

    const properties = new Map<number, PropertyValue>();

    // Parse PropertySet if data remains
    const propCount = this.reader.hasBytes(2) ? this.reader.readUint16() : 0;

    for (let p = 0; p < propCount; p++) {
      if (!this.reader.hasBytes(4)) break;
      const propId = this.reader.readUint32();
      const type = (propId >> 26) & 0x1f;
      const id = propId & 0x03ffffff;

      let val: PropertyValue["data"] = 0;
      switch (type) {
        case 0x01: // bool
          val = this.reader.hasBytes(1) ? this.reader.readUint8() !== 0 : false;
          break;
        case 0x02: // 1 byte
          val = this.reader.hasBytes(1) ? this.reader.readUint8() : 0;
          break;
        case 0x03: // 2 bytes
          val = this.reader.hasBytes(2) ? this.reader.readUint16() : 0;
          break;
        case 0x04: // 4 bytes
          val = this.reader.hasBytes(4) ? this.reader.readUint32() : 0;
          break;
        case 0x05: // 8 bytes
          val = this.reader.hasBytes(8) ? Number(this.reader.readUint64()) : 0;
          break;
        case 0x07: { // String or raw data
          const len = this.reader.hasBytes(2) ? this.reader.readUint16() : 0;
          if (len > 0 && this.reader.hasBytes(len)) {
            val = this.reader.readUtf16String(len);
          }
          break;
        }
      }

      properties.set(id, { propertyId: id, type, data: val });
    }

    const space = this.objectSpaces.get(spaceGuid) || {
      guid: spaceGuid,
      objects: new Map(),
    };

    space.objects.set(compactId, {
      jcid,
      compactId,
      properties,
      children: [],
    });

    this.objectSpaces.set(spaceGuid, space);
  }

  public getHeader(): OneStoreHeader {
    return this.header;
  }
}
