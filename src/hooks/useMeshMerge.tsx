'use client';

import { useState, useCallback, useRef, useEffect, RefObject } from 'react';
import * as THREE from 'three';
import { MeshMerge } from '@/core/meshmerge';
import { MergeParams } from '@/core/meshmerge';

export interface MeshMergeState {
    currentStep: number;
    resultRef: RefObject<THREE.SkinnedMesh | null>;
}
export interface MeshMergeParams {
    smoothLayers: number;
    smoothFactor: number;
}

export function useMeshMerge(onMergeComplete?: (mesh: THREE.SkinnedMesh) => void) {
    const [currentStep, setCurrentStep] = useState<number>(0);
    const [mesh1, setMesh1] = useState<THREE.SkinnedMesh | null>(null);
    const [mesh2, setMesh2] = useState<THREE.SkinnedMesh | null>(null);
    const [smoothLayers, setSmoothLayers] = useState<number>(0);
    const [smoothFactor, setSmoothFactor] = useState<number>(0.1);
    const [swap, setSwap] = useState<boolean>(false);
    const [param, setParam] = useState<MergeParams | null>(null);

    const mergerRef = useRef<MeshMerge | null>(null);
    const resultRef = useRef<THREE.SkinnedMesh | null>(null);

    const onReady = useCallback((mesh1: THREE.SkinnedMesh, mesh2: THREE.SkinnedMesh) => {
        setCurrentStep(1);
        setMesh1(mesh1);
        setMesh2(mesh2);
        setSwap(false);
    }, []);

    const processStep2 = useCallback(() => {
        if (!mesh1 || !mesh2 || !param) return;
        const merger = swap ? new MeshMerge(mesh2, mesh1, param) : new MeshMerge(mesh1, mesh2, param);
        const result = merger.runTriangleRemoval();
        mergerRef.current = merger;
        resultRef.current = result;
    }, [mesh1, mesh2, param, swap]);

    const processStep3 = useCallback(() => {
        if (!mergerRef.current) return;
        if (!resultRef.current) return;
        mergerRef.current.runMeshStitch(resultRef.current);
    }, []);

    const processStep4 = useCallback(() => {
        if (!mergerRef.current) return;
        if (!resultRef.current) return;
        mergerRef.current.runMeshSmooth(resultRef.current, smoothLayers, smoothFactor);
    }, [smoothLayers, smoothFactor]);

    const processStep5 = useCallback(() => {
        if (!mergerRef.current) return;
        if (!resultRef.current) return;
        mergerRef.current.computeSkinWeights(resultRef.current);
    }, []);

    const onNext = useCallback(() => {
        setCurrentStep(prev => prev + 1);
    }, []);
    const onBack = useCallback(() => {
        setCurrentStep(prev => Math.max(1, prev - 1));
    }, []);
    const onReset = useCallback(() => {
        setCurrentStep(0);
        setMesh1(null);
        setMesh2(null);
        setParam(null);
        setSwap(false);
        mergerRef.current = null;
        resultRef.current = null;
    }, []);

    useEffect(() => {
        if (currentStep === 2)  processStep2();
        if (currentStep === 3)  processStep3();
        if (currentStep === 4)  processStep4();
        if (currentStep === 5)  processStep5();
    }, [
        currentStep,
        processStep2, mesh1, mesh2, param, swap,
        processStep3,
        processStep4, smoothLayers, smoothFactor,
        processStep5,
    ]);

    useEffect(() => {
        if (currentStep > 5) {
            if (onMergeComplete && resultRef.current)
                onMergeComplete(resultRef.current);

            onReset();
        }
    }, [currentStep, onMergeComplete, onReset]);

    const state: MeshMergeState = {
        currentStep,
        resultRef
    };
    const params: MeshMergeParams = {
        smoothLayers,
        smoothFactor,
    };

    return {
        state,
        params,
        onReady,
        onNext,
        onBack,
        onReset,
        setParam,
        setSwap,
        onParamChange: {
            setSmoothLayers,
            setSmoothFactor,
        },
    };
}
