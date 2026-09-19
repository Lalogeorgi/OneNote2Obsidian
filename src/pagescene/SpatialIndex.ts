import { Point2D } from "../geometry/Point";
import { Rect2D, Rectangle } from "../geometry/Rectangle";
import { ObjectId } from "../model/Ids";
import { PageSceneNode } from "./PageScene";

interface SpatialItem {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly node: PageSceneNode;
}

/**
 * High-performance 2D Spatial Hash Grid & Bounding Index.
 * Provides O(1) to O(K) average-time frustum culling and hit-testing across 10,000+ objects.
 */
export class SpatialIndex {
  private items: SpatialItem[] = [];
  private itemMap = new Map<ObjectId, SpatialItem>();
  private grid = new Map<string, SpatialItem[]>();
  private readonly cellSize: number;
  private totalBounds: Rectangle | null = null;

  constructor(cellSize = 256) {
    this.cellSize = Math.max(64, cellSize);
  }

  /**
   * Bulk loads a collection of scene nodes into the spatial index.
   */
  public load(nodes: readonly PageSceneNode[]): void {
    this.clear();
    for (const node of nodes) {
      this.insert(node);
    }
  }

  /**
   * Inserts a single scene node into the spatial index.
   */
  public insert(node: PageSceneNode): void {
    const item: SpatialItem = {
      minX: node.aabb.minX,
      minY: node.aabb.minY,
      maxX: node.aabb.maxX,
      maxY: node.aabb.maxY,
      node,
    };

    this.items.push(item);
    this.itemMap.set(node.id, item);
    this.totalBounds = null; // Invalidate cached total bounds

    // Populate grid cells
    const minCx = Math.floor(item.minX / this.cellSize);
    const maxCx = Math.floor(item.maxX / this.cellSize);
    const minCy = Math.floor(item.minY / this.cellSize);
    const maxCy = Math.floor(item.maxY / this.cellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = `${cx}:${cy}`;
        let cell = this.grid.get(key);
        if (!cell) {
          cell = [];
          this.grid.set(key, cell);
        }
        cell.push(item);
      }
    }
  }

  /**
   * Removes a node by ID from the spatial index.
   */
  public remove(nodeId: ObjectId): boolean {
    const item = this.itemMap.get(nodeId);
    if (!item) return false;

    this.itemMap.delete(nodeId);
    this.items = this.items.filter((it) => it.node.id !== nodeId);
    this.totalBounds = null;

    const minCx = Math.floor(item.minX / this.cellSize);
    const maxCx = Math.floor(item.maxX / this.cellSize);
    const minCy = Math.floor(item.minY / this.cellSize);
    const maxCy = Math.floor(item.maxY / this.cellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = `${cx}:${cy}`;
        const cell = this.grid.get(key);
        if (cell) {
          const filtered = cell.filter((it) => it.node.id !== nodeId);
          if (filtered.length === 0) {
            this.grid.delete(key);
          } else {
            this.grid.set(key, filtered);
          }
        }
      }
    }

    return true;
  }

  public get size(): number {
    return this.items.length;
  }

  /**
   * Search for all scene nodes intersecting a query bounding box (e.g. visible viewport).
   */
  public search(queryRect: Rect2D): PageSceneNode[] {
    const minX = queryRect.x;
    const minY = queryRect.y;
    const maxX = queryRect.x + queryRect.width;
    const maxY = queryRect.y + queryRect.height;

    // Small dataset optimization: linear scan if very few items
    if (this.items.length < 32) {
      const results: PageSceneNode[] = [];
      for (const item of this.items) {
        if (!(item.maxX < minX || item.minX > maxX || item.maxY < minY || item.minY > maxY)) {
          results.push(item.node);
        }
      }
      return results;
    }

    const minCx = Math.floor(minX / this.cellSize);
    const maxCx = Math.floor(maxX / this.cellSize);
    const minCy = Math.floor(minY / this.cellSize);
    const maxCy = Math.floor(maxY / this.cellSize);

    const candidates = new Set<SpatialItem>();

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const cell = this.grid.get(`${cx}:${cy}`);
        if (cell) {
          for (let i = 0; i < cell.length; i++) {
            candidates.add(cell[i]!);
          }
        }
      }
    }

    const results: PageSceneNode[] = [];
    for (const item of candidates) {
      if (!(item.maxX < minX || item.minX > maxX || item.maxY < minY || item.minY > maxY)) {
        results.push(item.node);
      }
    }

    return results;
  }

  /**
   * Hit test a point against all indexed nodes, returning the top-most node by zIndex.
   */
  public hitTest(point: Point2D): PageSceneNode | null {
    const hits = this.hitTestAll(point);
    return hits[0] ?? null;
  }

  /**
   * Hit test a point against all indexed nodes, returning all matching nodes sorted by zIndex descending.
   */
  public hitTestAll(point: Point2D): PageSceneNode[] {
    const cx = Math.floor(point.x / this.cellSize);
    const cy = Math.floor(point.y / this.cellSize);
    const cell = this.grid.get(`${cx}:${cy}`);

    const pool = cell && this.items.length >= 32 ? cell : this.items;
    const hits: PageSceneNode[] = [];

    for (const item of pool) {
      const isInk = item.node.layer === "topInk" || item.node.layer === "bottomInk";
      const slop = isInk ? 8 : 0;
      if (
        point.x >= item.minX - slop &&
        point.x <= item.maxX + slop &&
        point.y >= item.minY - slop &&
        point.y <= item.maxY + slop
      ) {
        hits.push(item.node);
      }
    }

    if (hits.length <= 1) return hits;
    hits.sort((a, b) => b.zIndex - a.zIndex);
    return hits;
  }

  /**
   * Calculates the union bounding box of all indexed nodes.
   */
  public getTotalBounds(): Rectangle | null {
    if (this.items.length === 0) return null;
    if (this.totalBounds) return this.totalBounds;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const item of this.items) {
      minX = Math.min(minX, item.minX);
      minY = Math.min(minY, item.minY);
      maxX = Math.max(maxX, item.maxX);
      maxY = Math.max(maxY, item.maxY);
    }

    this.totalBounds = new Rectangle(minX, minY, maxX - minX, maxY - minY);
    return this.totalBounds;
  }

  public clear(): void {
    this.items = [];
    this.itemMap.clear();
    this.grid.clear();
    this.totalBounds = null;
  }
}
