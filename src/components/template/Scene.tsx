'use client';

import { useRef, useEffect } from 'react';
import { useScene, SceneHooks } from '@/hooks/useScene';
import { traceMesh } from '@/utils/threeSkel';
import { deepCopy } from '@/utils/misc';
import * as THREE from 'three';

export interface SceneProps {
    enableRig?: boolean;
    enableTransform?: boolean;
    onMeshSelect?: (mesh: THREE.SkinnedMesh) => void;
    onSceneReady?: (api: SceneHooks) => void;
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

        const handleLeftClick = (event: MouseEvent) => {
            if (event.button !== 0) return;

            const result = apiRef.current.raycast(event.clientX, event.clientY);
            const mesh = traceMesh(result);
            if (!mesh) {
                apiRef.current.detach();
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
                    const sum = wgt.reduce((a, b) => a + b, 0);
                    weight[i] = wgt[index] / sum;
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

        canvas.addEventListener('mousedown', handleLeftClick);
        canvas.addEventListener('contextmenu', handleRightClick);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            canvas.removeEventListener('mousedown', handleLeftClick);
            canvas.removeEventListener('contextmenu', handleRightClick);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [enableRig, enableTransform, onMeshSelect]);

    return <div ref={containerRef} className="w-full h-full" />;
}
