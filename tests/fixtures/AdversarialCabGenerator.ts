import { BinaryFixtureGenerator } from "./BinaryFixtureGenerator";

export class AdversarialCabGenerator {
  /**
   * Constructs a basic uncompressed CAB buffer with custom file entries.
   */
  public static createCustomCab(
    files: Array<{ name: string; data: Uint8Array; declaredSize?: number }>,
    options: {
      signature?: string;
      cFilesOverride?: number;
      coffCabStartOverride?: number;
      cFoldersOverride?: number;
    } = {}
  ): ArrayBuffer {
    const totalDataSize = files.reduce((acc, f) => acc + f.data.length, 0);
    const namesLength = files.reduce((acc, f) => acc + (f.name.length + 1), 0);
    const bufferSize = 512 + (files.length * 16) + namesLength + totalDataSize;

    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // Signature
    const sig = options.signature ?? "MSCF";
    for (let i = 0; i < 4; i++) {
      bytes[i] = sig.charCodeAt(i);
    }

    view.setUint32(8, bufferSize, true); // cbCabinet
    view.setUint32(16, 44, true);        // coffFiles
    view.setUint8(24, 3);               // versionMinor
    view.setUint8(25, 1);               // versionMajor
    view.setUint16(26, options.cFoldersOverride ?? 1, true); // cFolders
    view.setUint16(28, options.cFilesOverride ?? files.length, true); // cFiles
    view.setUint16(30, 0, true);        // flags
    view.setUint16(32, 1, true);        // setID
    view.setUint16(34, 0, true);        // iCabinet

    // CFFOLDER at offset 36
    const coffCabStart = options.coffCabStartOverride ?? (44 + (files.length * 16) + namesLength + 16);
    view.setUint32(36, coffCabStart, true);
    view.setUint16(40, 1, true); // cCFData = 1
    view.setUint16(42, 0, true); // uncompressed

    // CFFILE entries at offset 44
    let curFilePos = 44;
    let runningDataOffset = 0;

    for (const f of files) {
      const cbFile = f.declaredSize !== undefined ? f.declaredSize : f.data.length;
      view.setUint32(curFilePos, cbFile, true);
      view.setUint32(curFilePos + 4, runningDataOffset, true);
      view.setUint16(curFilePos + 8, 0, true); // iFolder
      view.setUint16(curFilePos + 10, 0, true); // date
      view.setUint16(curFilePos + 12, 0, true); // time
      view.setUint16(curFilePos + 14, 0, true); // attribs

      // Write null-terminated filename
      for (let i = 0; i < f.name.length; i++) {
        bytes[curFilePos + 16 + i] = f.name.charCodeAt(i);
      }
      bytes[curFilePos + 16 + f.name.length] = 0;

      curFilePos += 16 + f.name.length + 1;
      runningDataOffset += f.data.length;
    }

    // CFDATA at coffCabStart
    view.setUint32(coffCabStart, 0, true); // checksum
    view.setUint16(coffCabStart + 4, totalDataSize, true); // cbData
    view.setUint16(coffCabStart + 6, totalDataSize, true); // cbUncomp

    // Copy file data
    let curDataPos = coffCabStart + 8;
    for (const f of files) {
      bytes.set(f.data, curDataPos);
      curDataPos += f.data.length;
    }

    return buffer;
  }

  public static createPathTraversalPackage(): ArrayBuffer {
    const validSection = new Uint8Array(BinaryFixtureGenerator.createValidSectionBuffer());
    return this.createCustomCab([
      { name: "../../malicious_escape.one", data: validSection },
    ]);
  }

  public static createAbsolutePathPackage(): ArrayBuffer {
    const validSection = new Uint8Array(BinaryFixtureGenerator.createValidSectionBuffer());
    return this.createCustomCab([
      { name: "/etc/passwd.one", data: validSection },
    ]);
  }

  public static createWindowsReservedDevicePackage(): ArrayBuffer {
    const validSection = new Uint8Array(BinaryFixtureGenerator.createValidSectionBuffer());
    return this.createCustomCab([
      { name: "CON.one", data: validSection },
    ]);
  }

  public static createIllegalFilenamePackage(): ArrayBuffer {
    const validSection = new Uint8Array(BinaryFixtureGenerator.createValidSectionBuffer());
    return this.createCustomCab([
      { name: "invalid<name>.one", data: validSection },
    ]);
  }

  public static createExcessiveFilesPackage(): ArrayBuffer {
    const validSection = new Uint8Array(BinaryFixtureGenerator.createValidSectionBuffer());
    return this.createCustomCab(
      [{ name: "Section1.one", data: validSection }],
      { cFilesOverride: 10000 }
    );
  }

  public static createCorruptedHeaderPackage(): ArrayBuffer {
    const validSection = new Uint8Array(BinaryFixtureGenerator.createValidSectionBuffer());
    return this.createCustomCab(
      [{ name: "Section1.one", data: validSection }],
      { signature: "CORR" }
    );
  }

  public static createNestedMultiSectionPackage(): ArrayBuffer {
    const tocData = new Uint8Array(BinaryFixtureGenerator.createValidTocBuffer());
    const section1 = new Uint8Array(BinaryFixtureGenerator.createValidSectionBuffer());
    const section2 = new Uint8Array(BinaryFixtureGenerator.createValidSectionBuffer());
    const section3 = new Uint8Array(BinaryFixtureGenerator.createValidSectionBuffer());

    return this.createCustomCab([
      { name: "OpenNotebook.onetoc2", data: tocData },
      { name: "QuickNotes.one", data: section1 },
      { name: "Projects/ProjectAlpha.one", data: section2 },
      { name: "Projects/ProjectBeta.one", data: section3 },
    ]);
  }
}
