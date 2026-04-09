'use client';

import { useRef, useEffect } from 'react';
import { useScene, SceneHooks } from '@/hooks/useScene';
import { traceMesh } from '@/utils/threeSkel';
import * as THREE from 'three';

export interface SceneProps {
    enableRig?: boolean;
    enableTransform?: boolean;
    onMeshSelect?: (mesh: THREE.SkinnedMesh) => void;
    onSceneReady?: (api: SceneHooks) => void;
    onLeftClick?: (mesh: THREE.SkinnedMesh | null, directMeshClick: boolean) => void;
}

/**
 * Reusable 3D view space for main viewport, meshgen, meshcut, meshmerge, etc.
 * Renders a full scene (camera, renderer, OrbitControls, ViewportGizmo, TransformControls)
 * and handles left-click to attach transform control to mesh or rig based on props.
 * Use enableRig / enableTransform to customize behavior per flow.
 */
export default function Scene({
    enableRig = true,
    enableTransform = true,
    onMeshSelect,
    onSceneReady,
    onLeftClick,
}: SceneProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneApi = useScene(containerRef);
    const apiRef = useRef(sceneApi);
    apiRef.current = sceneApi;

    useEffect(() => {
        onSceneReady?.(apiRef.current);
    }, [onSceneReady]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const canvas = container.querySelector('canvas');
        if (!canvas) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();
            if (key === 'g')    apiRef.current.setMode('translate');
            if (key === 'r')    apiRef.current.setMode('rotate');
            if (key === 's')    apiRef.current.setMode('scale');
        };

        const DRAG_THRESHOLD = 4; // pixels
        let mousePressed = false;
        let mouseDragged = false;
        let downX = 0, downY = 0;

        const handleMouseDown = (event: MouseEvent) => {
            if (event.button === 0) {
                mousePressed = true;
                mouseDragged = false;
                downX = event.clientX;
                downY = event.clientY;
            }
        };

        const handleMouseMove = (event: MouseEvent) => {
            if (!mousePressed || mouseDragged) return;
            const dx = event.clientX - downX;
            const dy = event.clientY - downY;
            if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD)
                mouseDragged = true;
        };

        const handleMouseUp = (event: MouseEvent) => {
            if (event.button !== 0) return;
            const wasDragged = mouseDragged;
            mousePressed = false;
            mouseDragged = false;
            if (wasDragged) return;

            const result = apiRef.current.raycast(event.clientX, event.clientY);
            const mesh = traceMesh(result);
            if (!mesh) {
                apiRef.current.detach();
                onLeftClick?.(null, false);
                return;
            }

            if (result instanceof THREE.SkinnedMesh) {
                if (enableTransform) {
                    apiRef.current.setSpace('world');
                    apiRef.current.attach(mesh);
                }
                if (mesh.geometry.getAttribute('color'))
                    mesh.geometry.deleteAttribute('color');

                const mat = mesh.material as THREE.MeshStandardMaterial;
                mat.vertexColors = false;
                mat.needsUpdate = true;
                onLeftClick?.(mesh, true);
                return;
            }
            const nV = mesh.geometry.getAttribute('position').count;
            const weight = new Array(nV).fill(0);
            const colors = new Float32Array(nV * 3);

            if (result instanceof THREE.Bone) {
                if (enableRig) {
                    apiRef.current.setSpace('local');
                    apiRef.current.attach(result);
                }
                const index = mesh.skeleton.bones.indexOf(result);
                const skinIndicesAttr = mesh.geometry.getAttribute('skinIndex') as THREE.BufferAttribute;
                const skinWeightsAttr = mesh.geometry.getAttribute('skinWeight') as THREE.BufferAttribute;

                for (let i = 0; i < nV; i++)
                for (let j = 0; j < 4; j++)
                    if (index === skinIndicesAttr.getComponent(i, j)) {
                        weight[i] = skinWeightsAttr.getComponent(i, j);
                        break;
                    }
            } else if (Array.isArray(result)) {
                const idxA = mesh.skeleton.bones.indexOf(result[0]);
                const idxB = mesh.skeleton.bones.indexOf(result[1]);
                const bones = mesh.userData.bones as [number, number][];
                const index = bones.findIndex(([i0, i1]) => (i0 === idxA && i1 === idxB) || (i0 === idxB && i1 === idxA));

                for (let i = 0; i < nV; i++) {
                    const wgt = mesh.userData.boneSkinWeights[i];
                    const sum = wgt?.reduce((a, b) => a + b, 0) || 0;
                    const idx = mesh.userData.boneSkinIndices[i].indexOf(index);
                    if (idx >= 0 && sum > 0)
                        weight[i] = wgt[idx] / sum;
                }
            }
            for (let i = 0; i < nV; i++) {
                colors[i * 3 + 0] = weight[i];
                colors[i * 3 + 1] = 0;
                colors[i * 3 + 2] = 1 - weight[i];
            }
            mesh.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.vertexColors = true;
            mat.needsUpdate = true;

            onLeftClick?.(mesh, false);
        };
        const handleRightClick = (event: MouseEvent) => {
            if (event.button !== 2) return;
            if (!onMeshSelect) return;

            const result = apiRef.current.raycast(event.clientX, event.clientY);
            const mesh = traceMesh(result);
            if (!mesh) return;

            event.preventDefault();
            onMeshSelect(mesh);
        };

        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('contextmenu', handleRightClick);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            canvas.removeEventListener('mousedown', handleMouseDown);
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('mouseup', handleMouseUp);
            canvas.removeEventListener('contextmenu', handleRightClick);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [enableRig, enableTransform, onMeshSelect, onLeftClick]);

    return <div ref={containerRef} className="w-full h-full" />;
}
