'use client';

import { Leva, useControls, button } from 'leva';

interface MeshCutControllerProps {
    currentStep: number;
    hasResults: boolean;
    sharpFactor: number;
    onSharpFactorChange: (value: number) => void;
    onApply: () => void;
    onCancel: () => void;
}

export default function MeshCutController({
    currentStep,
    hasResults,
    sharpFactor,
    onSharpFactorChange,
    onApply,
    onCancel,
}: MeshCutControllerProps) {
    // Tuning controls - only relevant in step 2
    useControls('Tuning', {
        sharpFactor: {
            value: sharpFactor,
            min: 0,
            max: 1,
            step: 0.1,
            label: 'Sharp Factor',
            onChange: (v) => onSharpFactorChange(v),
        },
    }, { collapsed: currentStep !== 2 }, [currentStep]);

    // Navigation
    useControls('Actions', {
        Apply: button(() => onApply(), {
            disabled: !hasResults,
        }),
        Cancel: button(() => onCancel()),
    }, [hasResults]);

    return <Leva />;
}
