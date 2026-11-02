import { cn } from "@/lib/utils";

/**
 * Silhueta de montanhas do banner do painel — SVG nosso, inline, sem asset de terceiros.
 * Decorativa: `aria-hidden`. A cor vem de `currentColor` (o chamador define `text-white/15`),
 * e a profundidade, das opacidades das camadas.
 */
export function Montanha({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 520 160"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMaxYMax meet"
      className={cn("pointer-events-none", className)}
      fill="currentColor"
    >
      {/* Camada de trás: o pico mais alto. */}
      <path d="M120 160 L250 52 L300 92 L350 30 L470 160 Z" opacity="0.9" />
      {/* Camada da frente: morros à direita. */}
      <path d="M260 160 L380 70 L430 104 L470 80 L520 112 L520 160 Z" opacity="0.7" />
      {/* Neve no pico. */}
      <path d="M350 30 L372 48 L360 46 L350 58 L342 46 L330 50 Z" opacity="1" />
    </svg>
  );
}
