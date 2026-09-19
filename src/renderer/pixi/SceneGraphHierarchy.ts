import { Container } from "pixi.js";
import { ViewportTransform } from "../../geometry/Transform";

/**
 * Manages the 9-tier PixiJS Container Layer Hierarchy.
 *
 * Stage
 *  └── rootContainer (Screen space)
 *       └── pageContainer (Scene space: tx, ty, scale, rotation)
 *            ├── backgroundLayer (Paper style, college rule, grid lines)
 *            ├── imagesLayer (Bitmap textures & sprites)
 *            ├── bottomInkLayer (Highlighter ink with blend modes)
 *            ├── tablesLayer (Table borders and cell grid)
 *            ├── shapesLayer (Vector rectangles, ellipses, arrows)
 *            ├── textLayer (Text placeholder bounds & highlights)
 *            ├── topInkLayer (Pen / opaque handwriting ink)
 *            ├── attachmentsLayer (File attachment badges)
 *            ├── selectionLayer (Selection marquee, bounding handles)
 *            └── interactionLayer (Hover outlines, active interaction UI)
 */
export class SceneGraphHierarchy {
  public readonly rootContainer: Container;
  public readonly pageContainer: Container;

  public readonly backgroundLayer: Container;
  public readonly spatialGroupsLayer: Container;
  public readonly imagesLayer: Container;
  public readonly bottomInkLayer: Container;
  public readonly tablesLayer: Container;
  public readonly shapesLayer: Container;
  public readonly textLayer: Container;
  public readonly stickyNotesLayer: Container;
  public readonly annotationsLayer: Container;
  public readonly spatialLinksLayer: Container;
  public readonly topInkLayer: Container;
  public readonly attachmentsLayer: Container;
  public readonly selectionLayer: Container;
  public readonly interactionLayer: Container;

  constructor() {
    this.rootContainer = new Container();
    this.rootContainer.label = "RootContainer";

    this.pageContainer = new Container();
    this.pageContainer.label = "PageContainer";

    this.backgroundLayer = new Container();
    this.backgroundLayer.label = "BackgroundLayer";

    this.spatialGroupsLayer = new Container();
    this.spatialGroupsLayer.label = "SpatialGroupsLayer";

    this.imagesLayer = new Container();
    this.imagesLayer.label = "ImagesLayer";

    this.bottomInkLayer = new Container();
    this.bottomInkLayer.label = "BottomInkLayer";

    this.tablesLayer = new Container();
    this.tablesLayer.label = "TablesLayer";

    this.shapesLayer = new Container();
    this.shapesLayer.label = "ShapesLayer";

    this.textLayer = new Container();
    this.textLayer.label = "TextLayer";

    this.stickyNotesLayer = new Container();
    this.stickyNotesLayer.label = "StickyNotesLayer";

    this.annotationsLayer = new Container();
    this.annotationsLayer.label = "AnnotationsLayer";

    this.spatialLinksLayer = new Container();
    this.spatialLinksLayer.label = "SpatialLinksLayer";

    this.topInkLayer = new Container();
    this.topInkLayer.label = "TopInkLayer";

    this.attachmentsLayer = new Container();
    this.attachmentsLayer.label = "AttachmentsLayer";

    this.selectionLayer = new Container();
    this.selectionLayer.label = "SelectionLayer";

    this.interactionLayer = new Container();
    this.interactionLayer.label = "InteractionLayer";

    // Build hierarchy in strict visual order (bottom to top)
    this.pageContainer.addChild(
      this.backgroundLayer,
      this.spatialGroupsLayer,
      this.imagesLayer,
      this.bottomInkLayer,
      this.tablesLayer,
      this.shapesLayer,
      this.textLayer,
      this.stickyNotesLayer,
      this.annotationsLayer,
      this.spatialLinksLayer,
      this.topInkLayer,
      this.attachmentsLayer,
      this.selectionLayer,
      this.interactionLayer
    );

    this.rootContainer.addChild(this.pageContainer);
  }

  public updateViewport(transform: ViewportTransform): void {
    this.pageContainer.position.set(transform.x, transform.y);
    this.pageContainer.scale.set(transform.scale, transform.scale);
    if (transform.rotation !== undefined) {
      this.pageContainer.rotation = transform.rotation;
    }
  }

  public clearContent(): void {
    this.backgroundLayer.removeChildren();
    this.imagesLayer.removeChildren();
    this.bottomInkLayer.removeChildren();
    this.tablesLayer.removeChildren();
    this.shapesLayer.removeChildren();
    this.textLayer.removeChildren();
    this.stickyNotesLayer.removeChildren();
    this.topInkLayer.removeChildren();
    this.attachmentsLayer.removeChildren();
    this.selectionLayer.removeChildren();
    this.interactionLayer.removeChildren();
  }

  public destroy(): void {
    this.rootContainer.destroy({
      children: true,
      texture: false,
    });
  }
}
