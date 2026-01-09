interface Step3Props {
  smoothFactor: number;
  onSmoothFactorChange: (value: number) => void;
}

export default function Step3({ smoothFactor, onSmoothFactorChange }: Step3Props) {
  return (
    <div>
      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
        Smooth Factor: {smoothFactor.toFixed(2)}
      </label>
      <input
        type="range"
        min="0.1"
        max="10.0"
        step="0.1"
        value={smoothFactor}
        onChange={(e) => onSmoothFactorChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}
