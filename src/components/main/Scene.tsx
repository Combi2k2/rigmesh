'use client';

import { useRef, useEffect, useState } from 'react';
import { useViewSpace, ViewSpaceReturn } from '@/hooks/useViewSpace';
import { SceneMenuContext } from '@/hooks/useScene';
import SceneMenu from './SceneMenu';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

export interface SceneProps {
    onSceneReady?: (refs: ViewSpaceReturn) => void;
    setMenuContext?: (context: SceneMenuContext | null) => void;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * Main 3D Scene component for the main viewport
 * 
 * Uses the useViewSpace hook to initialize a 3D scene with camera, renderer, and controls.
 * Renders skinned meshes and handles click events for transformation.
 */
export default function Scene({
    onSceneReady, 
    setMenuContext,
    className = 'w-full h-full',
    style
}: SceneProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewSpaceRefs = useViewSpace(containerRef);
    const transformControlRef = useRef<TransformControls | null>(null);
    const menuContextRef = useRef<SceneMenuContext>({
        selectedMeshes: [],
        selectedAction: null
    });
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

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
            menuContextRef.current.selectedMeshes = [];
            menuContextRef.current.selectedAction = null;
            setMenuPosition(null);
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

    useEffect(() => {
        const scene = viewSpaceRefs.sceneRef.current;
        const camera = viewSpaceRefs.cameraRef.current;
        const renderer = viewSpaceRefs.rendererRef.current;
        if (!scene || !camera || !renderer) return;

        const handleClick = (event: MouseEvent) => {
            const mouse = new THREE.Vector2();
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, camera);

            // Collect all skinned meshes from the scene (they're nested inside bounding box containers)
            const skinnedMeshes: THREE.SkinnedMesh[] = [];
            scene.traverse((object) => {
                if (object instanceof THREE.SkinnedMesh) {
                    skinnedMeshes.push(object);
                }
            });

            // Raycast only against skinned meshes to avoid hitting objects with undefined matrixWorld
            const intersects = raycaster.intersectObjects(skinnedMeshes, false);

            if (intersects.length > 0 && transformControlRef.current) {
                const skinnedMesh = intersects[0].object;
                const bbox = skinnedMesh.parent;
                
                if (event.button === 0) {
                    transformControlRef.current.attach(bbox);
                    menuContextRef.current.selectedMeshes = [];
                    menuContextRef.current.selectedAction = null;
                    setMenuPosition(null);
                } else if (event.button === 2) {
                    event.preventDefault();
                    menuContextRef.current.selectedMeshes.push(skinnedMesh);
                    setMenuPosition({
                        x: event.clientX,
                        y: event.clientY
                    });
                }
            } else {
                if (transformControlRef.current)
                    transformControlRef.current.detach();

                menuContextRef.current.selectedMeshes = [];
                menuContextRef.current.selectedAction = null;
                setMenuPosition(null);
            }
        };

        const handleContextMenu = (event: MouseEvent) => {
            event.preventDefault();
        };

        const canvas = viewSpaceRefs.rendererRef.current.domElement;
        canvas.addEventListener('mousedown', handleClick);
        canvas.addEventListener('contextmenu', handleContextMenu);

        return () => {
            canvas.removeEventListener('mousedown', handleClick);
            canvas.removeEventListener('contextmenu', handleContextMenu);
        };
    }, [viewSpaceRefs]);

    return (
        <>
            <div ref={containerRef} className={className} style={style} />
            <SceneMenu 
                menuContextRef={menuContextRef}
                setMenuContext={setMenuContext}
                position={menuPosition}
            />
        </>
    );
}
