'use client';

import Step1 from './Step1';
import Step2 from './Step2';
import Step3 from './Step3';
import Step4 from './Step4';
import { MeshGenParams } from '@/hooks/meshgen';

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
    const renderStepContent = () => {
    switch (currentStep) {
        case 1:
            return <Step1
                isodistance={params.isodistance}
                branchMinLength={params.branchMinLength}
                onIsodistanceChange={onParamChange.setIsodistance}
                onBranchMinLengthChange={onParamChange.setBranchMinLength}
            />;
        case 2:
            return <Step2
                laplacianIterations={params.laplacianIterations}
                laplacianAlpha={params.laplacianAlpha}
                onLaplacianIterationsChange={onParamChange.setLaplacianIterations}
                onLaplacianAlphaChange={onParamChange.setLaplacianAlpha}
            />;
        case 3:
            return <Step3
                smoothFactor={params.smoothFactor}
                onSmoothFactorChange={onParamChange.setSmoothFactor}
            />;
        case 4:
            return <Step4
                isometricIterations={params.isometricIterations}
                isometricLength={params.isometricLength}
                isometricLengthAuto={params.isometricLengthAuto}
                onIsometricIterationsChange={onParamChange.setIsometricIterations}
                onIsometricLengthChange={onParamChange.setIsometricLength}
                onIsometricLengthAutoChange={onParamChange.setIsometricLengthAuto}
            />;
        default:
            return null;
        }
    };

    return <>
        <div className="border-b border-gray-300 dark:border-gray-700 p-3">
            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Step {currentStep} / {totalSteps}: {STEP_NAMES[currentStep] || `Step ${currentStep}`}
            </div>
            <div className="flex gap-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                key={i}
                className={`flex-1 h-2 rounded ${
                    i + 1 <= currentStep
                    ? 'bg-blue-500'
                    : 'bg-gray-300 dark:bg-gray-600'
                }`}
                />
            ))}
            </div>
        </div>
        <div className="flex-1 border-b border-gray-300 dark:border-gray-700 p-3 overflow-y-auto">
            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3">Param Tune</div>
            <div className="space-y-4">
                {renderStepContent()}
            </div>
        </div>

        {/* Action Buttons */}
        <div className="p-3 border-t border-gray-300 dark:border-gray-700 space-y-2">
            <div className="flex gap-2">
                <button
                    onClick={onBack}
                    disabled={currentStep <= 1}
                    className="flex-1 px-4 py-2 bg-gray-500 hover:bg-gray-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded"
                >
                    Back
                </button>
                <button
                    onClick={onNext}
                    disabled={currentStep > totalSteps}
                    className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded"
                >
                    {currentStep >= totalSteps ? 'Complete' : 'Next'}
                </button>
            </div>
            {onCancel && (
                <button
                    onClick={onCancel}
                    className="w-full px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded"
                >
                    Cancel
                </button>
            )}
        </div>
    </>;
}
