'use client';

import Step1 from './Step1';
import Step2 from './Step2';
import Step3 from './Step3';
import Step4 from './Step4';

interface MeshGenFlowProps {
  currentStep: number;
  totalSteps: number;
  
  // Step 1 params
  isodistance: number;
  branchMinLength: number;
  onIsodistanceChange: (value: number) => void;
  onBranchMinLengthChange: (value: number) => void;
  
  // Step 2 params
  laplacianIterations: number;
  laplacianAlpha: number;
  onLaplacianIterationsChange: (value: number) => void;
  onLaplacianAlphaChange: (value: number) => void;
  
  // Step 3 params
  smoothFactor: number;
  onSmoothFactorChange: (value: number) => void;
  
  // Step 4 params
  isometricIterations: number;
  isometricLength: number;
  isometricLengthAuto: boolean;
  onIsometricIterationsChange: (value: number) => void;
  onIsometricLengthChange: (value: number) => void;
  onIsometricLengthAutoChange: (value: boolean) => void;
  
  // Actions
  onNext: () => void;
}

const STEP_NAMES: { [key: number]: string } = {
  1: 'Generate + Prune Triangulation',
  2: 'Chord Smoothing',
  3: 'Surface Generation',
  4: 'Isometric Remeshing',
};

export default function MeshGenFlow({
  currentStep,
  totalSteps,
  isodistance,
  branchMinLength,
  onIsodistanceChange,
  onBranchMinLengthChange,
  laplacianIterations,
  laplacianAlpha,
  onLaplacianIterationsChange,
  onLaplacianAlphaChange,
  smoothFactor,
  onSmoothFactorChange,
  isometricIterations,
  isometricLength,
  isometricLengthAuto,
  onIsometricIterationsChange,
  onIsometricLengthChange,
  onIsometricLengthAutoChange,
  onNext,
}: MeshGenFlowProps) {
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1
            isodistance={isodistance}
            branchMinLength={branchMinLength}
            onIsodistanceChange={onIsodistanceChange}
            onBranchMinLengthChange={onBranchMinLengthChange}
          />
        );
      case 2:
        return (
          <Step2
            laplacianIterations={laplacianIterations}
            laplacianAlpha={laplacianAlpha}
            onLaplacianIterationsChange={onLaplacianIterationsChange}
            onLaplacianAlphaChange={onLaplacianAlphaChange}
          />
        );
      case 3:
        return (
          <Step3
            smoothFactor={smoothFactor}
            onSmoothFactorChange={onSmoothFactorChange}
          />
        );
      case 4:
        return (
          <Step4
            isometricIterations={isometricIterations}
            isometricLength={isometricLength}
            isometricLengthAuto={isometricLengthAuto}
            onIsometricIterationsChange={onIsometricIterationsChange}
            onIsometricLengthChange={onIsometricLengthChange}
            onIsometricLengthAutoChange={onIsometricLengthAutoChange}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      {/* Step Indicator */}
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

      {/* Param Tune Section */}
      <div className="flex-1 border-b border-gray-300 dark:border-gray-700 p-3 overflow-y-auto">
        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3">Param Tune</div>
        <div className="space-y-4">
          {renderStepContent()}
        </div>
      </div>

      {/* Action Buttons - Only Next button */}
      <div className="p-3 border-t border-gray-300 dark:border-gray-700">
        <button
          onClick={onNext}
          disabled={currentStep >= totalSteps}
          className="w-full px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded"
        >
          Next
        </button>
      </div>
    </>
  );
}
