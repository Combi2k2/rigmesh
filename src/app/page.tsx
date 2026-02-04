'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { useMeshGen } from '@/hooks/useMeshGen';
import { useViewSpace, ViewSpaceReturn } from '@/hooks/useViewSpace';
import { useViewSpaceMesh } from '@/hooks/useViewSpaceMesh';
import MeshGenUI from '@/components/meshgenUI/MeshGenUI';
import Scene from '@/components/main/Scene';
import Canvas from '@/components/canvas';
import { MeshCutUI } from '@/components/meshcutUI';
import { computeSkinWeightsGlobal } from '@/core/skin';
import { skinnedMeshFromData } from '@/utils/skinnedMesh';
import { Point, Vec2, Vec3, MeshData, SkelData, MenuAction } from '@/interface';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface SkinnedMeshData {
    mesh3D: { vertices: { x: number; y: number; z: number }[]; faces: number[][] };
    skeleton: { joints: { x: number; y: number; z: number }[]; bones: [number, number][] };
    skinWeights: number[][];
    skinIndices: number[][];
    version: string;
}

export default function Page() {
    const sceneRef = useRef<THREE.Scene | null>(null);
    const viewSpaceRefsRef = useRef<ViewSpaceReturn | null>(null);
    const processedMeshesRef = useRef<Set<string>>(new Set());
    const [showCanvas, setShowCanvas] = useState(false);
    const [isSceneReady, setIsSceneReady] = useState(false);
    const [showRigUI, setShowRigUI] = useState(false);
    const [riggingMesh, setRiggingMesh] = useState<THREE.SkinnedMesh | null>(null);
    const [showCutUI, setShowCutUI] = useState(false);
    const [cuttingMesh, setCuttingMesh] = useState<THREE.SkinnedMesh | null>(null);

    const sceneHooks = useViewSpaceMesh(sceneRef as React.RefObject<THREE.Scene>);
    const meshGen = useMeshGen();
    const [exportedData, setExportedData] = useState<SkinnedMeshData | null>(null);
    const sceneContainerRef = useRef<HTMLDivElement>(null);

    // When mesh gen completes (step > 5) and scene is ready, create skinned mesh and add to scene
    useEffect(() => {
        const { currentStep, mesh3D, skeleton } = meshGen.state;
        if (currentStep <= 5 || !mesh3D || !skeleton || !sceneRef.current || !isSceneReady) return;

        const meshKey = `${mesh3D[0].length}-${mesh3D[1].length}-${skeleton[0].length}`;
        if (processedMeshesRef.current.has(meshKey)) return;
        processedMeshesRef.current.add(meshKey);

        const skinWeights = computeSkinWeightsGlobal(mesh3D, skeleton);

        const data: SkinnedMeshData = {
            mesh3D: {
                vertices: mesh3D[0].map((v) => ({ x: v.x, y: v.y, z: v.z })),
                faces: mesh3D[1],
            },
            skeleton: {
                joints: skeleton[0].map((j) => ({ x: j.x, y: j.y, z: j.z })),
                bones: skeleton[1],
            },
            skinWeights: skinWeights.map((w) => [...w]),
            skinIndices: skinWeights.map((weights) =>
                Array.from({ length: weights.length }, (_, i) => i)
                    .sort((a, b) => weights[b] - weights[a])
                    .slice(0, 4)
            ),
            version: '1.0',
        };
        setExportedData(data);

        const skinnedMesh = skinnedMeshFromData({ mesh: mesh3D, skel: skeleton, skinWeights, skinIndices: null });
        sceneHooks.addSkinnedMesh(skinnedMesh);
    }, [meshGen.state.currentStep, meshGen.state.mesh3D, meshGen.state.skeleton, sceneHooks, isSceneReady]);

    const handleSceneReady = useCallback((refs: ViewSpaceReturn) => {
        viewSpaceRefsRef.current = refs;
        sceneRef.current = refs.sceneRef.current;
        setIsSceneReady(true);
    }, []);

    const handleMenuAction = useCallback(
        (action: MenuAction, meshes: THREE.SkinnedMesh[]) => {
            if (!meshes || meshes.length === 0) return;

            switch (action) {
                case 'copy': 
                    const clonedMesh = SkeletonUtils.clone(meshes[0]);
                    sceneHooks.addSkinnedMesh(clonedMesh);
                    break;
                case 'delete':
                    meshes.forEach((mesh) => sceneHooks.delSkinnedMesh(mesh));
                    break;
                case 'rig':
                    if (meshes.length > 0) {
                        setRiggingMesh(meshes[0]);
                        setShowRigUI(true);
                    }
                    break;
                case 'cut':
                    if (meshes.length > 0) {
                        setCuttingMesh(meshes[0]);
                        setShowCutUI(true);
                    }
                    break;
                case 'merge':
                    // TODO: Implement merge functionality
                    console.log('Merge action triggered for', meshes.length, 'mesh(es)');
                    break;
            }
        },
        [sceneHooks]
    );

    const handlePathComplete = useCallback(
        (path: Point[]) => {
            meshGen.onPathComplete(path as Vec2[]);
            setShowCanvas(false);
        },
        [meshGen]
    );

    const handleExport = useCallback(() => {
        if (!exportedData) {
            alert('No mesh data to export. Please complete the mesh generation first.');
            return;
        }

        const json = JSON.stringify(exportedData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `skinned-mesh-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [exportedData]);

    const handleImport = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (!file) return;

            if (!isSceneReady || !sceneRef.current) {
                alert('Scene is not ready yet. Please wait for the scene to load.');
                event.target.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target?.result as string) as SkinnedMeshData;
                    
                    // Validate data structure
                    if (!data.mesh3D || !data.skeleton || !data.skinWeights || !data.skinIndices) {
                        throw new Error('Invalid file format: missing required fields');
                    }
                    
                    // Convert back to Vec3 format
                    const mesh3D: MeshData = [
                        data.mesh3D.vertices.map((v) => new Vec3(v.x, v.y, v.z)),
                        data.mesh3D.faces,
                    ];
                    const skeleton: SkelData = [
                        data.skeleton.joints.map((j) => new Vec3(j.x, j.y, j.z)),
                        data.skeleton.bones,
                    ];

                    const skinnedMesh = skinnedMeshFromData({ mesh: mesh3D, skel: skeleton, skinWeights: data.skinWeights, skinIndices: data.skinIndices });
                    sceneHooks.addSkinnedMesh(skinnedMesh);
                    // setExportedData({ mesh: mesh3D, skel: skeleton, skinWeights: data.skinWeights, skinIndices: data.skinIndices, version: data.version });
                } catch (error) {
                    console.error('Failed to load mesh data:', error);
                    alert(`Failed to load mesh data: ${error instanceof Error ? error.message : 'Invalid file format'}`);
                }
            };
            reader.readAsText(file);
            // Reset input so same file can be selected again
            event.target.value = '';
        },
        [sceneHooks, isSceneReady]
    );

    const isMeshGenMode = meshGen.state.currentStep <= 5;

    // Trigger window resize event when scene becomes visible to force renderer resize
    useEffect(() => {
        if (!isMeshGenMode && sceneContainerRef.current) {
            // Small delay to ensure DOM has updated
            const timeoutId = setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
            }, 50);
            return () => clearTimeout(timeoutId);
        }
    }, [isMeshGenMode]);

    return (
        <div className="relative h-screen w-full overflow-hidden">
            {/* Always keep Scene mounted to preserve meshes, just hide it during meshgen */}
            <div 
                ref={sceneContainerRef}
                className="h-full w-full"
                style={{ display: isMeshGenMode ? 'none' : 'block' }}
            >
                <Scene
                    onSceneReady={handleSceneReady}
                    onMenuAction={handleMenuAction}
                    className="h-full w-full"
                />
            </div>
            {isMeshGenMode && (
                <MeshGenUI
                    state={meshGen.state}
                    params={meshGen.params}
                    onNext={meshGen.onNext}
                    onBack={meshGen.onBack}
                    onParamChange={meshGen.onParamChange}
                    onCancel={meshGen.onReset}
                />
            )}

            {showCanvas && (
                <div className="absolute inset-0 z-50 bg-white dark:bg-gray-900">
                    <Canvas onPathComplete={handlePathComplete} />
                </div>
            )}

            {showCutUI && cuttingMesh && (
                <MeshCutUI
                    skinnedMesh={cuttingMesh}
                    onComplete={(meshes) => {
                        // Add the result meshes to the scene (already THREE.SkinnedMesh)
                        meshes.forEach(mesh => {
                            // Reset color to white before adding to main scene
                            if (mesh.material instanceof THREE.MeshStandardMaterial) {
                                mesh.material.color.setHex(0xffffff);
                            }
                            // Reset position (remove preview offset)
                            mesh.position.set(0, 0, 0);
                            sceneHooks.addSkinnedMesh(mesh);
                        });
                        // Remove the original mesh
                        sceneHooks.delSkinnedMesh(cuttingMesh);
                        setShowCutUI(false);
                        setCuttingMesh(null);
                    }}
                    onCancel={() => {
                        setShowCutUI(false);
                        setCuttingMesh(null);
                    }}
                />
            )}

            {/* Control buttons */}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
                <button
                    onClick={() => setShowCanvas((v) => !v)}
                    className="rounded-lg bg-blue-600 p-3 text-white shadow-lg transition-colors hover:bg-blue-700"
                    title={showCanvas ? 'Hide Canvas' : 'Show Canvas'}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="h-6 w-6"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18.14 4.487l-1.687 1.688"
                        />
                    </svg>
                </button>

                {!isMeshGenMode && (
                    <>
                        <button
                            onClick={handleExport}
                            disabled={!exportedData}
                            className="rounded-lg bg-green-600 p-3 text-white shadow-lg transition-colors hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                            title="Export Skinned Mesh Data"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={1.5}
                                stroke="currentColor"
                                className="h-6 w-6"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                                />
                            </svg>
                        </button>

                        <label
                            className="rounded-lg bg-purple-600 p-3 text-white shadow-lg transition-colors hover:bg-purple-700 cursor-pointer"
                            title="Import Skinned Mesh Data"
                        >
                            <input
                                type="file"
                                accept=".json"
                                onChange={handleImport}
                                className="hidden"
                            />
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={1.5}
                                stroke="currentColor"
                                className="h-6 w-6"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                                />
                            </svg>
                        </label>
                    </>
                )}
            </div>
        </div>
    );
}
