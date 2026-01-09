interface Step4Props {
  isometricIterations: number;
  isometricLength: number;
  isometricLengthAuto: boolean;
  onIsometricIterationsChange: (value: number) => void;
  onIsometricLengthChange: (value: number) => void;
  onIsometricLengthAutoChange: (value: boolean) => void;
}

export default function Step4({
  isometricIterations,
  isometricLength,
  isometricLengthAuto,
  onIsometricIterationsChange,
  onIsometricLengthChange,
  onIsometricLengthAutoChange,
}: Step4Props) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          Iterations: {isometricIterations}
        </label>
        <input
          type="range"
          min="1"
          max="20"
          step="1"
          value={isometricIterations}
          onChange={(e) => onIsometricIterationsChange(Number(e.target.value))}
          className="w-full"
        />
      </div>
      <div>
        <div className="flex items-center gap-2 mb-2">
          <input
            type="checkbox"
            id="isometricLengthAuto"
            checked={isometricLengthAuto}
            onChange={(e) => onIsometricLengthAutoChange(e.target.checked)}
            className="w-4 h-4"
          />
          <label htmlFor="isometricLengthAuto" className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
            Auto Length
          </label>
        </div>
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          Length: {isometricLengthAuto ? 'Auto' : isometricLength}
        </label>
        <input
          type="range"
          min="5"
          max="100"
          step="1"
          value={isometricLength}
          onChange={(e) => onIsometricLengthChange(Number(e.target.value))}
          disabled={isometricLengthAuto}
          className="w-full disabled:opacity-50"
        />
      </div>
    </div>
  );
}
