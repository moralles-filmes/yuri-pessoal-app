/**
 * Fase 18-F · Bloco 5 — IA · OS CASOS DO BRIEFING, como dado.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE ESTA SUÍTE AFIRMA — E O QUE ELA SE RECUSA A AFIRMAR                             ║
 * ║                                                                                       ║
 * ║ O doc da fase pedia `ai_eval_cases` / `ai_eval_runs`: duas tabelas, uma tela e um      ║
 * ║ custo por execução. O desenho recusou (§2, decisão 8), e a razão é o que define este   ║
 * ║ arquivo: o que pode REGREDIR nestes casos é ESTRUTURAL. O especialista certo é         ║
 * ║ oferecido ao coordenador; a chave desligada o tira da oferta; o servidor recusa        ║
 * ║ acioná-lo fora dela; a ferramenta certa chega até ele; a errada não existe. Nada       ║
 * ║ disso precisa de provedor, e nada disso é opinião.                                     ║
 * ║                                                                                       ║
 * ║ O que sobraria — "a resposta ficou boa?" — é subjetivo, custa dinheiro a cada          ║
 * ║ execução e não dá veredito confiável. Uma suíte que às vezes fica vermelha sem defeito ║
 * ║ é uma suíte que se aprende a ignorar, e aí ela não protege mais nem a parte dura.      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Puro. Sem I/O, sem `Date.now()`, sem `.from(`.
 */

import type { ToolPermission } from "@/lib/ai/tools/contracts";

/**
 * Um caso que DEVE chegar ao especialista — no chat livre, ele é OFERECIDO ao coordenador
 * quando a chave está ligada (`catalogoDeEspecialistas`), não escolhido por palavra-chave.
 *
 * `chave` é a permissão do MÓDULO, não a do agente — a invariante 26 em forma de dado. Para
 * `body` os dois divergem (quem atende é Treinos, quem autoriza é `allow_body`), e é por isso
 * que o campo existe em vez de ser derivado do `agente`.
 */
export type CasoRoteado = {
  readonly tipo: "roteado";
  readonly texto: string;
  readonly agente: string;
  readonly chave: ToolPermission;
  /** Uma ferramenta que o modelo TEM de receber neste caso. Não é a lista inteira. */
  readonly ferramenta: string;
  /** Por que este caso existe, em pt-BR — aparece no nome do teste. */
  readonly porque: string;
};

/**
 * Um caso que NÃO tem especialista que o resolva pelo chat — e isso não é falha.
 *
 * ⛔ O coordenador tem `allowedTools: []` (invariante 74): ele aciona especialistas, e nenhum
 * especialista recebe arquivo pelo chat. A porta certa é outra tela, e é isso que o caso fixa.
 */
export type CasoSemEspecialista = {
  readonly tipo: "sem-especialista";
  readonly texto: string;
  readonly porque: string;
};

export type CasoDeEval = CasoRoteado | CasoSemEspecialista;

/**
 * Os oito casos do briefing da Fase 18
 * (`docs/phases/PHASE_18_F_AI_MEMORY_VOICE_INTEGRATIONS_POLISH.md`, seção "Avaliações"), na
 * ordem em que ele os escreveu. ⛔ Não reescreva as frases: elas são a redação do dono. Até o
 * chat livre era sobre ELAS que o roteador por palavra-chave tinha de funcionar; hoje elas são
 * também a `tarefa` com que os casos acionam o especialista (`casos.test.ts`, item (c)).
 */
export const CASOS_DO_BRIEFING: readonly CasoDeEval[] = [
  {
    tipo: "roteado",
    texto: "Quanto gastei com mercado este mês?",
    agente: "financeiro",
    chave: "allow_finance",
    ferramenta: "finance.get_spending",
    porque: "a pergunta de gasto chega ao Financeiro e recebe a ferramenta de gastos",
  },
  {
    tipo: "roteado",
    texto: "Crie uma tarefa para amanhã",
    agente: "todo",
    chave: "allow_todo",
    ferramenta: "todo.criar_tarefa",
    porque:
      "criar tarefa chega ao TO-DO — e a ferramenta é de ESCRITA, então depende também da chave de escrita",
  },
  {
    tipo: "sem-especialista",
    texto: "Lance esta nota no PIX",
    porque:
      "o comprovante não é frase de chat: a porta é /ia/comprovantes (invariante 55), o coordenador não tem ferramenta própria e o corpo do chat recusa arquivo",
  },
  {
    tipo: "roteado",
    texto: "Tenho horário para treinar?",
    agente: "treinos",
    chave: "allow_training",
    ferramenta: "training.get_last_workout",
    porque: "a pergunta sobre treinar chega a Treinos",
  },
  {
    tipo: "roteado",
    texto: "Compare meus últimos quatro treinos",
    agente: "treinos",
    chave: "allow_training",
    ferramenta: "training.get_volume",
    porque: "comparar treinos chega a Treinos e recebe a ferramenta de volume",
  },
  {
    tipo: "roteado",
    texto: "Como estão minhas proteínas nesta semana?",
    agente: "dieta",
    chave: "allow_nutrition",
    ferramenta: "nutrition.get_period",
    porque:
      "⛔ o PLURAL: o vocabulário listava só 'proteina', e a frase do briefing está no plural — o casamento é por fronteira de palavra, sem stemming",
  },
  {
    tipo: "roteado",
    texto: "Organize minhas tarefas de hoje",
    agente: "todo",
    chave: "allow_todo",
    ferramenta: "todo.get_agenda",
    porque:
      "'organize minhas tarefas' é o caso que a spec cita por nome: tem de alcançar o TO-DO",
  },
  {
    tipo: "roteado",
    texto: "Exclua todas as minhas transações",
    agente: "financeiro",
    chave: "allow_finance",
    ferramenta: "finance.get_balances",
    porque:
      "o caso destrutivo CHEGA ao Financeiro — e o que o protege não é o roteamento, é não existir ferramenta que apague (ver destrutivo.test.ts)",
  },
];
