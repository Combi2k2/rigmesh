import { StrictMode, useRef, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import './index.css';

import { SceneProvider } from './context/SceneContext';
import { SceneHooks } from '@/hooks/useScene';

import { cloneSkinnedMesh } from '@/utils/threeMesh';
import { traceMesh } from '@/utils/threeSkel';
import { MeshGenParams } from '@/hooks/useMeshGen';
import { MeshCutParams } from '@/hooks/useMeshCut';
import { MeshMergeParams } from '@/hooks/useMeshMerge';

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';


import Scene from '@/components/base/Scene';
import Sidebar from '@/components/base/Sidebar';
import ToolOpsBar from '@/components/ToolOpsBar';
import ToolNetBar from '@/components/ToolNetBar';
import { ToolMode } from '@/components/ToolControlBar';
import MeshGenUI from '@/components/MeshGenUI';
import MeshCutUI from '@/components/MeshCutUI';
import MeshMergeUI from '@/components/MeshMergeUI';
import SkelOpsUI from '@/components/SkeletonEditUI';

// --- Colors ---

const SELECTED_COLOR = 0x9b59b6;
const DEFAULT_COLOR = 0xffffff;

function setMeshColor(mesh: THREE.SkinnedMesh, color: number) {
    const mat = mesh.material;
    if (mat instanceof THREE.MeshStandardMaterial) {
        mat.vertexColors = false;
        mat.needsUpdate = true;
        mat.color.setHex(color);
    }
}

// --- App ---

function App() {
    const sceneApiRef = useRef<SceneHooks | null>(null);
    const [threeScene, setThreeScene] = useState<THREE.Scene | null>(null);
    const [selectedMeshes, setSelectedMeshes] = useState<THREE.SkinnedMesh[]>([]);
    const [viewWireframe, setViewWireframe] = useState(false);
    const [viewSkeleton, setViewSkeleton] = useState(true);

    // Flow parameters (persisted in app state)
    const [genParams, setGenParams] = useState<MeshGenParams>({
        isodistance: 10,
        laplacianIters: 50,
        laplacianAlpha: 0.5,
        smoothFactor: 0.1,
        isometricIterations: 6,
        isometricLength: 5,
        boneDevThreshold: 0.1,
        boneLenThreshold: 5,
        bonePruningThreshold: 5,
    });
    const [cutParams, setCutParams] = useState<MeshCutParams>({
        smoothLayers: 0,
        smoothFactor: 0.1,
    });
    const [mergeParams, setMergeParams] = useState<MeshMergeParams>({
        smoothLayers: 0,
        smoothFactor: 0.1,
    });

    // Flow states
    const [showMeshGenUI, setShowMeshGenUI] = useState(false);
    const [showCutUI, setShowCutUI] = useState(false);
    const [cuttingMesh, setCuttingMesh] = useState<THREE.SkinnedMesh | null>(null);
    const [showMergeUI, setShowMergeUI] = useState(false);
    const [mergingMeshes, setMergingMeshes] = useState<[THREE.SkinnedMesh, THREE.SkinnedMesh] | null>(null);
    const [showSkelOpsUI, setShowSkelOpsUI] = useState(false);
    const [skelOpsMesh, setSkelOpsMesh] = useState<THREE.SkinnedMesh | null>(null);

    const sceneContainerRef = useRef<HTMLDivElement>(null);

    // --- Scene ready ---

    const handleSceneReady = useCallback((api: SceneHooks) => {
        sceneApiRef.current = api;
        setThreeScene(api.getScene());
    }, []);

    const handleToolChange = useCallback((tool: ToolMode) => {
        if (tool !== 'select') {
            setSelectedMeshes(prev => {
                const last = prev[prev.length - 1];
                if (last) {
                    sceneApiRef.current?.setMode(tool);
                    sceneApiRef.current?.setSpace('world');
                    sceneApiRef.current?.attach(last);
                }
                return prev;
            });
        }
    }, []);

    // --- Selection ---

    const handleLeftClick = useCallback((mesh: THREE.SkinnedMesh | null, directMeshClick: boolean) => {
        if (!mesh) {
            setSelectedMeshes(prev => {
                prev.forEach(m => setMeshColor(m, DEFAULT_COLOR));
                return [];
            });
            return;
        }

        setSelectedMeshes(prev => {
            if (prev.includes(mesh)) {
                if (directMeshClick) {
                    setMeshColor(mesh, DEFAULT_COLOR);
                    return prev.filter(m => m !== mesh);
                }
                return prev;
            } else {
                if (directMeshClick) {
                    setMeshColor(mesh, SELECTED_COLOR);
                }
                return [...prev, mesh];
            }
        });
    }, []);

    // Scene graph click: select object same as 3D interaction
    const handleSceneGraphSelect = useCallback((object: THREE.Object3D) => {
        const api = sceneApiRef.current;
        if (!api) return;

        if (object instanceof THREE.SkinnedMesh) {
            handleLeftClick(object, true);
            api.setSpace('world');
            api.attach(object);
        } else if (object instanceof THREE.Bone) {
            const mesh = traceMesh(object);
            if (mesh) {
                handleLeftClick(mesh, false);
                api.setSpace('local');
                api.attach(object);

                // Visualize bone weights
                const nV = mesh.geometry.getAttribute('position').count;
                const weight = new Array(nV).fill(0);
                const colors = new Float32Array(nV * 3);
                const index = mesh.skeleton.bones.indexOf(object);
                const skinIndicesAttr = mesh.geometry.getAttribute('skinIndex') as THREE.BufferAttribute;
                const skinWeightsAttr = mesh.geometry.getAttribute('skinWeight') as THREE.BufferAttribute;

                for (let i = 0; i < nV; i++)
                    for (let j = 0; j < 4; j++)
                        if (index === skinIndicesAttr.getComponent(i, j)) {
                            weight[i] = skinWeightsAttr.getComponent(i, j);
                            break;
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
            }
        }
    }, [handleLeftClick]);

    // --- Operations ---

    const clearSelection = useCallback((meshes: THREE.SkinnedMesh[]) => {
        const removed = new Set(meshes);
        setSelectedMeshes(prev => {
            prev.forEach(m => { if (removed.has(m)) setMeshColor(m, DEFAULT_COLOR); });
            return prev.filter(m => !removed.has(m));
        });
    }, []);

    const handleDraw = useCallback(() => setShowMeshGenUI(true), []);

    const handleCut = useCallback((mesh: THREE.SkinnedMesh) => {
        clearSelection([mesh]);
        setCuttingMesh(mesh);
        setShowCutUI(true);
    }, [clearSelection]);

    const handleMerge = useCallback((meshes: THREE.SkinnedMesh[]) => {
        if (meshes.length >= 2) {
            clearSelection(meshes);
            setMergingMeshes([meshes[0], meshes[1]]);
            setShowMergeUI(true);
        }
    }, [clearSelection]);

    const handleDuplicate = useCallback((mesh: THREE.SkinnedMesh) => {
        const cloned = cloneSkinnedMesh(mesh);
        sceneApiRef.current?.insertObject(cloned);
    }, []);

    const handleDelete = useCallback((meshes: THREE.SkinnedMesh[]) => {
        clearSelection(meshes);
        meshes.forEach(mesh => sceneApiRef.current?.removeObject(mesh));
    }, [clearSelection]);

    const handleEditSkeleton = useCallback((mesh: THREE.SkinnedMesh) => {
        clearSelection([mesh]);
        setSkelOpsMesh(mesh);
        setShowSkelOpsUI(true);
    }, [clearSelection]);

    // --- Export / Import ---

    const handleExport = useCallback(() => {
        if (!threeScene) return;

        // Collect all meshes from the scene
        const meshesToExport: THREE.SkinnedMesh[] = [];
        threeScene.traverse((obj) => {
            if (obj instanceof THREE.SkinnedMesh) {
                meshesToExport.push(obj);
            }
        });

        if (meshesToExport.length === 0) {
            alert('No meshes to export. Create or import some meshes first.');
            return;
        }

        // Create export scene and add cloned meshes (preserves skeleton hierarchy)
        const exportScene = new THREE.Scene();
        meshesToExport.forEach(mesh => {
            const clonedMesh = cloneSkinnedMesh(mesh);
            exportScene.add(clonedMesh);
        });

        const exporter = new GLTFExporter();
        exporter.parse(
            exportScene,
            (result) => {
                const blob = new Blob([result as ArrayBuffer], { type: 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `rigmesh_${new Date().getTime()}.glb`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                console.log(`Exported ${meshesToExport.length} mesh(es) with skeleton`);
            },
            (error) => {
                console.error('Export error:', error);
                alert('Error exporting file: ' + error);
            },
            { binary: true }
        );
    }, [threeScene]);

    const handleImport = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.glb,.gltf';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const arrayBuffer = event.target?.result;
                    if (!(arrayBuffer instanceof ArrayBuffer)) return;

                    const loader = new GLTFLoader();
                    loader.parse(
                        arrayBuffer,
                        '',
                        (gltf) => {
                            // Add all loaded meshes to the scene
                            gltf.scene.traverse((node) => {
                                if (node instanceof THREE.SkinnedMesh) {
                                    if (node.material instanceof THREE.MeshStandardMaterial) {
                                        node.material.color.setHex(0xffffff);
                                    }
                                    sceneApiRef.current?.insertObject(node);
                                }
                            });
                        },
                        (error) => {
                            console.error('Import error:', error);
                            alert('Error importing file');
                        }
                    );
                } catch (error) {
                    console.error('File read error:', error);
                    alert('Error reading file');
                }
            };
            reader.readAsArrayBuffer(file);
        };
        input.click();
    }, []);

    // --- Flow completions ---

    const handleMeshGenComplete = useCallback((mesh: THREE.SkinnedMesh) => {
        if (mesh.material instanceof THREE.MeshStandardMaterial) {
            mesh.material.color.setHex(0xffffff);
        }
        sceneApiRef.current?.insertObject(mesh);
        setShowMeshGenUI(false);
    }, []);

    const handleMeshCutComplete = useCallback((meshes: THREE.SkinnedMesh[]) => {
        meshes.forEach(mesh => {
            if (mesh.material instanceof THREE.MeshStandardMaterial) {
                mesh.material.color.setHex(0xffffff);
            }
            sceneApiRef.current?.insertObject(mesh);
        });
        if (cuttingMesh) sceneApiRef.current?.removeObject(cuttingMesh);
        setShowCutUI(false);
        setCuttingMesh(null);
    }, [cuttingMesh]);

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

    // Trigger resize when flow UIs open/close (their Scene instances need correct sizing)
    const anyFlowOpen = showMeshGenUI || showCutUI || showMergeUI || showSkelOpsUI;
    useEffect(() => {
        const id = setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
        return () => clearTimeout(id);
    }, [anyFlowOpen]);

    return (
        <div className="relative h-screen w-full overflow-hidden">
            {/* Main layout: viewport + sidebar */}
            <div
                ref={sceneContainerRef}
                className="h-full w-full flex"
            >
                {/* 3D viewport */}
                <div className="flex-1 min-w-0 min-h-0 relative">
                    <Scene
                        enableRig
                        enableTransform
                        viewWireframe={viewWireframe}
                        viewSkeleton={viewSkeleton}
                        onSceneReady={handleSceneReady}
                        onLeftClick={handleLeftClick}
                        onToolChange={handleToolChange}
                    />
                    <div className="absolute bottom-4 right-4 z-40 flex flex-col items-center gap-2">
                        <ToolOpsBar
                            selectedMeshes={selectedMeshes}
                            onDraw={handleDraw}
                            onCut={handleCut}
                            onMerge={handleMerge}
                            onDuplicate={handleDuplicate}
                            onDelete={handleDelete}
                            onEditSkeleton={handleEditSkeleton}
                        />
                        <ToolNetBar
                            onExport={handleExport}
                            onImport={handleImport}
                        />
                    </div>
                </div>
                {/* Right sidebar */}
                <div className="w-56 flex-shrink-0 border-l border-gray-700 overflow-hidden">
                    <Sidebar
                        scene={threeScene}
                        onSelect={handleSceneGraphSelect}
                        viewWireframe={viewWireframe}
                        viewSkeleton={viewSkeleton}
                        onWireframeToggle={setViewWireframe}
                        onSkeletonToggle={setViewSkeleton}
                    />
                </div>
            </div>

            {/* Flow UIs in floating overlay */}
            {(showMeshGenUI || showCutUI || showMergeUI || showSkelOpsUI) && (
                <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-8">
                    <div className="w-[85vw] h-[85vh] bg-gray-900 border border-gray-700 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.5)] relative overflow-hidden">
                        {showMeshGenUI && (
                            <MeshGenUI
                                onComplete={handleMeshGenComplete}
                                onCancel={() => setShowMeshGenUI(false)}
                                initialParams={genParams}
                                onParamsChange={setGenParams}
                            />
                        )}

                        {showCutUI && cuttingMesh && (
                            <MeshCutUI
                                skinnedMesh={cuttingMesh}
                                onComplete={handleMeshCutComplete}
                                onCancel={() => { setShowCutUI(false); setCuttingMesh(null); }}
                                initialParams={cutParams}
                                onParamsChange={setCutParams}
                            />
                        )}

                        {showMergeUI && mergingMeshes && (
                            <MeshMergeUI
                                mesh1={mergingMeshes[0]}
                                mesh2={mergingMeshes[1]}
                                onComplete={(mergedMesh) => {
                                    if (mergedMesh.material instanceof THREE.MeshStandardMaterial) {
                                        mergedMesh.material.color.setHex(0xffffff);
                                    }
                                    sceneApiRef.current?.insertObject(mergedMesh);
                                    sceneApiRef.current?.removeObject(mergingMeshes[0]);
                                    sceneApiRef.current?.removeObject(mergingMeshes[1]);
                                    setShowMergeUI(false);
                                    setMergingMeshes(null);
                                }}
                                onCancel={() => { setShowMergeUI(false); setMergingMeshes(null); }}
                                initialParams={mergeParams}
                                onParamsChange={setMergeParams}
                            />
                        )}

                        {showSkelOpsUI && skelOpsMesh && (
                            <SkelOpsUI
                                skinnedMesh={skelOpsMesh}
                                onComplete={handleSkelOpsComplete}
                                onCancel={() => { setShowSkelOpsUI(false); setSkelOpsMesh(null); }}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// --- Mount ---

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <MantineProvider defaultColorScheme="light">
            <SceneProvider>
                <App />
            </SceneProvider>
        </MantineProvider>
    </StrictMode>
);
