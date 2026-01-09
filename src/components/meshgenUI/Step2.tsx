interface Step2Props {
  laplacianIterations: number;
  laplacianAlpha: number;
  onLaplacianIterationsChange: (value: number) => void;
  onLaplacianAlphaChange: (value: number) => void;
}

export default function Step2({ laplacianIterations, laplacianAlpha, onLaplacianIterationsChange, onLaplacianAlphaChange }: Step2Props) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          Laplacian Iterations: {laplacianIterations}
        </label>
        <input
          type="range"
          min="0"
          max="200"
          step="1"
          value={laplacianIterations}
          onChange={(e) => onLaplacianIterationsChange(Number(e.target.value))}
          className="w-full"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          Laplacian Alpha: {laplacianAlpha.toFixed(2)}
        </label>
        <input
          type="range"
          min="0.1"
          max="1.0"
          step="0.05"
          value={laplacianAlpha}
          onChange={(e) => onLaplacianAlphaChange(Number(e.target.value))}
          className="w-full"
        />
      </div>
    </div>
  );
}
