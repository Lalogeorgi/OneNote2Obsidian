# Canonical Document Model & PageScene Layout Specification

**Author:** Senior Software Architect & Document Engineer  
**Status:** Canonical Reference Schema v1.0

---

## 1. Domain Model Hierarchy

```
 ┌─────────────────────────────────────────────────────────────┐
 │                     CANONICAL NOTEBOOK                      │
 │   - id: string (GUID)                                       │
 │   - title: string                                           │
 │   - sections: CanonicalSection[]                            │
 │   - sectionGroups: CanonicalSectionGroup[]                  │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │                      CANONICAL SECTION                      │
 │   - id: string (GUID)                                       │
 │   - name: string                                            │
 │   - color: string (Hex)                                     │
 │   - pages: CanonicalPage[]                                  │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │                       CANONICAL PAGE                        │
 │   - id: string (GUID)                                       │
 │   - title: string                                           │
 │   - level: number (0 = Main, 1 = Subpage, 2 = Sub-subpage)   │
 │   - timestamps: { created: number, modified: number }       │
 │   - canvasStyle: { background: string, ruleLines: RuleType }│
 │   - elements: CanonicalElement[]                            │
 └──────────────────────────────┬──────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
 ┌───────────────┐       ┌───────────────┐       ┌───────────────┐
 │   Outlines    │       │     Media     │       │    Ink / ISF  │
 │ (Text/Blocks) │       │ (Images/PDFs) │       │ (Handwriting) │
 └───────────────┘       └───────────────┘       └───────────────┘
        ▼                       ▼                       ▼
 ┌───────────────┐       ┌───────────────┐       ┌───────────────┐
 │    Tables     │       │  Attachments  │       │    Shapes     │
 │ (Row/Col/Cell)│       │ (Files/Icons) │       │ (Arrows/Lines)│
 └───────────────┘       └───────────────┘       └───────────────┘
```

---

## 2. Canonical TypeScript Schema Definitions

```typescript
/** Unique Identifier for entities across the document lifecycle */
export type EntityId = string;

/** 2.5D Coordinate Bounds in 96 DPI CSS Pixels */
export interface BoundingRect {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number; // In degrees (0 - 360)
  zIndex: number;    // Global stacking order
}

/** Root Notebook Entity */
export interface CanonicalNotebook {
  id: EntityId;
  title: string;
  sourceFile: string;
  sectionGroups: CanonicalSectionGroup[];
  sections: CanonicalSection[];
  metadata: Record<string, unknown>;
}

export interface CanonicalSectionGroup {
  id: EntityId;
  name: string;
  sections: CanonicalSection[];
  subGroups: CanonicalSectionGroup[];
}

export interface CanonicalSection {
  id: EntityId;
  name: string;
  color?: string;
  isEncrypted: boolean;
  pages: CanonicalPage[];
}

export interface CanonicalPage {
  id: EntityId;
  title: string;
  pageLevel: number;
  createdTime: number;
  modifiedTime: number;
  pageWidth?: number;
  pageHeight?: number;
  backgroundColor?: string;
  ruleLines?: {
    type: 'none' | 'narrow' | 'college' | 'wide' | 'small-grid' | 'large-grid';
    color: string;
    spacing: number;
  };
  elements: CanonicalElement[];
  revisions?: PageRevision[];
}

export type CanonicalElement =
  | CanonicalOutline
  | CanonicalImage
  | CanonicalInkStrokeGroup
  | CanonicalTable
  | CanonicalAttachment
  | CanonicalShape;

/** Freeform Outline / Text Container */
export interface CanonicalOutline {
  type: 'outline';
  id: EntityId;
  bounds: BoundingRect;
  paragraphs: CanonicalParagraph[];
}

export interface CanonicalParagraph {
  id: EntityId;
  indentLevel: number;
  bulletType?: 'none' | 'disc' | 'number' | 'checkbox';
  isTaskChecked?: boolean;
  runs: CanonicalTextRun[];
}

export interface CanonicalTextRun {
  text: string;
  fontFamily?: string;
  fontSize?: number;        // Points (pt)
  fontColor?: string;       // Hex (#000000)
  highlightColor?: string;  // Hex (#FFFF00)
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  hyperlink?: {
    type: 'external' | 'internal-page' | 'internal-paragraph';
    target: string;
  };
}

/** Embedded Raster Image or Vector Printout */
export interface CanonicalImage {
  type: 'image';
  id: EntityId;
  bounds: BoundingRect;
  assetId: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'image/svg+xml';
  originalFileName?: string;
  altText?: string;
  isBackgroundPrintout?: boolean;
}

/** ISF Handwriting & Drawing Strokes */
export interface CanonicalInkStrokeGroup {
  type: 'ink';
  id: EntityId;
  bounds: BoundingRect;
  isHighlighter: boolean;
  strokes: CanonicalStroke[];
}

export interface CanonicalStroke {
  id: EntityId;
  color: string;
  width: number;
  points: { x: number; y: number; pressure?: number }[];
}

/** OneNote Table Structure */
export interface CanonicalTable {
  type: 'table';
  id: EntityId;
  bounds: BoundingRect;
  columns: { width: number }[];
  rows: CanonicalTableRow[];
}

export interface CanonicalTableRow {
  id: EntityId;
  cells: CanonicalTableCell[];
}

export interface CanonicalTableCell {
  id: EntityId;
  backgroundColor?: string;
  colSpan?: number;
  rowSpan?: number;
  elements: CanonicalElement[];
}

/** Embedded Binary File Attachment */
export interface CanonicalAttachment {
  type: 'attachment';
  id: EntityId;
  bounds: BoundingRect;
  assetId: string;
  fileName: string;
  fileSizeBytes: number;
  iconAssetId?: string;
}

/** Geometric Shapes & Connector Lines */
export interface CanonicalShape {
  type: 'shape';
  id: EntityId;
  bounds: BoundingRect;
  shapeType: 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'callout' | 'star';
  fillColor?: string;
  strokeColor?: string;
  strokeWidth: number;
}
```

---

## 3. PageScene Layout Transformation Pipeline

The `PageScene` translates raw `CanonicalPage` records into an absolute display list:

```typescript
export interface PageScene {
  pageId: EntityId;
  title: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  background: {
    color: string;
    ruleLines?: { type: string; spacing: number; color: string };
  };
  displayNodes: PageSceneNode[];
}

export interface PageSceneNode {
  id: EntityId;
  canonicalElement: CanonicalElement;
  layer: 'background' | 'bottomInk' | 'images' | 'shapes' | 'tables' | 'text' | 'topInk';
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  zIndex: number;
  renderable: boolean;
}
```

### Coordinate Normalization Algorithm
OneNote records coordinates in half-points ($1/144\text{ inch}$) or points ($1/72\text{ inch}$). The Layout Engine converts all coordinates to 96 DPI CSS Pixels:
$$\text{Pixels}_{96\text{DPI}} = \text{Points} \times \left(\frac{96}{72}\right) = \text{Points} \times 1.333333$$

---

## 4. Markdown Semantic Projection Generator

To maintain seamless Obsidian Knowledge Graph interoperability, the Semantic Projector derives a clean Markdown document from the canonical model:

```typescript
export class MarkdownSemanticProjector {
  public static project(page: CanonicalPage): string {
    const lines: string[] = [];

    // Frontmatter YAML
    lines.push('---');
    lines.push(`title: "${page.title.replace(/"/g, '\\"')}"`);
    lines.push(`created: ${new Date(page.createdTime).toISOString()}`);
    lines.push(`updated: ${new Date(page.modifiedTime).toISOString()}`);
    lines.push(`onenote_id: "${page.id}"`);
    lines.push('tags:');
    lines.push('  - onenote-import');
    lines.push('---');
    lines.push('');

    // Title Heading
    lines.push(`# ${page.title}`);
    lines.push('');

    // Spatial Sidecar Link
    lines.push(`> [!note] Spatial Canvas`);
    lines.push(`> View spatial layout: ![[${page.id}.onecanvas.json]]`);
    lines.push('');

    // Sort elements vertically (top-to-bottom reading order)
    const sortedElements = [...page.elements].sort((a, b) => a.bounds.y - b.bounds.y);

    for (const el of sortedElements) {
      if (el.type === 'outline') {
        for (const p of el.paragraphs) {
          const indent = '  '.repeat(Math.max(0, p.indentLevel));
          let prefix = '';
          if (p.bulletType === 'checkbox') {
            prefix = p.isTaskChecked ? '- [x] ' : '- [ ] ';
          } else if (p.bulletType === 'disc') {
            prefix = '- ';
          } else if (p.bulletType === 'number') {
            prefix = '1. ';
          }

          const runText = p.runs
            .map((r) => {
              let t = r.text;
              if (r.bold) t = `**${t}**`;
              if (r.italic) t = `*${t}*`;
              if (r.strikethrough) t = `~~${t}~~`;
              if (r.hyperlink) t = `[${t}](${r.hyperlink.target})`;
              return t;
            })
            .join('');

          lines.push(`${indent}${prefix}${runText}`);
        }
        lines.push('');
      } else if (el.type === 'image') {
        lines.push(`![[${el.originalFileName || el.assetId}]]`);
        lines.push('');
      } else if (el.type === 'table') {
        lines.push(this.renderMarkdownTable(el));
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  private static renderMarkdownTable(table: CanonicalTable): string {
    // Generate standard GFM Markdown Table
    const rows: string[] = [];
    if (table.rows.length === 0) return '';

    const firstRow = table.rows[0];
    const header = '| ' + firstRow.cells.map(() => 'Header').join(' | ') + ' |';
    const separator = '| ' + firstRow.cells.map(() => '---').join(' | ') + ' |';
    rows.push(header);
    rows.push(separator);

    for (const row of table.rows) {
      const rowContent =
        '| ' +
        row.cells
          .map((c) => {
            return c.elements
              .map((e) => (e.type === 'outline' ? e.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' ') : ''))
              .join(' ')
              .replace(/\|/g, '\\|');
          })
          .join(' | ') +
        ' |';
      rows.push(rowContent);
    }

    return rows.join('\n');
  }
}
```
