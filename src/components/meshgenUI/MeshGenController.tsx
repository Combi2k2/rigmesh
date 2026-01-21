'use client';

import { MeshGenParams } from '@/hooks/meshgen';
import { Leva, useControls, button } from 'leva';

interface MeshGenControllerProps {
    currentStep: number;
    totalSteps: number;
    params: MeshGenParams;
    onParamChange: {
        setIsodistance: (value: number) => void;
        setBranchMinLength: (value: number) => void;
        setLaplacianIterations: (value: number) => void;
        setLaplacianAlpha: (value: number) => void;
        setSmoothFactor: (value: number) => void;
        setIsometricIterations: (value: number) => void;
        setIsometricLength: (value: number) => void;
        setIsometricLengthAuto: (value: boolean) => void;
        setBoneDevThreshold: (value: number) => void;
        setBoneLenThreshold: (value: number) => void;
        setSkelAlgo: (value: 'chord' | 'mat') => void;
    };
    onNext: () => void;
    onBack: () => void;
    onCancel?: () => void;
}

const STEP_NAMES: { [key: number]: string } = {
    1: 'Generate + Prune Triangulation',
    2: 'Chord Smoothing',
    3: 'Surface Generation',
    4: 'Isometric Remeshing',
    5: 'Skeleton Generation',
};

export default function MeshGenController({
    currentStep,
    totalSteps,
    params,
    onParamChange,
    onNext,
    onBack,
    onCancel,
}: MeshGenControllerProps) {
    console.log('currentStep', currentStep);
    useControls('Step 1: Generate + Prune Triangulation',{
        isodistance: { value: params.isodistance, min: 1, max: 50, step: 1, onChange: v => onParamChange.setIsodistance(v)},
        branchMinLength: { value: params.branchMinLength, min: 1, max: 100, step: 1, onChange: v => onParamChange.setBranchMinLength(v)}
    }, {collapsed: currentStep !== 1});

    useControls('Step 2: Chord Smoothing',{
        laplacianIterations: { value: params.laplacianIterations, min: 0, max: 100, step: 1, onChange: v => onParamChange.setLaplacianIterations(v)},
        laplacianAlpha: { value: params.laplacianAlpha, min: 0, max: 2, step: 0.05, onChange: v => onParamChange.setLaplacianAlpha(v)}
    }, {collapsed: currentStep !== 2});

    useControls('Step 3: Surface Generation',{
        smoothFactor: { value: params.smoothFactor, min: 0, max: 10.0, step: 0.05, onChange: v => onParamChange.setSmoothFactor(v)}
    }, {collapsed: currentStep !== 3});

    useControls('Step 4: Isometric Remeshing',{
        isometricIterations: { value: params.isometricIterations, min: 1, max: 10, step: 1, onChange: v => onParamChange.setIsometricIterations(v)},
        isometricLength:     { value: params.isometricLength,     min: 1, max: 100, step: 1, onChange: v => onParamChange.setIsometricLength(v)},
        isometricLengthAuto: { value: params.isometricLengthAuto, onChange: v => onParamChange.setIsometricLengthAuto(v)}
    }, {collapsed: currentStep !== 4});
    
    useControls('Step 5: Skeleton Generation',{
        boneDevThreshold: { value: params.boneDevThreshold, min: 5, max: 100, step: 1, onChange: v => onParamChange.setBoneDevThreshold(v)},
        boneLenThreshold: { value: params.boneLenThreshold, min: 1, max: 100, step: 1, onChange: v => onParamChange.setBoneLenThreshold(v)},
        skelAlgo: { value: 'chord', options: ['chord', 'mat'], onChange: v => onParamChange.setSkelAlgo(v)}
    }, {collapsed: currentStep !== 5});

    useControls('Navigation', {
        Back: button(() => onBack(), {
          disabled: currentStep <= 1,
        }),
        Next: button(() => onNext(), {
          disabled: currentStep >= totalSteps,
        }),
        Cancel: button(() => onCancel?.())
      })

    return <Leva/>;
}