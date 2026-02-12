'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { SceneHooks } from '@/hooks/useScene';
import MeshGenUI from '@/components/MeshGenUI';
import Scene from '@/components/main/Scene';
import Canvas from '@/components/canvas';
import MeshCutUI from '@/components/MeshCutUI';
import MeshMergeUI from '@/components/MeshMergeUI';
import SkelOpsUI from '@/components/SkelOps';
import { Point, Vec2, Vec3, MeshData, SkelData, MenuAction } from '@/interface';
import { skinnedMeshFromData } from '@/utils/threeMesh';
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
    const sceneApiRef = useRef<SceneHooks | null>(null);
    const [showCanvas, setShowCanvas] = useState(false);
    const [meshGenPath, setMeshGenPath] = useState<Vec2[] | null>(null);
    const [isSceneReady, setIsSceneReady] = useState(false);
    const [showRigUI, setShowRigUI] = useState(false);
    const [riggingMesh, setRiggingMesh] = useState<THREE.SkinnedMesh | null>(null);
    const [showCutUI, setShowCutUI] = useState(false);
    const [cuttingMesh, setCuttingMesh] = useState<THREE.SkinnedMesh | null>(null);
    const [showMergeUI, setShowMergeUI] = useState(false);
    const [mergingMeshes, setMergingMeshes] = useState<[THREE.SkinnedMesh, THREE.SkinnedMesh] | null>(null);
    const [showSkelOpsUI, setShowSkelOpsUI] = useState(false);
    const [skelOpsMesh, setSkelOpsMesh] = useState<THREE.SkinnedMesh | null>(null);
    const [exportedData, setExportedData] = useState<SkinnedMeshData | null>(null);
    const sceneContainerRef = useRef<HTMLDivElement>(null);

    const showMeshGenUI = meshGenPath !== null;

    const handleSceneReady = useCallback((api: SceneHooks) => {
        sceneApiRef.current = api;
        setIsSceneReady(true);
    }, []);

    const handleMeshCutComplete = useCallback((meshes: THREE.SkinnedMesh[]) => {
        meshes.forEach((mesh) => {
            if (mesh.material instanceof THREE.MeshStandardMaterial) {
                mesh.material.color.setHex(0xffffff);
            }
            sceneApiRef.current?.insertObject(mesh);
        });
        if (cuttingMesh) sceneApiRef.current?.removeObject(cuttingMesh);
        setShowCutUI(false);
        setCuttingMesh(null);
    }, [cuttingMesh]);

    const handleMeshCutCancel = useCallback(() => {
        setShowCutUI(false);
        setCuttingMesh(null);
    }, []);

    const handleMenuAction = useCallback(
        (action: MenuAction, meshes: THREE.SkinnedMesh[]) => {
            if (!meshes || meshes.length === 0) return;

            switch (action) {
                case 'copy':
                    const clonedMesh = SkeletonUtils.clone(meshes[0]);
                    sceneApiRef.current?.insertObject(clonedMesh);
                    break;
                case 'delete':
                    meshes.forEach((mesh) => sceneApiRef.current?.removeObject(mesh));
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
                    if (meshes.length >= 2) {
                        setMergingMeshes([meshes[0], meshes[1]]);
                        setShowMergeUI(true);
                    } else {
                        console.warn('Merge requires 2 meshes, got', meshes.length);
                    }
                    break;
                case 'editSkeleton':
                    if (meshes.length > 0) {
                        setSkelOpsMesh(meshes[0]);
                        setShowSkelOpsUI(true);
                    }
                    break;
            }
        },
        []
    );

    const handleSkelOpsComplete = useCallback((result: THREE.SkinnedMesh | THREE.SkinnedMesh[]) => {
        const mesh = Array.isArray(result) ? result[0] : result;
        if (mesh && skelOpsMesh) {
            if (mesh.material instanceof THREE.MeshStandardMaterial) {
                mesh.material.color.setHex(0xffffff);
            }
            sceneApiRef.current?.removeObject(skelOpsMesh);
            sceneApiRef.current?.insertObject(mesh);
        }
        setShowSkelOpsUI(false);
        setSkelOpsMesh(null);
    }, [skelOpsMesh]);

    const handleSkelOpsCancel = useCallback(() => {
        setShowSkelOpsUI(false);
        setSkelOpsMesh(null);
    }, []);

    const handlePathComplete = useCallback((path: Point[]) => {
        setMeshGenPath(path as Vec2[]);
        setShowCanvas(false);
    }, []);

    const handleMeshGenComplete = useCallback((mesh: THREE.SkinnedMesh) => {
        if (mesh.material instanceof THREE.MeshStandardMaterial) {
            mesh.material.color.setHex(0xffffff);
        }
        sceneApiRef.current?.insertObject(mesh);
        setMeshGenPath(null);
    }, []);

    const handleMeshGenCancel = useCallback(() => {
        setMeshGenPath(null);
    }, []);

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

            if (!isSceneReady || !sceneApiRef.current) {
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
                    sceneApiRef.current.insertObject(skinnedMesh);
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
        [isSceneReady]
    );

    // Trigger window resize event when scene becomes visible after closing meshgen
    useEffect(() => {
        if (!showMeshGenUI && sceneContainerRef.current) {
            const timeoutId = setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
            }, 50);
            return () => clearTimeout(timeoutId);
        }
    }, [showMeshGenUI]);

    return (
        <div className="relative h-screen w-full overflow-hidden">
            <div
                ref={sceneContainerRef}
                className="h-full w-full"
                style={{ display: showMeshGenUI ? 'none' : 'block' }}
            >
                <Scene
                    onSceneReady={handleSceneReady}
                    onMenuAction={handleMenuAction}
                    className="h-full w-full"
                />
            </div>
            {showMeshGenUI && meshGenPath && (
                <MeshGenUI
                    path={meshGenPath}
                    onComplete={handleMeshGenComplete}
                    onCancel={handleMeshGenCancel}
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
                    onComplete={handleMeshCutComplete}
                    onCancel={handleMeshCutCancel}
                />
            )}

            {showMergeUI && mergingMeshes && (
                <MeshMergeUI
                    mesh1={mergingMeshes[0]}
                    mesh2={mergingMeshes[1]}
                    onComplete={(mergedMesh) => {
                        // Reset color to white before adding to main scene
                        if (mergedMesh.material instanceof THREE.MeshStandardMaterial) {
                            mergedMesh.material.color.setHex(0xffffff);
                        }
                        sceneApiRef.current?.insertObject(mergedMesh);
                        // Remove the original meshes
                        sceneApiRef.current?.removeObject(mergingMeshes[0]);
                        sceneApiRef.current?.removeObject(mergingMeshes[1]);
                        setShowMergeUI(false);
                        setMergingMeshes(null);
                    }}
                    onCancel={() => {
                        setShowMergeUI(false);
                        setMergingMeshes(null);
                    }}
                />
            )}

            {showSkelOpsUI && skelOpsMesh && (
                <SkelOpsUI
                    skinnedMesh={skelOpsMesh}
                    onComplete={handleSkelOpsComplete}
                    onCancel={handleSkelOpsCancel}
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

                {!showMeshGenUI && (
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
