interface Step5Props {
  boneDevThreshold: number;
  boneLenThreshold: number;
  skelAlgo: 'chord' | 'mat';
  onBoneDevThresholdChange: (value: number) => void;
  onBoneLenThresholdChange: (value: number) => void;
  onSkelAlgoChange: (value: 'chord' | 'mat') => void;
}

export default function Step5({
  boneDevThreshold,
  boneLenThreshold,
  skelAlgo,
  onBoneDevThresholdChange,
  onBoneLenThresholdChange,
  onSkelAlgoChange,
}: Step5Props) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          Bone Deviation Threshold: {boneDevThreshold.toFixed(2)}
        </label>
        <input
          type="range"
          min="0.01"
          max="1.0"
          step="0.01"
          value={boneDevThreshold}
          onChange={(e) => onBoneDevThresholdChange(Number(e.target.value))}
          className="w-full"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          Bone Length Threshold: {boneLenThreshold}
        </label>
        <input
          type="range"
          min="1"
          max="50"
          step="1"
          value={boneLenThreshold}
          onChange={(e) => onBoneLenThresholdChange(Number(e.target.value))}
          className="w-full"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-2">
          Algorithm
        </label>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="skelAlgo"
              value="chord"
              checked={skelAlgo === 'chord'}
              onChange={(e) => onSkelAlgoChange(e.target.value as 'chord' | 'mat')}
              className="w-4 h-4"
            />
            <span className="text-xs text-gray-700 dark:text-gray-300">Chord</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="skelAlgo"
              value="mat"
              checked={skelAlgo === 'mat'}
              onChange={(e) => onSkelAlgoChange(e.target.value as 'chord' | 'mat')}
              className="w-4 h-4"
            />
            <span className="text-xs text-gray-700 dark:text-gray-300">MAT</span>
          </label>
        </div>
      </div>
    </div>
  );
}
