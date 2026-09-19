import { BinaryReader } from "./BinaryReader";

export enum OneNoteFileType {
  SECTION_2010_2016 = "SECTION_2010_2016",
  TOC_2010_2016 = "TOC_2010_2016",
  PACKAGE_CAB = "PACKAGE_CAB",
  LEGACY_SECTION_2007 = "LEGACY_SECTION_2007",
  LEGACY_TOC_2007 = "LEGACY_TOC_2007",
  UNKNOWN = "UNKNOWN",
}

export interface FileValidationResult {
  readonly isValid: boolean;
  readonly fileType: OneNoteFileType;
  readonly guidFileType?: string;
  readonly isLegacy: boolean;
  readonly isPackage: boolean;
  readonly error?: string;
}

export class FormatDetector {
  public static readonly GUID_SECTION_2010 = "{7B5C52E4-D88C-4DA7-AEB1-5378D02996D3}";
  public static readonly GUID_TOC_2010 = "{43FF2DF1-EF57-4C06-9733-9526D6108381}";
  public static readonly GUID_SECTION_2007 = "{44F99F07-A595-46F2-B091-B88E75C41DF0}";
  public static readonly GUID_TOC_2007 = "{977114D2-83FD-4767-8C7E-28F8DFCEB20C}";

  public static detect(buffer: ArrayBuffer | Uint8Array): FileValidationResult {
    if (!buffer || buffer.byteLength < 16) {
      return {
        isValid: false,
        fileType: OneNoteFileType.UNKNOWN,
        isLegacy: false,
        isPackage: false,
        error: "Buffer too small to be a valid OneNote file (<16 bytes)",
      };
    }

    const reader = new BinaryReader(buffer);

    // 1. Check Cabinet Magic (MSCF)
    const magic = reader.peekBytes(4);
    if (magic[0] === 0x4d && magic[1] === 0x53 && magic[2] === 0x43 && magic[3] === 0x46) {
      return {
        isValid: true,
        fileType: OneNoteFileType.PACKAGE_CAB,
        isLegacy: false,
        isPackage: true,
      };
    }

    // 2. Read FileType GUID
    const guid = reader.readGuid();

    switch (guid) {
      case FormatDetector.GUID_SECTION_2010:
        return {
          isValid: true,
          fileType: OneNoteFileType.SECTION_2010_2016,
          guidFileType: guid,
          isLegacy: false,
          isPackage: false,
        };
      case FormatDetector.GUID_TOC_2010:
        return {
          isValid: true,
          fileType: OneNoteFileType.TOC_2010_2016,
          guidFileType: guid,
          isLegacy: false,
          isPackage: false,
        };
      case FormatDetector.GUID_SECTION_2007:
        return {
          isValid: true,
          fileType: OneNoteFileType.LEGACY_SECTION_2007,
          guidFileType: guid,
          isLegacy: true,
          isPackage: false,
        };
      case FormatDetector.GUID_TOC_2007:
        return {
          isValid: true,
          fileType: OneNoteFileType.LEGACY_TOC_2007,
          guidFileType: guid,
          isLegacy: true,
          isPackage: false,
        };
      default:
        return {
          isValid: false,
          fileType: OneNoteFileType.UNKNOWN,
          guidFileType: guid,
          isLegacy: false,
          isPackage: false,
          error: `Unrecognized OneNote File Header GUID: ${guid}`,
        };
    }
  }
}
