import { IPlatformAdapter } from "./IPlatformAdapter";

export class MemoryPlatformAdapter implements IPlatformAdapter {
  public readonly platformName = "in-memory";
  public readonly isDesktop = false;

  private files = new Map<string, Uint8Array>();
  private directories = new Set<string>();

  public async createStagingDirectory(prefix: string): Promise<string> {
    const dir = `/virtual-staging/${prefix}${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.directories.add(this.normalize(dir));
    return dir;
  }

  public async removeDirectory(dirPath: string): Promise<void> {
    const normDir = this.normalize(dirPath);
    this.directories.delete(normDir);

    for (const key of Array.from(this.files.keys())) {
      if (key.startsWith(normDir + "/") || key === normDir) {
        this.files.delete(key);
      }
    }
  }

  public async writeStagedFile(filePath: string, data: Uint8Array | ArrayBuffer): Promise<void> {
    const norm = this.normalize(filePath);
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    this.files.set(norm, bytes);

    // Register parent directory
    const parts = norm.split("/");
    parts.pop();
    if (parts.length > 0) {
      this.directories.add(parts.join("/"));
    }
  }

  public async readStagedFile(filePath: string): Promise<ArrayBuffer> {
    const norm = this.normalize(filePath);
    const data = this.files.get(norm);
    if (!data) {
      throw new Error(`File not found in virtual storage: ${filePath}`);
    }
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }

  public async listStagedFiles(dirPath: string): Promise<string[]> {
    const normDir = this.normalize(dirPath);
    const results: string[] = [];

    for (const key of this.files.keys()) {
      if (key.startsWith(normDir + "/")) {
        const rel = key.substring(normDir.length + 1);
        results.push(rel);
      }
    }

    return results;
  }

  public async exists(targetPath: string): Promise<boolean> {
    const norm = this.normalize(targetPath);
    return this.files.has(norm) || this.directories.has(norm);
  }

  public joinPath(...segments: string[]): string {
    return this.normalize(segments.join("/"));
  }

  public async atomicPublish(stagedDir: string, targetVaultDir: string): Promise<void> {
    const files = await this.listStagedFiles(stagedDir);
    for (const rel of files) {
      const src = this.joinPath(stagedDir, rel);
      const dest = this.joinPath(targetVaultDir, rel);
      const data = this.files.get(src);
      if (data) {
        await this.writeStagedFile(dest, data);
      }
    }
  }

  private normalize(p: string): string {
    return p.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
  }
}
