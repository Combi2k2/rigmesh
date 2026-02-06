'use client';

import { Leva, useControls, button } from 'leva';

interface MeshMergeControllerProps {
    currentStep: number;
    hasResult: boolean;
    smoothingFactor: number;
    preserveSkinWeights: boolean;
    error: string | null;
    onSmoothingFactorChange: (value: number) => void;
    onPreserveSkinWeightsChange: (value: boolean) => void;
    onApply: () => void;
    onCancel: () => void;
}

export default function MeshMergeController({
    currentStep,
    hasResult,
    smoothingFactor,
    preserveSkinWeights,
    error,
    onSmoothingFactorChange,
    onPreserveSkinWeightsChange,
    onApply,
    onCancel,
}: MeshMergeControllerProps) {
    // Tuning controls - only relevant in step 2
    useControls('Tuning', {
        smoothingFactor: {
            value: smoothingFactor,
            min: 0,
            max: 1,
            step: 0.05,
            label: 'Smoothing',
            onChange: (v) => onSmoothingFactorChange(v),
        },
        preserveSkinWeights: {
            value: preserveSkinWeights,
            label: 'Preserve Skin',
            onChange: (v) => onPreserveSkinWeightsChange(v),
        },
    }, { collapsed: currentStep !== 2 }, [currentStep, smoothingFactor, preserveSkinWeights]);

    // Navigation
    useControls('Actions', {
        Apply: button(() => onApply(), {
            disabled: !hasResult || !!error,
        }),
        Cancel: button(() => onCancel()),
    }, [hasResult, error]);

    return <Leva />;
}
