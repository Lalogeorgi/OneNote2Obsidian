/**
 * Branded Nominal ID Types to prevent identifier swapping bugs.
 */

declare const __brand: unique symbol;
export type Brand<T, B> = T & { readonly [__brand]: B };

export type NotebookId = Brand<string, "NotebookId">;
export type SectionGroupId = Brand<string, "SectionGroupId">;
export type SectionId = Brand<string, "SectionId">;
export type PageId = Brand<string, "PageId">;
export type ObjectId = Brand<string, "ObjectId">;
export type StickyNoteId = Brand<string, "ObjectId">;
export type AssetId = Brand<string, "AssetId">;

export class IdGenerator {
  public static notebookId(rawId?: string): NotebookId {
    return (rawId || `nb_${IdGenerator.randomHex(8)}`) as NotebookId;
  }

  public static sectionGroupId(rawId?: string): SectionGroupId {
    return (rawId || `secgrp_${IdGenerator.randomHex(8)}`) as SectionGroupId;
  }

  public static sectionId(rawId?: string): SectionId {
    return (rawId || `sec_${IdGenerator.randomHex(8)}`) as SectionId;
  }

  public static pageId(rawId?: string): PageId {
    return (rawId || `page_${IdGenerator.randomHex(8)}`) as PageId;
  }

  public static stickyNoteId(rawId?: string): StickyNoteId {
    return (rawId || `sn_${IdGenerator.randomHex(8)}`) as StickyNoteId;
  }

  public static objectId(prefix = "obj", rawId?: string): ObjectId {
    return (rawId || `${prefix}_${IdGenerator.randomHex(8)}`) as ObjectId;
  }

  public static assetId(rawId?: string): AssetId {
    return (rawId || `asset_${IdGenerator.randomHex(8)}`) as AssetId;
  }

  private static randomHex(length: number): string {
    const bytes = new Uint8Array(length);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, length * 2);
  }
}
