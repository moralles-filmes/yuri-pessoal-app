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

/** 'yyyy-MM' → "ago/26". */
function rotuloDoMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const nome = new Intl.DateTimeFormat("pt-BR", { month: "short" })
    .format(new Date(y, m - 1, 1))
    .replace(".", "");
  return `${nome}/${String(y).slice(2)}`;
}

/**
 * Declara os pagamentos de fatura contados cheios por falta de total (proporção indefinida), com
 * os MESES em que aconteceram — cada gráfico recebe os meses que ele desenha.
 */
export function RodapeDasFaturasSemTotal({
  meses,
}: {
  meses: readonly { mes: string; quantidade: number }[];
}) {
  const total = meses.reduce((s, m) => s + m.quantidade, 0);
  if (total <= 0) return null;
  const quando = meses.map((m) => rotuloDoMes(m.mes)).join(", ");
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      {total === 1
        ? `1 pagamento de fatura sem total registrado foi contado cheio como seu (${quando}).`
        : `${total} pagamentos de fatura sem total registrado foram contados cheios como seus (${quando}).`}
    </p>
  );
}
