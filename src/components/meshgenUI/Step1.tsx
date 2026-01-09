interface Step1Props {
  isodistance: number;
  branchMinLength: number;
  onIsodistanceChange: (value: number) => void;
  onBranchMinLengthChange: (value: number) => void;
}

export default function Step1({ isodistance, branchMinLength, onIsodistanceChange, onBranchMinLengthChange }: Step1Props) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          Isodistance: {isodistance}
        </label>
        <input
          type="range"
          min="2"
          max="50"
          step="1"
          value={isodistance}
          onChange={(e) => onIsodistanceChange(Number(e.target.value))}
          className="w-full"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          Branch Min Length: {branchMinLength}
        </label>
        <input
          type="range"
          min="1"
          max="20"
          step="1"
          value={branchMinLength}
          onChange={(e) => onBranchMinLengthChange(Number(e.target.value))}
          className="w-full"
        />
      </div>
    </div>
  );
}
