'use client';

import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import { MeshGenState } from '@/hooks/meshgen';
import { Point } from '@/interface';
import ViewSpace, { ViewSpaceReturn } from '@/components/ViewSpace';

const COLORS = {
    BACKGROUND: 0x1a1a2e,
    POLYGON: 0xffffff,
    MESH_2D: 0x10b981,
    MESH_2D_WIREFRAME: 0x059669,
    CHORD: 0xffd93d,
    MESH_3D_BLUE: 0x3b82f6,
    MESH_3D_GREEN: 0x10b981,  
    MESH_3D_YELLOW: 0xfbbf24,
    MESH_3D_GREY: 0xc0c0c0,
} as const;


export default function MeshGenOverlay({ state }: { state: MeshGenState }) {
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<TrackballControls | null>(null);
    
    const mesh2dRef = useRef<THREE.Mesh | null>(null);
    const mesh3dRef = useRef<THREE.Group | null>(null);
    const chordRef = useRef<THREE.Group | null>(null);
    const wireframe2dRef = useRef<THREE.LineSegments | null>(null);
    const wireframe3dRef = useRef<THREE.Group | null>(null);
    const polygonRef = useRef<THREE.Line | null>(null);
    
    const [viewSpaceReady, setViewSpaceReady] = useState(false);
    
    const createGeometry = (V: Point[], F: number[]) : THREE.BufferGeometry => {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(V.length * 3);
        
        V.forEach((v, i) => {
            positions[i * 3] = v.x;
            positions[i * 3 + 1] = v.y;
            positions[i * 3 + 2] = v.z || 0;
        });
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setIndex(F);
        geometry.computeVertexNormals();
        return geometry;
    };
    const handleViewSpaceReady = (refs: ViewSpaceReturn) => {
        sceneRef.current = refs.sceneRef.current;
        cameraRef.current = refs.cameraRef.current;
        controlsRef.current = refs.controlsRef.current;
        setViewSpaceReady(true);

        if (sceneRef.current) {
            sceneRef.current.background = new THREE.Color(COLORS.BACKGROUND);
        }
    };
    const cleanMesh = (scene: THREE.Scene, mesh: THREE.Mesh | null, wireframe: THREE.LineSegments | null) => {
        if (mesh) {
            scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
        if (wireframe) {
            scene.remove(wireframe);
            wireframe.geometry.dispose();
            wireframe.material.dispose();
        }
    };
    const cleanLine = (scene: THREE.Scene, line: THREE.Line | null) => {
        if (!line) return;
        
        scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
    };
    const cleanGroup = (scene: THREE.Scene, group: THREE.Group | null) => {
        if (!group) return;
        
        group.traverse((child) => {
            if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Line) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });
        scene.remove(group);
    };

    const renderPolygon = (scene: THREE.Scene, polygon: Point[]) => {
        if (polygon.length < 3) return;
        
        polygon = polygon.map(v => new THREE.Vector3(v.x, v.y, 0));
        polygon.push(polygon[0]);

        const geometry = new THREE.BufferGeometry().setFromPoints(polygon);
        const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: COLORS.POLYGON }));
        scene.add(line);
        polygonRef.current = line;
    };

    const renderStep1 = (scene: THREE.Scene, mesh2d: [Point[], number[][]]) => {
        const [V, F] = mesh2d;
        const geometry = createGeometry(V, F.flat());
        const wireframe = new THREE.WireframeGeometry(geometry);

        mesh2dRef.current      = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: COLORS.MESH_2D, transparent: true, opacity: 0.5 }));
        wireframe2dRef.current = new THREE.LineSegments(wireframe, new THREE.LineBasicMaterial({ color: COLORS.MESH_2D_WIREFRAME }));
        scene.add(mesh2dRef.current);
        scene.add(wireframe2dRef.current);

        cameraRef.current.position.set(0, 0, 100);
        cameraRef.current.lookAt(new THREE.Vector3(0, 0, 0));
        if (controlsRef.current) {
            controlsRef.current.target.set(0, 0, 0);
            controlsRef.current.update();
        }
    };
    const renderStep2 = (scene: THREE.Scene, chords: [Point[], Point[], number[]]) => {
        const [chordAxis, chordDirs, chordLengths] = chords;
        if (chordAxis.length === 0)
            return;

        const chordGroup = new THREE.Group();

        for (let i = 0; i < chordAxis.length; i++) {
            const mid = chordAxis[i];
            const dir = chordDirs[i].unit();
            const len = chordLengths[i];

            const v0 = mid.minus(dir.times(len/2));
            const v1 = mid.plus(dir.times(len/2));

            const geometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(v0.x, v0.y, v0?.z || 0),
                new THREE.Vector3(v1.x, v1.y, v1?.z || 0)
            ]);
            const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: COLORS.CHORD }));
            chordGroup.add(line);
        }
        scene.add(chordGroup);
        chordRef.current = chordGroup;
    };
    const renderStep3 = (scene: THREE.Scene, mesh3d: [Point[], number[][]], capOffset: number, junctionOffset: number) => {
        const [V, F] = mesh3d;
        const F1 = F.slice(0, capOffset).flat();
        const F2 = F.slice(capOffset, junctionOffset).flat();
        const F3 = F.slice(junctionOffset).flat();

        const createMesh = (faces: number[], color: number): [THREE.Mesh, THREE.LineSegments] => {
            const geometry = createGeometry(V, faces);
            const wireframe = new THREE.WireframeGeometry(geometry);

            return [
                new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color })),
                new THREE.LineSegments(wireframe, new THREE.LineBasicMaterial({ color: 0x000000 })),
            ];
        };

        const geometryGroup = new THREE.Group();
        const wireframeGroup = new THREE.Group();

        const group0 = createMesh(F1, COLORS.MESH_3D_BLUE);
        const group1 = createMesh(F2, COLORS.MESH_3D_GREEN);
        const group2 = createMesh(F3, COLORS.MESH_3D_YELLOW);

        geometryGroup.add(group0[0]);   wireframeGroup.add(group0[1]);
        geometryGroup.add(group1[0]);   wireframeGroup.add(group1[1]);
        geometryGroup.add(group2[0]);   wireframeGroup.add(group2[1]);

        scene.add(geometryGroup);
        scene.add(wireframeGroup);

        mesh3dRef.current = geometryGroup;
        wireframe3dRef.current = wireframeGroup;
    };
    const renderStep4 = (scene: THREE.Scene, mesh3d: [Point[], number[][]]) => {
        const [V, F] = mesh3d;

        const geometry = createGeometry(V, F.flat());
        const wireframe = new THREE.WireframeGeometry(geometry);

        mesh3dRef.current = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: COLORS.MESH_3D_GREY }));
        wireframe3dRef.current = new THREE.LineSegments(wireframe, new THREE.LineBasicMaterial({ color: 0x000000 }));
        
        scene.add(mesh3dRef.current);
        scene.add(wireframe3dRef.current);
    };

    useEffect(() => {
        if (!viewSpaceReady || !sceneRef.current) {
            console.log('[MeshGenOverlay] Rendering skipped - view space not ready');
            return;
        }
        const scene = sceneRef.current;
        const { currentStep, mesh2D, mesh3D, chordData, capOffset, junctionOffset } = state;

        cleanLine(scene, polygonRef.current);
        cleanMesh(scene, mesh2dRef.current, wireframe2dRef.current);
        cleanGroup(scene, chordRef.current);
        cleanGroup(scene, mesh3dRef.current);
        cleanGroup(scene, wireframe3dRef.current);

        polygonRef.current = null;
        mesh2dRef.current = null;
        mesh3dRef.current = null;
        wireframe2dRef.current = null;
        wireframe3dRef.current = null;
        chordRef.current = null;

        if (currentStep >= 2 && mesh2D)     renderPolygon(scene, mesh2D[0]);
        if (currentStep == 1 && mesh2D)     renderStep1(scene, mesh2D);
        if (currentStep == 2 && chordData)  renderStep2(scene, chordData);
        if (currentStep == 3 && mesh3D)     renderStep3(scene, mesh3D, capOffset, junctionOffset);
        if (currentStep == 4 && mesh3D)     renderStep4(scene, mesh3D);
    }, [state, viewSpaceReady]);

    return (
        <div className="absolute inset-0 z-50 bg-black bg-opacity-60">
            <ViewSpace
                onViewSpaceReady={handleViewSpaceReady}
                className="w-full h-full"
                style={{ 
                    pointerEvents: 'auto',
                    position: 'relative',
                    minHeight: '100%',
                    minWidth: '100%'
                }}
            />
        </div>
    );
}