import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

/**
 * REDESIGN-07-D — o que alguém desfaria sem perceber em IA, Configurações, Notificações e
 * Busca. Uma linha por contrato: arquivo × padrão exigido (ou proibido) × por quê (molde
 * `CONTRATOS` das 07-A/07-B/07-C). Lê o código, não o renderiza (invariante 25: o projeto não
 * tem teste de componente); comentários saem antes.
 */
const SRC = path.resolve(__dirname, "..");

type Contrato = { arquivo: string; exige: RegExp; porque: string };

const CARTAO = "components/ai/proposal-card.tsx";
const CHAT = "components/ai/chat-client.tsx";
const ACOES = "components/ai/action-history-client.tsx";
const INSIGHTS = "components/ai/insights-client.tsx";

export const CONTRATOS: Contrato[] = [
  // ── D1 — o cartão fala o vocabulário do Approval Engine ──
  { arquivo: CARTAO, exige: /estadoDoCartao\(/, porque: "o estado do cartão sai de uma função pura com o vocabulário de approval/state.ts (M1)" },
  { arquivo: CARTAO, exige: /desfechoDaConfirmacao\(/, porque: "cada status da execução vira o seu desfecho — falhou não vira 'em parte' (M25)" },
  { arquivo: CARTAO, exige: /from "@\/components\/ai\/estado-da-acao"/, porque: "tom e ícone de cada estado vêm da MESMA fonte de /ia/acoes (M2)" },
  { arquivo: CARTAO, exige: /async function confirmar\(\)[\s\S]*?\}\s*catch\b/, porque: "a promise que rejeita vira 'sem desfecho registrado', não um spinner eterno (M26)" },
  { arquivo: CARTAO, exige: /onDecidiu\?\.\(/, porque: "o cartão avisa quem o hospeda quando a decisão termina (M11)" },
  { arquivo: CHAT, exige: /React\.useState<Record<string, DesfechoDoCartao>>/, porque: "o desfecho mora no hook, acima da gaveta — fechar o painel não o apaga (invariante 95)" },
  { arquivo: CHAT, exige: /<ProposalCardSobDemanda\b[^>]*?\bdesfecho=\{/, porque: "no chat o cartão é controlado pelo hook (M28)" },
  { arquivo: CHAT, exige: /<ProposalCardSobDemanda\b[^>]*?\bonDecidiu=\{/, porque: "o painel fica sabendo da decisão (M11)" },
  { arquivo: "components/ai/proposal-card-sob-demanda.tsx", exige: /dynamic\(\s*\(\) => import\("@\/components\/ai\/proposal-card"\)/, porque: "o cartão sai do primeiro carregamento das telas da IA (orçamento de /ia, spec §6.3)" },

  // ── D1 — /ia/acoes ──
  { arquivo: ACOES, exige: /from "@\/components\/ai\/estado-da-acao"/, porque: "expirada e recusada deixam de dividir cor e ícone (M2)" },
  { arquivo: ACOES, exige: /aria-current=\{f === filtro \? "page" : undefined\}/, porque: "o filtro escolhido é anunciado (M23)" },
  { arquivo: ACOES, exige: /não há execução registrada/, porque: "a confirmada sem execução é explicada, não deixada como selo mudo" },

  // ── D1 — insights (E3/E4) ──
  { arquivo: INSIGHTS, exige: /aria-pressed=\{insight\.estado\.avaliacao === "util"\}/, porque: "a escolha 'Útil' é anunciada, não só desenhada (M29)" },
  { arquivo: INSIGHTS, exige: /aria-pressed=\{insight\.estado\.avaliacao === "inutil"\}/, porque: "a escolha 'Não útil' é anunciada" },
  { arquivo: INSIGHTS, exige: /aria-pressed=\{mostrarTodos\}/, porque: "'Mostrar também…' é alternância e diz se está ligada" },
  { arquivo: "components/ai/source-chips.tsx", exige: /O que não estiver amparado por uma consulta é inferência do assistente\./, porque: "a legenda de inferência aparece sem precisar expandir (E4)" },
];

export const PROIBIDOS: Contrato[] = [
  ...[CHAT, ACOES, INSIGHTS, "components/ai/receipt-review.tsx"].map((arquivo) => ({
    arquivo,
    exige: /import \{[^}]*\bProposalCard\b[^}]*\} from "@\/components\/ai\/proposal-card"/,
    porque: "o cartão entra pela fachada sob demanda; import estático o traria de volta ao primeiro carregamento",
  })),
  { arquivo: CARTAO, exige: /Confirmar antes de aplicar/, porque: "o cabeçalho diz o estado, não um título fixo que mente no vencido (M1)" },
  { arquivo: CARTAO, exige: /status !== "sucesso"/, porque: "'diferente de sucesso' juntava falhou com em parte (M25)" },
  { arquivo: ACOES, exige: /const CLASSE_DO_ESTADO\b/, porque: "a cor do estado tem uma fonte só (estado-da-acao.tsx)" },
  { arquivo: ACOES, exige: /durationMs\} ms/, porque: "'· N ms' é latência técnica, não informação do dono" },
  { arquivo: INSIGHTS, exige: /\{insight\.confianca\}/, porque: "a chave crua 'media' não aparece — vai o rótulo" },
  { arquivo: INSIGHTS, exige: /promptVersion/, porque: "a versão do prompt fica no banco, não na tela" },
  { arquivo: INSIGHTS, exige: /por \{insight\.provider\}/, porque: "o provedor aparece pelo rótulo, não pelo identificador" },
  { arquivo: "app/(app)/ia/insights/page.tsx", exige: /\$\{m\.desfecho\}/, porque: "o desfecho da varredura aparece pelo rótulo, não pela chave" },
];

const fonte = (arquivo: string) =>
  semComentarios(fs.readFileSync(path.join(SRC, arquivo), "utf8"));

describe("07-D — contratos de IA, Configurações, Notificações e Busca", () => {
  it.each(CONTRATOS.map((c) => [c.arquivo, c.porque, c] as const))("%s — %s", (_a, _p, c) => {
    expect(fonte(c.arquivo)).toMatch(c.exige);
  });

  it.each(PROIBIDOS.map((c) => [c.arquivo, c.porque, c] as const))(
    "%s não tem: %s",
    (_a, _p, c) => {
      expect(fonte(c.arquivo)).not.toMatch(c.exige);
    },
  );
});
