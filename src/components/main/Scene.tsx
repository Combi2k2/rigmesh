'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useViewSpace, ViewSpaceReturn } from '@/hooks/useViewSpace';
import { MenuAction } from '@/hooks/useScene';
import SceneMenu, { MenuPosition } from './SceneMenu';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

export interface SceneProps {
    onSceneReady?: (refs: ViewSpaceReturn) => void;
    onMenuAction?: (action: MenuAction, meshes: THREE.SkinnedMesh[]) => void;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * Main 3D Scene component for the main viewport
 * 
 * Uses the useViewSpace hook to initialize a 3D scene with camera, renderer, and controls.
 * Renders skinned meshes and handles click events for transformation and context menus.
 */
export default function Scene({
    onSceneReady, 
    onMenuAction,
    className = 'w-full h-full',
    style
}: SceneProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewSpaceRefs = useViewSpace(containerRef);
    const transformControlRef = useRef<TransformControls | null>(null);
    
    // Menu state
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
    const [selectedMeshes, setSelectedMeshes] = useState<THREE.SkinnedMesh[]>([]);
    const [mergeTargetMesh, setMergeTargetMesh] = useState<THREE.SkinnedMesh | null>(null);

    // Initialize transform controls and setup
    useEffect(() => {
        const container = containerRef.current;
        const renderer = viewSpaceRefs.rendererRef.current;
        const camera = viewSpaceRefs.cameraRef.current;
        const scene = viewSpaceRefs.sceneRef.current;
        
        if (!container || !renderer || !camera || !scene)
            return;

        const resizeObserver = new ResizeObserver(() => {
            const width = container.clientWidth || 800;
            const height = container.clientHeight || 600;
            
            if (width > 0 && height > 0) {
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
                renderer.setSize(width, height);
            }
        });
        resizeObserver.observe(container);

        const checkAndResize = () => {
            const width = container.clientWidth || 800;
            const height = container.clientHeight || 600;
            if (width > 0 && height > 0) {
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
                renderer.setSize(width, height);
            }
        };

        checkAndResize();
        const timeoutId = setTimeout(checkAndResize, 100);

        if (style?.display !== 'none') {
            const transformControl = new TransformControls(camera, renderer.domElement);
            transformControl.setMode('translate');
            transformControl.setSpace('world');
            scene.add(transformControl.getHelper());

            transformControl.addEventListener('dragging-changed', (event) => {
                if (viewSpaceRefs.controlsRef.current) {
                    viewSpaceRefs.controlsRef.current.enabled = !event.value;
                }
            });
            
            transformControlRef.current = transformControl;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (!transformControlRef.current) return;
            switch (event.key.toLowerCase()) {
                case 'g':
                    transformControlRef.current.setMode('translate');
                    break;
                case 'r':
                    transformControlRef.current.setMode('rotate');
                    break;
                case 's':
                    transformControlRef.current.setMode('scale');
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            resizeObserver.disconnect();
            clearTimeout(timeoutId);
            window.removeEventListener('keydown', handleKeyDown);
            if (transformControlRef.current) {
                scene.remove(transformControlRef.current.getHelper());
                transformControlRef.current.dispose();
                transformControlRef.current = null;
            }
        };
    }, [viewSpaceRefs, style?.display]);
    
    useEffect(() => {
        if (onSceneReady && viewSpaceRefs.sceneRef.current) {
            onSceneReady(viewSpaceRefs);
        }
    }, [onSceneReady, viewSpaceRefs]);

    // Helper function to convert screen coordinates to normalized device coordinates
    const screenToNDC = useCallback((clientX: number, clientY: number, rect: DOMRect) => {
        return new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        );
    }, []);

    const raycast = useCallback((
        mouse: THREE.Vector2,
        camera: THREE.Camera,
        scene: THREE.Scene
    ): THREE.SkinnedMesh | null => {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);

        const meshes = scene.children.filter((child) => child instanceof THREE.SkinnedMesh) as THREE.SkinnedMesh[];
        const mesh = raycaster.intersectObjects(meshes, false)[0]?.object as THREE.SkinnedMesh | undefined;

        if (mesh) {
            let bones = mesh.skeleton.bones.map((bone) => bone.children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh);
            let bone = raycaster.intersectObjects(bones, false)[0]?.object as THREE.Mesh | undefined;

            return [mesh, bone?.parent as THREE.Bone | undefined];
        } else {
            return [null, null];
        }
    }, []);

    // Handle left click for transform controls
    useEffect(() => {
        const scene = viewSpaceRefs.sceneRef.current;
        const camera = viewSpaceRefs.cameraRef.current;
        const renderer = viewSpaceRefs.rendererRef.current;
        if (!scene || !camera || !renderer) return;

        const handleLeftClick = (event: MouseEvent) => {
            if (event.button !== 0) return;

            // Close menu on left click
            setIsMenuOpen(false);
            setMenuPosition(null);

            if (!transformControlRef.current) return;

            const rect = renderer.domElement.getBoundingClientRect();
            const mouse = new THREE.Vector2(
                ((event.clientX - rect.left) / rect.width) * 2 - 1,
                -((event.clientY - rect.top) / rect.height) * 2 + 1
            );
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, camera);
            const meshes = scene.children.filter((child) => child instanceof THREE.SkinnedMesh) as THREE.SkinnedMesh[];
            const mesh = raycaster.intersectObjects(meshes, false)[0]?.object as THREE.SkinnedMesh | undefined;

            if (mesh) {
                let bones = mesh.skeleton.bones.map((bone) => bone.children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh);
                let bone = raycaster.intersectObjects(bones, false)[0]?.object as THREE.Mesh | undefined;
            
                if (bone) {
                    bone = bone.parent as THREE.Bone;
                    transformControlRef.current.setSpace('local');
                    transformControlRef.current.attach(bone);

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
                    transformControlRef.current.setSpace('world');
                    transformControlRef.current.attach(mesh);

                    if (mesh.geometry.getAttribute('color'))
                        mesh.geometry.deleteAttribute('color');
                    
                    mesh.material.vertexColors = false;
                    mesh.material.needsUpdate = true;
                }
            } else {
                transformControlRef.current.detach();
                setSelectedMeshes([]);
            }
        };

        const canvas = renderer.domElement;
        canvas.addEventListener('mousedown', handleLeftClick);

        return () => {
            canvas.removeEventListener('mousedown', handleLeftClick);
        };
    }, [viewSpaceRefs]);

    // Handle right click for context menu
    useEffect(() => {
        const scene = viewSpaceRefs.sceneRef.current;
        const camera = viewSpaceRefs.cameraRef.current;
        const renderer = viewSpaceRefs.rendererRef.current;
        if (!scene || !camera || !renderer) return;

        const handleContextMenu = (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();

            const rect = renderer.domElement.getBoundingClientRect();
            const mouse = screenToNDC(event.clientX, event.clientY, rect);
            const [mesh, bone] = raycast(mouse, camera, scene);

            if (mesh) {
                setSelectedMeshes([mesh]);
                setMenuPosition({
                    x: event.clientX,
                    y: event.clientY
                });
                setIsMenuOpen(true);
            } else {
                // Clicked on empty space, close menu
                setIsMenuOpen(false);
                setMenuPosition(null);
                setSelectedMeshes([]);
            }
        };

        const canvas = renderer.domElement;
        canvas.addEventListener('contextmenu', handleContextMenu);

        return () => {
            canvas.removeEventListener('contextmenu', handleContextMenu);
        };
    }, [viewSpaceRefs, screenToNDC, raycast]);

    // Handle menu actions
    const handleMenuAction = useCallback((action: MenuAction, meshes: THREE.SkinnedMesh[]) => {
        if (onMenuAction) {
            onMenuAction(action, meshes);
        }

        // Clear merge target for non-merge actions
        if (action !== 'merge') {
            setMergeTargetMesh(null);
        } else {
            // Merge action - clear target after merge
            setMergeTargetMesh(null);
        }
    }, [onMenuAction]);

    // Handle selecting mesh for merge
    const handleSelectForMerge = useCallback((meshes: THREE.SkinnedMesh[]) => {
        if (meshes.length > 0) {
            setMergeTargetMesh(meshes[0]);
        }
    }, []);

    // Handle menu close
    const handleMenuClose = useCallback(() => {
        setIsMenuOpen(false);
        setMenuPosition(null);
        // Don't clear selectedMeshes here - they might be needed for actions
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
