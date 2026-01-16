'use client';

import { useRef, useEffect, RefObject } from 'react';
import * as THREE from 'three';
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { ViewportGizmo } from "three-viewport-gizmo"

export interface ViewSpaceReturn {
    sceneRef: RefObject<THREE.Scene>;
    cameraRef: RefObject<THREE.PerspectiveCamera>;
    rendererRef: RefObject<THREE.WebGLRenderer>;
    controlsRef: RefObject<OrbitControls>;
}

// Default configuration constants
const DEFAULT_FOV = 75;
const DEFAULT_NEAR = 0.1;
const DEFAULT_FAR = 100000;
const DEFAULT_INITIAL_POSITION = { x: 0, y: 0, z: 100 };
const DEFAULT_BACKGROUND_COLOR = 0x1a1a2e;

/**
 * Hook for creating and managing a 3D view space with Three.js
 * 
 * Creates a scene, camera, renderer, and TrackballControls with default settings.
 * The view space is always interactive and auto-renders.
 * Users can add lights and objects to the scene, and configure camera properties via the returned refs.
 * 
 * @param containerRef - Ref to the HTML div element that will contain the canvas
 * @returns Object containing refs to scene, camera, renderer, and controls
 * 
 * @example
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * const { sceneRef, cameraRef, rendererRef, controlsRef } = useViewSpace(containerRef);
 * 
 * // Configure camera properties
 * useEffect(() => {
 *   if (cameraRef.current) {
 *     cameraRef.current.fov = 60;
 *     cameraRef.current.near = 0.1;
 *     cameraRef.current.far = 1000;
 *     cameraRef.current.updateProjectionMatrix();
 *   }
 * }, [cameraRef]);
 * 
 * // Add lights and objects to the scene
 * useEffect(() => {
 *   if (sceneRef.current) {
 *     const light = new THREE.AmbientLight(0xffffff, 0.6);
 *     sceneRef.current.add(light);
 *     
 *     const mesh = new THREE.Mesh(geometry, material);
 *     sceneRef.current.add(mesh);
 *   }
 * }, [sceneRef]);
 * ```
 */
export function useViewSpace(
    containerRef: RefObject<HTMLDivElement>
): ViewSpaceReturn {
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const animationFrameIdRef = useRef<number | null>(null);

     // Initialize the 3D view space
    useEffect(() => {
        if (!containerRef.current) {
            console.warn('[useViewSpace] Container not ready');
            return;
        }

        const container = containerRef.current;
        const existingCanvases = container.querySelectorAll('canvas');
        existingCanvases.forEach(canvas => {
            container.removeChild(canvas);
        });
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(DEFAULT_BACKGROUND_COLOR);
        sceneRef.current = scene;

        // Get container dimensions
        const width = container.clientWidth || 800;
        const height = container.clientHeight || 600;

        const camera = new THREE.PerspectiveCamera(
            DEFAULT_FOV,
            width / height,
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
        renderer.setSize(width, height);
        renderer.shadowMap.enabled = true;
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controlsRef.current = controls;
        
        const gizmo = new ViewportGizmo(camera, renderer);
        gizmo.attachControls(controls);

        const render = () => {
            const currentScene = sceneRef.current;
            const currentCamera = cameraRef.current;
            const currentRenderer = rendererRef.current;
            const currentControls = controlsRef.current;
            
            if (currentScene && currentCamera && currentRenderer && currentControls) {
                currentControls.update();
                currentRenderer.render(currentScene, currentCamera);
                gizmo.render();
            }
        };
        const animate = () => {
            animationFrameIdRef.current = requestAnimationFrame(animate);
            render();
        };
        animate();

        const handleResize = () => {
            if (!container || !cameraRef.current || !rendererRef.current) return;

            const newWidth = container.clientWidth || 800;
            const newHeight = container.clientHeight || 600;

            cameraRef.current.aspect = newWidth / newHeight;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(newWidth, newHeight);
            gizmo.update();
        };
        window.addEventListener('resize', handleResize);

        return () => {
            if (animationFrameIdRef.current !== null) {
                cancelAnimationFrame(animationFrameIdRef.current);
                animationFrameIdRef.current = null;
            }
            window.removeEventListener('resize', handleResize);

            if (container && rendererRef.current?.domElement && 
                container.contains(rendererRef.current.domElement)
            ) { 
                container.removeChild(rendererRef.current.domElement);
            }

            if (controlsRef.current) {
                controlsRef.current.dispose();
                controlsRef.current = null;
            }
            gizmo.dispose();
        };
    }, [containerRef]);

    return {
        sceneRef,
        cameraRef,
        rendererRef,
        controlsRef,
    };
}
