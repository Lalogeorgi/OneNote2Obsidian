import { IPlatformAdapter } from "./IPlatformAdapter";
import { MemoryPlatformAdapter } from "./MemoryPlatformAdapter";
import { NodePlatformAdapter } from "./NodePlatformAdapter";

export class PlatformManager {
  private static instance: IPlatformAdapter | null = null;

  public static getAdapter(): IPlatformAdapter {
    if (!this.instance) {
      // Auto-detect environment
      const isNode =
        typeof process !== "undefined" &&
        Boolean(process.versions?.node);

      if (isNode) {
        try {
          this.instance = new NodePlatformAdapter();
        } catch {
          this.instance = new MemoryPlatformAdapter();
        }
      } else {
        this.instance = new MemoryPlatformAdapter();
      }
    }
    return this.instance;
  }

  public static setAdapter(adapter: IPlatformAdapter | null): void {
    this.instance = adapter;
  }
}
