import { CanonicalElement } from "./CanonicalElements";
import { PageId } from "./Ids";

export type RuleLineKind = "none" | "narrow" | "college" | "wide" | "small-grid" | "large-grid";

export interface PageRuleLines {
  readonly kind: RuleLineKind;
  readonly color: string; // Hex (#D0D0D0)
  readonly spacing: number; // In 96 DPI CSS pixels (e.g. 24px)
  readonly marginX?: number; // Vertical margin guide line (e.g. 96px)
}

export interface PageCanvasStyle {
  readonly backgroundColor: string; // Hex (#FFFFFF)
  readonly ruleLines?: PageRuleLines;
}

export interface PageRevision {
  readonly revisionId: string;
  readonly author?: string;
  readonly timestamp: number;
}

/**
 * Full Canonical Page Document Model.
 * Strictly UI-independent source of truth.
 */
export interface CanonicalPage {
  readonly id: PageId;
  readonly title: string;
  readonly pageLevel: number; // 0 = root page, 1 = sub-page, 2 = sub-subpage
  readonly createdTime: number;
  readonly modifiedTime: number;
  /** Optional fixed page print dimensions (e.g. Letter/A4). OneNote spatial canvas itself is unbounded/infinite. */
  readonly pageWidth?: number;
  readonly pageHeight?: number;
  readonly canvasStyle: PageCanvasStyle;
  readonly elements: readonly CanonicalElement[];
  readonly revisions?: readonly PageRevision[];
  readonly metadata?: Record<string, unknown>;
}
