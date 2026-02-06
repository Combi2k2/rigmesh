'use client';

import { useState, useCallback } from 'react';
import * as THREE from 'three';
import { runMeshMerge, runMeshMergePreserveSkin } from '@/core/meshmerge';

export interface MeshMergeState {
    currentStep: number;
    inputMesh1: THREE.SkinnedMesh | null;
    inputMesh2: THREE.SkinnedMesh | null;
    resultMesh: THREE.SkinnedMesh | null;
    error: string | null;
}

export interface MeshMergeParams {
    smoothingFactor: number;
    preserveSkinWeights: boolean;
}

export function useMeshMerge(
    onMergeComplete?: (mesh: THREE.SkinnedMesh) => void
) {
    // State
    const [currentStep, setCurrentStep] = useState<number>(0);
    const [inputMesh1, setInputMesh1] = useState<THREE.SkinnedMesh | null>(null);
    const [inputMesh2, setInputMesh2] = useState<THREE.SkinnedMesh | null>(null);
    const [resultMesh, setResultMesh] = useState<THREE.SkinnedMesh | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Params
    const [smoothingFactor, setSmoothingFactor] = useState<number>(0.1);
    const [preserveSkinWeights, setPreserveSkinWeights] = useState<boolean>(false);

    /**
     * Step 0: Initialize with the first input skinned mesh.
     * Moves to step 1 (ready for second mesh input).
     */
    const processStep0 = useCallback((mesh: THREE.SkinnedMesh) => {
        setInputMesh1(mesh);
        setInputMesh2(null);
        setResultMesh(null);
        setError(null);
        setCurrentStep(1);
    }, []);

    /**
     * Step 1: Accept the second mesh and perform the merge.
     * Moves to step 2 (preview/adjust result).
     */
    const processStep1 = useCallback((mesh: THREE.SkinnedMesh) => {
        if (!inputMesh1) return;

        setInputMesh2(mesh);
        setError(null);

        try {
            const mergeFn = preserveSkinWeights ? runMeshMergePreserveSkin : runMeshMerge;
            const result = mergeFn(inputMesh1, mesh, smoothingFactor);

            if (result) {
                setResultMesh(result);
                setCurrentStep(2);
            } else {
                setError('Meshes do not appear to intersect. Please ensure the meshes overlap before merging.');
            }
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : 'Unknown error during merge';
            setError(`Merge failed: ${errorMsg}`);
        }
    }, [inputMesh1, smoothingFactor, preserveSkinWeights]);

    /**
     * Step 2: Adjust smoothing factor and re-run merge.
     * Can be called multiple times to preview different settings.
     */
    const processStep2 = useCallback((factor: number) => {
        if (!inputMesh1 || !inputMesh2) return;

        // Dispose old result mesh before re-merging
        if (resultMesh) {
            resultMesh.geometry.dispose();
            if (resultMesh.material instanceof THREE.Material) {
                resultMesh.material.dispose();
            }
        }

        setSmoothingFactor(factor);
        setError(null);

        try {
            const mergeFn = preserveSkinWeights ? runMeshMergePreserveSkin : runMeshMerge;
            const result = mergeFn(inputMesh1, inputMesh2, factor);

            if (result) {
                setResultMesh(result);
            } else {
                setError('Merge failed with new parameters.');
            }
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : 'Unknown error during merge';
            setError(`Merge failed: ${errorMsg}`);
        }
    }, [inputMesh1, inputMesh2, resultMesh, preserveSkinWeights]);

    /**
     * Toggle preserve skin weights and re-run merge if in step 2.
     */
    const togglePreserveSkinWeights = useCallback((preserve: boolean) => {
        setPreserveSkinWeights(preserve);

        // If we're in step 2, re-run the merge with new setting
        if (currentStep === 2 && inputMesh1 && inputMesh2) {
            if (resultMesh) {
                resultMesh.geometry.dispose();
                if (resultMesh.material instanceof THREE.Material) {
                    resultMesh.material.dispose();
                }
            }

            try {
                const mergeFn = preserve ? runMeshMergePreserveSkin : runMeshMerge;
                const result = mergeFn(inputMesh1, inputMesh2, smoothingFactor);

                if (result) {
                    setResultMesh(result);
                    setError(null);
                } else {
                    setError('Merge failed with new parameters.');
                }
            } catch (e) {
                const errorMsg = e instanceof Error ? e.message : 'Unknown error during merge';
                setError(`Merge failed: ${errorMsg}`);
            }
        }
    }, [currentStep, inputMesh1, inputMesh2, resultMesh, smoothingFactor]);

    /**
     * Move to previous step.
     */
    const handleBack = useCallback(() => {
        if (currentStep === 2) {
            // Clean up result mesh
            if (resultMesh) {
                resultMesh.geometry.dispose();
                if (resultMesh.material instanceof THREE.Material) {
                    resultMesh.material.dispose();
                }
            }
            setInputMesh2(null);
            setResultMesh(null);
            setError(null);
            setCurrentStep(1);
        } else if (currentStep === 1) {
            setInputMesh1(null);
            setError(null);
            setCurrentStep(0);
        }
    }, [currentStep, resultMesh]);

    /**
     * Reset all state to initial.
     */
    const handleReset = useCallback(() => {
        // Clean up result mesh
        if (resultMesh) {
            resultMesh.geometry.dispose();
            if (resultMesh.material instanceof THREE.Material) {
                resultMesh.material.dispose();
            }
        }
        setCurrentStep(0);
        setInputMesh1(null);
        setInputMesh2(null);
        setResultMesh(null);
        setError(null);
    }, [resultMesh]);

    /**
     * Apply the merge and return result via callback.
     */
    const handleApply = useCallback(() => {
        if (resultMesh && onMergeComplete) {
            onMergeComplete(resultMesh);
            // Don't dispose mesh since it's being passed to the callback
            setCurrentStep(0);
            setInputMesh1(null);
            setInputMesh2(null);
            setResultMesh(null);
            setError(null);
        }
    }, [resultMesh, onMergeComplete]);

    const state: MeshMergeState = {
        currentStep,
        inputMesh1,
        inputMesh2,
        resultMesh,
        error,
    };

    const params: MeshMergeParams = {
        smoothingFactor,
        preserveSkinWeights,
    };

    return {
        state,
        params,
        processStep0,
        processStep1,
        processStep2,
        onBack: handleBack,
        onReset: handleReset,
        onApply: handleApply,
        onParamChange: {
            setSmoothingFactor,
            setPreserveSkinWeights: togglePreserveSkinWeights,
        },
    };
}
