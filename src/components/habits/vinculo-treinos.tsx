import Link from "next/link";
import { Dumbbell } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * REDESIGN-07-B · D1 — a marca do hábito que REFLETE os treinos, escrita uma vez.
 *
 * O texto descreve `lib/training/habit-sync.ts` (17-F): o upsert troca o valor e o "feito" e
 * PRESERVA a observação; a exclusão apaga a linha inteira, observação junto. Se o reflexo mudar
 * (é arquivo da 07-C), esta frase muda com ele — risco residual declarado no spec §11.
 */
export function SeloReflexoDosTreinos() {
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Dumbbell aria-hidden="true" />
      Reflete os treinos
    </Badge>
  );
}

export function AvisoReflexoDosTreinos() {
  return (
    <p className="text-xs text-muted-foreground">
      O check-in deste hábito vem dos treinos concluídos. Ao concluir, reabrir, abandonar ou
      excluir um treino, o dia é recalculado: o valor marcado à mão é substituído, e o registro do
      dia é apagado (com a observação) se não restar treino concluído.{" "}
      <Link
        href="/treinos/configuracoes"
        className="underline underline-offset-2 hover:text-foreground"
      >
        Ver o vínculo em Treinos
      </Link>
    </p>
  );
}
