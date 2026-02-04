'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import * as THREE from 'three';
import MeshCutScene from './MeshCutScene';
import MeshCutController from './MeshCutController';
import { useMeshCut } from '@/hooks/useMeshCut';
import { computeCutPlaneFromScreenLine, ScreenLine } from '@/core/meshcut';

export interface MeshCutUIProps {
    skinnedMesh: THREE.SkinnedMesh;
    onComplete?: (meshes: THREE.SkinnedMesh[]) => void;
    onCancel?: () => void;
}

export default function MeshCutUI({
    skinnedMesh,
    onComplete,
    onCancel,
}: MeshCutUIProps) {
    const meshCut = useMeshCut(onComplete);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const [initialized, setInitialized] = useState(false);

    // Initialize with the skinned mesh directly
    useEffect(() => {
        if (skinnedMesh && !initialized) {
            meshCut.processStep0(skinnedMesh);
            setInitialized(true);
        }
    }, [skinnedMesh, initialized, meshCut]);

    const handleCameraRef = useCallback((camera: THREE.PerspectiveCamera | null) => {
        cameraRef.current = camera;
    }, []);

    const handleLineComplete = useCallback((line: ScreenLine) => {
        const camera = cameraRef.current;
        if (!camera) {
            console.error('Camera not available');
            return;
        }
        
        // Convert screen line to cut plane using the camera
        const plane = computeCutPlaneFromScreenLine(line, camera);
        meshCut.processStep1(plane.normal, plane.offset);
    }, [meshCut]);

    const handleSharpFactorChange = useCallback((factor: number) => {
        // Use processStep2 to re-run the cut with new sharp factor
        meshCut.processStep2(factor);
    }, [meshCut]);

    const handleApply = useCallback(() => {
        meshCut.onApply();
    }, [meshCut]);

    const handleCancel = useCallback(() => {
        meshCut.onReset();
        onCancel?.();
    }, [meshCut, onCancel]);

    return (
        <div className="absolute inset-0 z-50 flex bg-white dark:bg-gray-900">
            <MeshCutScene
                skinnedMesh={skinnedMesh}
                currentStep={meshCut.state.currentStep}
                resultMeshes={meshCut.state.resultMeshes}
                onLineComplete={handleLineComplete}
                onCameraRef={handleCameraRef}
            />
            <MeshCutController
                currentStep={meshCut.state.currentStep}
                hasResults={meshCut.state.resultMeshes !== null && meshCut.state.resultMeshes.length > 0}
                sharpFactor={meshCut.params.sharpFactor}
                onSharpFactorChange={handleSharpFactorChange}
                onApply={handleApply}
                onCancel={handleCancel}
            />
        </div>
    );
}
