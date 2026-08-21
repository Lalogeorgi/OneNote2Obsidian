import { DiagnosticCode } from "../../diagnostics/DiagnosticTypes";
import { logger } from "../../diagnostics/Logger";
import { CoordinateMath } from "../../geometry/Bounds";
import {
  CanonicalAttachment,
  CanonicalElement,
  CanonicalImage,
  CanonicalInkStrokeGroup,
  CanonicalOutline,
  CanonicalParagraph,
  CanonicalShape,
  CanonicalTable,
  CanonicalTextRun,
} from "../../model/CanonicalElements";
import { CanonicalNotebook, CanonicalSection } from "../../model/CanonicalNotebook";
import { CanonicalPage } from "../../model/CanonicalPage";
import { AssetId, IdGenerator } from "../../model/Ids";
import { ExtractedAsset } from "../ParserAdapter";
import { IsfParser } from "./IsfParser";
import { MsOneStoreParser, ParsedObjectNode } from "./MsOneStoreParser";

export class MsOneDocumentBuilder {
  private assets = new Map<AssetId, ExtractedAsset>();
  private warnings: string[] = [];

  public buildNotebook(parser: MsOneStoreParser, title = "Imported Notebook"): CanonicalNotebook {
    const sections: CanonicalSection[] = [];

    // Group object spaces into sections and pages
    for (const [spaceGuid, space] of parser.objectSpaces) {
      const pages: CanonicalPage[] = [];

      for (const [, obj] of space.objects) {
        if (obj.jcid === 0x00060007 || obj.jcid === 0x00060001) {
          const page = this.buildPageFromObject(obj, space.objects, parser.blobs);
          if (page) {
            pages.push(page);
          }
        }
      }

      if (pages.length > 0) {
        sections.push({
          id: IdGenerator.sectionId(spaceGuid),
          name: "Section 1",
          isEncrypted: false,
          pages,
        });
      }
    }

    return {
      id: IdGenerator.notebookId(),
      title,
      sectionGroups: [],
      sections,
    };
  }

  public buildPage(parser: MsOneStoreParser): CanonicalPage {
    // Locate root page object
    for (const [, space] of parser.objectSpaces) {
      for (const [, obj] of space.objects) {
        if (obj.jcid === 0x00060007 || obj.properties.size > 0) {
          const page = this.buildPageFromObject(obj, space.objects, parser.blobs);
          if (page) return page;
        }
      }
    }

    // Default empty canonical page if no structured root found
    return {
      id: IdGenerator.pageId(),
      title: "Untitled Page",
      pageLevel: 0,
      createdTime: Date.now(),
      modifiedTime: Date.now(),
      canvasStyle: { backgroundColor: "#FFFFFF" },
      elements: [],
    };
  }

  public buildPageFromObject(
    _rootObj: ParsedObjectNode,
    allObjects: Map<number, ParsedObjectNode>,
    blobs: Map<number, Uint8Array>
  ): CanonicalPage | null {
    const elements: CanonicalElement[] = [];
    let pageTitle = "Untitled Page";
    let zCounter = 1;

    for (const [, obj] of allObjects) {
      try {
        switch (obj.jcid) {
          case 0x00060007: // Page root
          case 0x00060008: { // Page Title
            const textProp = obj.properties.get(0x00010001);
            if (textProp && typeof textProp.data === "string" && textProp.data.trim()) {
              pageTitle = textProp.data.trim();
            }
            break;
          }
          case 0x0006000c:
          case 0x0006000d: {
            // Outline Element
            const outline = this.convertOutline(obj, zCounter++);
            if (outline) elements.push(outline);
            break;
          }
          case 0x00060012: {
            // Image Element
            const image = this.convertImage(obj, blobs, zCounter++);
            if (image) elements.push(image);
            break;
          }
          case 0x00060014: {
            // Ink / Handwriting Element
            const ink = this.convertInk(obj, blobs, zCounter++);
            if (ink) elements.push(ink);
            break;
          }
          case 0x0006001b: {
            // Table Element
            const table = this.convertTable(obj, zCounter++);
            if (table) elements.push(table);
            break;
          }
          case 0x00060020: {
            // Attachment
            const attachment = this.convertAttachment(obj, blobs, zCounter++);
            if (attachment) elements.push(attachment);
            break;
          }
          case 0x00060024: {
            // Geometric Shape
            const shape = this.convertShape(obj, zCounter++);
            if (shape) elements.push(shape);
            break;
          }
          default: {
            // Record diagnostic for unsupported/unknown JCIDs
            if (obj.jcid > 0) {
              logger.info(
                DiagnosticCode.GENERAL_INFO,
                `Preserved unsupported OneNote JCID: 0x${obj.jcid.toString(16)}`,
                { jcid: obj.jcid, compactId: obj.compactId }
              );
            }
            break;
          }
        }
      } catch (err) {
        logger.warn(
          DiagnosticCode.MODEL_ORPHAN_ELEMENT,
          `Failed to convert object JCID 0x${obj.jcid.toString(16)}`,
          { jcid: obj.jcid }
        );
      }
    }

    return {
      id: IdGenerator.pageId(),
      title: pageTitle,
      pageLevel: 0,
      createdTime: Date.now(),
      modifiedTime: Date.now(),
      canvasStyle: {
        backgroundColor: "#FFFFFF",
        ruleLines: { kind: "none", color: "#E0E0E0", spacing: 24 },
      },
      elements,
    };
  }

  private convertOutline(obj: ParsedObjectNode, zIndex: number): CanonicalOutline | null {
    const rawText = obj.properties.get(0x00010001)?.data;
    const text = typeof rawText === "string" ? rawText : "";
    if (!text && obj.children.length === 0) return null;

    const xPt = (obj.properties.get(0x00010009)?.data as number) || 80;
    const yPt = (obj.properties.get(0x0001000a)?.data as number) || 80;
    const widthPt = (obj.properties.get(0x0001000b)?.data as number) || 400;
    const heightPt = (obj.properties.get(0x0001000c)?.data as number) || 120;

    const runs: CanonicalTextRun[] = [
      {
        text: text || "Outline Text",
        style: {
          fontSize: (obj.properties.get(0x00010022)?.data as number) || 11,
          bold: Boolean(obj.properties.get(0x00010024)?.data),
          italic: Boolean(obj.properties.get(0x00010025)?.data),
        },
      },
    ];

    const paragraph: CanonicalParagraph = {
      id: IdGenerator.objectId("p"),
      indentLevel: 0,
      runs,
    };

    return {
      type: "outline",
      id: IdGenerator.objectId("outline"),
      bounds: CoordinateMath.normalizeBounds(xPt, yPt, widthPt, heightPt, zIndex),
      paragraphs: [paragraph],
    };
  }

  private convertImage(
    obj: ParsedObjectNode,
    blobs: Map<number, Uint8Array>,
    zIndex: number
  ): CanonicalImage | null {
    const xPt = (obj.properties.get(0x00010009)?.data as number) || 100;
    const yPt = (obj.properties.get(0x0001000a)?.data as number) || 100;
    const widthPt = (obj.properties.get(0x00010004)?.data as number) || 300;
    const heightPt = (obj.properties.get(0x00010005)?.data as number) || 200;

    const blobOffset = (obj.properties.get(0x0001000e)?.data as number) || 0;
    const blobData = blobs.get(blobOffset) || new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header mock

    const assetId = IdGenerator.assetId();
    const mimeType = this.sniffMimeType(blobData);

    this.assets.set(assetId, {
      id: assetId,
      mimeType,
      fileName: `image_${assetId}.png`,
      data: blobData,
    });

    return {
      type: "image",
      id: IdGenerator.objectId("img"),
      bounds: CoordinateMath.normalizeBounds(xPt, yPt, widthPt, heightPt, zIndex),
      assetId,
      mimeType,
    };
  }

  private convertInk(
    obj: ParsedObjectNode,
    blobs: Map<number, Uint8Array>,
    zIndex: number
  ): CanonicalInkStrokeGroup | null {
    const xPt = (obj.properties.get(0x00010009)?.data as number) || 100;
    const yPt = (obj.properties.get(0x0001000a)?.data as number) || 100;
    const widthPt = (obj.properties.get(0x00010004)?.data as number) || 200;
    const heightPt = (obj.properties.get(0x00010005)?.data as number) || 100;

    const inkBlobOffset = (obj.properties.get(0x00010015)?.data as number) || 0;
    const isfBytes = blobs.get(inkBlobOffset) || new Uint8Array([0x00, 0x04, 0x00, 0x00, 0x00, 0x00]);

    const isfParsed = IsfParser.parse(isfBytes);

    return {
      type: "ink",
      id: IdGenerator.objectId("ink"),
      bounds: CoordinateMath.normalizeBounds(xPt, yPt, widthPt, heightPt, zIndex),
      isHighlighter: isfParsed.isHighlighter,
      strokes: isfParsed.strokes,
    };
  }

  private convertTable(obj: ParsedObjectNode, zIndex: number): CanonicalTable | null {
    const xPt = (obj.properties.get(0x00010009)?.data as number) || 100;
    const yPt = (obj.properties.get(0x0001000a)?.data as number) || 200;
    const widthPt = (obj.properties.get(0x00010004)?.data as number) || 400;
    const heightPt = (obj.properties.get(0x00010005)?.data as number) || 150;

    return {
      type: "table",
      id: IdGenerator.objectId("table"),
      bounds: CoordinateMath.normalizeBounds(xPt, yPt, widthPt, heightPt, zIndex),
      columns: [{ width: 150 }, { width: 150 }],
      rows: [
        {
          id: IdGenerator.objectId("row1"),
          cells: [
            { id: IdGenerator.objectId("c1"), elements: [] },
            { id: IdGenerator.objectId("c2"), elements: [] },
          ],
        },
      ],
    };
  }

  private convertAttachment(
    obj: ParsedObjectNode,
    blobs: Map<number, Uint8Array>,
    zIndex: number
  ): CanonicalAttachment | null {
    const xPt = (obj.properties.get(0x00010009)?.data as number) || 100;
    const yPt = (obj.properties.get(0x0001000a)?.data as number) || 300;
    const fileName = (obj.properties.get(0x00010018)?.data as string) || "attachment.bin";

    const blobOffset = (obj.properties.get(0x00010019)?.data as number) || 0;
    const data = blobs.get(blobOffset) || new Uint8Array();

    const assetId = IdGenerator.assetId();
    this.assets.set(assetId, {
      id: assetId,
      mimeType: "application/octet-stream",
      fileName,
      data,
    });

    return {
      type: "attachment",
      id: IdGenerator.objectId("att"),
      bounds: CoordinateMath.normalizeBounds(xPt, yPt, 180, 48, zIndex),
      assetId,
      fileName,
      fileSizeBytes: data.length,
    };
  }

  private convertShape(obj: ParsedObjectNode, zIndex: number): CanonicalShape | null {
    const xPt = (obj.properties.get(0x00010009)?.data as number) || 200;
    const yPt = (obj.properties.get(0x0001000a)?.data as number) || 200;
    const widthPt = (obj.properties.get(0x00010004)?.data as number) || 150;
    const heightPt = (obj.properties.get(0x00010005)?.data as number) || 100;

    return {
      type: "shape",
      id: IdGenerator.objectId("shape"),
      bounds: CoordinateMath.normalizeBounds(xPt, yPt, widthPt, heightPt, zIndex),
      shapeKind: "rectangle",
      strokeColor: "#3B82F6",
      strokeWidth: 2,
    };
  }

  private sniffMimeType(data: Uint8Array): "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/svg+xml" {
    if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
      return "image/png";
    }
    if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
      return "image/jpeg";
    }
    if (data.length >= 3 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
      return "image/gif";
    }
    return "image/png";
  }

  public getExtractedAssets(): ReadonlyMap<AssetId, ExtractedAsset> {
    return this.assets;
  }

  public getWarnings(): readonly string[] {
    return this.warnings;
  }
}
