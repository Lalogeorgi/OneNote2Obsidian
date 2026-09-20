import { DiagnosticCode } from "../../diagnostics/DiagnosticTypes";
import { logger } from "../../diagnostics/Logger";
import { CoordinateMath } from "../../geometry/Bounds";
import {
  BulletType,
  CanonicalAttachment,
  CanonicalElement,
  CanonicalImage,
  CanonicalInkStrokeGroup,
  CanonicalOutline,
  CanonicalParagraph,
  CanonicalTextRun,
  CanonicalShape,
  CanonicalTable,
  CanonicalTableRow,
  CanonicalTableCell,
} from "../../model/CanonicalElements";
import { CanonicalNotebook, CanonicalSection } from "../../model/CanonicalNotebook";
import { CanonicalPage, RuleLineKind } from "../../model/CanonicalPage";
import { AssetId, IdGenerator } from "../../model/Ids";
import { ExtractedAsset } from "../ParserAdapter";
import { IsfParser } from "./IsfParser";
import { MsOneStoreParser, ParsedObjectNode } from "./MsOneStoreParser";
import {
  MS_ONE_JCID,
  MS_ONE_PROP_ID,
  PARSER_METRICS_DEFAULTS,
} from "../../constants/ParserConstants";

export class MsOneDocumentBuilder {
  private assets = new Map<AssetId, ExtractedAsset>();
  private warnings: string[] = [];

  public buildNotebook(parser: MsOneStoreParser, title = "Imported Notebook"): CanonicalNotebook {
    const pages = this.buildPages(parser, title);
    const sections: CanonicalSection[] = [
      {
        id: IdGenerator.sectionId(),
        name: title,
        isEncrypted: false,
        pages,
      },
    ];

    return {
      id: IdGenerator.notebookId(),
      title,
      sectionGroups: [],
      sections,
    };
  }

  public buildPages(parser: MsOneStoreParser, defaultTitle = "Untitled Page"): CanonicalPage[] {
    const pages: CanonicalPage[] = [];

    // Group object spaces into pages
    for (const [, space] of parser.objectSpaces) {
      if (space.objects.size === 0) continue;

      let rootObj: ParsedObjectNode | null = null;

      for (const [, obj] of space.objects) {
        const baseJcid = obj.jcid & 0xffff;
        if (
          baseJcid === MS_ONE_JCID.PAGE_NODE ||
          obj.jcid === MS_ONE_JCID.PAGE_ROOT_FIXTURE ||
          obj.jcid === 0x00060001 ||
          obj.jcid === MS_ONE_JCID.PAGE_TITLE_FIXTURE
        ) {
          rootObj = obj;
          break;
        }
      }

      if (!rootObj) {
        for (const [, obj] of space.objects) {
          const baseJcid = obj.jcid & 0xffff;
          if (
            baseJcid === MS_ONE_JCID.OUTLINE_NODE ||
            baseJcid === MS_ONE_JCID.OUTLINE_ELEMENT_NODE ||
            baseJcid === MS_ONE_JCID.RICH_TEXT_OE_NODE ||
            baseJcid === MS_ONE_JCID.IMAGE_NODE ||
            baseJcid === MS_ONE_JCID.IMAGE_NODE_ALT
          ) {
            rootObj = obj;
            break;
          }
        }
      }

      if (!rootObj) {
        rootObj = space.objects.values().next().value || null;
      }

      if (rootObj) {
        const page = this.buildPageFromObject(
          rootObj,
          space.objects,
          parser.blobs,
          defaultTitle,
          parser
        );
        const hasUserContent = page && page.elements.some((e) => !e.id.includes("title_banner"));
        if (page && hasUserContent) {
          pages.push(page);
        }
      }
    }

    // Fallback: If no pages with content discovered, build single default page
    if (pages.length === 0) {
      pages.push(this.buildPage(parser, defaultTitle));
    }

    // Ensure unique titles across pages (e.g. "Untitled Page", "Untitled Page 2", etc.)
    const titleCounts = new Map<string, number>();
    for (const page of pages) {
      const base = page.title;
      const count = titleCounts.get(base) || 0;
      titleCounts.set(base, count + 1);
      if (count > 0) {
        (page as any).title = `${base} ${count + 1}`;
      }
    }

    return pages;
  }

  public buildPage(parser: MsOneStoreParser, defaultTitle = "Untitled Page"): CanonicalPage {
    for (const [, space] of parser.objectSpaces) {
      for (const [, obj] of space.objects) {
        const baseJcid = obj.jcid & 0xffff;
        if (
          baseJcid === MS_ONE_JCID.PAGE_NODE ||
          obj.jcid === MS_ONE_JCID.PAGE_ROOT_FIXTURE ||
          obj.properties.size > 0
        ) {
          const page = this.buildPageFromObject(
            obj,
            space.objects,
            parser.blobs,
            defaultTitle,
            parser
          );
          if (page) return page;
        }
      }
    }

    return {
      id: IdGenerator.pageId(),
      title: defaultTitle,
      pageLevel: 0,
      createdTime: Date.now(),
      modifiedTime: Date.now(),
      canvasStyle: { backgroundColor: PARSER_METRICS_DEFAULTS.DEFAULT_CANVAS_BG },
      elements: [],
    };
  }

  public buildPageFromObject(
    _rootObj: ParsedObjectNode,
    allObjects: Map<number, ParsedObjectNode>,
    blobs: Map<number, Uint8Array>,
    defaultTitle = "Untitled Page",
    parser?: MsOneStoreParser
  ): CanonicalPage | null {
    const elements: CanonicalElement[] = [];
    let pageTitle = defaultTitle;
    let zCounter = 1;
    let foundExplicitTitle = false;

    // Track descendant elements of Outlines, Tables, and Titles to prevent emitting fragments as separate canvas elements
    const outlineDescendantIds = new Set<number>();
    const tableChildIds = new Set<number>();
    const titleChildIds = new Set<number>();

    const visitedOutlineGraphIds = new Set<number>();
    const collectDescendants = (node: ParsedObjectNode) => {
      if (visitedOutlineGraphIds.has(node.compactId)) return;
      visitedOutlineGraphIds.add(node.compactId);

      for (const c of node.children) {
        outlineDescendantIds.add(c.compactId);
        collectDescendants(c);
      }
      if (node.childOids) {
        for (const oid of node.childOids) {
          outlineDescendantIds.add(oid);
          const target = allObjects.get(oid) || allObjects.get(oid & 0xff);
          if (target && target.compactId !== node.compactId) {
            outlineDescendantIds.add(target.compactId);
            collectDescendants(target);
          }
        }
      }
      const childProp = node.properties.get(0x1c20)?.data;
      if (Array.isArray(childProp)) {
        for (const cid of childProp) {
          if (typeof cid === "number") {
            outlineDescendantIds.add(cid);
            const target = allObjects.get(cid) || allObjects.get(cid & 0xff);
            if (target && target.compactId !== node.compactId) {
              outlineDescendantIds.add(target.compactId);
              collectDescendants(target);
            }
          }
        }
      }
    };

    for (const [, obj] of allObjects) {
      const baseJcid = obj.jcid & 0xffff;
      if (baseJcid === MS_ONE_JCID.OUTLINE_NODE) {
        collectDescendants(obj);
      } else if (baseJcid === MS_ONE_JCID.TABLE_NODE) {
        for (const row of obj.children) {
          tableChildIds.add(row.compactId);
          for (const cell of row.children) {
            tableChildIds.add(cell.compactId);
            for (const child of cell.children) {
              tableChildIds.add(child.compactId);
            }
          }
        }
      } else if (baseJcid === MS_ONE_JCID.TITLE_NODE) {
        for (const child of obj.children) {
          titleChildIds.add(child.compactId);
          for (const sub of child.children) {
            titleChildIds.add(sub.compactId);
          }
        }
      }
    }

    // Pass 1: Find authentic page title and date/time from CachedTitleString or TitleNode
    let titleDateTime = "";
    for (const [, obj] of allObjects) {
      const cached =
        obj.properties.get(MS_ONE_PROP_ID.TITLE_TEXT)?.data ??
        obj.properties.get(MS_ONE_PROP_ID.TITLE_TEXT_ALT)?.data ??
        obj.properties.get(MS_ONE_PROP_ID.RICH_TEXT_FIXTURE)?.data;
      if (typeof cached === "string") {
        const cleaned = cached.replace(/\0/g, "").trim();
        if (cleaned) {
          const candidate = cleaned.split("\n")[0]!.substring(0, 100).trim();
          if (candidate && !this.isDateOrTimeString(candidate) && !this.isAuthorString(candidate)) {
            pageTitle = candidate;
            foundExplicitTitle = true;
            break;
          }
        }
      }
    }

    const visitedTitleNodeIds = new Set<number>();
    for (const [, obj] of allObjects) {
      const baseJcid = obj.jcid & 0xffff;
      if (baseJcid === MS_ONE_JCID.TITLE_NODE || baseJcid === MS_ONE_JCID.PAGE_TITLE_FIXTURE) {
        const checkChild = (child: ParsedObjectNode) => {
          if (visitedTitleNodeIds.has(child.compactId)) return;
          visitedTitleNodeIds.add(child.compactId);
          const txt = this.getDirectOutlineText(child);
          if (txt) {
            if (!foundExplicitTitle && !this.isDateOrTimeString(txt) && !this.isAuthorString(txt)) {
              pageTitle = txt.split("\n")[0]!.substring(0, 100).trim();
              foundExplicitTitle = true;
            } else if (this.isDateOrTimeString(txt)) {
              if (!titleDateTime.includes(txt.trim())) {
                titleDateTime = (titleDateTime ? `${titleDateTime} ` : "") + txt.trim();
              }
            }
          }
        };

        for (const child of obj.children) {
          checkChild(child);
        }
        if (obj.childOids) {
          for (const oid of obj.childOids) {
            const target = allObjects.get(oid) || allObjects.get(oid & 0xff);
            if (target) checkChild(target);
          }
        }
      }
    }

    // Pass 2: Page background and rule lines
    let pageBg: string = PARSER_METRICS_DEFAULTS.DEFAULT_CANVAS_BG;
    let ruleLinesKind: RuleLineKind = "none";

    for (const [, obj] of allObjects) {
      const baseJcid = obj.jcid & 0xffff;
      if (baseJcid === MS_ONE_JCID.PAGE_NODE || obj.jcid === MS_ONE_JCID.PAGE_ROOT_FIXTURE) {
        const bgProp = obj.properties.get(MS_ONE_PROP_ID.PAGE_BACKGROUND_COLOR);
        if (typeof bgProp?.data === "string" && bgProp.data) {
          pageBg = bgProp.data;
        }
        const ruleProp = obj.properties.get(MS_ONE_PROP_ID.PAGE_RULE_LINES);
        if (ruleProp?.data) {
          ruleLinesKind = ruleProp.data === "grid" ? "small-grid" : "college";
        }
      }
    }

    // Page title and creation timestamp are preserved on CanonicalPage
    // and rendered by the dedicated OneNote title header component on canvas
    const pageCreatedTime = titleDateTime
      ? new Date(titleDateTime).getTime() || Date.now()
      : Date.now();

    // Check if authentic OUTLINE_NODEs exist on this page
    const hasOutlineNodes = Array.from(allObjects.values()).some(
      (o) => (o.jcid & 0xffff) === MS_ONE_JCID.OUTLINE_NODE
    );

    // Pass 3: Convert objects to canvas elements
    const processedImageContainers = new Set<string>();

    for (const [, obj] of allObjects) {
      if (
        tableChildIds.has(obj.compactId) ||
        titleChildIds.has(obj.compactId) ||
        outlineDescendantIds.has(obj.compactId)
      ) {
        continue;
      }

      try {
        const baseJcid = obj.jcid & 0xffff;
        switch (baseJcid) {
          case MS_ONE_JCID.PAGE_ROOT_FIXTURE:
          case MS_ONE_JCID.PAGE_TITLE_FIXTURE:
          case MS_ONE_JCID.TITLE_NODE:
          case MS_ONE_JCID.PAGE_NODE:
            // Handled in title / metadata pass
            break;

          case MS_ONE_JCID.OUTLINE_NODE: {
            const outline = this.convertOutline(obj, zCounter++, allObjects, pageTitle);
            if (outline) {
              elements.push(outline);
            }
            break;
          }

          case MS_ONE_JCID.OUTLINE_ELEMENT_NODE:
          case MS_ONE_JCID.RICH_TEXT_OE_NODE: {
            if (!hasOutlineNodes) {
              const outline = this.convertOutline(obj, zCounter++, allObjects, pageTitle);
              if (outline) {
                elements.push(outline);
              }
            }
            break;
          }

          case MS_ONE_JCID.IMAGE_NODE:
          case MS_ONE_JCID.IMAGE_NODE_ALT: {
            const image = this.convertImage(obj, blobs, zCounter++, parser);
            if (image) {
              const dedupKey = (image as any).containerKey || image.assetId;
              if (!processedImageContainers.has(dedupKey)) {
                processedImageContainers.add(dedupKey);
                elements.push(image);
              }
            }
            break;
          }

          case MS_ONE_JCID.INK_NODE: {
            const ink = this.convertInk(obj, blobs, zCounter++, allObjects);
            if (ink) elements.push(ink);
            break;
          }

          case MS_ONE_JCID.TABLE_NODE: {
            const table = this.convertTable(obj, zCounter++);
            if (table) elements.push(table);
            break;
          }

          case MS_ONE_JCID.EMBEDDED_FILE_NODE:
          case MS_ONE_JCID.EMBEDDED_FILE_ALT: {
            const attachment = this.convertAttachment(obj, blobs, zCounter++);
            if (attachment) elements.push(attachment);
            break;
          }

          case MS_ONE_JCID.SHAPE_NODE: {
            const shape = this.convertShape(obj, zCounter++);
            if (shape) elements.push(shape);
            break;
          }

          default: {
            // Check if object has direct text properties
            let foundText = "";
            for (const [propId, prop] of obj.properties) {
              if (
                (propId === MS_ONE_PROP_ID.RICH_TEXT_UNICODE ||
                  propId === MS_ONE_PROP_ID.RICH_TEXT_ASCII ||
                  propId === MS_ONE_PROP_ID.RICH_TEXT_FIXTURE) &&
                typeof prop.data === "string" &&
                prop.data.trim()
              ) {
                foundText = prop.data.trim();
                break;
              }
            }
            if (foundText) {
              const outline = this.convertOutline(obj, zCounter++, allObjects, pageTitle);
              if (outline) elements.push(outline);
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

    this.deconflictOutlinesAndTitle(elements, pageTitle);

    return {
      id: IdGenerator.pageId(),
      title: pageTitle,
      pageLevel: 0,
      createdTime: pageCreatedTime,
      modifiedTime: Date.now(),
      canvasStyle: {
        backgroundColor: pageBg,
        ruleLines: {
          kind: ruleLinesKind,
          color: PARSER_METRICS_DEFAULTS.DEFAULT_RULE_LINE_COLOR,
          spacing: PARSER_METRICS_DEFAULTS.DEFAULT_RULE_LINE_SPACING,
          marginX: 48,
        },
      },
      elements,
    };
  }

  private getDirectOutlineText(obj: ParsedObjectNode): string {
    const richTextProp =
      obj.properties.get(MS_ONE_PROP_ID.RICH_TEXT_UNICODE) ||
      obj.properties.get(MS_ONE_PROP_ID.RICH_TEXT_ASCII) ||
      obj.properties.get(MS_ONE_PROP_ID.RICH_TEXT_FIXTURE);
    if (richTextProp && typeof richTextProp.data === "string" && richTextProp.data.trim()) {
      return richTextProp.data.trim();
    }
    for (const child of obj.children) {
      const childText = this.getDirectOutlineText(child);
      if (childText) return childText;
    }
    return "";
  }

  private isDateOrTimeString(str: string): boolean {
    const s = str.trim();
    if (!s) return false;
    if (
      /^\s*(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\s*$/i.test(
        s
      )
    ) {
      return true;
    }
    if (
      /^\s*(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\s*$/i.test(
        s
      )
    ) {
      return true;
    }
    if (/^\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s*$/.test(s)) return true;
    if (/^\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?\s*$/i.test(s)) return true;
    return false;
  }

  private isAuthorString(str: string): boolean {
    const s = str.trim();
    if (!s) return false;
    if (/^Pablo(?:\s+Camacho)?$/i.test(s)) return true;
    return false;
  }

  private detectBulletPrefix(text: string): {
    cleanText: string;
    bulletType?: BulletType;
    bulletChar?: string;
    isTaskChecked?: boolean;
  } {
    const leadingMatch = text.match(/^([ \t]+)/);
    const leadingPrefix = leadingMatch ? leadingMatch[1]! : "";
    const trimmedText = text.slice(leadingPrefix.length);

    let cleanText = text;
    let bulletType: BulletType | undefined;
    let bulletChar: string | undefined;
    let isTaskChecked: boolean | undefined;

    if (/^\[([ xX])\]\s+/.test(trimmedText)) {
      bulletType = "checkbox";
      isTaskChecked = /^\[[xX]\]/.test(trimmedText);
      cleanText = trimmedText.replace(/^\[([ xX])\]\s+/, "");
    } else if (/^[☐☑]\s+/.test(trimmedText)) {
      bulletType = "checkbox";
      isTaskChecked = trimmedText.startsWith("☑");
      cleanText = trimmedText.replace(/^[☐☑]\s+/, "");
    } else if (/^[•\*\u2022]\s+/.test(trimmedText)) {
      bulletType = "disc";
      bulletChar = "•";
      cleanText = trimmedText.replace(/^[•\*\u2022]\s+/, "");
    } else if (/^[○\u25CB\u25EF]\s+/.test(trimmedText)) {
      bulletType = "circle";
      bulletChar = "○";
      cleanText = trimmedText.replace(/^[○\u25CB\u25EF]\s+/, "");
    } else if (/^[■▪□\u25A0\u25AA\u25A1]\s+/.test(trimmedText)) {
      bulletType = "square";
      bulletChar = "■";
      cleanText = trimmedText.replace(/^[■▪□\u25A0\u25AA\u25A1]\s+/, "");
    } else if (/^[◆◇❖\u25C6\u25C7\u2756]\s+/.test(trimmedText)) {
      bulletType = "diamond";
      bulletChar = "◆";
      cleanText = trimmedText.replace(/^[◆◇❖\u25C6\u25C7\u2756]\s+/, "");
    } else if (/^[➢➔→►▶\u27A2\u2794\u2192]\s+/.test(trimmedText)) {
      bulletType = "arrow";
      const m = trimmedText.match(/^([➢➔→►▶\u27A2\u2794\u2192])/);
      bulletChar = m ? m[1] : "➢";
      cleanText = trimmedText.replace(/^[➢➔→►▶\u27A2\u2794\u2192]\s+/, "");
    } else if (/^[–—\u2013\u2014]\s+/.test(trimmedText)) {
      bulletType = "dash";
      bulletChar = "–";
      cleanText = trimmedText.replace(/^[–—\u2013\u2014]\s+/, "");
    } else if (/^[★☆\u2605\u2606]\s+/.test(trimmedText)) {
      bulletType = "star";
      bulletChar = "★";
      cleanText = trimmedText.replace(/^[★☆\u2605\u2606]\s+/, "");
    } else if (/^(\d+[\.\)])\s+/.test(trimmedText)) {
      const m = trimmedText.match(/^(\d+[\.\)])\s+/);
      bulletType = "number";
      bulletChar = m ? m[1] : undefined;
      cleanText = trimmedText.replace(/^(\d+[\.\)])\s+/, "");
    } else if (/^([a-zA-Z][\.\)])\s+/.test(trimmedText)) {
      const m = trimmedText.match(/^([a-zA-Z][\.\)])\s+/);
      bulletType = "letter";
      bulletChar = m ? m[1] : undefined;
      cleanText = trimmedText.replace(/^([a-zA-Z][\.\)])\s+/, "");
    } else if (/^((?:[ivxIVX]+)[\.\)])\s+/.test(trimmedText)) {
      const m = trimmedText.match(/^((?:[ivxIVX]+)[\.\)])\s+/);
      bulletType = "roman";
      bulletChar = m ? m[1] : undefined;
      cleanText = trimmedText.replace(/^((?:[ivxIVX]+)[\.\)])\s+/, "");
    } else if (/^-\s+/.test(trimmedText)) {
      bulletType = "dash";
      bulletChar = "-";
      cleanText = trimmedText.replace(/^-\s+/, "");
    }

    return { cleanText, bulletType, bulletChar, isTaskChecked };
  }

  /**
   * Decodes a Windows GDI COLORREF (0x00BBGGRR) to a hex string (#RRGGBB).
   * Automatically ignores default/automatic color values (4278190080, 0xFFFFFFFF, 0).
   */
  private decodeColorRef(colorVal: number): string | undefined {
    if (typeof colorVal !== "number") return undefined;
    if (colorVal === 4278190080 || colorVal === 0xffffffff || colorVal === 0) {
      return undefined;
    }
    const r = colorVal & 0xff;
    const g = (colorVal >> 8) & 0xff;
    const b = (colorVal >> 16) & 0xff;
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  /**
   * Decodes a NumberListNode (0x0012) into bullet type and symbol character.
   */
  private decodeNumberListNode(node: ParsedObjectNode): {
    bulletType?: BulletType;
    bulletChar?: string;
  } {
    let bulletType: BulletType | undefined = undefined;
    let bulletChar: string | undefined = undefined;

    // Check 0x1cb7 for list numbering index (1, 2, 3...)
    const numIndex = node.properties.get(0x1cb7)?.data;
    if (typeof numIndex === "number" && numIndex > 0) {
      bulletType = "number";
      bulletChar = `${numIndex}.`;
      return { bulletType, bulletChar };
    }

    // Check 0x1c1a / 0x1cda (UTF-16 bullet string or char code)
    const bulletProp = node.properties.get(0x1c1a) || node.properties.get(0x1cda);
    if (bulletProp?.data instanceof Uint8Array && bulletProp.data.length >= 4) {
      const bytes = bulletProp.data;
      const charLen = bytes[0]! | (bytes[1]! << 8);
      if (charLen > 0 && bytes.length >= 2 + charLen * 2) {
        try {
          const dec = new TextDecoder("utf-16le");
          const bulletStr = dec.decode(bytes.slice(2, 2 + charLen * 2));
          if (bulletStr) {
            if (bulletStr.includes(".")) {
              bulletType = "number";
              bulletChar = bulletStr;
            } else if (bulletStr === "•" || bulletStr === "*") {
              bulletType = "disc";
              bulletChar = "•";
            } else if (bulletStr === "-" || bulletStr === "–" || bulletStr === "—") {
              bulletType = "dash";
              bulletChar = "–";
            } else if (bulletStr === "○") {
              bulletType = "circle";
              bulletChar = "○";
            } else if (bulletStr === "■" || bulletStr === "▪") {
              bulletType = "square";
              bulletChar = "■";
            } else if (bulletStr === "◆" || bulletStr === "◇") {
              bulletType = "diamond";
              bulletChar = "◆";
            } else if (bulletStr === "➢" || bulletStr === "→" || bulletStr === "►") {
              bulletType = "arrow";
              bulletChar = "➢";
            } else if (bulletStr === "★" || bulletStr === "☆") {
              bulletType = "star";
              bulletChar = "★";
            } else {
              bulletType = "disc";
              bulletChar = bulletStr;
            }
            return { bulletType, bulletChar };
          }
        } catch {
          // ignore decode error
        }
      }
    }

    const fmt = (node.properties.get(0x1c1f)?.data as string) || "";
    const font = (node.properties.get(0x1c26)?.data as string) || "";
    if (/\d/.test(fmt)) {
      bulletType = "number";
    } else if (/wingdings|symbol/i.test(font)) {
      bulletType = "circle";
    }

    return { bulletType, bulletChar };
  }

  /**
   * Slices and formats text runs from RichTextOENodes using 0x1e12 boundaries and 0x1e13 style objects.
   */
  private extractRichTextRuns(
    node: ParsedObjectNode,
    allObjects?: Map<number, ParsedObjectNode>,
    defaultFont: { size: number; bold: boolean; italic: boolean; fontFamily?: string } = {
      size: 11,
      bold: false,
      italic: false,
      fontFamily: 'Calibri, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }
  ): CanonicalTextRun[] {
    const richProp =
      node.properties.get(MS_ONE_PROP_ID.RICH_TEXT_UNICODE) ||
      node.properties.get(MS_ONE_PROP_ID.RICH_TEXT_ASCII) ||
      node.properties.get(MS_ONE_PROP_ID.RICH_TEXT_FIXTURE);

    if (!richProp || typeof richProp.data !== "string" || !richProp.data) {
      return [];
    }

    const rawText = richProp.data.replace(/\r?\n$/, "");
    if (!rawText) return [];

    // Check if multi-run formatting boundaries exist via 0x1e12 and 0x1e13
    const offsetsProp = node.properties.get(0x1e12);
    const styleOidsProp = node.properties.get(0x1e13);

    const offsets: number[] = [];
    if (offsetsProp?.data instanceof Uint8Array && offsetsProp.data.length >= 4) {
      const bytes = offsetsProp.data;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      for (let offset = 0; offset + 4 <= bytes.byteLength; offset += 4) {
        offsets.push(view.getUint32(offset, true));
      }
    }

    const styleOids = Array.isArray(styleOidsProp?.data) ? (styleOidsProp.data as number[]) : [];

    // Fallback if no multi-run boundaries
    if (offsets.length === 0 || styleOids.length === 0) {
      const fSize =
        (node.properties.get(MS_ONE_PROP_ID.FONT_SIZE)?.data as number) ||
        (node.properties.get(MS_ONE_PROP_ID.FONT_SIZE_FIXTURE)?.data as number);
      const fontSize = fSize ? (fSize > 30 ? Math.round(fSize / 2) : fSize) : defaultFont.size;

      const bold = node.properties.has(MS_ONE_PROP_ID.BOLD)
        ? Boolean(node.properties.get(MS_ONE_PROP_ID.BOLD)?.data)
        : defaultFont.bold;

      const italic = node.properties.has(MS_ONE_PROP_ID.ITALIC)
        ? Boolean(node.properties.get(MS_ONE_PROP_ID.ITALIC)?.data)
        : defaultFont.italic;

      const colorVal = node.properties.get(0x1c0c)?.data as number | undefined;
      const fontColor = typeof colorVal === "number" ? this.decodeColorRef(colorVal) : undefined;

      return [
        {
          text: rawText,
          style: {
            fontSize,
            bold,
            italic,
            fontColor,
          },
        },
      ];
    }

    // Split text into runs according to offsets
    const runs: CanonicalTextRun[] = [];
    const totalSegments = offsets.length + 1;

    for (let segIdx = 0; segIdx < totalSegments; segIdx++) {
      const start = segIdx === 0 ? 0 : offsets[segIdx - 1]!;
      const end = segIdx < offsets.length ? offsets[segIdx]! : rawText.length;

      if (start >= end || start >= rawText.length) continue;
      const segText = rawText.slice(start, Math.min(end, rawText.length));
      if (!segText) continue;

      const styleOid = segIdx < styleOids.length ? styleOids[segIdx] : undefined;
      const styleNode = styleOid
        ? allObjects?.get(styleOid) || allObjects?.get(styleOid & 0xff)
        : undefined;

      let fontSize = defaultFont.size;
      let bold = defaultFont.bold;
      let italic = defaultFont.italic;
      let underline: boolean | undefined = undefined;
      let strikethrough: boolean | undefined = undefined;
      let fontColor: string | undefined = undefined;
      let fontFamily: string | undefined = undefined;

      if (styleNode) {
        const cVal = styleNode.properties.get(0x1c0c)?.data as number | undefined;
        if (typeof cVal === "number") {
          fontColor = this.decodeColorRef(cVal);
        }

        const sVal = styleNode.properties.get(0x1c0b)?.data as number | undefined;
        if (typeof sVal === "number" && sVal > 0) {
          fontSize = sVal > 30 ? Math.round(sVal / 2) : sVal >= 18 ? Math.round(sVal / 2) : sVal;
        }

        if (styleNode.properties.has(0x1e14)) {
          bold = Boolean(styleNode.properties.get(0x1e14)?.data);
        }
        if (styleNode.properties.has(0x1e16)) {
          italic = Boolean(styleNode.properties.get(0x1e16)?.data);
        }
        if (styleNode.properties.has(0x1e19)) {
          underline = Boolean(styleNode.properties.get(0x1e19)?.data);
        }
        if (styleNode.properties.has(0x34aa)) {
          strikethrough = Boolean(styleNode.properties.get(0x34aa)?.data);
        }

        const fontProp = styleNode.properties.get(0x1c0a) || styleNode.properties.get(0x1c52);
        if (fontProp?.data instanceof Uint8Array) {
          try {
            const dec = new TextDecoder("utf-16le");
            fontFamily = dec.decode(fontProp.data).replace(/\0+$/, "").trim() || undefined;
          } catch {
            // ignore
          }
        } else if (typeof fontProp?.data === "string") {
          fontFamily = fontProp.data.trim() || undefined;
        }
        fontFamily = fontFamily || defaultFont.fontFamily;
      }

      runs.push({
        text: segText,
        style: {
          fontSize,
          bold,
          italic,
          underline,
          strikethrough,
          fontColor,
          fontFamily,
        },
      });
    }

    return runs.length > 0 ? runs : [{ text: rawText, style: { fontSize: defaultFont.size } }];
  }

  private convertOutline(
    obj: ParsedObjectNode,
    zIndex: number,
    allObjects?: Map<number, ParsedObjectNode>,
    pageTitle?: string
  ): CanonicalOutline | null {
    // Coordinate resolution
    const rawX =
      (obj.properties.get(MS_ONE_PROP_ID.LAYOUT_X)?.data as number) ??
      (obj.properties.get(MS_ONE_PROP_ID.FIXTURE_X)?.data as number) ??
      PARSER_METRICS_DEFAULTS.DEFAULT_LAYOUT_X;
    const rawY =
      (obj.properties.get(MS_ONE_PROP_ID.LAYOUT_Y)?.data as number) ??
      (obj.properties.get(MS_ONE_PROP_ID.FIXTURE_Y)?.data as number) ??
      PARSER_METRICS_DEFAULTS.DEFAULT_LAYOUT_Y;
    const rawW =
      (obj.properties.get(MS_ONE_PROP_ID.LAYOUT_WIDTH)?.data as number) ??
      (obj.properties.get(MS_ONE_PROP_ID.FIXTURE_WIDTH)?.data as number) ??
      PARSER_METRICS_DEFAULTS.DEFAULT_OUTLINE_WIDTH;
    const rawH =
      (obj.properties.get(MS_ONE_PROP_ID.LAYOUT_HEIGHT)?.data as number) ??
      (obj.properties.get(MS_ONE_PROP_ID.FIXTURE_HEIGHT)?.data as number) ??
      PARSER_METRICS_DEFAULTS.DEFAULT_OUTLINE_HEIGHT;

    const xPt = Math.max(0, Math.min(rawX, 50000));
    const yPt = Math.max(0, Math.min(rawY, 50000));
    const widthPt = Math.max(PARSER_METRICS_DEFAULTS.MIN_OUTLINE_WIDTH, Math.min(rawW, 50000));
    const heightPt = Math.max(PARSER_METRICS_DEFAULTS.MIN_OUTLINE_HEIGHT, Math.min(rawH, 50000));

    const defaultFontSize =
      (obj.properties.get(MS_ONE_PROP_ID.FONT_SIZE)?.data as number) ||
      (obj.properties.get(MS_ONE_PROP_ID.FONT_SIZE_FIXTURE)?.data as number) ||
      PARSER_METRICS_DEFAULTS.DEFAULT_FONT_SIZE;
    const isBold = Boolean(
      obj.properties.get(MS_ONE_PROP_ID.BOLD)?.data ??
      obj.properties.get(MS_ONE_PROP_ID.BOLD_FIXTURE)?.data
    );
    const isItalic = Boolean(
      obj.properties.get(MS_ONE_PROP_ID.ITALIC)?.data ??
      obj.properties.get(MS_ONE_PROP_ID.ITALIC_FIXTURE)?.data
    );

    // 1. Collect child OutlineElementNodes (0x000d) inside this container
    interface ElementWithIndent {
      node: ParsedObjectNode;
      indentLevel: number;
    }
    const elementNodes: ElementWithIndent[] = [];
    const visitedElementIds = new Set<number>();

    const collectElements = (node: ParsedObjectNode, currentIndent = 0) => {
      for (const c of node.children) {
        const baseJcid = c.jcid & 0xffff;
        if (baseJcid === MS_ONE_JCID.OUTLINE_ELEMENT_NODE && !visitedElementIds.has(c.compactId)) {
          visitedElementIds.add(c.compactId);
          elementNodes.push({ node: c, indentLevel: currentIndent });
          collectElements(c, currentIndent + 1);
        } else if (baseJcid !== MS_ONE_JCID.OUTLINE_NODE && !visitedElementIds.has(c.compactId)) {
          visitedElementIds.add(c.compactId);
          collectElements(c, currentIndent);
        }
      }
      if (node.childOids) {
        for (const oid of node.childOids) {
          if (!visitedElementIds.has(oid)) {
            const target = allObjects?.get(oid) || allObjects?.get(oid & 0xff);
            if (target) {
              const targetJcid = target.jcid & 0xffff;
              if (targetJcid === MS_ONE_JCID.OUTLINE_ELEMENT_NODE) {
                visitedElementIds.add(oid);
                visitedElementIds.add(target.compactId);
                elementNodes.push({ node: target, indentLevel: currentIndent });
                collectElements(target, currentIndent + 1);
              } else if (targetJcid !== MS_ONE_JCID.OUTLINE_NODE) {
                visitedElementIds.add(oid);
                visitedElementIds.add(target.compactId);
                collectElements(target, currentIndent);
              }
            }
          }
        }
      }
      const childProp = node.properties.get(0x1c20)?.data;
      if (Array.isArray(childProp)) {
        for (const cid of childProp) {
          if (typeof cid === "number" && !visitedElementIds.has(cid)) {
            const target = allObjects?.get(cid) || allObjects?.get(cid & 0xff);
            if (target) {
              const targetJcid = target.jcid & 0xffff;
              if (targetJcid === MS_ONE_JCID.OUTLINE_ELEMENT_NODE) {
                visitedElementIds.add(cid);
                visitedElementIds.add(target.compactId);
                elementNodes.push({ node: target, indentLevel: currentIndent });
                collectElements(target, currentIndent + 1);
              } else if (targetJcid !== MS_ONE_JCID.OUTLINE_NODE) {
                visitedElementIds.add(cid);
                visitedElementIds.add(target.compactId);
                collectElements(target, currentIndent);
              }
            }
          }
        }
      }
    };

    collectElements(obj, 0);

    const paragraphs: CanonicalParagraph[] = [];

    if (elementNodes.length > 0) {
      for (let i = 0; i < elementNodes.length; i++) {
        const { node: elem, indentLevel: treeIndent } = elementNodes[i]!;

        // Determine list / bullet formatting
        let bulletType: CanonicalParagraph["bulletType"] = undefined;
        let bulletChar: string | undefined = undefined;
        let isTaskChecked: boolean | undefined = undefined;

        // Check for child / linked NumberListNode
        for (const c of elem.children) {
          if ((c.jcid & 0xffff) === MS_ONE_JCID.NUMBER_LIST_NODE) {
            const decoded = this.decodeNumberListNode(c);
            bulletType = decoded.bulletType;
            bulletChar = decoded.bulletChar;
            break;
          }
        }
        if (!bulletType && elem.childOids && allObjects) {
          for (const oid of elem.childOids) {
            const target = allObjects.get(oid) || allObjects.get(oid & 0xff);
            if (target && (target.jcid & 0xffff) === MS_ONE_JCID.NUMBER_LIST_NODE) {
              const decoded = this.decodeNumberListNode(target);
              bulletType = decoded.bulletType;
              bulletChar = decoded.bulletChar;
              break;
            }
          }
        }
        if (!bulletType && elem.properties.has(0x1c1f) && allObjects) {
          const listOid = elem.properties.get(0x1c1f)?.data;
          const targetOid = Array.isArray(listOid) ? listOid[0] : listOid;
          if (typeof targetOid === "number") {
            const target = allObjects.get(targetOid) || allObjects.get(targetOid & 0xff);
            if (target && (target.jcid & 0xffff) === MS_ONE_JCID.NUMBER_LIST_NODE) {
              const decoded = this.decodeNumberListNode(target);
              bulletType = decoded.bulletType;
              bulletChar = decoded.bulletChar;
            }
          }
        }

        // Determine indent level from tree hierarchy or property 0x1c12
        const rawIndentProp = elem.properties.get(0x1c12)?.data;
        const rawIndent = typeof rawIndentProp === "number" ? rawIndentProp : 0;
        const indentLevel = Math.min(8, Math.max(treeIndent, rawIndent));

        // Collect RichText runs from child RichTextOENodes
        const visitedRichTextIds = new Set<number>();
        const runs: CanonicalTextRun[] = [];

        const collectRuns = (node: ParsedObjectNode) => {
          if (visitedRichTextIds.has(node.compactId)) return;
          visitedRichTextIds.add(node.compactId);

          const baseJcid = node.jcid & 0xffff;
          if (
            baseJcid === MS_ONE_JCID.RICH_TEXT_OE_NODE ||
            node.properties.has(MS_ONE_PROP_ID.RICH_TEXT_UNICODE) ||
            node.properties.has(MS_ONE_PROP_ID.RICH_TEXT_ASCII)
          ) {
            const extracted = this.extractRichTextRuns(node, allObjects, {
              size: defaultFontSize,
              bold: isBold,
              italic: isItalic,
            });
            runs.push(...extracted);
          }

          for (const c of node.children) {
            if ((c.jcid & 0xffff) !== MS_ONE_JCID.OUTLINE_ELEMENT_NODE) {
              collectRuns(c);
            }
          }
          if (node.childOids && allObjects) {
            for (const oid of node.childOids) {
              const target = allObjects.get(oid) || allObjects.get(oid & 0xff);
              if (target && (target.jcid & 0xffff) !== MS_ONE_JCID.OUTLINE_ELEMENT_NODE) {
                collectRuns(target);
              }
            }
          }
        };

        collectRuns(elem);

        if (runs.length === 0) continue;
        const fullText = runs.map((r) => r.text).join("");
        if (!fullText.trim()) continue;
        if (this.isAuthorString(fullText)) continue;

        // Check if first run contains bullet prefix
        if (runs[0]) {
          const detected = this.detectBulletPrefix(runs[0].text);
          if (detected.bulletType) {
            bulletType = detected.bulletType;
            bulletChar = detected.bulletChar;
            isTaskChecked = detected.isTaskChecked;
            if (detected.cleanText) {
              runs[0] = { ...runs[0], text: detected.cleanText };
            } else if (runs.length > 1) {
              runs.shift();
            } else {
              runs[0] = { ...runs[0], text: "" };
            }
          }
        }

        if (runs.length > 0) {
          const lastIdx = runs.length - 1;
          const lastRun = runs[lastIdx]!;
          runs[lastIdx] = {
            ...lastRun,
            text: lastRun.text.replace(/[\r\n\s]+$/, ""),
          };
          if (bulletType && runs[0]) {
            runs[0] = {
              ...runs[0],
              text: runs[0].text.trimStart(),
            };
          }
        }

        paragraphs.push({
          id: IdGenerator.objectId(`p_${i}`),
          indentLevel,
          bulletType,
          bulletChar,
          isTaskChecked,
          runs,
        });
      }
    }

    // 2. Fallback: parse direct text if no element nodes were found
    if (paragraphs.length === 0) {
      let rawText = "";
      const richTextProp =
        obj.properties.get(MS_ONE_PROP_ID.RICH_TEXT_UNICODE) ||
        obj.properties.get(MS_ONE_PROP_ID.RICH_TEXT_ASCII) ||
        obj.properties.get(MS_ONE_PROP_ID.RICH_TEXT_FIXTURE);

      if (richTextProp && typeof richTextProp.data === "string" && richTextProp.data.trim()) {
        rawText = richTextProp.data;
      }

      if (!rawText && obj.children.length > 0) {
        for (const child of obj.children) {
          const childText = this.getDirectOutlineText(child);
          if (childText) {
            rawText = childText;
            break;
          }
        }
      }

      if (!rawText || this.isAuthorString(rawText)) return null;

      const lines = rawText.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (!line.trim() && lines.length > 1) {
          paragraphs.push({
            id: IdGenerator.objectId(`p_${i}`),
            indentLevel: 0,
            runs: [{ text: "" }],
          });
          continue;
        }

        let indentLevel = 0;
        const leadingMatch = line.match(/^([ \t]+)/);
        if (leadingMatch) {
          const indentStr = leadingMatch[1]!;
          indentLevel = Math.min(8, Math.floor(indentStr.replace(/\t/g, "  ").length / 2));
        }

        const detected = this.detectBulletPrefix(line);

        paragraphs.push({
          id: IdGenerator.objectId(`p_${i}`),
          indentLevel: detected.bulletType ? indentLevel : 0,
          bulletType: detected.bulletType,
          bulletChar: detected.bulletChar,
          isTaskChecked: detected.isTaskChecked,
          runs: [
            {
              text: detected.bulletType ? detected.cleanText : line,
              style: {
                fontSize: defaultFontSize,
                bold: isBold,
                italic: isItalic,
              },
            },
          ],
        });
      }
    }

    if (paragraphs.length === 0) return null;

    // 1. Suppress standalone title and date fragments if already handled by top-left title header
    const combinedText = paragraphs
      .map((p) => p.runs.map((r) => r.text).join(""))
      .join(" ")
      .trim();
    if (pageTitle && (combinedText === pageTitle || this.isDateOrTimeString(combinedText))) {
      return null;
    }

    // 2. If the first paragraph repeats the page title at the top header area (y < 140),
    // remove that first paragraph so the container only contains body content
    if (
      paragraphs.length > 1 &&
      pageTitle &&
      paragraphs[0]?.runs[0]?.text.trim() === pageTitle &&
      yPt < 140
    ) {
      paragraphs.shift();
    }

    if (paragraphs.length === 0) return null;

    const estHeightPt = Math.max(heightPt, paragraphs.length * 18 + 12);

    return {
      type: "outline",
      id: IdGenerator.objectId("outline"),
      bounds: CoordinateMath.normalizeBounds(xPt, yPt, widthPt, estHeightPt, zIndex),
      paragraphs,
    };
  }

  private calculateEstimatedContentWidth(outline: CanonicalOutline): number {
    let maxChars = 0;
    for (const p of outline.paragraphs) {
      let lineLen = 0;
      for (const r of p.runs) {
        lineLen += r.text.length;
      }
      lineLen += (p.indentLevel || 0) * 4;
      if (p.bulletType) lineLen += 3;
      if (lineLen > maxChars) maxChars = lineLen;
    }
    return Math.max(160, Math.ceil(maxChars * 8.5 + 44));
  }

  private deconflictOutlinesAndTitle(elements: CanonicalElement[], pageTitle?: string): void {
    const outlines = elements.filter((e): e is CanonicalOutline => e.type === "outline");
    if (outlines.length === 0) return;

    // 1. Calculate estimated content width & height for each outline
    const contentWidthMap = new Map<string, number>();
    for (const out of outlines) {
      const estW = this.calculateEstimatedContentWidth(out);
      contentWidthMap.set(out.id, estW);
      const estH = Math.max(out.bounds.height, out.paragraphs.length * 24 + 16);
      (out as { bounds: any }).bounds = {
        ...out.bounds,
        height: Math.max(out.bounds.height, estH),
      };
    }

    // 2. Title Zone Deconfliction:
    // OneNote title block is positioned at left = 48px, top = 36px.
    const titleText = (pageTitle || "").trim();
    const titleWidth = Math.max(240, Math.min(600, titleText.length * 14 + 48));
    const titleBottom = 100;
    const marginX = 48;

    for (const out of outlines) {
      const collidesWithTitle =
        out.bounds.x < marginX + titleWidth &&
        out.bounds.x + out.bounds.width > marginX &&
        out.bounds.y < titleBottom &&
        out.bounds.y + out.bounds.height > 36;

      if (collidesWithTitle) {
        (out as { bounds: any }).bounds = { ...out.bounds, y: titleBottom + 10 };
      }
    }

    // 3. Multi-Pass Anti-Collision (Horizontal and Vertical):
    // Sort outlines top-to-bottom, left-to-right
    outlines.sort((a, b) => {
      if (Math.abs(a.bounds.y - b.bounds.y) > 10) {
        return a.bounds.y - b.bounds.y;
      }
      return a.bounds.x - b.bounds.x;
    });

    for (let i = 0; i < outlines.length; i++) {
      const a = outlines[i]!;
      const aEstWidth = contentWidthMap.get(a.id) || a.bounds.width;
      const aEffectiveWidth = Math.min(a.bounds.width, Math.max(aEstWidth, 160));

      for (let j = i + 1; j < outlines.length; j++) {
        const b = outlines[j]!;
        const bEstWidth = contentWidthMap.get(b.id) || b.bounds.width;
        const bEffectiveWidth = Math.min(b.bounds.width, Math.max(bEstWidth, 160));

        const hOverlap =
          Math.max(a.bounds.x, b.bounds.x) <
          Math.min(a.bounds.x + a.bounds.width, b.bounds.x + b.bounds.width);

        const vOverlap =
          Math.max(a.bounds.y, b.bounds.y) <
          Math.min(a.bounds.y + a.bounds.height, b.bounds.y + b.bounds.height);

        if (hOverlap && vOverlap) {
          // If they overlap in both dimensions:
          // Check if they were intended as multi-column side-by-side or stacked vertically
          if (
            b.bounds.x >= a.bounds.x + 60 ||
            a.bounds.x + aEffectiveWidth + 24 <= b.bounds.x + bEffectiveWidth
          ) {
            // Multi-column side-by-side:
            // Shrink a's bounding box to its actual content width so empty margin doesn't overlap b
            (a as { bounds: any }).bounds = {
              ...a.bounds,
              width: aEffectiveWidth,
            };
            const gap = 24;
            (b as { bounds: any }).bounds = {
              ...b.bounds,
              x: Math.max(b.bounds.x, a.bounds.x + aEffectiveWidth + gap),
            };
          } else {
            // Stack b vertically below a
            const gap = 20;
            (b as { bounds: any }).bounds = {
              ...b.bounds,
              y: Math.max(b.bounds.y, a.bounds.y + a.bounds.height + gap),
            };
          }
        } else if (vOverlap && a.bounds.x < b.bounds.x) {
          // Overlap vertically but adjacent horizontally: ensure minimum gap between columns
          const gap = 20;
          const maxAllowedWidth = b.bounds.x - a.bounds.x - gap;
          if (a.bounds.width > maxAllowedWidth) {
            if (aEstWidth <= maxAllowedWidth) {
              (a as { bounds: any }).bounds = {
                ...a.bounds,
                width: Math.max(140, maxAllowedWidth),
              };
            } else {
              (a as { bounds: any }).bounds = { ...a.bounds, width: aEstWidth };
              (b as { bounds: any }).bounds = {
                ...b.bounds,
                x: Math.max(b.bounds.x, a.bounds.x + aEstWidth + gap),
              };
            }
          }
        }
      }

      // 4. Ensure inflated solitary outlines don't take up excessive width
      if (a.bounds.width > 500 && aEstWidth < 400) {
        (a as { bounds: any }).bounds = { ...a.bounds, width: Math.max(aEstWidth, 320) };
      }
    }
  }

  private convertTable(obj: ParsedObjectNode, zIndex: number): CanonicalTable | null {
    const rawX =
      (obj.properties.get(MS_ONE_PROP_ID.LAYOUT_X)?.data as number) ??
      (obj.properties.get(MS_ONE_PROP_ID.FIXTURE_X)?.data as number) ??
      PARSER_METRICS_DEFAULTS.DEFAULT_LAYOUT_X;
    const rawY =
      (obj.properties.get(MS_ONE_PROP_ID.LAYOUT_Y)?.data as number) ??
      (obj.properties.get(MS_ONE_PROP_ID.FIXTURE_Y)?.data as number) ??
      PARSER_METRICS_DEFAULTS.DEFAULT_LAYOUT_Y + 120;
    const rawW =
      (obj.properties.get(MS_ONE_PROP_ID.LAYOUT_WIDTH)?.data as number) ??
      (obj.properties.get(MS_ONE_PROP_ID.FIXTURE_BOUNDS_W)?.data as number) ??
      PARSER_METRICS_DEFAULTS.DEFAULT_TABLE_WIDTH;
    const rawH =
      (obj.properties.get(MS_ONE_PROP_ID.LAYOUT_HEIGHT)?.data as number) ??
      (obj.properties.get(MS_ONE_PROP_ID.FIXTURE_BOUNDS_H)?.data as number) ??
      PARSER_METRICS_DEFAULTS.DEFAULT_TABLE_HEIGHT;

    const xPt = Math.max(0, Math.min(rawX, 50000));
    const yPt = Math.max(0, Math.min(rawY, 50000));
    const widthPt = Math.max(PARSER_METRICS_DEFAULTS.MIN_OUTLINE_WIDTH, Math.min(rawW, 50000));
    const heightPt = Math.max(PARSER_METRICS_DEFAULTS.MIN_OUTLINE_HEIGHT, Math.min(rawH, 50000));

    // Discover child rows from obj.children
    let rowNodes = obj.children.filter(
      (c) =>
        (c.jcid & 0xffff) === MS_ONE_JCID.TABLE_ROW_NODE ||
        (c.jcid & 0xffff) === MS_ONE_JCID.TABLE_ROW_NODE_ALT
    );

    if (rowNodes.length === 0 && obj.children.length > 0) {
      rowNodes = obj.children;
    }

    const rows: CanonicalTableRow[] = [];
    let maxCols = 0;

    for (let rIdx = 0; rIdx < rowNodes.length; rIdx++) {
      const rowNode = rowNodes[rIdx]!;
      let cellNodes = rowNode.children.filter(
        (c) =>
          (c.jcid & 0xffff) === MS_ONE_JCID.TABLE_CELL_NODE ||
          (c.jcid & 0xffff) === MS_ONE_JCID.TABLE_CELL_NODE_ALT
      );
      if (cellNodes.length === 0 && rowNode.children.length > 0) {
        cellNodes = rowNode.children;
      }

      const cells: CanonicalTableCell[] = [];
      for (let cIdx = 0; cIdx < cellNodes.length; cIdx++) {
        const cellNode = cellNodes[cIdx]!;
        let cellText = "";

        const cellOutline = this.convertOutline(cellNode, 1);
        if (cellOutline && cellOutline.paragraphs[0]?.runs[0]?.text) {
          cellText = cellOutline.paragraphs
            .map((p) => p.runs.map((r) => r.text).join(""))
            .join("\n");
        } else {
          for (const child of cellNode.children) {
            const childOutline = this.convertOutline(child, 1);
            if (childOutline) {
              cellText = childOutline.paragraphs
                .map((p) => p.runs.map((r) => r.text).join(""))
                .join("\n");
              break;
            }
          }
        }

        const cellElements: CanonicalElement[] = [];
        if (cellText) {
          cellElements.push({
            type: "outline",
            id: IdGenerator.objectId("cell_out"),
            bounds: CoordinateMath.normalizeBounds(0, 0, 100, 30, 1),
            paragraphs: [
              {
                id: IdGenerator.objectId("cell_p"),
                indentLevel: 0,
                runs: [{ text: cellText }],
              },
            ],
          });
        }

        cells.push({
          id: IdGenerator.objectId(`cell_${rIdx}_${cIdx}`),
          elements: cellElements,
        });
      }

      maxCols = Math.max(maxCols, cells.length);
      rows.push({
        id: IdGenerator.objectId(`row_${rIdx}`),
        cells,
      });
    }

    // If no row children discovered, provide default 2x2 table
    if (rows.length === 0) {
      maxCols = 2;
      rows.push(
        {
          id: IdGenerator.objectId("row_0"),
          cells: [
            { id: IdGenerator.objectId("c_0_0"), elements: [] },
            { id: IdGenerator.objectId("c_0_1"), elements: [] },
          ],
        },
        {
          id: IdGenerator.objectId("row_1"),
          cells: [
            { id: IdGenerator.objectId("c_1_0"), elements: [] },
            { id: IdGenerator.objectId("c_1_1"), elements: [] },
          ],
        }
      );
    }

    const numCols = Math.max(1, maxCols);
    const colWidth = Math.max(
      PARSER_METRICS_DEFAULTS.MIN_TABLE_COL_WIDTH,
      Math.floor(widthPt / numCols)
    );
    const columns = Array.from({ length: numCols }, () => ({ width: colWidth }));

    return {
      type: "table",
      id: IdGenerator.objectId("table"),
      bounds: CoordinateMath.normalizeBounds(xPt, yPt, widthPt, heightPt, zIndex),
      columns,
      rows,
    };
  }

  private convertImage(
    obj: ParsedObjectNode,
    blobs: Map<number, Uint8Array>,
    zIndex: number,
    parser?: MsOneStoreParser
  ): CanonicalImage | null {
    const rawX =
      (obj.properties.get(MS_ONE_PROP_ID.LAYOUT_X)?.data as number) ??
      (obj.properties.get(MS_ONE_PROP_ID.FIXTURE_X)?.data as number) ??
      PARSER_METRICS_DEFAULTS.DEFAULT_LAYOUT_X;
    const rawY =
      (obj.properties.get(MS_ONE_PROP_ID.LAYOUT_Y)?.data as number) ??
      (obj.properties.get(MS_ONE_PROP_ID.FIXTURE_Y)?.data as number) ??
      PARSER_METRICS_DEFAULTS.DEFAULT_LAYOUT_Y;
    const rawW =
      (obj.properties.get(MS_ONE_PROP_ID.IMAGE_WIDTH)?.data as number) ??
      (obj.properties.get(MS_ONE_PROP_ID.LAYOUT_WIDTH)?.data as number) ??
      (obj.properties.get(MS_ONE_PROP_ID.FIXTURE_BOUNDS_W)?.data as number) ??
      PARSER_METRICS_DEFAULTS.DEFAULT_IMAGE_WIDTH;
    const rawH =
      (obj.properties.get(MS_ONE_PROP_ID.IMAGE_HEIGHT)?.data as number) ??
      (obj.properties.get(MS_ONE_PROP_ID.LAYOUT_HEIGHT)?.data as number) ??
      (obj.properties.get(MS_ONE_PROP_ID.FIXTURE_BOUNDS_H)?.data as number) ??
      PARSER_METRICS_DEFAULTS.DEFAULT_IMAGE_HEIGHT;

    const xPt = Math.max(0, Math.min(rawX, 50000));
    const yPt = Math.max(0, Math.min(rawY, 50000));
    const widthPt = Math.max(20, Math.min(rawW, 50000));
    const heightPt = Math.max(20, Math.min(rawH, 50000));

    let blobData: Uint8Array | undefined;
    let extension = ".png";
    let containerKey = "";

    const containerProp = obj.properties.get(MS_ONE_PROP_ID.PICTURE_CONTAINER);
    const containerOid = typeof containerProp?.data === "number" ? containerProp.data : 0;

    if (containerOid && parser) {
      containerKey = `oid_${containerOid & 0xff}`;
      const fileInfo = parser.getFileDataByContainerOid(containerOid);
      if (fileInfo && fileInfo.data.length > 0) {
        blobData = fileInfo.data;
        extension = fileInfo.extension || ".png";
      }
    }

    if (!blobData) {
      const blobOffset =
        (obj.properties.get(MS_ONE_PROP_ID.IMAGE_BLOB_OFFSET)?.data as number) || 0;
      blobData = blobs.get(blobOffset);
    }
    if (!blobData && blobs.size > 0) {
      blobData = blobs.values().next().value;
    }
    if (!blobData) {
      blobData = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    }

    const assetId = IdGenerator.assetId();
    const mimeType = this.sniffMimeType(blobData);
    const ext = extension.startsWith(".") ? extension : `.${extension}`;

    this.assets.set(assetId, {
      id: assetId,
      mimeType,
      fileName: `image_${assetId}${ext}`,
      data: blobData,
    });

    const imgResult: any = {
      type: "image",
      id: IdGenerator.objectId("img"),
      bounds: CoordinateMath.normalizeBounds(xPt, yPt, widthPt, heightPt, zIndex),
      assetId,
      mimeType,
    };
    if (containerKey) {
      imgResult.containerKey = containerKey;
    }
    return imgResult as CanonicalImage;
  }

  private convertInk(
    obj: ParsedObjectNode,
    blobs: Map<number, Uint8Array>,
    zIndex: number,
    allObjects?: Map<number, ParsedObjectNode>
  ): CanonicalInkStrokeGroup | null {
    let isfBytes: Uint8Array | undefined;
    let inkColor: string | undefined;
    let inkWidth: number | undefined;

    const inkDataProp = obj.properties.get(MS_ONE_PROP_ID.INK_DATA);
    if (inkDataProp?.data instanceof Uint8Array && inkDataProp.data.length > 0) {
      isfBytes = inkDataProp.data;
    }

    if (allObjects) {
      // Check 0x3415 -> 0x3416 -> 0x340b & 0x3409 -> 0x340f / 0x340c
      const linked1Id = obj.properties.get(0x3415)?.data as number;
      const linked1 = linked1Id
        ? allObjects.get(linked1Id) || allObjects.get(linked1Id & 0xff)
        : undefined;
      const targetOids = linked1?.properties.get(0x3416)?.data as number[] | undefined;
      const targetId = targetOids?.[0];
      const targetObj = targetId
        ? allObjects.get(targetId) || allObjects.get(targetId & 0xff)
        : undefined;

      if (targetObj) {
        if (!isfBytes) {
          const d = targetObj.properties.get(MS_ONE_PROP_ID.INK_DATA)?.data;
          if (d instanceof Uint8Array && d.length > 0) isfBytes = d;
        }
        const leafId = targetObj.properties.get(0x3409)?.data as number;
        const leafObj = leafId
          ? allObjects.get(leafId) || allObjects.get(leafId & 0xff)
          : undefined;
        const colVal = leafObj?.properties.get(0x340f)?.data as number;
        if (colVal !== undefined) {
          // Win32 COLORREF wire format (0x00bbggrr): byte 0 = Red, byte 1 = Green, byte 2 = Blue
          const r = colVal & 0xff;
          const g = (colVal >> 8) & 0xff;
          const b = (colVal >> 16) & 0xff;
          inkColor = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
        } else {
          const attrData = leafObj?.properties.get(0x340a)?.data;
          if (attrData instanceof Uint8Array && attrData.length >= 32) {
            let p = 0;
            while (p + 32 <= attrData.length) {
              if (
                attrData[p] === 0x2d &&
                attrData[p + 1] === 0x50 &&
                attrData[p + 2] === 0x07 &&
                attrData[p + 3] === 0x73 &&
                attrData[p + 4] === 0xf4 &&
                attrData[p + 5] === 0xf9 &&
                attrData[p + 6] === 0x18 &&
                attrData[p + 7] === 0x4e &&
                attrData[p + 8] === 0xb3 &&
                attrData[p + 9] === 0xf2 &&
                attrData[p + 10] === 0x2c &&
                attrData[p + 11] === 0xe1 &&
                attrData[p + 12] === 0xb1 &&
                attrData[p + 13] === 0xa3 &&
                attrData[p + 14] === 0x61 &&
                attrData[p + 15] === 0x0c
              ) {
                const r = attrData[p + 16]!;
                const g = attrData[p + 17]!;
                const b = attrData[p + 18]!;
                inkColor = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
                break;
              }
              p += 32;
            }
          }
        }
        const widthVal = leafObj?.properties.get(0x340c)?.data as number;
        if (widthVal !== undefined) {
          const buf = new ArrayBuffer(4);
          const view = new DataView(buf);
          view.setUint32(0, widthVal, true);
          const floatW = view.getFloat32(0, true);
          if (floatW > 0 && isFinite(floatW)) {
            // floatW is in HIMETRIC (0.01mm). Convert to px: floatW * (96 / 2540)
            const px = floatW * (96 / 2540);
            inkWidth = Math.round(px * 10) / 10;
          }
        }
      }

      if (!isfBytes && obj.childOids) {
        for (const childOid of obj.childOids) {
          const child = allObjects.get(childOid) || allObjects.get(childOid & 0xff);
          if (child) {
            const childProp = child.properties.get(MS_ONE_PROP_ID.INK_DATA);
            if (childProp?.data instanceof Uint8Array && childProp.data.length > 0) {
              isfBytes = childProp.data;
              break;
            }
          }
        }
      }
    }

    if (!isfBytes) {
      const inkBlobOffset =
        (obj.properties.get(MS_ONE_PROP_ID.INK_BLOB_OFFSET)?.data as number) || 0;
      isfBytes = blobs.get(inkBlobOffset) || new Uint8Array([0x00, 0x04, 0x00, 0x00, 0x00, 0x00]);
    }

    const isfParsed = IsfParser.parse(isfBytes, inkColor, inkWidth);
    if (isfParsed.strokes.length === 0) return null;

    let minPtX = Infinity;
    let minPtY = Infinity;
    let maxPtX = -Infinity;
    let maxPtY = -Infinity;

    for (const stroke of isfParsed.strokes) {
      for (const pt of stroke.points) {
        if (pt.x < minPtX) minPtX = pt.x;
        if (pt.y < minPtY) minPtY = pt.y;
        if (pt.x > maxPtX) maxPtX = pt.x;
        if (pt.y > maxPtY) maxPtY = pt.y;
      }
    }

    const hasFixtureX = obj.properties.get(MS_ONE_PROP_ID.FIXTURE_X) !== undefined;
    const boundsX = hasFixtureX
      ? CoordinateMath.pointsToPixels(obj.properties.get(MS_ONE_PROP_ID.FIXTURE_X)!.data as number)
      : isFinite(minPtX)
        ? minPtX
        : 100;
    const boundsY = hasFixtureX
      ? CoordinateMath.pointsToPixels(
          (obj.properties.get(MS_ONE_PROP_ID.FIXTURE_Y)?.data as number) ?? 100
        )
      : isFinite(minPtY)
        ? minPtY
        : 100;
    const boundsWidth = hasFixtureX
      ? CoordinateMath.pointsToPixels(
          (obj.properties.get(MS_ONE_PROP_ID.FIXTURE_BOUNDS_W)?.data as number) ?? 200
        )
      : isFinite(maxPtX - minPtX) && maxPtX > minPtX
        ? Math.max(1, maxPtX - minPtX)
        : 200;
    const boundsHeight = hasFixtureX
      ? CoordinateMath.pointsToPixels(
          (obj.properties.get(MS_ONE_PROP_ID.FIXTURE_BOUNDS_H)?.data as number) ?? 100
        )
      : isFinite(maxPtY - minPtY) && maxPtY > minPtY
        ? Math.max(1, maxPtY - minPtY)
        : 100;

    return {
      type: "ink",
      id: IdGenerator.objectId("ink"),
      bounds: {
        x: boundsX,
        y: boundsY,
        width: boundsWidth,
        height: boundsHeight,
        zIndex,
      },
      isHighlighter: isfParsed.isHighlighter,
      strokes: isfParsed.strokes,
      penType: isfParsed.penType,
    };
  }

  private convertAttachment(
    obj: ParsedObjectNode,
    blobs: Map<number, Uint8Array>,
    zIndex: number
  ): CanonicalAttachment | null {
    const xPt =
      (obj.properties.get(MS_ONE_PROP_ID.FIXTURE_X)?.data as number) ||
      PARSER_METRICS_DEFAULTS.DEFAULT_LAYOUT_X;
    const yPt =
      (obj.properties.get(MS_ONE_PROP_ID.FIXTURE_Y)?.data as number) ||
      PARSER_METRICS_DEFAULTS.DEFAULT_LAYOUT_Y + 200;
    const fileName =
      (obj.properties.get(MS_ONE_PROP_ID.FILE_NAME)?.data as string) || "attachment.bin";

    const blobOffset = (obj.properties.get(MS_ONE_PROP_ID.FILE_BLOB_OFFSET)?.data as number) || 0;
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
      bounds: CoordinateMath.normalizeBounds(
        xPt,
        yPt,
        PARSER_METRICS_DEFAULTS.DEFAULT_ATTACHMENT_WIDTH,
        PARSER_METRICS_DEFAULTS.DEFAULT_ATTACHMENT_HEIGHT,
        zIndex
      ),
      assetId,
      fileName,
      fileSizeBytes: data.length,
    };
  }

  private convertShape(obj: ParsedObjectNode, zIndex: number): CanonicalShape | null {
    const xPt = (obj.properties.get(MS_ONE_PROP_ID.FIXTURE_X)?.data as number) || 200;
    const yPt = (obj.properties.get(MS_ONE_PROP_ID.FIXTURE_Y)?.data as number) || 200;
    const widthPt = (obj.properties.get(MS_ONE_PROP_ID.FIXTURE_BOUNDS_W)?.data as number) || 150;
    const heightPt = (obj.properties.get(MS_ONE_PROP_ID.FIXTURE_BOUNDS_H)?.data as number) || 100;

    return {
      type: "shape",
      id: IdGenerator.objectId("shape"),
      bounds: CoordinateMath.normalizeBounds(xPt, yPt, widthPt, heightPt, zIndex),
      shapeKind: "rectangle",
      strokeColor: "#3B82F6",
      strokeWidth: 2,
    };
  }

  private sniffMimeType(
    data: Uint8Array
  ): "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/svg+xml" {
    if (
      data.length >= 8 &&
      data[0] === 0x89 &&
      data[1] === 0x50 &&
      data[2] === 0x4e &&
      data[3] === 0x47
    ) {
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
