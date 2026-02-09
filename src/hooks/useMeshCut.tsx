'use client';

import { useState, useCallback, useRef, useEffect, RefObject } from 'react';
import * as THREE from 'three';
import { MeshCut } from '@/core/meshcut';
import { Vec3, Plane } from '@/interface';

export interface MeshCutState {
    currentStep: number;
    resultRef: RefObject<THREE.SkinnedMesh[] | null>;
}
export interface MeshCutParams {
    smoothLayers: number;
    smoothFactor: number;
}

export function useMeshCut(onCutComplete?: (meshes: THREE.SkinnedMesh[]) => void) {
    const [currentStep, setCurrentStep] = useState<number>(0);
    const [inputMesh, setInputMesh] = useState<THREE.SkinnedMesh | null>(null);
    const resultRef = useRef<THREE.SkinnedMesh[] | null>(null);
    const cutterRef = useRef<MeshCut | null>(null);

    const [smoothLayers, setSmoothLayers] = useState<number>(0);
    const [smoothFactor, setSmoothFactor] = useState<number>(0.1);
    
    const processStep1 = useCallback(() => {
        if (!inputMesh) return;
        cutterRef.current = new MeshCut(inputMesh);
        resultRef.current = null;
    }, [inputMesh]);
    
    const processStep2 = useCallback(() => {
        if (!cutterRef.current) return;
        if (!resultRef.current) return;
        resultRef.current.forEach(mesh => cutterRef.current.runMeshPatch(mesh));
    }, []);

    const processStep3 = useCallback(() => {
    }, [smoothLayers, smoothFactor]);

    const processStep4 = useCallback(() => {
    }, []);

    const onMeshReady = useCallback((mesh: THREE.SkinnedMesh) => {
        setInputMesh(mesh);
        setCurrentStep(1);
    }, []);

    const onCutReady = useCallback((plane: Plane) => {
        if (!cutterRef.current) return;
        const cutter = cutterRef.current;
        const meshes = cutter.runMeshSplit(plane);
        resultRef.current = meshes;
    }, []);

    const onNext = useCallback(() => {
        setCurrentStep(prev => prev + 1);
    }, []);
    const onBack = useCallback(() => {
        setCurrentStep(prev => Math.max(1, prev - 1));
    }, []);
    const onReset = useCallback(() => {
        setCurrentStep(0);
        setInputMesh(null);
        cutterRef.current = null;
        resultRef.current = null;
    }, []);

    useEffect(() => {
        if (currentStep === 1) processStep1();
        if (currentStep === 2) processStep2();
        if (currentStep === 3) processStep3();
        if (currentStep === 4) processStep4();
    }, [currentStep, 
        processStep1,
        processStep2,
        processStep3, smoothLayers, smoothFactor,
        processStep4,
    ]);
    useEffect(() => {
        if (currentStep > 4) {
            if (onCutComplete && resultRef.current)
                onCutComplete(resultRef.current);
            onReset();
        }
    }, [currentStep, onCutComplete, onReset]);

    const state: MeshCutState = {
        currentStep,
        resultRef,
    };

    const params: MeshCutParams = {
        smoothLayers,
        smoothFactor,
    };

    return {
        state,
        params,
        onMeshReady,
        onCutReady,
        onNext,
        onBack,
        onReset,
        onParamChange: {
            setSmoothLayers,
            setSmoothFactor,
        },
    };
}
