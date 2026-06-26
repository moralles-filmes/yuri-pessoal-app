import { cn } from "@/lib/utils";

/**
 * Anel de progresso (SVG) até a meta. Usado no rastreador de água e em cards de
 * progresso. Cores via tokens/hex do hábito — legível em dark e light.
 */
export function ProgressRing({
  value,
  target,
  size = 132,
  stroke = 12,
  color = "var(--primary)",
  children,
  className,
}: {
  value: number;
  target: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = target > 0 ? Math.min(1, value / target) : 0;
  const offset = circumference * (1 - ratio);

  return (
    <div
      className={cn("relative grid place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        {children}
      </div>
    </div>
  );
}
