import { Texture } from "pixi.js";

/**
 * Robust resource lifecycle tracker preventing memory leaks during Obsidian view teardown.
 * Manages GPU textures, event listeners, and disposable handles.
 */

export type DisposableResource = () => void;

export class ResourceTracker {
  private disposables: Set<DisposableResource> = new Set();
  private textureCache = new Map<string, Texture>();
  private domListeners: Array<{
    target: EventTarget;
    type: string;
    listener: EventListenerOrEventListenerObject;
    options?: boolean | AddEventListenerOptions;
  }> = [];

  public register(disposable: DisposableResource): () => void {
    this.disposables.add(disposable);
    return () => this.disposables.delete(disposable);
  }

  public addEventListener(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    target.addEventListener(type, listener, options);
    this.domListeners.push({ target, type, listener, options });
  }

  public getTexture(assetId: string): Texture | null {
    return this.textureCache.get(assetId) ?? null;
  }

  public setTexture(assetId: string, texture: Texture): void {
    this.textureCache.set(assetId, texture);
  }

  public get textureCount(): number {
    return this.textureCache.size;
  }

  public disposeAll(): void {
    // 1. Remove all DOM event listeners
    for (const { target, type, listener, options } of this.domListeners) {
      try {
        target.removeEventListener(type, listener, options);
      } catch (err) {
        console.error("Error removing DOM listener during disposal:", err);
      }
    }
    this.domListeners = [];

    // 2. Destroy cached textures
    for (const texture of this.textureCache.values()) {
      try {
        texture.destroy(true);
      } catch (err) {
        console.error("Error destroying cached texture:", err);
      }
    }
    this.textureCache.clear();

    // 3. Execute all custom disposers (e.g. destroy animations, workers)
    for (const dispose of this.disposables) {
      try {
        dispose();
      } catch (err) {
        console.error("Error executing disposable during disposal:", err);
      }
    }
    this.disposables.clear();
  }
}
