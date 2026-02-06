'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import * as THREE from 'three';
import MeshMergeScene from './MeshMergeScene';
import MeshMergeController from './MeshMergeController';
import { useMeshMerge } from '@/hooks/useMeshMerge';

export interface MeshMergeUIProps {
    /** The first mesh to merge */
    mesh1: THREE.SkinnedMesh;
    /** The second mesh to merge */
    mesh2: THREE.SkinnedMesh;
    /** Callback when merge is complete and applied */
    onComplete?: (mesh: THREE.SkinnedMesh) => void;
    /** Callback when merge is cancelled */
    onCancel?: () => void;
}

export default function MeshMergeUI({
    mesh1,
    mesh2,
    onComplete,
    onCancel,
}: MeshMergeUIProps) {
    const meshMerge = useMeshMerge(onComplete);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const [initialized, setInitialized] = useState(false);

    // Initialize with both meshes and immediately run merge
    useEffect(() => {
        if (mesh1 && mesh2 && !initialized) {
            meshMerge.processStep0(mesh1);
            setInitialized(true);
        }
    }, [mesh1, mesh2, initialized, meshMerge]);

    // Once step 0 is done, automatically proceed to step 1 with second mesh
    useEffect(() => {
        if (initialized && meshMerge.state.currentStep === 1 && mesh2) {
            meshMerge.processStep1(mesh2);
        }
    }, [initialized, meshMerge.state.currentStep, mesh2, meshMerge]);

    const handleCameraRef = useCallback((camera: THREE.PerspectiveCamera | null) => {
        cameraRef.current = camera;
    }, []);

    const handleSmoothingFactorChange = useCallback((factor: number) => {
        meshMerge.processStep2(factor);
    }, [meshMerge]);

    const handlePreserveSkinWeightsChange = useCallback((preserve: boolean) => {
        meshMerge.onParamChange.setPreserveSkinWeights(preserve);
    }, [meshMerge]);

    const handleApply = useCallback(() => {
        meshMerge.onApply();
    }, [meshMerge]);

    const handleCancel = useCallback(() => {
        meshMerge.onReset();
        onCancel?.();
    }, [meshMerge, onCancel]);

    return (
        <div className="absolute inset-0 z-50 flex bg-white dark:bg-gray-900">
            <MeshMergeScene
                mesh1={mesh1}
                mesh2={mesh2}
                currentStep={meshMerge.state.currentStep}
                resultMesh={meshMerge.state.resultMesh}
                error={meshMerge.state.error}
                onCameraRef={handleCameraRef}
            />
            <MeshMergeController
                currentStep={meshMerge.state.currentStep}
                hasResult={meshMerge.state.resultMesh !== null}
                smoothingFactor={meshMerge.params.smoothingFactor}
                preserveSkinWeights={meshMerge.params.preserveSkinWeights}
                error={meshMerge.state.error}
                onSmoothingFactorChange={handleSmoothingFactorChange}
                onPreserveSkinWeightsChange={handlePreserveSkinWeightsChange}
                onApply={handleApply}
                onCancel={handleCancel}
            />
        </div>
    );
}
