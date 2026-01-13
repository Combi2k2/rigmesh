'use client';

import MeshGenController from './MeshGenController';
import MeshGenOverlay from './MeshGenOverlay';
import { MeshGenState, MeshGenParams } from '@/hooks/meshgen';

interface MeshGenUIProps {
    state: MeshGenState;
    params: MeshGenParams;
    onNext: () => void;
    onBack: () => void;
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
    onCancel?: () => void;
}

export default function MeshGenUI({
    state,
    params,
    onNext,
    onBack,
    onParamChange,
    onCancel,
}: MeshGenUIProps) {
    return (
        <div className="w-full h-screen overflow-hidden flex border border-gray-300 dark:border-gray-700">
            <div className="w-2/3 border-r border-gray-300 dark:border-gray-700 relative">
                <MeshGenOverlay state={state} />
            </div>
            <div className="w-1/3 flex flex-col bg-gray-50 dark:bg-gray-900">
                <MeshGenController
                    currentStep={state.currentStep}
                    totalSteps={5}
                    params={params}
                    onParamChange={onParamChange}
                    onNext={onNext}
                    onBack={onBack}
                    onCancel={onCancel}
                />
            </div>
        </div>
    );
}

