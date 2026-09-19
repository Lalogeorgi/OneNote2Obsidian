import { SpatialBounds } from "../geometry/Bounds";
import { Rectangle } from "../geometry/Rectangle";
import { IdGenerator, ObjectId } from "../model/Ids";
import {
  CanonicalSpatialGroup,
  SpatialGroupRole,
  SpatialGroupStyle,
} from "../model/CanonicalSpatialGroup";
import {
  PageScene,
  PageSceneNode,
  SceneGroupNode,
  SceneStickyNoteNode,
} from "../pagescene/PageScene";

export interface CreateGroupOptions {
  readonly title?: string;
  readonly groupRole?: SpatialGroupRole;
  readonly style?: SpatialGroupStyle;
  readonly padding?: number;
  readonly headerHeight?: number;
}

/**
 * Spatial Group Engine: Manages clustering, bounding kinematics,
 * grouping/ungrouping, and decoupled opacity hierarchies.
 */
export class SpatialGroupManager {
  public static readonly DEFAULT_PADDING = 24;
  public static readonly DEFAULT_HEADER_HEIGHT = 36;

  /**
   * Creates a new spatial group enclosing the specified member nodes.
   */
  public static createGroup(
    scene: PageScene,
    memberIds: readonly ObjectId[],
    options: CreateGroupOptions = {}
  ): SceneGroupNode | null {
    if (memberIds.length === 0) return null;

    const members = scene.nodes.filter(
      (n) => memberIds.includes(n.id) && n.layer !== "spatialGroups"
    );
    if (members.length === 0) return null;

    const padding = options.padding ?? SpatialGroupManager.DEFAULT_PADDING;
    const headerHeight = options.headerHeight ?? SpatialGroupManager.DEFAULT_HEADER_HEIGHT;

    // 1. Calculate minimal enclosing bounding box
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let minZIndex = Infinity;

    for (const m of members) {
      if (m.bounds.x < minX) minX = m.bounds.x;
      if (m.bounds.y < minY) minY = m.bounds.y;
      const right = m.bounds.x + m.bounds.width;
      const bottom = m.bounds.y + m.bounds.height;
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
      if (m.zIndex < minZIndex) minZIndex = m.zIndex;
    }

    const groupBounds: SpatialBounds = {
      x: minX - padding,
      y: minY - padding - headerHeight,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2 + headerHeight,
      zIndex: Math.max(0, minZIndex - 1),
    };

    const groupId = IdGenerator.objectId("grp");
    const now = Date.now();

    const canonicalGroup: CanonicalSpatialGroup = {
      type: "spatialGroup",
      id: groupId,
      title: options.title || "Group",
      bounds: groupBounds,
      memberIds: members.map((m) => m.id),
      groupRole: options.groupRole || "frame",
      style: options.style || {
        backgroundColor: "rgba(59, 130, 246, 0.05)",
        borderColor: "rgba(59, 130, 246, 0.3)",
        borderWidth: 1.5,
        borderStyle: "dashed",
        opacity: 1.0,
      },
      createdTime: now,
      modifiedTime: now,
    };

    const groupNode: SceneGroupNode = {
      id: groupId,
      layer: "spatialGroups",
      bounds: groupBounds,
      aabb: Rectangle.create(groupBounds.x, groupBounds.y, groupBounds.width, groupBounds.height),
      zIndex: groupBounds.zIndex ?? 0,
      visible: true,
      opacity: canonicalGroup.style?.opacity ?? 1.0,
      element: canonicalGroup,
      title: canonicalGroup.title,
      memberIds: canonicalGroup.memberIds,
      style: canonicalGroup.style,
    };

    // 2. Attach grouping metadata to member sticky notes
    for (const m of members) {
      if (m.layer === "stickyNotes") {
        const sticky = m as SceneStickyNoteNode;
        (sticky.element as any).grouping = {
          groupId,
          groupRole: "member",
        };
      }
    }

    // 3. Register in scene
    scene.nodes.unshift(groupNode);
    if (!scene.groups) scene.groups = [];
    scene.groups.push(canonicalGroup);

    return groupNode;
  }

  /**
   * Dissolves a spatial group, detaching members without modifying their coordinates or properties.
   */
  public static ungroup(scene: PageScene, groupId: ObjectId): boolean {
    const groupIdx = scene.nodes.findIndex((n) => n.id === groupId && n.layer === "spatialGroups");
    if (groupIdx === -1) return false;

    const groupNode = scene.nodes[groupIdx] as SceneGroupNode;

    // Detach grouping metadata from member sticky notes
    for (const memberId of groupNode.memberIds) {
      const member = scene.nodes.find((n) => n.id === memberId);
      if (member && member.layer === "stickyNotes") {
        const sticky = member as SceneStickyNoteNode;
        delete (sticky.element as any).grouping;
      }
    }

    // Remove group node from scene
    scene.nodes.splice(groupIdx, 1);

    if (scene.groups) {
      scene.groups = scene.groups.filter((g) => g.id !== groupId);
    }

    return true;
  }

  /**
   * Moves a spatial group and all of its contained member objects proportionally in O(K) time.
   */
  public static moveGroup(
    scene: PageScene,
    groupId: ObjectId,
    deltaX: number,
    deltaY: number
  ): PageSceneNode[] {
    const groupNode = scene.nodes.find((n) => n.id === groupId && n.layer === "spatialGroups") as
      SceneGroupNode | undefined;

    if (!groupNode) return [];

    // 1. Move group container bounds
    groupNode.bounds = {
      ...groupNode.bounds,
      x: groupNode.bounds.x + deltaX,
      y: groupNode.bounds.y + deltaY,
    };
    groupNode.aabb = Rectangle.create(
      groupNode.bounds.x,
      groupNode.bounds.y,
      groupNode.bounds.width,
      groupNode.bounds.height
    );
    (groupNode.element as any).bounds = groupNode.bounds;

    const movedMembers: PageSceneNode[] = [];

    // 2. Move each member object
    for (const memberId of groupNode.memberIds) {
      const member = scene.nodes.find((n) => n.id === memberId);
      if (!member) continue;

      member.bounds = {
        ...member.bounds,
        x: member.bounds.x + deltaX,
        y: member.bounds.y + deltaY,
      };
      member.aabb = Rectangle.create(
        member.bounds.x,
        member.bounds.y,
        member.bounds.width,
        member.bounds.height
      );

      if (member.element) {
        (member.element as any).bounds = member.bounds;
      }

      movedMembers.push(member);
    }

    return movedMembers;
  }

  /**
   * Recalculates minimal enclosing bounding box for a group based on current member positions.
   */
  public static recalculateGroupBounds(
    scene: PageScene,
    groupId: ObjectId,
    padding = SpatialGroupManager.DEFAULT_PADDING,
    headerHeight = SpatialGroupManager.DEFAULT_HEADER_HEIGHT
  ): SpatialBounds | null {
    const groupNode = scene.nodes.find((n) => n.id === groupId && n.layer === "spatialGroups") as
      SceneGroupNode | undefined;

    if (!groupNode || groupNode.memberIds.length === 0) return null;

    const members = scene.nodes.filter((n) => groupNode.memberIds.includes(n.id));
    if (members.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const m of members) {
      if (m.bounds.x < minX) minX = m.bounds.x;
      if (m.bounds.y < minY) minY = m.bounds.y;
      const right = m.bounds.x + m.bounds.width;
      const bottom = m.bounds.y + m.bounds.height;
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
    }

    const newBounds: SpatialBounds = {
      x: minX - padding,
      y: minY - padding - headerHeight,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2 + headerHeight,
      zIndex: groupNode.bounds.zIndex,
    };

    groupNode.bounds = newBounds;
    groupNode.aabb = Rectangle.create(newBounds.x, newBounds.y, newBounds.width, newBounds.height);
    (groupNode.element as any).bounds = newBounds;

    return newBounds;
  }

  /**
   * Adds an existing canvas node to a spatial group.
   */
  public static addMemberToGroup(scene: PageScene, groupId: ObjectId, memberId: ObjectId): boolean {
    const groupNode = scene.nodes.find((n) => n.id === groupId && n.layer === "spatialGroups") as
      SceneGroupNode | undefined;
    const member = scene.nodes.find((n) => n.id === memberId && n.layer !== "spatialGroups");

    if (!groupNode || !member) return false;
    if (groupNode.memberIds.includes(memberId)) return true;

    (groupNode as any).memberIds = [...groupNode.memberIds, memberId];
    (groupNode.element as any).memberIds = groupNode.memberIds;

    if (member.layer === "stickyNotes") {
      const sticky = member as SceneStickyNoteNode;
      (sticky.element as any).grouping = {
        groupId,
        groupRole: "member",
      };
    }

    SpatialGroupManager.recalculateGroupBounds(scene, groupId);
    return true;
  }

  /**
   * Removes a member from a spatial group.
   */
  public static removeMemberFromGroup(
    scene: PageScene,
    groupId: ObjectId,
    memberId: ObjectId
  ): boolean {
    const groupNode = scene.nodes.find((n) => n.id === groupId && n.layer === "spatialGroups") as
      SceneGroupNode | undefined;
    if (!groupNode) return false;

    (groupNode as any).memberIds = groupNode.memberIds.filter((id) => id !== memberId);
    (groupNode.element as any).memberIds = groupNode.memberIds;

    const member = scene.nodes.find((n) => n.id === memberId);
    if (member && member.layer === "stickyNotes") {
      const sticky = member as SceneStickyNoteNode;
      delete (sticky.element as any).grouping;
    }

    if (groupNode.memberIds.length === 0) {
      SpatialGroupManager.ungroup(scene, groupId);
    } else {
      SpatialGroupManager.recalculateGroupBounds(scene, groupId);
    }

    return true;
  }

  /**
   * Computes effective rendered opacity without conflating or mutating persisted note opacity.
   * O_eff = O_group * O_object
   */
  public static computeEffectiveOpacity(node: PageSceneNode, scene: PageScene): number {
    const objOpacity = typeof node.opacity === "number" ? node.opacity : 1.0;

    // Find if node belongs to any spatial group
    const group = scene.nodes.find(
      (n) => n.layer === "spatialGroups" && (n as SceneGroupNode).memberIds.includes(node.id)
    ) as SceneGroupNode | undefined;

    if (!group) return objOpacity;

    const groupOpacity = typeof group.style?.opacity === "number" ? group.style.opacity : 1.0;
    return Number((groupOpacity * objOpacity).toFixed(4));
  }
}
