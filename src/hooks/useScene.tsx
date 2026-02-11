'use client';

import { useRef, useEffect, useCallback, RefObject } from 'react';
import * as THREE from 'three';
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { ViewportGizmo } from "three-viewport-gizmo"
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { createSkeleton } from '../utils/threeSkel';

export type TransformMode = 'translate' | 'rotate' | 'scale';
export type TransformSpace = 'world' | 'local';
export type RaycastResult = THREE.SkinnedMesh | THREE.Bone | [THREE.Bone, THREE.Bone] | null;

/**
 * Return type of useScene.
 *
 * - **insertObject** – Add an object to the scene.
 * - **removeObject** – Remove an object from the scene. Disposes geometry/material.
 * - **getCamera** – Get the current perspective camera (for cut plane, etc.).
 * - **getCanvas** – Get the renderer canvas element (for overlays, hit testing).
 * - **raycast** / **attach** / **detach** / **setSpace** / **setMode** – Transform controls.
 */
export interface SceneHooks {
    insertObject: (obj: THREE.Object3D) => void;
    removeObject: (obj: THREE.Object3D) => void;
    getCamera: () => THREE.PerspectiveCamera | null;
    getCanvas: () => HTMLCanvasElement | null;
    raycast: (clientX: number, clientY: number) => RaycastResult;
    attach: (obj: THREE.Object3D) => void;
    detach: () => void;
    setSpace: (space: TransformSpace) => void;
    setMode: (mode: TransformMode) => void;
}

// Default configuration constants
const DEFAULT_FOV = 75;
const DEFAULT_NEAR = 0.1;
const DEFAULT_FAR = 100000;
const DEFAULT_INITIAL_POSITION = { x: 0, y: 0, z: 100 };
const DEFAULT_BACKGROUND_COLOR = 0x1a1a2e;
/**
 * Creates and manages a 3D scene: scene, camera, renderer, OrbitControls, ViewportGizmo, and TransformControls.
 * Resize is driven by the container (ResizeObserver); no window resize listener.
 *
 * @param containerRef - Ref to the HTML div that will host the canvas
 * @returns SceneHooks: {
 *      insertObject,
 *      removeObject,
 *      raycast,
 *      attach,
 *      detach,
 *      setSpace,
 *      setMode
 * }
 */
export function useScene(containerRef: RefObject<HTMLDivElement>): SceneHooks {
    const sceneRef = useRef<THREE.Scene | null>(null);
    const gizmoRef = useRef<ViewportGizmo | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const cameraControlsRef = useRef<OrbitControls | null>(null);
    const objectControlsRef = useRef<TransformControls | null>(null);
    const frameIdRef = useRef<number | null>(null);
    const mesh2HelperRef = useRef<Map<number, THREE.Group>>(new Map());
    const meshCounterRef = useRef(0);

    const insertObject = useCallback((obj: THREE.Object3D) => {
        if (!sceneRef.current) return;

        sceneRef.current.add(obj);
        if (obj instanceof THREE.SkinnedMesh) {
            const helper = createSkeleton(obj);
            const id = meshCounterRef.current;
            obj.userData.id = id;
            mesh2HelperRef.current.set(id, helper);
            meshCounterRef.current++;
            sceneRef.current.add(helper);
            sceneRef.current.updateMatrixWorld(true);
        }
    }, []);

    const removeObject = useCallback((obj: THREE.Object3D) => {
        if (!sceneRef.current || !obj) return;
        if (obj instanceof THREE.SkinnedMesh) {
            const id = obj.userData.id;
            const helper = mesh2HelperRef.current.get(id);
            if (helper) {
                helper.children.forEach(child => child.dispose());
                sceneRef.current.remove(helper);
                mesh2HelperRef.current.delete(id);
            } else {
                console.warn('[useScene] Helper not found for skinned mesh');
            }
        }
        sceneRef.current.detach();
        sceneRef.current.remove(obj);
    }, []);

    const getCamera = useCallback(() => cameraRef.current, []);
    const getCanvas = useCallback(() => rendererRef.current?.domElement ?? null, []);

    const raycast = useCallback((clientX: number, clientY: number): RaycastResult => {
        const renderer = rendererRef.current;
        const camera = cameraRef.current;
        const scene = sceneRef.current;
        if (!renderer?.domElement || !camera || !scene)
            return null;

        const rect = renderer.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(ndc, camera);
        const helpers: THREE.Mesh[] = [];
        const meshes: THREE.SkinnedMesh[] = [];

        scene.children.forEach(child => {
            if (child instanceof THREE.SkinnedMesh) {
                meshes.push(child);
            } else if (child.userData?.isHelper) {
                helpers.push(...child.children);
            }
        });
        let intersects = raycaster.intersectObjects(helpers, false)
        if (intersects.length > 0) {
            let obj = intersects[0].object;
            if (obj?.isHelperJoint) return obj.joint as THREE.Bone;
            if (obj?.isHelperBone)  return [obj.jointA as THREE.Bone, obj.jointB as THREE.Bone];
        }
        intersects = raycaster.intersectObjects(meshes, false);
        if (intersects.length > 0)
            return intersects[0].object as THREE.SkinnedMesh;
        
        return null;
    }, []);

    const attach = useCallback((obj: THREE.Object3D) => {
        objectControlsRef.current?.attach(obj);
    }, []);
    const detach = useCallback(() => {
        objectControlsRef.current?.detach();
    }, []);
    const setSpace = useCallback((space: TransformSpace) => {
        objectControlsRef.current?.setSpace(space);
    }, []);
    const setMode = useCallback((mode: TransformMode) => {
        objectControlsRef.current?.setMode(mode);
    }, []);

    useEffect(() => {
        if (!containerRef.current) {
            console.warn('[useScene] Container not ready');
            return;
        }

        const container = containerRef.current;
        const existingCanvases = container.querySelectorAll('canvas');
        existingCanvases.forEach((canvas) => {
            container.removeChild(canvas);
        });
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(DEFAULT_BACKGROUND_COLOR);

        scene.add(new THREE.GridHelper(1000, 100, 0x444444, 0x222222));
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));

        const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
        directionalLight1.position.set(50, 50, 50);
        directionalLight2.position.set(-50, 30, -50);
        directionalLight1.castShadow = true;
        scene.add(directionalLight1);
        scene.add(directionalLight2);

        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(
            DEFAULT_FOV,
            1,
            DEFAULT_NEAR,
            DEFAULT_FAR
        );
        camera.position.set(
            DEFAULT_INITIAL_POSITION.x,
            DEFAULT_INITIAL_POSITION.y,
            DEFAULT_INITIAL_POSITION.z
        );
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.shadowMap.enabled = true;
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const applySize = () => {
            const width = container.clientWidth || 800;
            const height = container.clientHeight || 600;
            if (width > 0 && height > 0 && cameraRef.current && rendererRef.current) {
                cameraRef.current.aspect = width / height;
                cameraRef.current.updateProjectionMatrix();
                rendererRef.current.setSize(width, height);
                gizmoRef.current?.update?.();
            }
        };
        applySize();
        const timeoutId = setTimeout(applySize, 100);

        const ro = new ResizeObserver(() => applySize());
        ro.observe(container);

        const cameraControls = new OrbitControls(camera, renderer.domElement);
        cameraControls.enableDamping = true;
        cameraControls.dampingFactor = 0.05;
        cameraControlsRef.current = cameraControls;

        const objectControls = new TransformControls(camera, renderer.domElement);
        objectControls.setMode('translate');
        objectControls.setSpace('world');
        scene.add(objectControls.getHelper());
        objectControlsRef.current = objectControls;
        objectControls.addEventListener('dragging-changed', (event) => {
            if (cameraControlsRef.current) {
                cameraControlsRef.current.enabled = !event.value;
            }
        });

        gizmoRef.current = new ViewportGizmo(camera, renderer, {
            placement: 'top-left',
            offset: { left: 20, top: 20 },
        });
        gizmoRef.current.attachControls(cameraControls);

        const render = () => {
            frameIdRef.current = requestAnimationFrame(render);
            const currentScene = sceneRef.current;
            const currentGizmo = gizmoRef.current;
            const currentCamera = cameraRef.current;
            const currentRenderer = rendererRef.current;
            const currentCameraControls = cameraControlsRef.current;
            const currentObjectControls = objectControlsRef.current;

            if (
                currentScene &&
                currentCamera &&
                currentRenderer &&
                currentCameraControls &&
                currentObjectControls &&
                currentGizmo
            ) {
                currentCameraControls.update();
                currentObjectControls.update();
                currentRenderer.render(currentScene, currentCamera);
                currentGizmo.render();
            }
        };
        render();

        return () => {
            ro.disconnect();
            clearTimeout(timeoutId);
            if (frameIdRef.current !== null) {
                cancelAnimationFrame(frameIdRef.current);
                frameIdRef.current = null;
            }
            if (sceneRef.current) {
                sceneRef.current.traverse((obj) => {
                    if (obj instanceof THREE.Mesh) {
                        obj.geometry?.dispose();
                        if (Array.isArray(obj.material)) {
                            obj.material.forEach((mat) => mat.dispose());
                        } else if (obj.material) {
                            obj.material.dispose();
                        }
                    }
                });
                sceneRef.current = null;
            }
            if (cameraControlsRef.current) {
                cameraControlsRef.current.dispose();
                cameraControlsRef.current = null;
            }
            if (objectControlsRef.current) {
                objectControlsRef.current.dispose();
                objectControlsRef.current = null;
            }
            if (gizmoRef.current) {
                gizmoRef.current.dispose();
                gizmoRef.current = null;
            }
            if (container && rendererRef.current?.domElement && container.contains(rendererRef.current.domElement)) {
                container.removeChild(rendererRef.current.domElement);
            }
            if (rendererRef.current) {
                rendererRef.current.dispose();
                rendererRef.current = null;
            }
            cameraRef.current = null;
        };
    }, [containerRef]);

    return {
        insertObject,
        removeObject,
        getCamera,
        getCanvas,
        raycast,
        attach,
        detach,
        setSpace,
        setMode,
    };
}
