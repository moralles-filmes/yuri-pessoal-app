import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * Desenho 2026-10-18: na base caixa, um gráfico cuja leitura falhou DIZ que não leu — nunca
 * desenha vazio ou zero (falha de leitura não vira zero, P2 da 03-E).
 */
export function CaixaNaoLido() {
  return (
    <EmptyState
      icon={TriangleAlert}
      title="Não foi possível ler o caixa"
      description="Os números desta base não foram carregados. Tente recarregar a página."
      className="py-8"
    />
  );
}

/** Declara os pagamentos de fatura contados cheios por falta de total (proporção indefinida). */
export function RodapeDasFaturasSemTotal({ quantidade }: { quantidade: number }) {
  if (quantidade <= 0) return null;
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      {quantidade === 1
        ? "1 pagamento de fatura sem total registrado foi contado cheio como seu."
        : `${quantidade} pagamentos de fatura sem total registrado foram contados cheios como seus.`}
    </p>
  );
}
