import { RendererStats } from "../IRenderer";

/**
 * Real-time graphics performance and diagnostics instrumentation.
 */
export class RendererInstrumentation {
  private lastFrameTime = performance.now();
  private frameCount = 0;
  private currentFps = 60;
  private frameTimes: number[] = [];
  private maxFrameHistory = 60;

  public visibleNodeCount = 0;
  public totalNodeCount = 0;
  public culledNodeCount = 0;
  public textureCount = 0;
  public estimatedVramBytes = 0;
  public isContextLost = false;
  public syncDurationMs = 0;
  public hitTestLatencyMs = 0;

  public beginFrame(): number {
    return performance.now();
  }

  public endFrame(startTime: number): void {
    const now = performance.now();
    const frameDuration = now - startTime;
    this.frameTimes.push(frameDuration);
    if (this.frameTimes.length > this.maxFrameHistory) {
      this.frameTimes.shift();
    }

    this.frameCount++;
    if (now - this.lastFrameTime >= 1000) {
      this.currentFps = (this.frameCount * 1000) / (now - this.lastFrameTime);
      this.frameCount = 0;
      this.lastFrameTime = now;
    }
  }

  public getStats(): RendererStats {
    const avgFrameTime =
      this.frameTimes.length > 0
        ? this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
        : 16.67;

    return {
      fps: Math.round(this.currentFps),
      frameTimeMs: parseFloat(avgFrameTime.toFixed(2)),
      visibleNodeCount: this.visibleNodeCount,
      totalNodeCount: this.totalNodeCount,
      culledNodeCount: this.culledNodeCount,
      textureCount: this.textureCount,
      estimatedVramBytes: this.estimatedVramBytes,
      isContextLost: this.isContextLost,
      syncDurationMs: parseFloat(this.syncDurationMs.toFixed(2)),
      hitTestLatencyMs: parseFloat(this.hitTestLatencyMs.toFixed(2)),
    };
  }

  public reset(): void {
    this.frameCount = 0;
    this.frameTimes = [];
    this.visibleNodeCount = 0;
    this.totalNodeCount = 0;
    this.culledNodeCount = 0;
    this.textureCount = 0;
    this.estimatedVramBytes = 0;
    this.syncDurationMs = 0;
    this.hitTestLatencyMs = 0;
  }
}
