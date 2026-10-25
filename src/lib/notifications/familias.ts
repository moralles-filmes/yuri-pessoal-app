/**
 * REDESIGN-03-G (L7, K1b) — o Cron POR FAMÍLIA. Puro: nenhum I/O, `now` sempre injetado.
 *
 * Cada leitura do Cron alimenta uma ou mais famílias de aviso. Quando uma leitura falha, a
 * família que depende dela fica AUSENTE do gerador — e as outras seguem. Antes, a leitura com
 * erro chegava como lista vazia, e "não consegui ler as faturas" virava "não há fatura atrasada"
 * sem nada no sino dizer que a verificação tinha sido parcial.
 *
 * ⚠️ Família que depende de DUAS leituras cai com qualquer uma delas: o limite do cartão é a
 * soma das faturas em aberto sobre o limite, e sem as faturas ele sairia sempre 0% (Z17).
 */
import { timeInSaoPaulo } from "@/lib/format";

export type Leitura =
  | "cartoes"
  | "faturas"
  | "contasFixas"
  | "recebiveis"
  | "recebimentos"
  | "tarefas"
  | "agenda"
  | "habitos"
  | "registrosDeHabito"
  | "cursos"
  | "sessoesDeEstudo"
  | "lancamentos"
  | "todo"
  | "lembretes"
  | "dieta"
  | "treinos"
  | "ia";

export type Familia =
  | "faturas"
  | "limiteDoCartao"
  | "contasFixas"
  | "recebiveis"
  | "tarefas"
  | "agenda"
  | "habitos"
  | "estudos"
  | "gastoAlto"
  | "todo"
  | "lembretes"
  | "dieta"
  | "treinos"
  | "ia";

/** A ordem das chaves é a ordem em que o aviso as lista. */
export const DEPENDE_DE: Record<Familia, readonly Leitura[]> = {
  faturas: ["faturas", "cartoes"],
  limiteDoCartao: ["cartoes", "faturas"],
  contasFixas: ["contasFixas"],
  recebiveis: ["recebiveis", "recebimentos"],
  tarefas: ["tarefas"],
  agenda: ["agenda"],
  habitos: ["habitos", "registrosDeHabito"],
  estudos: ["cursos", "sessoesDeEstudo"],
  gastoAlto: ["lancamentos", "faturas", "recebiveis", "recebimentos"],
  todo: ["todo"],
  lembretes: ["lembretes"],
  // Dieta, Treinos e IA: o builder inteiro do módulo é UMA leitura (as internas ficam fora, K1b).
  dieta: ["dieta"],
  treinos: ["treinos"],
  ia: ["ia"],
};

const NOMES: Record<Familia, string> = {
  faturas: "faturas",
  limiteDoCartao: "limite do cartão",
  contasFixas: "contas fixas",
  recebiveis: "recebíveis",
  tarefas: "tarefas",
  agenda: "agenda",
  habitos: "hábitos",
  estudos: "estudos",
  gastoAlto: "gasto alto",
  todo: "TO-DO",
  lembretes: "lembretes do TO-DO",
  dieta: "Dieta",
  treinos: "Treinos",
  ia: "IA",
};

/** As famílias que ficam fora do gerador, na ordem de `DEPENDE_DE`. */
export function familiasNaoLidas(falhas: ReadonlySet<Leitura>): Familia[] {
  return (Object.keys(DEPENDE_DE) as Familia[]).filter((f) =>
    DEPENDE_DE[f].some((leitura) => falhas.has(leitura)),
  );
}

/** "faturas, contas fixas" */
export function textoDasFamilias(familias: readonly Familia[]): string {
  return familias.map((f) => NOMES[f]).join(", ");
}

export type JanelaDaVerificacao = "manha" | "noite";

/**
 * D-G30 — a janela entra no dedupe: duas execuções no mesmo dia (09h e 21h) são duas
 * verificações; a mesma rodada de novo não duplica. Hora de BRASÍLIA, nunca a do processo (Z18).
 */
export function janelaDaVerificacao(now: Date): JanelaDaVerificacao {
  const hora = Number(timeInSaoPaulo(now).slice(0, 2));
  return hora < 15 ? "manha" : "noite";
}

/** A hora real da execução, para o texto ("09h"; "14h" num disparo manual) — D-G30. */
export function horaDaVerificacao(now: Date): string {
  return `${timeInSaoPaulo(now).slice(0, 2)}h`;
}
