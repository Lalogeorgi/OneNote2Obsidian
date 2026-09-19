import { App, TFile } from "obsidian";

/**
 * Frontmatter & Properties Management Service.
 * Ensures 100% compatibility with Obsidian's native Properties engine.
 */
export class FrontmatterManager {
  /**
   * Formats a timestamp or Date into Obsidian's native ISO Date & Time format: YYYY-MM-DDTHH:mm:ss.
   * Eliminates milliseconds and Zulu suffixes that trigger "Invalid Date" errors in Obsidian.
   */
  public static formatObsidianDate(time?: number | Date | string | null): string {
    let d: Date;
    if (!time) {
      d = new Date();
    } else if (typeof time === "number") {
      d = new Date(time);
    } else if (time instanceof Date) {
      d = time;
    } else {
      const parsed = Date.parse(time);
      d = isNaN(parsed) ? new Date() : new Date(parsed);
    }

    if (isNaN(d.getTime())) {
      d = new Date();
    }

    // Return YYYY-MM-DDTHH:mm:ss
    return d.toISOString().slice(0, 19);
  }

  /**
   * Parses the YAML frontmatter block from markdown file content.
   * Handles quoted/unquoted strings, numbers, booleans, lists (like tags), and dates.
   */
  public static parseFrontmatter(content: string): Record<string, any> {
    const result: Record<string, any> = {};
    if (!content.startsWith("---")) return result;

    const endMatch = content.slice(3).match(/\r?\n---\r?\n?/);
    if (!endMatch || endMatch.index === undefined) return result;

    const yamlBlock = content.slice(3, 3 + endMatch.index).trim();
    const lines = yamlBlock.split(/\r?\n/);

    let currentListKey: string | null = null;
    let currentList: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // Check for list item continuation (- item)
      const listMatch = line.match(/^\s*-\s+(.*)$/);
      if (listMatch && currentListKey) {
        const itemVal = listMatch[1]!.trim().replace(/^["']|["']$/g, "");
        currentList.push(itemVal);
        continue;
      }

      // If we were processing a list and hit a non-list line, save it
      if (currentListKey) {
        result[currentListKey] = [...currentList];
        currentListKey = null;
        currentList = [];
      }

      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;

      const rawKey = line.slice(0, colonIdx).trim();
      const rawVal = line.slice(colonIdx + 1).trim();
      if (!rawKey) continue;

      // Start of a YAML list (e.g. "tags:")
      if (!rawVal) {
        currentListKey = rawKey;
        currentList = [];
        continue;
      }

      // Parse primitive values
      result[rawKey] = this.parsePrimitive(rawVal);
    }

    if (currentListKey) {
      result[currentListKey] = [...currentList];
    }

    return result;
  }

  /**
   * Serializes a dictionary of properties into a standard YAML frontmatter block.
   */
  public static serializeFrontmatter(properties: Record<string, any>): string {
    const lines: string[] = ["---"];

    // 1. Primary OneNote and Obsidian properties first in logical order
    const priorityKeys = [
      "onenote_page_id",
      "onenote_title",
      "created",
      "modified",
      "spatial_sidecar",
      "tags",
    ];
    const writtenKeys = new Set<string>();

    for (const key of priorityKeys) {
      if (key in properties && properties[key] !== undefined) {
        this.appendPropertyLine(lines, key, properties[key]);
        writtenKeys.add(key);
      }
    }

    // 2. Custom user-defined properties
    for (const [key, val] of Object.entries(properties)) {
      if (!writtenKeys.has(key) && val !== undefined) {
        this.appendPropertyLine(lines, key, val);
        writtenKeys.add(key);
      }
    }

    lines.push("---");
    return lines.join("\n");
  }

  /**
   * Replaces or prepends frontmatter in a markdown document, preserving the rest of the body.
   */
  public static replaceFrontmatter(content: string, newProps: Record<string, any>): string {
    const newFrontmatter = this.serializeFrontmatter(newProps);

    if (content.startsWith("---")) {
      const endMatch = content.slice(3).match(/\r?\n---\r?\n?/);
      if (endMatch && endMatch.index !== undefined) {
        const remaining = content
          .slice(3 + endMatch.index + endMatch[0].length)
          .replace(/^\r?\n/, "");
        return `${newFrontmatter}\n\n${remaining}`;
      }
    }

    // If no frontmatter existed, prepend it
    return `${newFrontmatter}\n\n${content.trimStart()}`;
  }

  /**
   * Safely updates, adds, or removes properties in a target Obsidian Markdown file.
   * Utilizes app.fileManager.processFrontMatter when available, with atomic vault fallback.
   */
  public static async updateFileProperties(
    app: App,
    file: TFile,
    updates: Record<string, any>,
    deletions: string[] = []
  ): Promise<Record<string, any>> {
    // 1. Prefer native Obsidian processFrontMatter API
    if (app.fileManager && typeof app.fileManager.processFrontMatter === "function") {
      let finalProps: Record<string, any> = {};
      try {
        await app.fileManager.processFrontMatter(file, (fm: any) => {
          // Normalize dates in updates
          if (updates.created) updates.created = this.formatObsidianDate(updates.created);
          if (updates.modified) updates.modified = this.formatObsidianDate(updates.modified);

          for (const [k, v] of Object.entries(updates)) {
            fm[k] = v;
          }
          for (const d of deletions) {
            delete fm[d];
          }
          finalProps = { ...fm };
        });
        return finalProps;
      } catch {
        // Fallback to vault read/write if processFrontMatter fails in tests or legacy environments
      }
    }

    // 2. Atomic fallback: Read, parse, merge, write
    const content = await app.vault.read(file);
    const existing = this.parseFrontmatter(content);

    // Normalize dates
    if (updates.created) updates.created = this.formatObsidianDate(updates.created);
    if (updates.modified) updates.modified = this.formatObsidianDate(updates.modified);

    const merged: Record<string, any> = { ...existing, ...updates };
    for (const d of deletions) {
      delete merged[d];
    }

    const updatedContent = this.replaceFrontmatter(content, merged);
    await app.vault.modify(file, updatedContent);
    return merged;
  }

  private static appendPropertyLine(lines: string[], key: string, val: any): void {
    if (val === null || val === undefined) {
      lines.push(`${key}: ""`);
      return;
    }

    if (Array.isArray(val)) {
      if (val.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of val) {
          lines.push(`  - ${item}`);
        }
      }
      return;
    }

    if (key === "created" || key === "modified") {
      lines.push(`${key}: ${this.formatObsidianDate(val)}`);
      return;
    }

    if (typeof val === "boolean" || typeof val === "number") {
      lines.push(`${key}: ${val}`);
      return;
    }

    const strVal = String(val);
    if (
      strVal.includes("\n") ||
      strVal.includes('"') ||
      strVal.includes(":") ||
      strVal.includes("#") ||
      strVal.includes("[") ||
      strVal.includes("{")
    ) {
      lines.push(`${key}: "${strVal.replace(/"/g, '\\"')}"`);
    } else {
      lines.push(`${key}: "${strVal}"`);
    }
  }

  private static parsePrimitive(rawVal: string): any {
    // Remove surrounding quotes if present
    const unquoted = rawVal.replace(/^["']|["']$/g, "").trim();

    if (rawVal === "true") return true;
    if (rawVal === "false") return false;
    if (rawVal === "null" || rawVal === "~") return null;

    // Numbers (integer or float)
    if (/^-?\d+(\.\d+)?$/.test(rawVal) && !isNaN(Number(rawVal))) {
      return Number(rawVal);
    }

    // Inline arrays like [a, b]
    if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
      const inner = rawVal.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
    }

    return unquoted;
  }
}
