export interface ArchiveSecurityPolicy {
  /** Maximum number of files permitted in a single archive */
  readonly maxFiles: number;
  /** Maximum total uncompressed payload in bytes (default: 10 GB) */
  readonly maxTotalBytes: number;
  /** Maximum uncompressed size of a single file entry in bytes (default: 2 GB) */
  readonly maxFileBytes: number;
  /** Maximum allowed decompression expansion ratio (e.g. 100x) */
  readonly maxCompressionRatio: number;
  /** Maximum allowed directory nesting depth */
  readonly maxNestingDepth: number;
}

export const DEFAULT_SECURITY_POLICY: ArchiveSecurityPolicy = {
  maxFiles: 5000,
  maxTotalBytes: 10 * 1024 * 1024 * 1024, // 10 GB
  maxFileBytes: 2 * 1024 * 1024 * 1024,   // 2 GB
  maxCompressionRatio: 100,
  maxNestingDepth: 16,
};
