'use client';

import { useState, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { runMeshCut } from '@/core/meshcut';
import { Vec3, Plane } from '@/interface';

export interface MeshCutState {
    currentStep: number;
    inputMesh: THREE.SkinnedMesh | null;
    cutPlane: Plane | null;
    resultMeshes: THREE.SkinnedMesh[] | null;
}

export interface MeshCutParams {
    sharpFactor: number;
}

export function useMeshCut(
    onCutComplete?: (meshes: THREE.SkinnedMesh[]) => void
) {
    // State
    const [currentStep, setCurrentStep] = useState<number>(0);
    const [inputMesh, setInputMesh] = useState<THREE.SkinnedMesh | null>(null);
    const [cutPlane, setCutPlane] = useState<Plane | null>(null);
    const [resultMeshes, setResultMeshes] = useState<THREE.SkinnedMesh[] | null>(null);

    // Params for step 2
    const [sharpFactor, setSharpFactor] = useState<number>(0.5);

    /**
     * Step 0: Initialize with the input skinned mesh.
     * Moves to step 1 (ready for cut plane input).
     */
    const processStep0 = useCallback((mesh: THREE.SkinnedMesh) => {
        setInputMesh(mesh);
        setCutPlane(null);
        setResultMeshes(null);
        setCurrentStep(1);
    }, []);

    /**
     * Step 1: Run mesh splitting with the given cut plane.
     * @param normal The cutting plane normal vector
     * @param offset The cutting plane offset (plane equation: normal·x + offset = 0)
     * Moves to step 2 (ready for sharpFactor tuning).
     */
    const processStep1 = useCallback((normal: Vec3, offset: number) => {
        if (!inputMesh) return;

        const plane: Plane = { normal, offset };
        const results = runMeshCut(inputMesh, plane, sharpFactor);

        results.forEach(mesh => {
            let v = new THREE.Vector3();
            v.fromBufferAttribute(mesh.geometry.getAttribute('position'), 0);
            v.applyMatrix4(mesh.matrixWorld);

            let pushDir = normal;

            if (normal.dot(v) + offset < 0)
                pushDir = pushDir.times(-1);

            mesh.position.x += pushDir.x * 5;
            mesh.position.y += pushDir.y * 5;
            mesh.position.z += pushDir.z * 5;
            mesh.updateMatrixWorld(true);
        });
        
        setCutPlane(plane);
        setResultMeshes(results);
        setCurrentStep(2);
    }, [inputMesh, sharpFactor]);

    /**
     * Step 2: Apply sharpness to the cut results.
     * @param factor Sharp factor (0-1)
     * This can be called multiple times to preview different sharpness levels.
     * Re-runs the cut with the new sharp factor.
     */
    const processStep2 = useCallback((factor: number) => {
        if (!inputMesh || !cutPlane) return;
        
        // Dispose old result meshes before re-cutting
        resultMeshes?.forEach(mesh => {
            mesh.geometry.dispose();
            if (mesh.material instanceof THREE.Material) {
                mesh.material.dispose();
            }
        });
        
        setSharpFactor(factor);
        const results = runMeshCut(inputMesh, cutPlane, factor);
        setResultMeshes(results);
    }, [inputMesh, cutPlane, resultMeshes]);

    /**
     * Move to previous step.
     */
    const handleBack = useCallback(() => {
        if (currentStep === 2) {
            // Clean up result meshes
            resultMeshes?.forEach(mesh => {
                mesh.geometry.dispose();
                if (mesh.material instanceof THREE.Material) {
                    mesh.material.dispose();
                }
            });
            setCutPlane(null);
            setResultMeshes(null);
            setCurrentStep(1);
        } else if (currentStep === 1) {
            setInputMesh(null);
            setCurrentStep(0);
        }
    }, [currentStep, resultMeshes]);

    /**
     * Reset all state to initial.
     */
    const handleReset = useCallback(() => {
        // Clean up result meshes
        resultMeshes?.forEach(mesh => {
            mesh.geometry.dispose();
            if (mesh.material instanceof THREE.Material) {
                mesh.material.dispose();
            }
        });
        setCurrentStep(0);
        setInputMesh(null);
        setCutPlane(null);
        setResultMeshes(null);
    }, [resultMeshes]);

    /**
     * Apply the cut and return results via callback.
     */
    const handleApply = useCallback(() => {
        if (resultMeshes && onCutComplete) {
            onCutComplete(resultMeshes);
            // Don't dispose meshes since they're being passed to the callback
            setCurrentStep(0);
            setInputMesh(null);
            setCutPlane(null);
            setResultMeshes(null);
        }
    }, [resultMeshes, onCutComplete]);

    const state: MeshCutState = {
        currentStep,
        inputMesh,
        cutPlane,
        resultMeshes,
    };

    const params: MeshCutParams = {
        sharpFactor,
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
            setSharpFactor,
        },
    };
}
