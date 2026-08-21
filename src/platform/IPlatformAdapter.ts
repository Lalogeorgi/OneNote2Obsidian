/**
 * Platform abstraction interface for file staging, path operations,
 * and atomic publishing, isolating Node/Electron from core parser/rendering logic.
 */

export interface IPlatformAdapter {
  readonly platformName: string;
  readonly isDesktop: boolean;

  /**
   * Creates a private, isolated staging directory with a unique session prefix.
   * @param prefix Prefix for the directory name (e.g. 'onepkg-stage-')
   * @returns Absolute or normalized virtual path to the staging directory.
   */
  createStagingDirectory(prefix: string): Promise<string>;

  /**
   * Recursively removes a staging directory and all its contents.
   * Guaranteed not to throw if the directory does not exist.
   */
  removeDirectory(dirPath: string): Promise<void>;

  /**
   * Writes a file chunk or buffer to a path within the staging area.
   */
  writeStagedFile(filePath: string, data: Uint8Array | ArrayBuffer): Promise<void>;

  /**
   * Reads a file from the staging area.
   */
  readStagedFile(filePath: string): Promise<ArrayBuffer>;

  /**
   * Lists all relative file paths inside a staging directory recursively.
   */
  listStagedFiles(dirPath: string): Promise<string[]>;

  /**
   * Checks if a file or directory exists.
   */
  exists(targetPath: string): Promise<boolean>;

  /**
   * Joins path segments safely using platform-appropriate separators.
   */
  joinPath(...segments: string[]): string;

  /**
   * Atomically moves or copies staged files into the target destination directory.
   */
  atomicPublish(stagedDir: string, targetVaultDir: string): Promise<void>;
}
