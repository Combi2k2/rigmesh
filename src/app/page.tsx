'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { useMeshGen } from '@/hooks/meshgen';
import { useScene, MeshData, SkelData } from '@/hooks/useScene';
import { useViewSpace, ViewSpaceReturn } from '@/hooks/useViewSpace';
import MeshGenUI from '@/components/meshgenUI/MeshGenUI';
import Scene from '@/components/main/Scene';
import Canvas from '@/components/canvas';
import { computeSkinWeightsGlobal } from '@/core/skin';
import { Point, Vec2, Vec3 } from '@/interface';
import * as THREE from 'three';

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

    const sceneHooks = useScene(sceneRef as React.RefObject<THREE.Scene>);
    const meshGen = useMeshGen();
    const [exportedData, setExportedData] = useState<SkinnedMeshData | null>(null);

    // When mesh gen completes (step > 5) and scene is ready, create skinned mesh and add to scene
    useEffect(() => {
        const { currentStep, mesh3D, skeleton } = meshGen.state;
        if (currentStep <= 5 || !mesh3D || !skeleton || !sceneRef.current || !isSceneReady) return;

        const meshKey = `${mesh3D[0].length}-${mesh3D[1].length}-${skeleton[0].length}`;
        if (processedMeshesRef.current.has(meshKey)) return;
        processedMeshesRef.current.add(meshKey);

        const skinWeights = computeSkinWeightsGlobal(mesh3D, skeleton);
        const nBones = skeleton[1].length;
        const skinIndices: number[][] = skinWeights.map((weights) =>
            Array.from({ length: nBones }, (_, i) => i)
                .map((boneIdx) => ({ boneIdx, weight: weights[boneIdx] }))
                .sort((a, b) => b.weight - a.weight)
                .slice(0, 4)
                .map((item) => item.boneIdx)
        );

        // Store data for export
        const data: SkinnedMeshData = {
            mesh3D: {
                vertices: mesh3D[0].map((v) => ({ x: v.x, y: v.y, z: v.z })),
                faces: mesh3D[1],
            },
            skeleton: {
                joints: skeleton[0].map((j) => ({ x: j.x, y: j.y, z: j.z })),
                bones: skeleton[1],
            },
            skinWeights,
            skinIndices,
            version: '1.0',
        };
        setExportedData(data);

        const skinnedMesh = sceneHooks.createSkinnedMesh(mesh3D, skeleton, skinWeights, skinIndices);
        if (skinnedMesh) sceneHooks.addSkinnedMesh(skinnedMesh);
    }, [meshGen.state.currentStep, meshGen.state.mesh3D, meshGen.state.skeleton, sceneHooks, isSceneReady]);

    const handleSceneReady = useCallback((refs: ViewSpaceReturn) => {
        viewSpaceRefsRef.current = refs;
        // Keep sceneRef.current in sync with the actual scene from useViewSpace
        sceneRef.current = refs.sceneRef.current;
        setIsSceneReady(true);
    }, []);

    const handleMenuContext = useCallback(
        (context: typeof sceneHooks.menuContext) => {
            if (!context) return;
            const { selectedMeshes, selectedAction } = context;
            switch (selectedAction) {
                case 'copy':
                    break; // TODO
                case 'delete':
                    selectedMeshes.forEach((m) => sceneHooks.delSkinnedMesh(m));
                    break;
                case 'rig':
                    break; // TODO
                case 'cut':
                    break; // TODO
                case 'merge':
                    break; // TODO
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

                    // Create and add skinned mesh
                    const skinnedMesh = sceneHooks.createSkinnedMesh(
                        mesh3D,
                        skeleton,
                        data.skinWeights,
                        data.skinIndices
                    );
                    if (skinnedMesh) {
                        sceneHooks.addSkinnedMesh(skinnedMesh);
                        setExportedData(data);
                    } else {
                        alert('Failed to create skinned mesh from imported data.');
                    }
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

    return (
        <div className="relative h-screen w-full overflow-hidden">
            {isMeshGenMode ? (
                <MeshGenUI
                    state={meshGen.state}
                    params={meshGen.params}
                    onNext={meshGen.onNext}
                    onBack={meshGen.onBack}
                    onParamChange={meshGen.onParamChange}
                    onCancel={meshGen.onReset}
                />
            ) : (
                <Scene
                    onSceneReady={handleSceneReady}
                    setMenuContext={handleMenuContext}
                    className="h-full w-full"
                />
            )}

            {showCanvas && (
                <div className="absolute inset-0 z-50 bg-white dark:bg-gray-900">
                    <Canvas onPathComplete={handlePathComplete} />
                </div>
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
