'use client';

import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useViewSpace } from '@/hooks/useViewSpace';
import { useViewSpaceMesh } from '@/hooks/useViewSpaceMesh';

const COLORS = {
    BACKGROUND: 0x1a1a2e,
    MESH1: 0x22c55e,         // Green for first mesh
    MESH2: 0x3b82f6,         // Blue for second mesh
    RESULT: 0x8b5cf6,        // Purple for result
    ERROR: 0xef4444,         // Red for error state
} as const;

export interface MeshMergeSceneProps {
    mesh1: THREE.SkinnedMesh;
    mesh2: THREE.SkinnedMesh;
    currentStep: number;
    resultMesh: THREE.SkinnedMesh | null;
    error: string | null;
    onCameraRef?: (camera: THREE.PerspectiveCamera | null) => void;
}

export default function MeshMergeScene({
    mesh1,
    mesh2,
    currentStep,
    resultMesh,
    error,
    onCameraRef,
}: MeshMergeSceneProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const vs = useViewSpace(containerRef);
    const vsMesh = useViewSpaceMesh(vs.sceneRef);
    
    const clone1Ref = useRef<THREE.SkinnedMesh | null>(null);
    const clone2Ref = useRef<THREE.SkinnedMesh | null>(null);
    const resultMeshRef = useRef<THREE.SkinnedMesh | null>(null);
    
    const [ready, setReady] = useState(false);

    // Pass camera ref to parent
    useEffect(() => {
        onCameraRef?.(vs.cameraRef.current);
    }, [vs.cameraRef.current, onCameraRef]);

    // Setup scene with cloned meshes - only run once when scene is ready
    const sceneInitializedRef = useRef(false);
    useEffect(() => {
        if (sceneInitializedRef.current) return;
        
        const scene = vs.sceneRef.current;
        const camera = vs.cameraRef.current;
        const renderer = vs.rendererRef.current;
        if (!scene || !camera || !renderer || !mesh1 || !mesh2) return;

        sceneInitializedRef.current = true;

        scene.background = new THREE.Color(COLORS.BACKGROUND);
        
        // Calculate bounding box to position camera appropriately
        const box1 = new THREE.Box3().setFromObject(mesh1);
        const box2 = new THREE.Box3().setFromObject(mesh2);
        const combinedBox = box1.union(box2);
        const center = combinedBox.getCenter(new THREE.Vector3());
        const size = combinedBox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        
        camera.position.set(center.x, center.y, center.z + maxDim * 2);
        camera.lookAt(center);

        // Clone and add first mesh
        const cloned1 = SkeletonUtils.clone(mesh1) as THREE.SkinnedMesh;
        cloned1.position.copy(mesh1.position);
        (cloned1.material as THREE.MeshStandardMaterial).color.setHex(COLORS.MESH1);
        clone1Ref.current = cloned1;
        vsMesh.addSkinnedMesh(cloned1);

        // Clone and add second mesh
        const cloned2 = SkeletonUtils.clone(mesh2) as THREE.SkinnedMesh;
        cloned2.position.copy(mesh2.position);
        (cloned2.material as THREE.MeshStandardMaterial).color.setHex(COLORS.MESH2);
        clone2Ref.current = cloned2;
        vsMesh.addSkinnedMesh(cloned2);

        setReady(true);

        return () => {
            if (clone1Ref.current) {
                vsMesh.delSkinnedMesh(clone1Ref.current);
                clone1Ref.current = null;
            }
            if (clone2Ref.current) {
                vsMesh.delSkinnedMesh(clone2Ref.current);
                clone2Ref.current = null;
            }
            sceneInitializedRef.current = false;
        };
    }, [vs.sceneRef, vs.cameraRef, vs.rendererRef, mesh1, mesh2, vsMesh.addSkinnedMesh, vsMesh.delSkinnedMesh]);

    // Handle result mesh display in step 2
    useEffect(() => {
        if (currentStep >= 2 && resultMesh && !error) {
            // Hide input mesh clones
            if (clone1Ref.current) {
                vsMesh.delSkinnedMesh(clone1Ref.current);
            }
            if (clone2Ref.current) {
                vsMesh.delSkinnedMesh(clone2Ref.current);
            }

            // Remove old result mesh if exists
            if (resultMeshRef.current) {
                vsMesh.delSkinnedMesh(resultMeshRef.current);
            }

            // Add new result mesh
            (resultMesh.material as THREE.MeshStandardMaterial).color.setHex(COLORS.RESULT);
            resultMeshRef.current = resultMesh;
            vsMesh.addSkinnedMesh(resultMesh);
        } else if (error && currentStep >= 2) {
            // On error, show original meshes with error indication
            if (clone1Ref.current) {
                (clone1Ref.current.material as THREE.MeshStandardMaterial).color.setHex(COLORS.ERROR);
            }
            if (clone2Ref.current) {
                (clone2Ref.current.material as THREE.MeshStandardMaterial).color.setHex(COLORS.ERROR);
            }
        }

        return () => {
            if (resultMeshRef.current) {
                vsMesh.delSkinnedMesh(resultMeshRef.current);
                resultMeshRef.current = null;
            }
        };
    }, [currentStep, resultMesh, error, vsMesh.addSkinnedMesh, vsMesh.delSkinnedMesh]);

    // Get mesh info for display
    const getMeshInfo = (mesh: THREE.SkinnedMesh | null) => {
        if (!mesh) return null;
        const pos = mesh.geometry.getAttribute('position');
        const idx = mesh.geometry.getIndex();
        return {
            vertices: pos?.count ?? 0,
            faces: Math.floor((idx?.count ?? 0) / 3),
            bones: mesh.skeleton?.bones?.length ?? 0,
        };
    };

    const mesh1Info = getMeshInfo(mesh1);
    const mesh2Info = getMeshInfo(mesh2);
    const resultInfo = resultMesh ? getMeshInfo(resultMesh) : null;

    return (
        <div className="w-2/3 border-r border-gray-300 dark:border-gray-700 relative">
            {/* 3D Canvas container */}
            <div ref={containerRef} className="absolute inset-0" />
            
            {/* Processing indicator */}
            {currentStep === 1 && ready && (
                <div className="absolute top-4 left-4 bg-black/70 text-white px-4 py-3 rounded-lg z-10">
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse" />
                        <span className="font-medium">Processing Merge...</span>
                    </div>
                </div>
            )}

            {/* Step 2: Result info overlay */}
            {currentStep >= 2 && resultMesh && !error && (
                <div className="absolute top-4 left-4 bg-black/70 text-white px-4 py-3 rounded-lg z-10">
                    <div className="font-medium">Merge Complete</div>
                    <div className="text-sm text-gray-300 mt-1">
                        {resultInfo && (
                            <>
                                {resultInfo.vertices} vertices, {resultInfo.faces} faces, {resultInfo.bones} bones
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Error overlay */}
            {error && (
                <div className="absolute top-4 left-4 bg-red-900/80 text-white px-4 py-3 rounded-lg z-10 max-w-md">
                    <div className="font-medium">Merge Failed</div>
                    <div className="text-sm text-gray-300 mt-1">{error}</div>
                </div>
            )}

            {/* Input meshes info (bottom left) */}
            {ready && currentStep < 2 && (
                <div className="absolute bottom-4 left-4 bg-black/70 text-white px-4 py-3 rounded-lg z-10 space-y-2">
                    <div className="text-sm font-medium">Input Meshes</div>
                    <div className="flex gap-4 text-xs">
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-green-500" />
                            <span>Mesh 1: {mesh1Info?.vertices}v, {mesh1Info?.faces}f</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-blue-500" />
                            <span>Mesh 2: {mesh2Info?.vertices}v, {mesh2Info?.faces}f</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Result mesh legend (bottom left in step 2) */}
            {ready && currentStep >= 2 && resultMesh && !error && (
                <div className="absolute bottom-4 left-4 bg-black/70 text-white px-4 py-3 rounded-lg z-10">
                    <div className="flex items-center gap-2 text-sm">
                        <span className="w-3 h-3 rounded-full bg-purple-500" />
                        <span>Merged Result</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                        Adjust smoothing in the controls panel
                    </div>
                </div>
            )}
        </div>
    );
}
