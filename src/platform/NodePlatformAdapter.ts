import { IPlatformAdapter } from "./IPlatformAdapter";

export class NodePlatformAdapter implements IPlatformAdapter {
  public readonly platformName = "node-electron";
  public readonly isDesktop = true;

  private fsp: typeof import("fs/promises") | null = null;
  private path: typeof import("path") | null = null;
  private os: typeof import("os") | null = null;

  constructor() {
    try {
      // Dynamic require / import to keep web packagers clean
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic require for desktop node fs
      this.fsp = require("fs").promises;
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic require for desktop node path
      this.path = require("path");
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic require for desktop node os
      this.os = require("os");
    } catch {
      // Running in environment without Node fs
    }
  }

  public async createStagingDirectory(prefix: string): Promise<string> {
    if (!this.fsp || !this.os || !this.path) {
      throw new Error("NodePlatformAdapter requires Node.js runtime environment");
    }

    const tmpBase = this.os.tmpdir();
    const uniqueName = `${prefix}${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const fullPath = this.path.join(tmpBase, uniqueName);

    await this.fsp.mkdir(fullPath, { recursive: true });
    return fullPath;
  }

  public async removeDirectory(dirPath: string): Promise<void> {
    if (!this.fsp) return;

    try {
      if (await this.exists(dirPath)) {
        await this.fsp.rm(dirPath, { recursive: true, force: true });
      }
    } catch {
      // Best effort cleanup
    }
  }

  public async writeStagedFile(filePath: string, data: Uint8Array | ArrayBuffer): Promise<void> {
    if (!this.fsp || !this.path) {
      throw new Error("NodePlatformAdapter requires Node.js runtime environment");
    }

    const parent = this.path.dirname(filePath);
    await this.fsp.mkdir(parent, { recursive: true });

    const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    await this.fsp.writeFile(filePath, uint8);
  }

  public async readStagedFile(filePath: string): Promise<ArrayBuffer> {
    if (!this.fsp) {
      throw new Error("NodePlatformAdapter requires Node.js runtime environment");
    }

    const buffer = await this.fsp.readFile(filePath);
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;
  }

  public async listStagedFiles(dirPath: string): Promise<string[]> {
    if (!this.fsp || !this.path) {
      throw new Error("NodePlatformAdapter requires Node.js runtime environment");
    }

    const results: string[] = [];

    const walk = async (currentDir: string, relativeDir: string) => {
      const entries = await this.fsp!.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const full = this.path!.join(currentDir, entry.name);
        const rel = relativeDir ? this.path!.join(relativeDir, entry.name) : entry.name;
        if (entry.isDirectory()) {
          await walk(full, rel);
        } else if (entry.isFile()) {
          results.push(rel.replace(/\\/g, "/"));
        }
      }
    };

    if (await this.exists(dirPath)) {
      await walk(dirPath, "");
    }

    return results;
  }

  public async exists(targetPath: string): Promise<boolean> {
    if (!this.fsp) return false;
    try {
      await this.fsp.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  public joinPath(...segments: string[]): string {
    if (this.path) {
      return this.path.join(...segments);
    }
    return segments.join("/").replace(/\\/g, "/");
  }

  public async atomicPublish(stagedDir: string, targetVaultDir: string): Promise<void> {
    if (!this.fsp || !this.path) {
      throw new Error("NodePlatformAdapter requires Node.js runtime environment");
    }

    await this.fsp.mkdir(targetVaultDir, { recursive: true });

    // Copy/move files across
    const files = await this.listStagedFiles(stagedDir);
    for (const relPath of files) {
      const src = this.path.join(stagedDir, relPath);
      const dest = this.path.join(targetVaultDir, relPath);
      const destDir = this.path.dirname(dest);
      await this.fsp.mkdir(destDir, { recursive: true });
      await this.fsp.copyFile(src, dest);
    }
  }
}
