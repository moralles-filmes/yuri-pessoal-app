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
const NOTIFICACOES = "app/(app)/notificacoes/notifications-client.tsx";
const BUSCA = "app/(app)/busca/busca-client.tsx";
const PALETA = "components/search/search-command.tsx";
const SINO = "components/notifications/notification-bell.tsx";

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

  // ── D3 — o chat anuncia a fase, nunca o texto ──
  { arquivo: CHAT, exige: /<p role="status" className="sr-only">\s*\{fase\}\s*<\/p>/, porque: "a região de status existe e diz só a fase (M8)" },
  { arquivo: CHAT, exige: /faseDoEvento\(/, porque: "a frase de cada fase sai de uma função pura testada" },
  { arquivo: CHAT, exige: /<div\b(?:(?!>)[\s\S])*?role="log"(?:(?!>)[\s\S])*?aria-live="off"/, porque: "o log não lê cada pedaço do streaming — o papel log traz polite implícito (M37)" },
  { arquivo: CHAT, exige: /Você disse: /, porque: "cada bolha diz quem falou para quem não vê o alinhamento" },
  { arquivo: CHAT, exige: /O assistente respondeu: /, porque: "idem, do lado do assistente" },
  { arquivo: CHAT, exige: /Mensagem para o assistente/, porque: "o campo tem rótulo, não só placeholder" },
  { arquivo: CHAT, exige: /aria-describedby=\{`\$\{idDoAtalho\} \$\{idDoGastoEnvio\}`\}/, porque: "o atalho e o gasto descrevem o campo" },
  { arquivo: CHAT, exige: /React\.useId\(\)/, porque: "ids por useId: a vista aparece em /ia e no painel ao mesmo tempo (M9, G-h)" },
  { arquivo: CHAT, exige: /onAtividade\?\.\(\{ tipo: "decidiu"/, porque: "o hook avisa o painel quando um cartão termina (M11)" },
  { arquivo: CHAT, exige: /onSwitch: \(e\) => \{(?:(?!\bonTool:)[\s\S])*?setDesfechos\(/, porque: "as propostas zeradas no switch levam junto os desfechos delas (invariante 46, Review Focus 4)" },
  { arquivo: CHAT, exige: /conversaId: conversa\b/, porque: "o hook expõe a conversa aberta para o painel" },
  { arquivo: "components/ai/floating-assistant-panel.tsx", exige: /conversationLink\(conversa\.conversaId\)/, porque: "'Abrir em tela cheia' abre ESTA conversa (M12)" },
  { arquivo: "components/ai/floating-assistant.tsx", exige: /aria-label=\{\s*aviso \? `Abrir o assistente — \$\{aviso\.texto\}` : "Abrir o assistente"\s*\}/, porque: "o nome do botão inclui o que o selo diz (M10)" },

  // ── D4 — Configurações ──
  ...[
    "app/(app)/configuracoes/loading.tsx",
    "app/(app)/busca/loading.tsx",
    "app/(app)/ia/consumo/loading.tsx",
    "app/(app)/ia/configuracoes/loading.tsx",
    "app/(app)/ia/conversas/loading.tsx",
  ].map((arquivo) => ({
    arquivo,
    exige: /export default function \w+\(\)[\s\S]*?<Skeleton\b/,
    porque: "a rota tem o esqueleto do próprio desenho, não o de bolhas de conversa herdado de /ia",
  })),
  { arquivo: "app/(app)/ia/conversas/[id]/loading.tsx", exige: /export \{ default \} from "\.\.\/\.\.\/loading"/, porque: "a conversa aberta é o chat: mantém o esqueleto de bolhas, não herda o da lista" },
  { arquivo: "app/(app)/configuracoes/page.tsx", exige: /Promise\.all\(\[[\s\S]*?\.then\(\(u\) => \(u \? getProviderCards\(u\.id\) : \[\]\)\)/, porque: "as chaves dos provedores entram no Promise.all, encadeadas ao usuário (C1)" },
  { arquivo: "components/settings/ai-card.tsx", exige: /settingsLink\(\)/, porque: "o link de /ia/configuracoes sai do construtor de ai-links" },

  // ── D5 — Notificações ──
  { arquivo: "components/settings/notifications-card.tsx", exige: /NOTIFICATION_TYPE_HINTS\[/, porque: "a dica de cada tipo aparece (existia e ninguém a lia)" },
  { arquivo: "components/settings/notifications-card.tsx", exige: /aria-describedby=\{[^}]*dica/i, porque: "a dica descreve o interruptor para o leitor de tela" },
  { arquivo: "components/settings/notifications-card.tsx", exige: /group\.nota\b/, porque: "o grupo da IA diz por que três avisos não têm interruptor" },
  { arquivo: NOTIFICACOES, exige: />\s*Não lida\s*</, porque: "lida × não lida em texto, não só em cor e peso" },
  ...(["Situação", "Tipo", "Prioridade"] as const).map((nome) => ({
    arquivo: NOTIFICACOES,
    exige: new RegExp(`aria-label="${nome}"`),
    porque: `o filtro "${nome}" tem nome — "Todas" sozinho não diz o que está filtrando`,
  })),
  { arquivo: NOTIFICACOES, exige: /Nada com estes filtros/, porque: "com filtro ativo, o vazio não afirma que não há notificação nenhuma" },
  { arquivo: NOTIFICACOES, exige: /<Link href=\{notificacoesLink\(\)\}>\s*Limpar filtros\s*<\/Link>/, porque: "o vazio com filtro oferece a saída (M39)" },
  { arquivo: NOTIFICACOES, exige: /Inclui as não lidas que o filtro atual esconde\./, porque: "'Marcar todas' marca também o que o filtro esconde, e diz isso antes" },
  { arquivo: NOTIFICACOES, exige: /notificacoesLink\(/, porque: "a URL dos filtros sai do construtor" },
  { arquivo: NOTIFICACOES, exige: /dynamic\(\s*\(\) =>\s*import\("\.\/excluir-notificacao-dialog"\)/, porque: "a confirmação de exclusão é uma só e sai do primeiro carregamento" },
  { arquivo: "app/(app)/notificacoes/excluir-notificacao-dialog.tsx", exige: /function aoMudarAbertura\([^)]*\)[^{]*\{\s*if \(excluindo\) return;/, porque: "o diálogo não fecha no meio da exclusão (o DeleteConfirmDialog não travava)" },
  { arquivo: "app/(app)/notificacoes/excluir-notificacao-dialog.tsx", exige: /<DialogDescription>/, porque: "o diálogo diz o que vai ser removido" },

  // ── D8 — rótulos e alternâncias ──
  { arquivo: "components/ai/conversation-list.tsx", exige: /aria-label="Favorita"\s*aria-pressed=\{c\.isFavorite\}/, porque: "o favorito é alternância com nome fixo e estado anunciado (M29)" },
  { arquivo: "components/ai/receipt-upload.tsx", exige: /<Label htmlFor="arquivo-comprovante"/, porque: "o seletor de arquivo tem rótulo" },
  ...(["rev-origem", "rev-conta", "rev-categoria"] as const).map((id) => ({
    arquivo: REVISAO,
    exige: new RegExp(`<Label htmlFor="${id}"[\\s\\S]*?<SelectTrigger\\s+id="${id}"`),
    porque: `o rótulo "${id}" está associado ao seletor`,
  })),
  { arquivo: REVISAO, exige: /aria-label=\{`Para onde vai/, porque: "o seletor de destino de cada item diz de qual item é" },
  { arquivo: INSIGHTS, exige: /className="sr-only">\s*Módulo da análise/, porque: "o seletor de módulo tem nome (o placeholder some ao escolher)" },
  { arquivo: INSIGHTS, exige: /className="sr-only">\s*Título da tarefa/, porque: "o campo da tarefa tem rótulo, não só placeholder" },

  // ── D6 — Busca, paleta e sino ──
  { arquivo: BUSCA, exige: /const \[query, setQuery\] = React\.useState\(initialQuery\)/, porque: "o texto do campo é local: responde na hora e não espera o servidor (regra do campo de texto)" },
  { arquivo: BUSCA, exige: /window\.history\.replaceState\(null, "", buscaLink\(/, porque: "digitar não busca o RSC a cada tecla (M17)" },
  { arquivo: BUSCA, exige: /\.catch\(\(\) => \{[^}]*setErro\(true\)/, porque: "falha da busca vira estado de erro, não lista vazia" },
  { arquivo: BUSCA, exige: /role="alert"/, porque: "o erro é anunciado" },
  { arquivo: BUSCA, exige: /Não foi possível buscar agora\.[\s\S]{0,60}Isso não quer dizer que não haja resultado\./, porque: "erro ≠ 'Nada encontrado' (M18)" },
  { arquivo: BUSCA, exige: /Tentar de novo/, porque: "o erro oferece a saída" },
  { arquivo: BUSCA, exige: /<EmptyState\b[\s\S]*?Digite ao menos 2 caracteres/, porque: "menos de 2 caracteres é dica no vazio do projeto, não um parágrafo solto" },
  { arquivo: "app/(app)/busca/page.tsx", exige: /<BuscaClient key=\{q\}/, porque: "navegação externa (paleta, voltar) remonta com os resultados do servidor" },
  { arquivo: PALETA, exige: /role="combobox"/, porque: "o campo da paleta é uma caixa de combinação (M40)" },
  { arquivo: PALETA, exige: /aria-activedescendant=\{/, porque: "o leitor acompanha o item escolhido pelas setas" },
  { arquivo: PALETA, exige: /role="listbox"/, porque: "os resultados são uma lista de opções" },
  { arquivo: PALETA, exige: /role="option"/, porque: "cada resultado é uma opção" },
  { arquivo: PALETA, exige: /aria-selected=\{/, porque: "a opção ativa é anunciada" },
  { arquivo: PALETA, exige: /scrollIntoView\(\{ block: "nearest" \}\)/, porque: "a opção ativa rola para a vista ao andar com as setas" },
  { arquivo: PALETA, exige: /<DialogDescription className="sr-only">\s*Setas escolhem, Enter abre, Esc fecha\.\s*<\/DialogDescription>/, porque: "a paleta diz como se usa" },
  { arquivo: SINO, exige: /aria-label=\{\s*unreadCount > 0 \? `Notificações — \$\{unreadCount\} não lidas` : "Notificações"\s*\}/, porque: "o nome do sino inclui a contagem (M19)" },
  { arquivo: SINO, exige: /aria-hidden="true"[^>]*>\s*\{unreadCount > 9/, porque: "o selo numérico não é lido de novo" },
  { arquivo: SINO, exige: /className="sr-only">\s*Não lida/, porque: "lida × não lida em texto no sino" },
  { arquivo: SINO, exige: /disabled=\{pending \|\| unreadCount === 0\}/, porque: "'Marcar todas' sem nada a marcar fica desabilitado" },
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

  // ── D3 ──
  { arquivo: CHAT, exige: /role="status"[^>]*>[^<]*\{(?:texto|b\.content)\b/, porque: "a região de status nunca recebe o texto da resposta (M36)" },
  { arquivo: CHAT, exige: /\b(?:id|htmlFor)="[^"]+"/, porque: "id escrito à mão colide entre /ia e o painel — o label do painel ativava o controle da página (M9, G-h)" },
  { arquivo: CHAT, exige: /\(Ctrl\+Enter envia\)/, porque: "o atalho sai do placeholder (some ao digitar) e vira descrição do campo" },
  { arquivo: "components/ai/floating-assistant.tsx", exige: /aria-label="Abrir o assistente"/, porque: "nome fixo esconde o selo de quem não o vê (M10)" },
  { arquivo: "components/ai/floating-assistant.tsx", exige: /<span className="sr-only">\{aviso\.texto\}<\/span>/, porque: "a frase do selo entra no nome, não num span que o leitor lê como conteúdo do botão" },

  // ── D4 ──
  { arquivo: "app/(app)/configuracoes/page.tsx", exige: /await getProviderCards\(/, porque: "a leitura das chaves não espera o Promise.all terminar para começar" },
  { arquivo: "components/settings/ai-card.tsx", exige: /"\/ia\/configuracoes"/, porque: "href de /ia montado à mão diverge do construtor" },

  // ── D5 ──
  { arquivo: NOTIFICACOES, exige: /`\/notificacoes\?/, porque: "a URL dos filtros não é montada à mão na tela" },

  // ── D6 ──
  { arquivo: BUSCA, exige: /router\.replace\(/, porque: "router.replace a cada tecla buscava o RSC no servidor (M17)" },
  { arquivo: BUSCA, exige: /`\/busca\$\{/, porque: "a URL da busca não é montada à mão" },
  { arquivo: SINO, exige: /aria-label="Notificações"/, porque: "nome fixo esconde a contagem (M19)" },
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

describe("07-D · D3 — o painel continua guardado pelos mesmos testes", () => {
  it("painel-persistencia.test.ts continua com os 6 testes (invariante 95)", () => {
    const testes = fonte("lib/ai/painel-persistencia.test.ts").match(/\bit\(/g) ?? [];
    expect(testes).toHaveLength(6);
  });
});

/**
 * REDESIGN-07-D · D7 — nenhuma tela do lote monta rota de `/ia` à mão (spec §6.7, M21).
 *
 * `src/lib/search/ai-links.ts` é a fonte única dos links de `/ia` (invariante 85). Um href
 * escrito à mão continua verde no dia em que a rota muda — e `?filtro=` fora de
 * `FILTROS_DO_HISTORICO` nem dá 404: mostra todas as ações em silêncio.
 */
describe("07-D · D7 — o lote linka /ia só pelos construtores (M21)", () => {
  const arquivos = PASTAS_DO_LOTE.flatMap(arquivosDe);
  const ROTA_DE_IA_A_MAO = /["'`]\/ia(?=[/"'`?])/;

  it("a varredura sabe dizer sim (fixture)", () => {
    expect('<Link href="/ia/configuracoes">').toMatch(ROTA_DE_IA_A_MAO);
    expect("href={`/ia/acoes?filtro=${f}`}").toMatch(ROTA_DE_IA_A_MAO);
    expect('fetch("/api/ia/chat")').not.toMatch(ROTA_DE_IA_A_MAO);
    expect("href={settingsLink()}").not.toMatch(ROTA_DE_IA_A_MAO);
  });

  it.each(arquivos.map((a) => [a] as const))("%s não escreve rota de /ia à mão", (arquivo) => {
    const linhas = fonte(arquivo)
      .split("\n")
      .filter((l) => ROTA_DE_IA_A_MAO.test(l))
      .map((l) => l.trim());
    expect(linhas, arquivo).toEqual([]);
  });
});
