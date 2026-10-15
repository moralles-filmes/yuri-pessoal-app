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

const fonte = (arquivo: string) =>
  semComentarios(fs.readFileSync(path.join(SRC, arquivo), "utf8"));

const CARTAO = "components/ai/proposal-card.tsx";
const CHAT = "components/ai/chat-client.tsx";
const ACOES = "components/ai/action-history-client.tsx";
const INSIGHTS = "components/ai/insights-client.tsx";
const PREFERENCIAS = "components/ai/ai-preferences-form.tsx";
const PROVEDOR = "components/ai/provider-card.tsx";
const REMOVER_CHAVE = "components/ai/remover-chave-dialog.tsx";
const REVISAO = "components/ai/receipt-review.tsx";

/** Uma tag JSX inteira até o seu fechamento — sem atravessar o `</Tag>` para a próxima. */
const dentroDe = (tag: string, ate: string) => `<${tag}\\b(?:(?!<\\/${tag}>)[\\s\\S])*?${ate}`;

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

  // ── D2 — o gasto é dito ANTES do clique, ao lado de cada gatilho (M4) ──
  { arquivo: "components/ai/frase-de-gasto.tsx", exige: /\{AVISO_DE_GASTO\}/, porque: "a frase de gasto é uma constante só, nunca reescrita por tela" },
  { arquivo: CHAT, exige: /<FraseDeGasto id=\{idDoGastoPanorama\}/, porque: "os panoramas gastam e dizem isso ao lado deles (M4)" },
  { arquivo: CHAT, exige: new RegExp(`ATALHOS_DE_EXPERIENCIA\\.map\\(\\(a\\) => \\(\\s*${dentroDe("Button", "aria-describedby=\\{idDoGastoPanorama\\}")}`), porque: "cada panorama é descrito pela frase de gasto (M4)" },
  { arquivo: CHAT, exige: />\s*\{a\.descricao\}\s*</, porque: "a descrição do panorama é visível, não só um title que o toque não alcança" },
  { arquivo: CHAT, exige: /<FraseDeGasto id=\{idDoGastoEnvio\}/, porque: "o compositor gasta e diz isso sob o campo (M4)" },
  { arquivo: CHAT, exige: new RegExp(`${dentroDe("Button", "aria-describedby=\\{idDoGastoEnvio\\}")}(?:(?!<\\/Button>)[\\s\\S])*?Enviar\\s*<\\/Button>`), porque: "o Enviar é descrito pela frase de gasto" },
  { arquivo: CHAT, exige: /<Switch\b(?:(?!\/>)[\s\S])*?aria-describedby=\{idDoGastoEnvio\}/, porque: "a Caixa de entrada também envia ao modelo, e diz isso" },
  { arquivo: INSIGHTS, exige: /<FraseDeGasto id=\{idDoGasto\}/, porque: "'Gerar análise' gasta e diz isso sob o seletor (M4)" },
  { arquivo: INSIGHTS, exige: new RegExp(`${dentroDe("Button", "aria-describedby=\\{idDoGasto\\}")}(?:(?!<\\/Button>)[\\s\\S])*?Gerar análise`), porque: "o botão de gerar é descrito pela frase de gasto" },
  { arquivo: INSIGHTS, exige: /const \[gerando, iniciarGeracao\] = useTransition\(\)/, porque: "'Gerar análise' tem transição própria: clicar Útil não gira o botão de gerar (M33)" },
  { arquivo: INSIGHTS, exige: /function gerar\(\)[\s\S]*?iniciarGeracao\(/, porque: "a geração roda na transição dela (M33)" },
  { arquivo: "components/ai/receipt-extract-button.tsx", exige: /\{CUSTO_DA_IA\}/, porque: "o comprovante usa a mesma frase de custo das outras telas" },
  { arquivo: "components/ai/receipt-extract-button.tsx", exige: /Isso não tem como ser desfeito/, porque: "o aviso de irreversibilidade continua antes do clique" },

  // ── D2 — permissões: o que se vê é o que se salva (G-e) ──
  { arquivo: PREFERENCIAS, exige: /alternarLeitura\(/, porque: "desligar a leitura desliga a escrita que depende dela (M6)" },
  { arquivo: PREFERENCIAS, exige: /alternarEscrita\(/, porque: "desligar a escrita do Financeiro desliga o envio de comprovantes (M32)" },
  { arquivo: PREFERENCIAS, exige: /function PermissaoDeEscritaLinha[\s\S]*?checked=\{escritaVisivel\(/, porque: "o interruptor de escrita mostra leitura E escrita (M30)" },
  { arquivo: PREFERENCIAS, exige: /checked=\{visaoVisivel\(form, catalogo\.escritas\)\}/, porque: "o envio de comprovantes mostra visão E as duas chaves do Financeiro" },
  { arquivo: PREFERENCIAS, exige: /permissoesParaSalvar\(form, catalogo\.escritas\)/, porque: "o que se salva é o que se vê" },
  { arquivo: PREFERENCIAS, exige: /aria-describedby=\{[^}]*idDoAviso/, porque: "'Ligue antes a leitura de X' descreve o interruptor desabilitado" },
  { arquivo: PREFERENCIAS, exige: /text-warning-ink/, porque: "o aviso usa o token de tom, não uma cor solta" },
  { arquivo: "app/(app)/ia/configuracoes/page.tsx", exige: /catalogo=\{catalogoDasPermissoes\(\)\}/, porque: "o catálogo das chaves é derivado do registry no servidor e chega por prop" },
  { arquivo: PREFERENCIAS, exige: /Com o botão oculto, o canto não se aplica/, porque: "o seletor de canto desabilitado diz por quê" },

  // ── D2 — números: um conversor só, e nada vira 0 por omissão (M7, M35) ──
  { arquivo: PREFERENCIAS, exige: /lerDecimal\(/, porque: "'1,5' é lido como 1,5, não como NaN em inglês num toast" },
  ...(["jobMonthlyBudget", "reservationMargin"] as const).map((campo) => ({
    arquivo: PREFERENCIAS,
    exige: new RegExp(`exigirValor\\(\\s*lerDecimal\\(form\\.${campo}\\)`),
    porque: `${campo} em branco é recusado no campo, nunca vira 0 (M35)`,
  })),
  ...(["rateLimitPerMinute", "rateLimitPerHour"] as const).map((campo) => ({
    arquivo: PREFERENCIAS,
    exige: new RegExp(`exigirValor\\(\\s*lerInteiro\\(form\\.${campo}\\)`),
    porque: `${campo} é inteiro e obrigatório: fração e branco são recusados no campo (M35)`,
  })),
  { arquivo: PREFERENCIAS, exige: /ariaDoErro\("pref-job-teto-erro", erros\.jobMonthlyBudget\)/, porque: "o erro fica no campo (aria-invalid + aria-describedby), não num toast" },
  { arquivo: PREFERENCIAS, exige: /<ErroDoCampo id="pref-job-teto-erro"/, porque: "a mensagem aparece sob o campo" },
  { arquivo: PROVEDOR, exige: /lerDecimal\(/, porque: "os limites do provedor passam pelo mesmo conversor" },
  { arquivo: PROVEDOR, exige: /<ErroDoCampo\b/, porque: "o limite recusado é dito sob o campo" },
  { arquivo: REVISAO, exige: /lerCentavos\(/, porque: "'12.50' é R$ 12,50, não R$ 1.250,00 (G-g)" },

  // ── D2 — "Remover chave" confirma ──
  { arquivo: PROVEDOR, exige: /dynamic\(\s*\(\) =>\s*import\("@\/components\/ai\/remover-chave-dialog"\)/, porque: "o diálogo sai do primeiro carregamento" },
  { arquivo: PROVEDOR, exige: /useLazyDialog\(/, porque: "monta na primeira abertura e não desmonta (animação de fechar)" },
  { arquivo: REMOVER_CHAVE, exige: /<DialogDescription>/, porque: "o diálogo diz o que acontece e como voltar" },
  { arquivo: REMOVER_CHAVE, exige: /Para voltar, cole a chave de novo\./, porque: "remover não tem desfazer; a tela diz o caminho de volta" },
  { arquivo: REMOVER_CHAVE, exige: /function aoMudarAbertura\([^)]*\)[^{]*\{\s*if \(removendo\) return;/, porque: "o diálogo não fecha no meio da remoção" },
  { arquivo: REMOVER_CHAVE, exige: /onOpenChange=\{aoMudarAbertura\}/, porque: "a trava vale para Esc e clique fora" },
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

  // ── D2 ──
  { arquivo: CHAT, exige: /title=\{a\.descricao\}/, porque: "a descrição do panorama não fica escondida num title" },
  { arquivo: INSIGHTS, exige: /function gerar\(\)\s*\{[^}]*startTransition\(/, porque: "'Gerar análise' não divide a transição do feedback dos cartões (M33)" },
  { arquivo: PREFERENCIAS, exige: /Number\(form\./, porque: "Number('') é 0 e Number('1,5') é NaN (M7)" },
  { arquivo: PREFERENCIAS, exige: /function PermissaoDeEscritaLinha[\s\S]*checked=\{ligada\}/, porque: "o interruptor de escrita não mostra a escrita sozinha (M30)" },
  { arquivo: PREFERENCIAS, exige: /text-amber-600/, porque: "o aviso usa o token de tom" },
  ...[PREFERENCIAS, "components/ai/preferencias-cascata.ts"].map((arquivo) => ({
    arquivo,
    exige: /^import (?!type\b)[^;]*from "@\/lib\/ai\/(?:tools\/registry|permissoes-da-tela)"/m,
    porque: "o registry (descrições e JSON Schemas das 30 ferramentas) não vai ao navegador — ~6,8 KB gz de /ia/configuracoes",
  })),
  { arquivo: PROVEDOR, exige: /Number\(form\./, porque: "Number('1,5') é NaN" },
  { arquivo: PROVEDOR, exige: /removeAiCredential/, porque: "remover a chave só acontece pelo diálogo de confirmação" },
  { arquivo: REVISAO, exige: /function textoParaCentavos\b/, porque: "a conversão que apagava todos os pontos sai" },
];

/**
 * REDESIGN-07-D · D2 — nenhum gasto nasce sem clique (spec §6.2, M5).
 *
 * Varre o CORPO de cada `useEffect`/`useLayoutEffect` (casamento de parênteses sobre o código
 * sem comentários) nas pastas do lote. Um efeito roda no carregamento, na abertura do painel e
 * na troca de rota — exatamente os momentos em que nada pode chamar o modelo.
 */
const PASTAS_DO_LOTE = [
  "components/ai",
  "components/settings",
  "components/notifications",
  "components/search",
  "app/(app)/ia",
  "app/(app)/configuracoes",
  "app/(app)/notificacoes",
  "app/(app)/busca",
];
const GATILHOS_DE_GASTO =
  /\b(?:fetch|disparar|enviar|iniciarExperiencia|gerarInsight|extrairComprovante)\(/;

function arquivosDe(pasta: string): string[] {
  const raiz = path.join(SRC, pasta);
  if (!fs.existsSync(raiz)) return [];
  return fs.readdirSync(raiz, { recursive: true, encoding: "utf8" })
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => `${pasta}/${f.replace(/\\/g, "/")}`);
}

/** Índice do caractere que fecha o par aberto em `inicio`, pulando strings simples. */
function fechamento(fonte: string, inicio: number, abre: string, fecha: string): number {
  let nivel = 0;
  for (let i = inicio; i < fonte.length; i++) {
    const c = fonte[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < fonte.length && fonte[i] !== c; i++) if (fonte[i] === "\\") i++;
      continue;
    }
    if (c === abre) nivel++;
    else if (c === fecha && --nivel === 0) return i;
  }
  return -1;
}

function corposDeEfeito(fonte: string): string[] {
  const corpos: string[] = [];
  for (const m of fonte.matchAll(/\buse(?:Layout)?Effect\(/g)) {
    const abre = m.index + m[0].length - 1;
    const fecha = fechamento(fonte, abre, "(", ")");
    expect(fecha, "efeito sem parêntese de fechamento").toBeGreaterThan(abre);
    corpos.push(fonte.slice(abre, fecha + 1));
  }
  return corpos;
}

describe("07-D · D2 — nenhum efeito chama o modelo (M5)", () => {
  const arquivos = PASTAS_DO_LOTE.flatMap(arquivosDe);

  it("a varredura alcança as pastas do lote (e os efeitos do chat)", () => {
    expect(arquivos.length).toBeGreaterThan(30);
    expect(corposDeEfeito(fonte(CHAT)).length).toBeGreaterThanOrEqual(2);
    // 8 medidos sobre b993513: os 7 de components/ai do G2, mais o atalho da paleta de busca.
    expect(arquivos.flatMap((a) => corposDeEfeito(fonte(a))).length).toBeGreaterThanOrEqual(8);
  });

  it.each(arquivos.map((a) => [a] as const))("%s — nenhum efeito dispara gasto", (arquivo) => {
    for (const corpo of corposDeEfeito(fonte(arquivo))) {
      expect(corpo, `efeito em ${arquivo}`).not.toMatch(GATILHOS_DE_GASTO);
    }
  });

  it('o único fetch("/api/ia/chat" do lote continua dentro de disparar', () => {
    const ocorrencias = arquivos.flatMap((a) =>
      [...fonte(a).matchAll(/fetch\("\/api\/ia\/chat"/g)].map(() => a),
    );
    expect(ocorrencias).toEqual([CHAT]);

    const chat = fonte(CHAT);
    const inicio = chat.search(/async function disparar\(/);
    expect(inicio).toBeGreaterThan(-1);
    const fimDosParametros = fechamento(chat, chat.indexOf("(", inicio), "(", ")");
    const abreCorpo = chat.indexOf("{", fimDosParametros);
    const fimDoCorpo = fechamento(chat, abreCorpo, "{", "}");
    const posicao = chat.indexOf('fetch("/api/ia/chat"');
    expect(posicao).toBeGreaterThan(abreCorpo);
    expect(posicao).toBeLessThan(fimDoCorpo);
  });
});


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
