import { DiagnosticCode } from "../../diagnostics/DiagnosticTypes";
import { ParserError } from "../ParserAdapter";

export interface PathSanitizationResult {
  readonly isValid: boolean;
  readonly sanitizedPath: string;
  readonly error?: string;
}

export class PathSanitizer {
  private static readonly WINDOWS_RESERVED_NAMES = new Set([
    "CON",
    "PRN",
    "AUX",
    "NUL",
    "COM1",
    "COM2",
    "COM3",
    "COM4",
    "COM5",
    "COM6",
    "COM7",
    "COM8",
    "COM9",
    "LPT1",
    "LPT2",
    "LPT3",
    "LPT4",
    "LPT5",
    "LPT6",
    "LPT7",
    "LPT8",
    "LPT9",
  ]);

  /**
   * Sanitizes an archive entry path, preventing path traversal, absolute paths,
   * null bytes, control characters, and reserved device names.
   */
  public static sanitize(rawPath: string, maxDepth = 16): PathSanitizationResult {
    if (!rawPath || typeof rawPath !== "string") {
      return { isValid: false, sanitizedPath: "", error: "Path is empty or not a string" };
    }

    // Check for null bytes and control characters (0x00 - 0x1F, 0x7F)
    // eslint-disable-next-line no-control-regex -- needed to detect control characters in path
    if (/[\x00-\x1F\x7F]/.test(rawPath)) {
      return {
        isValid: false,
        sanitizedPath: "",
        error: "Path contains null bytes or control characters",
      };
    }

    // Normalize slashes
    const normalized = rawPath.replace(/\\/g, "/");

    // Check for absolute paths or drive letters
    if (
      /^[a-zA-Z]:/.test(normalized) ||
      normalized.startsWith("/") ||
      normalized.startsWith("//")
    ) {
      return {
        isValid: false,
        sanitizedPath: "",
        error: "Absolute paths and drive letters are forbidden",
      };
    }

    // Split segments and clean
    const rawSegments = normalized.split("/");
    const safeSegments: string[] = [];

    for (const seg of rawSegments) {
      const rawTrimmed = seg.trim();

      if (!rawTrimmed || rawTrimmed === ".") {
        continue;
      }

      if (rawTrimmed === ".." || rawTrimmed.includes("..")) {
        return {
          isValid: false,
          sanitizedPath: "",
          error: "Path traversal ('..') detected in archive entry",
        };
      }

      const trimmed = rawTrimmed.replace(/\.+$/, ""); // Strip trailing dots & spaces

      if (!trimmed) {
        continue;
      }

      // Check for illegal filename characters: < > : " | ? *
      if (/[<>:"|?*]/.test(trimmed)) {
        return {
          isValid: false,
          sanitizedPath: "",
          error: `Illegal character in path segment: "${trimmed}"`,
        };
      }

      // Check Windows reserved device names
      const baseName = trimmed.split(".")[0]!.toUpperCase();
      if (this.WINDOWS_RESERVED_NAMES.has(baseName)) {
        return {
          isValid: false,
          sanitizedPath: "",
          error: `Reserved device name forbidden: "${trimmed}"`,
        };
      }

      if (trimmed.length > 255) {
        return {
          isValid: false,
          sanitizedPath: "",
          error: "Filename segment exceeds maximum 255 characters",
        };
      }

      safeSegments.push(trimmed);
    }

    if (safeSegments.length === 0) {
      return { isValid: false, sanitizedPath: "", error: "Sanitized path resulted in empty path" };
    }

    if (safeSegments.length > maxDepth) {
      return {
        isValid: false,
        sanitizedPath: "",
        error: `Path nesting depth exceeds limit of ${maxDepth}`,
      };
    }

    const finalPath = safeSegments.join("/");
    return {
      isValid: true,
      sanitizedPath: finalPath,
    };
  }

  /**
   * Asserts that a path is safe, throwing a structured ParserError if invalid.
   */
  public static assertSafe(rawPath: string): string {
    const result = this.sanitize(rawPath);
    if (!result.isValid) {
      throw new ParserError(
        `Adversarial or malformed archive entry path rejected: ${result.error} (raw: "${rawPath}")`,
        DiagnosticCode.PARSER_CORRUPT_CHUNK,
        { rawPath, error: result.error }
      );
    }
    return result.sanitizedPath;
  }
}
