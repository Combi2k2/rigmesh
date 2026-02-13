'use client';

import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import * as THREE from 'three';
import { useMeshGen } from '@/hooks/useMeshGen';
import { SceneHooks } from '@/hooks/useScene';
import { Vec2, Vec3 } from '@/interface';
import { createSkeleton } from '@/utils/threeSkel';

import Scene from '@/components/template/Scene';
import Controller from '@/components/template/Controller';

const COLORS = {
    POLYGON: 0xffffff,
    MESH_2D: 0x10b981,
    MESH_2D_WIREFRAME: 0x059669,
    CHORD: 0xffd93d,
    MESH_3D_BLUE: 0x3b82f6,
    MESH_3D_GREEN: 0x10b981,
    MESH_3D_YELLOW: 0xfbbf24,
    MESH_3D_GREY: 0xc0c0c0,
} as const;

function createGeometry(V: { x: number; y: number; z?: number }[], F: number[]): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(V.length * 3);
    V.forEach((v, i) => {
        positions[i * 3] = v.x;
        positions[i * 3 + 1] = v.y;
        positions[i * 3 + 2] = v.z ?? 0;
    });
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(F);
    geometry.computeVertexNormals();
    return geometry;
}

function disposeDisplayGroup(group: THREE.Group) {
    group.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Line) {
            child.geometry?.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
                else child.material.dispose();
            }
        }
    });
    while (group.children.length > 0) group.remove(group.children[0]);
}

export interface MeshGenUIProps {
    path: Vec2[];
    onComplete?: (mesh: THREE.SkinnedMesh) => void;
    onCancel?: () => void;
}

export default function MeshGenUI({ path, onComplete, onCancel }: MeshGenUIProps) {
    const sceneRef = useRef<SceneHooks | null>(null);
    const flowApi = useMeshGen(onComplete);
    const displayGroupRef = useRef<THREE.Group | null>(null);
    const [ready, setReady] = useState(false);

    const handleReady = useCallback(
        (api: SceneHooks) => {
            sceneRef.current = api;
            setReady(true);
            const group = new THREE.Group();
            displayGroupRef.current = group;
            api.insertObject(group);
            flowApi.onPathComplete(path);
        },
        [path, flowApi.onPathComplete]
    );

    // Sync display to state: clear display group and re-render current step
    useEffect(() => {
        if (!ready || !sceneRef.current || !displayGroupRef.current) return;
        const group = displayGroupRef.current;
        const scene = sceneRef.current.getScene();
        if (!scene) return;

        disposeDisplayGroup(group);
        const { currentStep, mesh2D, mesh3D, chordData, capOffset, junctionOffset, skeleton } = flowApi.state;

        if (currentStep >= 2 && mesh2D) {
            const polygon = mesh2D[0].map((v) => new THREE.Vector3(v.x, v.y, 0));
            if (polygon.length >= 3) {
                polygon.push(polygon[0].clone());
                const geom = new THREE.BufferGeometry().setFromPoints(polygon);
                const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: COLORS.POLYGON }));
                group.add(line);
            }
        }
        if (currentStep === 1 && mesh2D) {
            const [V, F] = mesh2D;
            const geometry = createGeometry(V, F.flat());
            const wireframe = new THREE.WireframeGeometry(geometry);
            const mesh = new THREE.Mesh(
                geometry,
                new THREE.MeshBasicMaterial({ color: COLORS.MESH_2D, transparent: true, opacity: 0.5 })
            );
            const wfLine = new THREE.LineSegments(
                wireframe,
                new THREE.LineBasicMaterial({ color: COLORS.MESH_2D_WIREFRAME })
            );
            group.add(mesh);
            group.add(wfLine);
        }
        if (currentStep === 2 && chordData) {
            const [chordAxis, chordDirs, chordLengths] = chordData;
            const chordGroup = new THREE.Group();
            for (let i = 0; i < chordAxis.length; i++) {
                const mid = chordAxis[i] as Vec3;
                const dir = (chordDirs[i] as Vec3).unit();
                const len = chordLengths[i];
                const half = dir.times(len / 2);
                const v0 = mid.minus(half);
                const v1 = mid.plus(half);
                const geom = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(v0.x, v0.y, v0.z ?? 0),
                    new THREE.Vector3(v1.x, v1.y, v1.z ?? 0),
                ]);
                const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: COLORS.CHORD }));
                chordGroup.add(line);
            }
            group.add(chordGroup);
        }
        if (currentStep === 3 && mesh3D) {
            const [V, F] = mesh3D;
            const F1 = F.slice(0, capOffset).flat();
            const F2 = F.slice(capOffset, junctionOffset).flat();
            const F3 = F.slice(junctionOffset).flat();
            const addPart = (faces: number[], color: number) => {
                const geometry = createGeometry(V, faces);
                const wireframe = new THREE.WireframeGeometry(geometry);
                const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color }));
                const wf = new THREE.LineSegments(wireframe, new THREE.LineBasicMaterial({ color: 0x000000 }));
                group.add(mesh);
                group.add(wf);
            };
            addPart(F1, COLORS.MESH_3D_BLUE);
            addPart(F2, COLORS.MESH_3D_GREEN);
            addPart(F3, COLORS.MESH_3D_YELLOW);
        }
        if (currentStep >= 4 && mesh3D) {
            const [V, F] = mesh3D;
            const geometry = createGeometry(V, F.flat());
            const wireframe = new THREE.WireframeGeometry(geometry);
            const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: COLORS.MESH_3D_GREY }));
            const wf = new THREE.LineSegments(wireframe, new THREE.LineBasicMaterial({ color: 0x000000 }));
            group.add(mesh);
            group.add(wf);
        }
        if (currentStep === 5 && skeleton && skeleton[0].length > 0 && skeleton[1].length > 0) {
            const skelGroup = createSkeleton(skeleton);
            group.add(skelGroup);
        }
    }, [ready, flowApi.state.currentStep, flowApi.state.mesh2D, flowApi.state.mesh3D, flowApi.state.chordData, flowApi.state.capOffset, flowApi.state.junctionOffset, flowApi.state.skeleton]);

    useEffect(() => {
        return () => {
            if (displayGroupRef.current && sceneRef.current) {
                disposeDisplayGroup(displayGroupRef.current);
                sceneRef.current.removeObject(displayGroupRef.current);
                displayGroupRef.current = null;
            }
        };
    }, []);

    const steps = useMemo(
        () => [
            {
                name: '2D Mesh',
                desc: 'Triangulated 2D mesh from the outline path. Adjust isodistance to control density.',
                params: [
                    {
                        name: 'isodistance',
                        value: flowApi.params.isodistance,
                        min: 2,
                        max: 30,
                        step: 1,
                        onChange: flowApi.onParamChange.setIsodistance,
                    },
                ],
            },
            {
                name: 'Chord Smoothing',
                desc: 'Chord smoothing for pipe axis. Laplacian iterations and alpha control the stitch shape.',
                params: [
                    {
                        name: 'laplacianIters',
                        value: flowApi.params.laplacianIters,
                        min: 0,
                        max: 30,
                        step: 1,
                        onChange: flowApi.onParamChange.setLaplacianIters,
                    },
                    {
                        name: 'laplacianAlpha',
                        value: flowApi.params.laplacianAlpha,
                        min: 0.1,
                        max: 1,
                        step: 0.05,
                        onChange: flowApi.onParamChange.setLaplacianAlpha,
                    },
                ],
            },
            {
                name: 'Mesh Smooth',
                desc: 'Smooth the 3D pipe mesh. Higher factor = stronger smoothing.',
                params: [
                    {
                        name: 'smoothFactor',
                        value: flowApi.params.smoothFactor,
                        min: 0.1,
                        max: 20,
                        step: 0.05,
                        onChange: flowApi.onParamChange.setSmoothFactor,
                    },
                ],
            },
            {
                name: 'Isometric Remesh',
                desc: 'Remesh for more uniform triangles. Improves skeleton and skinning quality.',
                params: [
                    {
                        name: 'isometricIters',
                        value: flowApi.params.isometricIterations,
                        min: 0,
                        max: 10,
                        step: 1,
                        onChange: flowApi.onParamChange.setIsometricIterations,
                    },
                    {
                        name: 'isometricLength',
                        value: flowApi.params.isometricLength,
                        min: 5,
                        max: 20,
                        step: 1,
                        onChange: flowApi.onParamChange.setIsometricLength,
                    },
                ],
            },
            {
                name: 'Skeleton',
                desc: 'Auto-generated skeleton from mesh. Thresholds control bone placement and pruning.',
                params: [
                    {
                        name: 'boneDevThreshold',
                        value: flowApi.params.boneDevThreshold,
                        min: 1,
                        max: 200,
                        step: 1,
                        onChange: flowApi.onParamChange.setBoneDevThreshold,
                    },
                    {
                        name: 'boneLenThreshold',
                        value: flowApi.params.boneLenThreshold,
                        min: 1,
                        max: 200,
                        step: 1,
                        onChange: flowApi.onParamChange.setBoneLenThreshold,
                    },
                    {
                        name: 'bonePruningThreshold',
                        value: flowApi.params.bonePruningThreshold,
                        min: 1,
                        max: 200,
                        step: 1,
                        onChange: flowApi.onParamChange.setBonePruningThreshold,
                    },
                ],
            },
        ],
        [
            flowApi.params.isodistance,
            flowApi.params.laplacianIters,
            flowApi.params.laplacianAlpha,
            flowApi.params.smoothFactor,
            flowApi.params.isometricIterations,
            flowApi.params.isometricLength,
            flowApi.params.boneDevThreshold,
            flowApi.params.boneLenThreshold,
            flowApi.params.bonePruningThreshold,
        ]
    );

    return (
        <div className="absolute inset-0 z-50 flex flex-col sm:flex-row bg-white dark:bg-gray-900">
            <div className="flex-1 min-w-0 min-h-0 relative">
                <Scene
                    enableRig={false}
                    enableTransform={false}
                    onSceneReady={handleReady}
                />
            </div>
            <div
                role="complementary"
                className="flex-shrink-0 w-full sm:w-80 border-l border-gray-700 bg-gray-900 overflow-auto shadow-xl flex flex-col"
                data-mantine-color-scheme="dark"
            >
                <div className="p-4 flex-1 min-h-0">
                    <Controller
                        currentStep={flowApi.state.currentStep}
                        onNext={flowApi.onNext}
                        onCancel={() => {
                            flowApi.onReset();
                            onCancel?.();
                        }}
                        steps={steps}
                    />
                </div>
            </div>
        </div>
    );
}
