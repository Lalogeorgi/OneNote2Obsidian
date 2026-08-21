/**
 * Structured diagnostic codes for error reporting and telemetry.
 */
export enum DiagnosticCode {
  // Parser Diagnostics
  PARSER_INVALID_MAGIC = "PARSER_INVALID_MAGIC",
  PARSER_CORRUPT_CHUNK = "PARSER_CORRUPT_CHUNK",
  PARSER_UNSUPPORTED_VERSION = "PARSER_UNSUPPORTED_VERSION",
  PARSER_ENCRYPTED_SECTION = "PARSER_ENCRYPTED_SECTION",
  PARSER_CAB_EXTRACTION_FAILED = "PARSER_CAB_EXTRACTION_FAILED",

  // Model & Domain Diagnostics
  MODEL_INVALID_ENTITY_ID = "MODEL_INVALID_ENTITY_ID",
  MODEL_ORPHAN_ELEMENT = "MODEL_ORPHAN_ELEMENT",
  MODEL_CORRUPT_ISF_INK = "MODEL_CORRUPT_ISF_INK",

  // Asset & Texture Diagnostics
  ASSET_MISSING = "ASSET_MISSING",
  ASSET_CORRUPT_BITMAP = "ASSET_CORRUPT_BITMAP",
  TEXTURE_VRAM_LIMIT_EXCEEDED = "TEXTURE_VRAM_LIMIT_EXCEEDED",
  TEXTURE_DECODE_FAILED = "TEXTURE_DECODE_FAILED",

  // Renderer Diagnostics
  RENDERER_INITIALIZATION_FAILED = "RENDERER_INITIALIZATION_FAILED",
  RENDERER_CONTEXT_LOST = "RENDERER_CONTEXT_LOST",
  RENDERER_CONTEXT_RESTORED = "RENDERER_CONTEXT_RESTORED",
  RENDERER_TESSELLATION_ERROR = "RENDERER_TESSELLATION_ERROR",

  // Performance & General
  PERF_SLOW_FRAME = "PERF_SLOW_FRAME",
  GENERAL_INFO = "GENERAL_INFO",
}

export type DiagnosticSeverity = "info" | "warning" | "error" | "fatal";

export interface DiagnosticEntry {
  readonly id: string;
  readonly code: DiagnosticCode;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly timestamp: number;
  readonly context?: Record<string, unknown>;
  readonly stack?: string;
}

export interface PerformanceMetric {
  readonly name: string;
  readonly durationMs: number;
  readonly timestamp: number;
  readonly details?: Record<string, unknown>;
}
