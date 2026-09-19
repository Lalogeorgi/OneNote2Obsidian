import { Rectangle } from "../geometry/Rectangle";
import { IdGenerator, ObjectId } from "../model/Ids";
import {
  AnnotationSemanticKind,
  CanonicalSpatialAnnotation,
  SpatialAnnotationStyle,
  SpatialAnnotationTarget,
} from "../model/CanonicalAnnotation";
import { PageScene, SceneAnnotationNode } from "../pagescene/PageScene";

/**
 * Spatial Annotation Manager: Manages extensible semantic annotations
 * across Sticky Notes, outlines, images, tables, shapes, groups, and files.
 */
export class SpatialAnnotationManager {
  /**
   * Creates and registers a new spatial annotation on the canvas.
   */
  public static createAnnotation(
    scene: PageScene,
    target: SpatialAnnotationTarget,
    semanticKind: AnnotationSemanticKind,
    content: string,
    style?: SpatialAnnotationStyle
  ): SceneAnnotationNode {
    const annotId = IdGenerator.objectId("annot");
    const now = Date.now();

    // Default bounds based on region or target
    const bounds = target.regionBounds || {
      x: 0,
      y: 0,
      width: 180,
      height: 60,
      zIndex: 10,
    };

    const canonicalAnnot: CanonicalSpatialAnnotation = {
      type: "annotation",
      id: annotId,
      semanticKind,
      target,
      content,
      bounds,
      style: style || {
        backgroundColor: "rgba(245, 158, 11, 0.1)",
        borderColor: "#F59E0B",
        badgeIcon: "💬",
        badgeText: semanticKind,
        opacity: 1.0,
      },
      createdTime: now,
      modifiedTime: now,
    };

    const annotNode: SceneAnnotationNode = {
      id: annotId,
      layer: "annotations",
      bounds,
      aabb: Rectangle.create(bounds.x, bounds.y, bounds.width, bounds.height),
      zIndex: bounds.zIndex ?? 10,
      visible: true,
      opacity: canonicalAnnot.style?.opacity ?? 1.0,
      element: canonicalAnnot,
      semanticKind,
      content,
      style: canonicalAnnot.style,
    };

    scene.nodes.push(annotNode);
    if (!scene.annotations) scene.annotations = [];
    scene.annotations.push(canonicalAnnot);

    return annotNode;
  }

  /**
   * Retrieves all annotations targeting a specific node ID or file path.
   */
  public static getAnnotationsForTarget(
    scene: PageScene,
    targetIdOrPath: string
  ): SceneAnnotationNode[] {
    const results: SceneAnnotationNode[] = [];

    for (const node of scene.nodes) {
      if (node.layer === "annotations") {
        const annot = node as SceneAnnotationNode;
        if (
          annot.element.target.targetId === targetIdOrPath ||
          annot.element.target.targetPath === targetIdOrPath
        ) {
          results.push(annot);
        }
      }
    }

    return results;
  }

  /**
   * Retrieves all annotations matching a specific semantic kind.
   */
  public static getAnnotationsBySemanticKind(
    scene: PageScene,
    kind: AnnotationSemanticKind
  ): SceneAnnotationNode[] {
    return scene.nodes.filter(
      (n) => n.layer === "annotations" && (n as SceneAnnotationNode).semanticKind === kind
    ) as SceneAnnotationNode[];
  }

  /**
   * Updates an annotation's content and style.
   */
  public static updateAnnotation(
    scene: PageScene,
    annotationId: ObjectId,
    content: string,
    style?: SpatialAnnotationStyle
  ): SceneAnnotationNode | null {
    const annotNode = scene.nodes.find(
      (n) => n.id === annotationId && n.layer === "annotations"
    ) as SceneAnnotationNode | undefined;

    if (!annotNode) return null;

    (annotNode as any).content = content;
    (annotNode.element as any).content = content;
    (annotNode.element as any).modifiedTime = Date.now();

    if (style) {
      (annotNode as any).style = { ...annotNode.style, ...style };
      (annotNode.element as any).style = annotNode.style;
    }

    return annotNode;
  }

  /**
   * Removes an annotation from the scene.
   */
  public static removeAnnotation(scene: PageScene, annotationId: ObjectId): boolean {
    const idx = scene.nodes.findIndex((n) => n.id === annotationId && n.layer === "annotations");
    if (idx === -1) return false;

    scene.nodes.splice(idx, 1);
    if (scene.annotations) {
      scene.annotations = scene.annotations.filter((a) => a.id !== annotationId);
    }

    return true;
  }
}
