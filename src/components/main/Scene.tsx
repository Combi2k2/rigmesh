'use client';

import { useRef, useEffect } from 'react';
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
    const selectedMeshRef = useRef<THREE.SkinnedMesh | null>(null);
    const menuContextRef = useRef<SceneMenuContext>({
        selectedMeshes: [],
        selectedAction: null
    });
    const menuPositionRef = useRef<{ x: number; y: number } | null>(null);

    // Initialize TransformControls
    useEffect(() => {
        const scene = viewSpaceRefs.sceneRef.current;
        const camera = viewSpaceRefs.cameraRef.current;
        const renderer = viewSpaceRefs.rendererRef.current;

        if (!scene || !camera || !renderer) return;

        const transformControl = new TransformControls(camera, renderer.domElement);
        transformControl.setMode('translate');
        transformControl.setSpace('world');
        
        if (typeof transformControl.getHelper === 'function') {
            const helper = transformControl.getHelper();
            scene.add(helper);
        } else {
            scene.add(transformControl as THREE.Object3D);
        }

        transformControl.addEventListener('dragging-changed', (event) => {
            if (viewSpaceRefs.controlsRef.current) {
                viewSpaceRefs.controlsRef.current.enabled = !event.value;
            }
            if (selectedMeshRef.current) {
                const anchor = transformControlRef.current.object;
                selectedMeshRef.current.position.copy(anchor.position);
                selectedMeshRef.current.quaternion.copy(anchor.quaternion);
                selectedMeshRef.current.scale.copy(anchor.scale);
            }
        });
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!transformControlRef.current) return;
            switch (event.key.toLowerCase()) {
                case 'g':
                    transformControl.setMode('translate');
                    break;
                case 'r':
                    transformControl.setMode('rotate');
                    break;
                case 's':
                    transformControl.setMode('scale');
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        transformControlRef.current = transformControl;

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            if (transformControlRef.current) {
                transformControlRef.current.dispose();
                transformControlRef.current = null;
            }
        };
    }, [viewSpaceRefs]);

    // Notify parent when scene is ready
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

            const intersects = raycaster.intersectObjects(scene.children.filter(obj => obj instanceof THREE.SkinnedMesh));

            if (intersects.length > 0 && transformControlRef.current) {
                const skinnedMesh = intersects[0].object as THREE.SkinnedMesh;
                
                if (event.button === 0) {
                    console.log('handleClick');
                    console.log(skinnedMesh);
                    transformControlRef.current.attach(skinnedMesh.skeleton.bones[0]);
                    selectedMeshRef.current = skinnedMesh;
                    menuPositionRef.current = null;
                } else if (event.button === 2) {
                    event.preventDefault();
                    menuContextRef.current.selectedMeshes.push(skinnedMesh);
                    menuPositionRef.current = {
                        x: event.clientX,
                        y: event.clientY
                    };
                }
            } else {
                if (event.button === 0) {
                    if (transformControlRef.current) {
                        transformControlRef.current.detach();
                        selectedMeshRef.current = null;
                    }
                }
                menuPositionRef.current = null;
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
                position={menuPositionRef.current}
            />
        </>
    );
}
