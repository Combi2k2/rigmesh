'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Bone, Lightbulb, Grid3x3 } from 'lucide-react';
import * as THREE from 'three';

// --- Types ---

type NodeType = 'mesh' | 'bone' | 'light' | 'grid';

interface SceneNode {
    id: number;
    name: string;
    type: NodeType;
    object: THREE.Object3D;
    children: SceneNode[];
    depth: number;
}

// --- Tree building ---

function nodeType(obj: THREE.Object3D): NodeType | null {
    if (obj instanceof THREE.GridHelper) return 'grid';
    if (obj instanceof THREE.Light) return 'light';
    if (obj instanceof THREE.SkinnedMesh) return 'mesh';
    if (obj instanceof THREE.Bone) return 'bone';
    return null;
}

function isSceneInfra(obj: THREE.Object3D): boolean {
    if (obj.userData?.isHelper) return true;
    if ((obj as any).isTransformControls) return true;
    if ((obj as any).isTransformControlsPlane) return true;
    // TransformControls helper group
    if (obj.type === 'TransformControlsPlane' || obj.type === 'TransformControls') return true;
    return false;
}

function buildNode(obj: THREE.Object3D, depth: number): SceneNode | null {
    if (isSceneInfra(obj)) return null;

    const type = nodeType(obj);
    const children: SceneNode[] = [];

    for (const child of obj.children) {
        const node = buildNode(child, depth + 1);
        if (node) children.push(node);
    }

    if (!type && children.length === 0) return null;
    // Skip untyped wrapper — bubble up children
    if (!type) return children.length === 1 ? children[0] : null;

    return {
        id: obj.id,
        name: obj.name || `${type}_${obj.id}`,
        type,
        object: obj,
        children,
        depth,
    };
}

function collectFromScene(scene: THREE.Scene): SceneNode[] {
    const nodes: SceneNode[] = [];
    for (const child of scene.children) {
        const node = buildNode(child, 0);
        if (node) nodes.push(node);
    }
    return nodes;
}

// --- Icons ---

const ICON_MAP: Record<NodeType, React.ComponentType<{ size: number; className?: string }>> = {
    mesh: Box,
    bone: Bone,
    light: Lightbulb,
    grid: Grid3x3,
};

const COLOR_MAP: Record<NodeType, string> = {
    mesh: 'text-green-400',
    bone: 'text-yellow-400',
    light: 'text-orange-300',
    grid: 'text-gray-500',
};

// --- Row component ---

interface TreeRowProps {
    node: SceneNode;
    index: number;
    selectedId: number | null;
    onSelect: (node: SceneNode) => void;
    onHoverStart: (node: SceneNode) => void;
    onHoverEnd: (node: SceneNode) => void;
}

function TreeRow({ node, index, selectedId, onSelect, onHoverStart, onHoverEnd }: TreeRowProps) {
    const [expanded, setExpanded] = useState(true);
    const hasChildren = node.children.length > 0;
    const isSelected = selectedId === node.id;
    const Icon = ICON_MAP[node.type];

    const rowBg = isSelected
        ? 'bg-blue-600/30'
        : index % 2 === 0
        ? 'bg-[#2a2a2a]'
        : 'bg-[#323232]';

    const rows: React.ReactNode[] = [];

    rows.push(
        <div
            key={node.id}
            className={`flex items-center gap-1.5 h-6 cursor-pointer select-none text-xs text-gray-300 ${rowBg} hover:bg-[#3a3a3a]`}
            style={{ paddingLeft: `${node.depth * 14 + 6}px` }}
            onClick={() => onSelect(node)}
            onMouseEnter={() => onHoverStart(node)}
            onMouseLeave={() => onHoverEnd(node)}
        >
            {hasChildren ? (
                <span
                    className="w-3 text-center text-gray-500 flex-shrink-0 cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                >
                    {expanded ? '\u25BE' : '\u25B8'}
                </span>
            ) : (
                <span className="w-3 flex-shrink-0" />
            )}
            <Icon size={12} className={`flex-shrink-0 ${COLOR_MAP[node.type]}`} />
            <span className="truncate">{node.name}</span>
        </div>
    );

    if (expanded && hasChildren) {
        let childIndex = index + 1;
        for (const child of node.children) {
            rows.push(
                <TreeRow
                    key={child.id}
                    node={child}
                    index={childIndex}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    onHoverStart={onHoverStart}
                    onHoverEnd={onHoverEnd}
                />
            );
            childIndex++;
        }
    }

    return <>{rows}</>;
}

// --- Highlight ---

const HIGHLIGHT_COLOR = 0xffaa00;   // orange, matching SkeletonEditUI
const HIGHLIGHT_MESH_COLOR = 0x9b59b6;
const DEFAULT_JOINT_COLOR = 0x00ff00;

function findHelperGroup(bone: THREE.Bone, scene: THREE.Scene): THREE.Group | null {
    // Walk up from bone to find parent SkinnedMesh
    let parent: THREE.Object3D | null = bone.parent;
    while (parent && !(parent instanceof THREE.SkinnedMesh)) parent = parent.parent;
    if (!(parent instanceof THREE.SkinnedMesh)) return null;
    const meshId = parent.userData.id;
    if (meshId == null) return null;

    // Find helper group in scene by matching userData
    for (const child of scene.children) {
        if (child.userData?.isHelper && child instanceof THREE.Group) {
            // Check if any joint helper references a bone from this mesh's skeleton
            for (const h of child.children) {
                const hAny = h as any;
                if (hAny.isHelperJoint && parent.skeleton.bones.includes(hAny.joint)) {
                    return child;
                }
            }
        }
    }
    return null;
}

function setHighlight(obj: THREE.Object3D, on: boolean, scene: THREE.Scene) {
    if (obj instanceof THREE.SkinnedMesh) {
        obj.userData.highlight = on;
        const mat = obj.material;
        if (mat instanceof THREE.MeshStandardMaterial) {
            if (on) {
                obj.userData._prevColor = mat.color.getHex();
                obj.userData._prevVertexColors = mat.vertexColors;
                mat.vertexColors = false;
                mat.color.setHex(HIGHLIGHT_MESH_COLOR);
                mat.needsUpdate = true;
            } else {
                mat.color.setHex(obj.userData._prevColor ?? 0xffffff);
                mat.vertexColors = obj.userData._prevVertexColors ?? false;
                mat.needsUpdate = true;
                delete obj.userData._prevColor;
                delete obj.userData._prevVertexColors;
            }
        }
    } else if (obj instanceof THREE.Bone) {
        const helper = findHelperGroup(obj, scene);
        if (!helper) return;

        // Only highlight the specific joint helper for this bone
        for (const child of helper.children) {
            const c = child as any;
            if (c.isHelperJoint && c.joint === obj) {
                (c.material as THREE.MeshBasicMaterial).color.setHex(
                    on ? HIGHLIGHT_COLOR : DEFAULT_JOINT_COLOR
                );
            }
        }
    }
}

// --- Main component ---

export interface SceneGraphProps {
    scene: THREE.Scene | null;
    onSelect?: (object: THREE.Object3D) => void;
}

export default function SceneGraph({ scene, onSelect }: SceneGraphProps) {
    const [tree, setTree] = useState<SceneNode[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const hoveredRef = useRef<SceneNode | null>(null);
    const sceneRef = useRef(scene);
    sceneRef.current = scene;

    useEffect(() => {
        if (!scene) { setTree([]); return; }

        const rebuild = () => setTree(collectFromScene(scene));
        rebuild();
        const interval = setInterval(rebuild, 1000);
        return () => clearInterval(interval);
    }, [scene]);

    const handleSelect = useCallback((node: SceneNode) => {
        setSelectedId(node.id);
        onSelect?.(node.object);
    }, [onSelect]);

    const handleHoverStart = useCallback((node: SceneNode) => {
        hoveredRef.current = node;
        if (sceneRef.current) setHighlight(node.object, true, sceneRef.current);
    }, []);

    const handleHoverEnd = useCallback((node: SceneNode) => {
        if (hoveredRef.current?.id === node.id) hoveredRef.current = null;
        if (sceneRef.current) setHighlight(node.object, false, sceneRef.current);
    }, []);

    let rowIndex = 0;

    return (
        <div className="flex flex-col h-full">
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-700 bg-[#1e1e1e]">
                Scene Graph
            </div>
            <div className="flex-1 overflow-auto">
                {tree.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-gray-500 italic">No objects</div>
                ) : (
                    tree.map(node => {
                        const el = (
                            <TreeRow
                                key={node.id}
                                node={node}
                                index={rowIndex}
                                selectedId={selectedId}
                                onSelect={handleSelect}
                                onHoverStart={handleHoverStart}
                                onHoverEnd={handleHoverEnd}
                            />
                        );
                        rowIndex++;
                        return el;
                    })
                )}
            </div>
        </div>
    );
}
