import { AlertTriangle } from "lucide-react";
import type { CompletudeFinanceira } from "@/lib/finance/pipeline";

/**
 * Aviso "parcial": a leitura pode estar incompleta, e a tela diz por quê (K4 da 04-A).
 *
 * Peça ÚNICA do painel financeiro e do relatório (04-A2, D-A2-19): o texto mora só aqui, e uma
 * segunda cópia divergiria na primeira edição. Server Component, sem estado; só `import type` do
 * pipeline. Leitura exata não desenha nada.
 */
export function AvisoParcial({ completude }: { completude: CompletudeFinanceira }) {
  if (completude.estado !== "parcial") return null;

  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2"
    >
      <AlertTriangle
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
      />
      <div className="min-w-0 space-y-0.5 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">
          Alguns números podem estar incompletos nesta leitura.
        </p>
        <ul className="list-disc space-y-0.5 pl-4">
          {completude.motivos.map((motivo) => (
            <li key={motivo}>{motivo}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
