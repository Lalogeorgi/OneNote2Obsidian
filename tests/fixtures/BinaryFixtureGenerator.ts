/**
 * Generates byte-accurate OneNote .one, .onetoc2, and .onepkg test fixtures.
 */

export class BinaryFixtureGenerator {
  public static createValidSectionBuffer(): ArrayBuffer {
    const buffer = new ArrayBuffer(4096);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // 1. Header: Section 2010 GUID {7B5C52E4-D88C-4DA7-AEB1-5378D02996D3}
    // E4 52 5C 7B 8C D8 A7 4D AE B1 53 78 D0 29 96 D3
    bytes.set(
      [0xe4, 0x52, 0x5c, 0x7b, 0x8c, 0xd8, 0xa7, 0x4d, 0xae, 0xb1, 0x53, 0x78, 0xd0, 0x29, 0x96, 0xd3],
      0
    );

    // guidFile
    bytes.set(
      [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00],
      16
    );

    // guidLegacyFileVersion
    bytes.fill(0, 32, 48);

    // guidFileFormat {109ADD3F-9111-49F6-82E3-21292C77860E}
    bytes.set(
      [0x3f, 0xad, 0x9a, 0x10, 0x11, 0x91, 0xf6, 0x49, 0x82, 0xe3, 0x21, 0x29, 0x2c, 0x77, 0x86, 0x0e],
      48
    );

    // ffvLastCode, ffvNewestCode, ffvOldestCode, ffvEphemeral
    view.setUint32(64, 0x0000002a, true);
    view.setUint32(68, 0x0000002a, true);
    view.setUint32(72, 0x0000002a, true);
    view.setUint32(76, 0x0000002a, true);

    // fcrTransactionLog at offset 132 (uint64 + uint32 = 12 bytes)
    view.setBigUint64(132, BigInt(0), true);
    view.setUint32(140, 0, true);

    // fcrFileNodeListRoot at offset 144 -> offset 512, size 1024
    view.setBigUint64(144, BigInt(512), true);
    view.setUint32(152, 1024, true);

    // fcrFreeChunkList at offset 156
    view.setBigUint64(156, BigInt(0), true);
    view.setUint32(164, 0, true);

    // 2. FileNodeList at offset 512
    const fnOffset = 512;
    view.setUint32(fnOffset, 0x00000001, true); // Header ID
    view.setUint32(fnOffset + 4, 0x00000000, true); // nFragmentSeq

    let cur = fnOffset + 8;

    // Node 1: ObjectSpaceManifestFileNode (0x00C)
    // nodeHeader: (size << 10) | nodeId
    // size = 16 bytes
    view.setUint32(cur, (16 << 10) | 0x00c, true);
    cur += 4;
    // ObjectSpace GUID
    bytes.set(
      [0xaa, 0xbb, 0xcc, 0xdd, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0x00, 0x11, 0x22],
      cur
    );
    cur += 16;

    // Node 2: Page Object Declaration (0x010) with jcidPageNode (0x00060007)
    const title = "Quarterly Strategy Page";
    const titleByteLen = title.length * 2;
    const node2Size = 16 + titleByteLen; // 4 + 4 + 2 + 4 + 2 + titleByteLen = 62
    view.setUint32(cur, (node2Size << 10) | 0x010, true);
    cur += 4;
    view.setUint32(cur, 0x00000001, true); // compactId 1
    view.setUint32(cur + 4, 0x00060007, true); // jcidPageNode
    view.setUint16(cur + 8, 1, true); // 1 property
    // Page Title prop
    view.setUint32(cur + 10, (0x07 << 26) | 0x00010001, true); // Type String, ID 0x00010001
    view.setUint16(cur + 14, titleByteLen, true);
    for (let i = 0; i < title.length; i++) {
      view.setUint16(cur + 16 + i * 2, title.charCodeAt(i), true);
    }
    cur += node2Size;

    // Node 3: Text Outline (0x010) with jcidOutlineElement (0x0006000D)
    const outlineText = "Strategic Goals for Q3";
    const outlineByteLen = outlineText.length * 2;
    const node3Size = 32 + outlineByteLen; // 4 + 4 + 2 + 8 + 8 + 6 + 44 = 76
    view.setUint32(cur, (node3Size << 10) | 0x010, true);
    cur += 4;
    view.setUint32(cur, 0x00000002, true); // compactId 2
    view.setUint32(cur + 4, 0x0006000d, true); // jcidOutlineElement
    view.setUint16(cur + 8, 3, true); // 3 properties
    // Offset X, Y
    view.setUint32(cur + 10, (0x04 << 26) | 0x00010009, true);
    view.setUint32(cur + 14, 120, true); // X = 120 pt
    view.setUint32(cur + 18, (0x04 << 26) | 0x0001000a, true);
    view.setUint32(cur + 22, 160, true); // Y = 160 pt
    // Text Run
    view.setUint32(cur + 26, (0x07 << 26) | 0x00010001, true);
    view.setUint16(cur + 30, outlineByteLen, true);
    for (let i = 0; i < outlineText.length; i++) {
      view.setUint16(cur + 32 + i * 2, outlineText.charCodeAt(i), true);
    }
    cur += node3Size;

    // Node 4: Image Object (0x010) with jcidImage (0x00060012)
    const node4Size = 34;
    view.setUint32(cur, (node4Size << 10) | 0x010, true);
    cur += 4;
    view.setUint32(cur, 0x00000003, true); // compactId 3
    view.setUint32(cur + 4, 0x00060012, true); // jcidImage
    view.setUint16(cur + 8, 3, true); // 3 properties
    view.setUint32(cur + 10, (0x04 << 26) | 0x00010009, true);
    view.setUint32(cur + 14, 400, true); // X = 400 pt
    view.setUint32(cur + 18, (0x04 << 26) | 0x0001000a, true);
    view.setUint32(cur + 22, 200, true); // Y = 200 pt
    view.setUint32(cur + 26, (0x04 << 26) | 0x0001000e, true);
    view.setUint32(cur + 30, 2048, true); // Blob offset 2048
    cur += node4Size;

    // Node 5: Ink Object (0x010) with jcidInk (0x00060014)
    const node5Size = 26;
    view.setUint32(cur, (node5Size << 10) | 0x010, true);
    cur += 4;
    view.setUint32(cur, 0x00000004, true); // compactId 4
    view.setUint32(cur + 4, 0x00060014, true); // jcidInk
    view.setUint16(cur + 8, 2, true);
    view.setUint32(cur + 10, (0x04 << 26) | 0x00010009, true);
    view.setUint32(cur + 14, 150, true);
    view.setUint32(cur + 18, (0x04 << 26) | 0x00010015, true);
    view.setUint32(cur + 22, 3072, true); // Ink blob offset 3072
    cur += node5Size;

    // Node 6: ObjectDataBLOBFileNode (0x028) for Image Blob at 2048
    view.setUint32(cur, (12 << 10) | 0x028, true);
    cur += 4;
    view.setBigUint64(cur, BigInt(2048), true);
    view.setUint32(cur + 8, 8, true);
    cur += 12;

    // Node 7: ObjectDataBLOBFileNode (0x028) for Ink Blob at 3072
    const inkBlob = [
      0x00, 0x04, 0x00, 0x00, 0xff, 0x00, // Drawing attributes (Red color in BGR: 0, 0, 255)
      0x08, 0x03, 0x00,                   // Tag 0x08, 3 points
      0x10, 0x00, 0x20, 0x00, 0x80,       // pt 1: x=16, y=32, pressure=128
      0x20, 0x00, 0x30, 0x00, 0x90,       // pt 2: x=32, y=48, pressure=144
      0x30, 0x00, 0x40, 0x00, 0xa0,       // pt 3: x=48, y=64, pressure=160
    ];
    view.setUint32(cur, (12 << 10) | 0x028, true);
    cur += 4;
    view.setBigUint64(cur, BigInt(3072), true);
    view.setUint32(cur + 8, inkBlob.length, true);
    cur += 12;

    // Node 8: FileNodeEnd (0x001)
    view.setUint32(cur, 0x001, true);

    // 3. Populate Image BLOB at offset 2048 (PNG Signature)
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 2048);

    // 4. Populate Ink ISF BLOB at offset 3072
    bytes.set(inkBlob, 3072);

    return buffer;
  }

  public static createValidTocBuffer(): ArrayBuffer {
    const buffer = new ArrayBuffer(1024);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // TOC 2010 GUID {43FF2DF1-EF57-4C06-9733-9526D6108381}
    // F1 2D FF 43 57 EF 06 4C 97 33 95 26 D6 10 83 81
    bytes.set(
      [0xf1, 0x2d, 0xff, 0x43, 0x57, 0xef, 0x06, 0x4c, 0x97, 0x33, 0x95, 0x26, 0xd6, 0x10, 0x83, 0x81],
      0
    );

    // guidFile
    bytes.fill(0x55, 16, 32);

    // guidFileFormat
    bytes.set(
      [0x3f, 0xad, 0x9a, 0x10, 0x11, 0x91, 0xf6, 0x49, 0x82, 0xe3, 0x21, 0x29, 0x2c, 0x77, 0x86, 0x0e],
      48
    );

    view.setUint32(64, 42, true);
    view.setUint32(68, 42, true);
    view.setUint32(72, 42, true);
    view.setUint32(76, 42, true);

    // fcrFileNodeListRoot at offset 144 -> offset 256, size 512
    view.setBigUint64(144, BigInt(256), true);
    view.setUint32(152, 512, true);

    // FileNodeList at offset 256
    view.setUint32(256, 1, true);
    view.setUint32(260, 0, true);

    // FileNodeEnd at offset 264
    view.setUint32(264, 0x001, true);

    return buffer;
  }

  public static createValidCabPackageBuffer(): ArrayBuffer {
    // Construct uncompressed Cabinet file containing Section1.one
    const sectionBuffer = new Uint8Array(BinaryFixtureGenerator.createValidSectionBuffer());
    const fileName = "Section1.one\0";

    const buffer = new ArrayBuffer(512 + sectionBuffer.length);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // CFHEADER (MSCF)
    bytes.set([0x4d, 0x53, 0x43, 0x46], 0); // "MSCF"
    view.setUint32(8, buffer.byteLength, true); // cbCabinet
    view.setUint32(16, 44, true); // coffFiles -> offset 44
    view.setUint8(24, 3); // versionMinor
    view.setUint8(25, 1); // versionMajor
    view.setUint16(26, 1, true); // cFolders = 1
    view.setUint16(28, 1, true); // cFiles = 1
    view.setUint16(30, 0, true); // flags = 0
    view.setUint16(32, 1, true); // setID = 1
    view.setUint16(34, 0, true); // iCabinet = 0

    // CFFOLDER at offset 36 (8 bytes)
    const coffCabStart = 80;
    view.setUint32(36, coffCabStart, true); // coffCabStart = 80
    view.setUint16(40, 1, true); // cCFData = 1
    view.setUint16(42, 0, true); // typeCompress = 0 (Uncompressed)

    // CFFILE at offset 44 (16 bytes + fileName)
    view.setUint32(44, sectionBuffer.length, true); // cbFile
    view.setUint32(48, 0, true); // uoffFolderStart = 0
    view.setUint16(52, 0, true); // iFolder = 0
    view.setUint16(54, 0, true); // date
    view.setUint16(56, 0, true); // time
    view.setUint16(58, 0, true); // attribs
    for (let i = 0; i < fileName.length; i++) {
      bytes[60 + i] = fileName.charCodeAt(i);
    }

    // CFDATA at offset 80 (8 bytes header + uncompressed data)
    view.setUint32(80, 0, true); // cbChecksum
    view.setUint16(84, sectionBuffer.length, true); // cbData
    view.setUint16(86, sectionBuffer.length, true); // cbUncomp
    bytes.set(sectionBuffer, 88);

    return buffer;
  }
}
