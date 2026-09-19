import { CanonicalInkPoint, CanonicalStroke, PenType } from "../../model/CanonicalElements";
import { IdGenerator } from "../../model/Ids";
import { BinaryReader } from "./BinaryReader";

export interface ParsedIsfData {
  readonly isHighlighter: boolean;
  readonly strokes: CanonicalStroke[];
  readonly color: string;
  readonly strokeWidth: number;
  readonly penType: PenType;
}

const ONENOTE_HIGHLIGHTER_COLORS = new Set([
  "#ffcc33", // Standard OneNote Yellow
  "#ffff00", // Bright Yellow
  "#ffff33",
  "#ffefa6",
  "#fff275",
  "#a8f0a0", // Green
  "#cbf1c4",
  "#00ff00",
  "#a6e3e9", // Sky Blue / Cyan
  "#87ceeb",
  "#00ffff",
  "#ff69b4", // Pink
  "#ffb6c1",
  "#ffe6eb",
  "#ffd8b8", // Orange
  "#ffa500",
  "#dda0dd", // Lavender / Purple
  "#e8d3ff",
]);

function isHighlighterColor(col?: string, width?: number): boolean {
  if (!col) return false;
  // If stroke width is explicitly provided and is thin (< 6px), it represents a pen/marker, not a wide highlighter
  if (width !== undefined && width < 6) return false;
  return ONENOTE_HIGHLIGHTER_COLORS.has(col.toLowerCase());
}

function determinePenType(isHighlighter: boolean, width: number): PenType {
  if (isHighlighter) return "highlighter";
  if (width <= 2.5) return "ballpoint";
  return "gel";
}

export class IsfParser {
  public static readSignedMultibyte(data: Uint8Array, offset: { val: number }): number {
    let unsigned = 0;
    let shift = 0;
    while (offset.val < data.length) {
      const b = data[offset.val++]!;
      unsigned |= (b & 0x7f) << shift;
      shift += 7;
      if ((b & 0x80) === 0) break;
    }
    const isNegative = (unsigned & 1) === 1;
    const magnitude = unsigned >>> 1;
    return isNegative ? -magnitude : magnitude;
  }

  /**
   * Parse Microsoft Ink Serialized Format (ISF) payload into vector strokes.
   */
  public static parse(data: Uint8Array, customColor?: string, customWidth?: number): ParsedIsfData {
    if (data.length < 4) {
      const isHighlighter = isHighlighterColor(customColor, customWidth);
      const strokeWidth = customWidth || (isHighlighter ? 14 : 2);
      return {
        isHighlighter,
        strokes: [],
        color: customColor || (isHighlighter ? "#ffff00" : "#000000"),
        strokeWidth,
        penType: determinePenType(isHighlighter, strokeWidth),
      };
    }

    const strokes: CanonicalStroke[] = [];
    let isHighlighter = isHighlighterColor(customColor, customWidth);
    let defaultColor = customColor || (isHighlighter ? "#ffff00" : "#000000");
    let defaultWidth = customWidth || (isHighlighter ? 14 : 2);

    // Primary: MS-ISF variable-length signed number stream (authentic OneNote ink)
    try {
      const offset = { val: 0 };
      const values: number[] = [];
      while (offset.val < data.length) {
        values.push(this.readSignedMultibyte(data, offset));
      }

      if (values.length >= 6) {
        const totalCount = values[0]!;
        const remaining = values.length - 1;

        let numChannels = 0;
        if (totalCount >= 4 && remaining === totalCount && totalCount % 5 === 0) numChannels = 5;
        else if (totalCount >= 4 && remaining === totalCount && totalCount % 3 === 0)
          numChannels = 3;
        else if (totalCount >= 4 && remaining === totalCount && totalCount % 2 === 0)
          numChannels = 2;
        else if (totalCount >= 4 && totalCount % 5 === 0) numChannels = 5;
        else if (totalCount >= 4 && totalCount % 3 === 0) numChannels = 3;
        else if (totalCount >= 4 && totalCount % 2 === 0) numChannels = 2;

        if (numChannels >= 2) {
          const N = Math.floor(totalCount / numChannels);
          if (N >= 2 && remaining >= N * numChannels) {
            const xs: number[] = [];
            let curX = values[1]!;
            xs.push(curX);
            for (let i = 2; i <= N; i++) {
              curX += values[i]!;
              xs.push(curX);
            }

            const ys: number[] = [];
            let curY = values[1 + N]!;
            ys.push(curY);
            for (let i = 2 + N; i <= 2 * N; i++) {
              curY += values[i]!;
              ys.push(curY);
            }

            const ps: number[] = [];
            if (numChannels >= 3) {
              let curP = values[1 + 2 * N]!;
              ps.push(curP);
              for (let i = 2 + 2 * N; i <= 3 * N; i++) {
                curP += values[i]!;
                ps.push(curP);
              }
            }

            const SCALE = 96 / 2540; // Convert HIMETRIC (0.01mm) to 96 DPI CSS/Pixi pixels
            const rawPoints: CanonicalInkPoint[] = [];
            for (let i = 0; i < N; i++) {
              const rawP = ps[i] ?? 2000;
              const pressure = isHighlighter ? 0.35 : Math.min(1.0, Math.max(0.1, rawP / 4000));
              rawPoints.push({
                x: xs[i]! * SCALE,
                y: ys[i]! * SCALE,
                pressure,
              });
            }

            if (rawPoints.length >= 2) {
              const penType = determinePenType(isHighlighter, defaultWidth);
              strokes.push({
                id: IdGenerator.objectId("stroke"),
                color: defaultColor,
                width: defaultWidth,
                points: rawPoints,
                penType,
              });

              return {
                isHighlighter,
                strokes,
                color: defaultColor,
                strokeWidth: defaultWidth,
                penType,
              };
            }
          }
        }
      }
    } catch {
      // Fall through to traditional ISF tag parsing
    }

    const reader = new BinaryReader(data);

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
              // ISF DrawingAttributes wire format: BGR + Flags
              const b = attrReader.readUint8();
              const g = attrReader.readUint8();
              const r = attrReader.readUint8();
              const flags = attrReader.hasBytes(1) ? attrReader.readUint8() : 0;

              defaultColor = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
              if (
                (flags & 0x01) !== 0 ||
                flags === 0x02 ||
                (isHighlighterColor(defaultColor, customWidth) &&
                  (customWidth === undefined || customWidth >= 6))
              ) {
                isHighlighter = true;
                defaultWidth = customWidth || 14;
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

            const rawX = reader.readInt16();
            const rawY = reader.readInt16();

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
            const penType = determinePenType(isHighlighter, defaultWidth);
            strokes.push({
              id: IdGenerator.objectId("stroke"),
              color: defaultColor,
              width: defaultWidth,
              points,
              penType,
            });
          }
        } else {
          reader.position += 1;
        }
      }
    } catch {
      // Malformed input protection: return parsed strokes so far
    }

    const penType = determinePenType(isHighlighter, defaultWidth);
    return {
      isHighlighter,
      strokes,
      color: defaultColor,
      strokeWidth: defaultWidth,
      penType,
    };
  }
}
