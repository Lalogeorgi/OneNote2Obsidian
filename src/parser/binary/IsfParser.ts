import { CanonicalInkPoint, CanonicalStroke } from "../../model/CanonicalElements";
import { IdGenerator } from "../../model/Ids";
import { BinaryReader } from "./BinaryReader";

export interface ParsedIsfData {
  readonly isHighlighter: boolean;
  readonly strokes: CanonicalStroke[];
  readonly color: string;
  readonly strokeWidth: number;
}

export class IsfParser {
  /**
   * Parse Microsoft Ink Serialized Format (ISF) payload into vector strokes.
   */
  public static parse(data: Uint8Array): ParsedIsfData {
    if (data.length < 4) {
      return {
        isHighlighter: false,
        strokes: [],
        color: "#000000",
        strokeWidth: 2,
      };
    }

    const reader = new BinaryReader(data);
    const strokes: CanonicalStroke[] = [];
    let isHighlighter = false;
    let defaultColor = "#000000";
    let defaultWidth = 2;

    try {
      // Check for raw point packet stream vs ISF tag blocks
      while (reader.hasBytes(4)) {
        const tag = reader.readUint8();

        // 0x00 / 0x01: Drawing Attributes Block
        if (tag === 0x00 || tag === 0x01) {
          const blockLen = reader.hasBytes(1) ? reader.readUint8() : 0;
          if (blockLen > 0 && reader.hasBytes(blockLen)) {
            const attrReader = reader.slice(reader.position, blockLen);
            reader.position += blockLen;

            if (attrReader.hasBytes(4)) {
              // BGR color
              const b = attrReader.readUint8();
              const g = attrReader.readUint8();
              const r = attrReader.readUint8();
              const flags = attrReader.hasBytes(1) ? attrReader.readUint8() : 0;

              defaultColor = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
              if ((flags & 0x01) !== 0 || flags === 0x02) {
                isHighlighter = true;
                defaultWidth = 18;
              }
            }
          }
        } else if (tag === 0x08 || tag === 0x0a) {
          // Stroke Packet List
          const count = reader.readUint16();
          const points: CanonicalInkPoint[] = [];

          let lastX = 0;
          let lastY = 0;

          for (let p = 0; p < count; p++) {
            if (!reader.hasBytes(4)) break;

            // 16-bit coordinates (half-points / HIMETRIC)
            const rawX = reader.readInt16();
            const rawY = reader.readInt16();

            // Delta or absolute coordinate decoding
            const x = (tag === 0x08 ? rawX : lastX + rawX) / 10;
            const y = (tag === 0x08 ? rawY : lastY + rawY) / 10;

            lastX = x * 10;
            lastY = y * 10;

            let pressure = 0.5;
            if (reader.hasBytes(1)) {
              pressure = reader.readUint8() / 255;
            }

            points.push({ x, y, pressure });
          }

          if (points.length > 0) {
            strokes.push({
              id: IdGenerator.objectId("stroke"),
              color: defaultColor,
              width: defaultWidth,
              points,
            });
          }
        } else {
          // Advance reader safely
          reader.position += 1;
        }
      }
    } catch {
      // Malformed input protection: return parsed strokes so far
    }

    return {
      isHighlighter,
      strokes,
      color: defaultColor,
      strokeWidth: defaultWidth,
    };
  }
}
