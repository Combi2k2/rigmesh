'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useScene, SceneHooks } from '@/hooks/useScene';
import { MenuAction } from '@/interface';
import SceneMenu, { MenuPosition } from './SceneMenu';
import { traceMesh } from '@/utils/threeSkel';
import * as THREE from 'three';

export interface SceneProps {
    onSceneReady?: (api: SceneHooks) => void;
    onMenuAction?: (action: MenuAction, meshes: THREE.SkinnedMesh[]) => void;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * Main 3D Scene component for the main viewport
 *
 * Uses the useScene hook to initialize a 3D scene with camera, renderer, and controls.
 * Renders skinned meshes and handles click events for transformation and context menus.
 */
export default function Scene({
    onSceneReady,
    onMenuAction,
    className = 'w-full h-full',
    style
}: SceneProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneApi = useScene(containerRef);

    // Menu state
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
    const [selectedMeshes, setSelectedMeshes] = useState<THREE.SkinnedMesh[]>([]);
    const [mergeTargetMesh, setMergeTargetMesh] = useState<THREE.SkinnedMesh | null>(null);

    // Keyboard shortcuts for transform mode (g/r/s)
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            switch (event.key.toLowerCase()) {
                case 'g':
                    sceneApi.setMode('translate');
                    break;
                case 'r':
                    sceneApi.setMode('rotate');
                    break;
                case 's':
                    sceneApi.setMode('scale');
                    break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [sceneApi]);

    useEffect(() => {
        if (onSceneReady) {
            onSceneReady(sceneApi);
        }
    }, [onSceneReady, sceneApi]);

    // Handle left click for transform controls
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const canvas = container.querySelector('canvas');
        if (!canvas) return;

        const handleLeftClick = (event: MouseEvent) => {
            if (event.button !== 0) return;

            setIsMenuOpen(false);
            setMenuPosition(null);

            const result = sceneApi.raycast(event.clientX, event.clientY);
            const mesh = traceMesh(result);
            const bone: THREE.Bone | null =
                result && !(result instanceof THREE.SkinnedMesh)
                    ? (Array.isArray(result) ? result[0] : (result as THREE.Bone))
                    : null;

            if (mesh) {
                if (bone) {
                    sceneApi.setSpace('local');
                    sceneApi.attach(bone);

                    const boneIndex = mesh.skeleton.bones.indexOf(bone);
                    const skinIndices = mesh.geometry.getAttribute('skinIndex') as THREE.BufferAttribute;
                    const skinWeights = mesh.geometry.getAttribute('skinWeight') as THREE.BufferAttribute;

                    const nV = skinIndices.count;
                    const colors = new Float32Array(nV * 3);

                    for (let i = 0; i < nV; i++) {
                        let influence = 0;

                        for (let j = 0; j < 4; j++) {
                            const idx = skinIndices.getComponent(i, j);
                            if (idx === boneIndex) {
                                influence = skinWeights.getComponent(i, j);
                                break;
                            }
                        }
                        colors[i * 3 + 0] = influence;
                        colors[i * 3 + 1] = 0;
                        colors[i * 3 + 2] = 1 - influence;
                    }
                    mesh.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

                    const mat = mesh.material as THREE.MeshStandardMaterial;
                    mat.vertexColors = true;
                    mat.needsUpdate = true;
                } else {
                    sceneApi.setSpace('world');
                    sceneApi.attach(mesh);

                    if (mesh.geometry.getAttribute('color'))
                        mesh.geometry.deleteAttribute('color');

                    const mat = mesh.material as THREE.MeshStandardMaterial;
                    mat.vertexColors = false;
                    mat.needsUpdate = true;
                }
            } else {
                sceneApi.detach();
                setSelectedMeshes([]);
            }
        };

        canvas.addEventListener('mousedown', handleLeftClick);
        return () => canvas.removeEventListener('mousedown', handleLeftClick);
    }, [sceneApi]);

    // Handle right click for context menu
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const canvas = container.querySelector('canvas');
        if (!canvas) return;

        const handleContextMenu = (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();

            const result = sceneApi.raycast(event.clientX, event.clientY);
            const mesh = traceMesh(result);

            if (mesh) {
                setSelectedMeshes([mesh]);
                setMenuPosition({
                    x: event.clientX,
                    y: event.clientY
                });
                setIsMenuOpen(true);
            } else {
                setIsMenuOpen(false);
                setMenuPosition(null);
                setSelectedMeshes([]);
            }
        };

        canvas.addEventListener('contextmenu', handleContextMenu);
        return () => canvas.removeEventListener('contextmenu', handleContextMenu);
    }, [sceneApi]);

    const handleMenuAction = useCallback((action: MenuAction, meshes: THREE.SkinnedMesh[]) => {
        if (action === 'merge' && mergeTargetMesh && meshes.length > 0) {
            if (onMenuAction) {
                onMenuAction(action, [mergeTargetMesh, meshes[0]]);
            }
            setMergeTargetMesh(null);
        } else {
            if (onMenuAction) {
                onMenuAction(action, meshes);
            }
            if (action !== 'merge') {
                setMergeTargetMesh(null);
            }
        }
    }, [onMenuAction, mergeTargetMesh]);

    const handleSelectForMerge = useCallback((meshes: THREE.SkinnedMesh[]) => {
        if (meshes.length > 0) {
            setMergeTargetMesh(meshes[0]);
        }
    }, []);

    const handleMenuClose = useCallback(() => {
        setIsMenuOpen(false);
        setMenuPosition(null);
    }, []);

    return (
        <>
            <div ref={containerRef} className={className} style={style} />
            <SceneMenu
                isOpen={isMenuOpen}
                position={menuPosition}
                selectedMeshes={selectedMeshes}
                hasMergeTarget={mergeTargetMesh !== null}
                onAction={handleMenuAction}
                onSelectForMerge={handleSelectForMerge}
                onClose={handleMenuClose}
            />
        </>
    );
}
