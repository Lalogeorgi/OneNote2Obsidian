import { CanonicalPage } from "./CanonicalPage";
import { NotebookId, PageId, SectionGroupId, SectionId } from "./Ids";

export interface CanonicalPageSummary {
  readonly id: PageId;
  readonly title: string;
  readonly pageLevel: number;
  readonly createdTime: number;
  readonly modifiedTime: number;
}

export interface CanonicalSection {
  readonly id: SectionId;
  readonly name: string;
  readonly color?: string;
  readonly isEncrypted: boolean;
  readonly pages: readonly CanonicalPage[];
}

export interface CanonicalSectionGroup {
  readonly id: SectionGroupId;
  readonly name: string;
  readonly sections: readonly CanonicalSection[];
  readonly subGroups: readonly CanonicalSectionGroup[];
}

/**
 * Top-Level Canonical Notebook Container.
 */
export interface CanonicalNotebook {
  readonly id: NotebookId;
  readonly title: string;
  readonly sourcePath?: string;
  readonly sectionGroups: readonly CanonicalSectionGroup[];
  readonly sections: readonly CanonicalSection[];
  readonly metadata?: Record<string, unknown>;
}
