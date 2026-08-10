/**
 * ProgressRing
 *
 * Circular SVG progress indicator with the percentage centered inside.
 * Purely presentational — callers pass a 0-100 value they already
 * compute (e.g. ProfileSidebar's calcProfileCompletion); this component
 * does not calculate anything itself.
 */

interface ProgressRingProps {
  /** 0-100 */
  value: number;
  size?: number;
  strokeWidth?: number;
  /** Hides the numeric label in the center when false. */
  showLabel?: boolean;
  className?: string;
}

export function ProgressRing({
  value,
  size = 56,
  strokeWidth = 5,
  showLabel = true,
  className,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const center = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={`${clamped}% complete`}
    >
      <circle
        className="progress-ring-track"
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
      />
      <circle
        className="progress-ring-fill"
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${center} ${center})`}
      />
      {showLabel && (
        <text x={center} y={center} textAnchor="middle" dominantBaseline="central" className="progress-ring-label">
          {clamped}%
        </text>
      )}
    </svg>
  );
}
