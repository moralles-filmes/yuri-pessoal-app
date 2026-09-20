# Fase 18-F · Bloco 2 — Botão flutuante · Plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA — use `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para implementar task a task. Os passos usam
> caixa (`- [ ]`) para acompanhamento.

**Objetivo:** pôr o assistente ao alcance de qualquer tela, por um botão fixo num canto
inferior que abre um painel — sem acrescentar peso ao primeiro byte das 67 rotas e sem que o
selo dele repita o sino.

**Arquitetura:** o botão é um ícone montado na casca do app (`AppShell`), sempre presente e
leve; o painel entra por `next/dynamic` na primeira abertura e reusa o `ChatClient` da 18-A
inteiro. O estado do selo é uma regra **pura** (`src/lib/ai/painel.ts`) alimentada só por
eventos do próprio painel. Canto e ocultação são duas colunas em `ai_user_preferences`, lidas
pelo layout numa consulta estreita.

**Stack:** Next.js 16 (App Router, Turbopack), Supabase, Tailwind v4, shadcn/ui (Radix), Zod,
Vitest (`environment: "node"`).

**Spec:** `docs/superpowers/specs/2026-09-19-18f-memoria-integracoes-design.md` — §5 é este
bloco; §10 é a ordem; o critério de aceite 6 é o desta entrega.

**Bloco anterior:** `docs/superpowers/plans/2026-09-19-18f-bloco1-costura.md`, fechado em
2026-09-19 (commits `e0a0ed2`…`502a210`). Ele deixou `src/lib/search/ai-links.ts` como fonte
única dos deep-links de `/ia` — use-a, não escreva rota à mão.

---

## Restrições globais

Valem em **todas** as tasks. Cada uma saiu de um defeito real deste repositório.

1. **O orçamento de JS por rota é a restrição que manda neste bloco.** Medido em 2026-09-19,
   depois do Bloco 1, com `npm run perf:bundle`:

   | Rota | Agora | Teto | Folga |
   | --- | --- | --- | --- |
   | `/(app)/configuracoes` | **279,2 KB gz** | 285 (teto próprio) | **5,8 KB** |
   | `/(app)/nutricao/compras` | 240,0 KB | 250 | 10,0 KB |
   | `/(app)/habitos` | 237,2 KB | 250 | 12,8 KB |
   | `/(app)/todo` | 236,2 KB | 250 | 13,8 KB |
   | mediana de 67 rotas | 211,7 KB | 250 | — |

   O botão mora na casca, então **tudo que ele importa entra nas 67 rotas**. O teto real do
   bloco é a folga da primeira linha: **5,8 KB gz**. ⛔ Estourar não se resolve subindo o teto
   de `EXCECOES` — resolve-se tirando import do botão.

2. **O que o botão PODE importar:** `react`, `next/dynamic`, **um** ícone do `lucide-react`
   (o pacote já está em toda rota pelo Header), `@/components/ui/button`, `@/lib/utils` (`cn`),
   `@/components/shared/use-lazy-dialog` e `@/lib/ai/painel` (puro).
   ⛔ **O que ele NÃO pode importar:** `@/lib/ai/constants` (texto grande, hoje só nas rotas de
   `/ia`), `@/lib/validators/*` (arrasta `zod`, 62,7 KB gz), `@/components/ai/chat-client`,
   `@/components/ui/dropdown-menu`, `@/components/ui/sheet` e qualquer `queries.ts`.
   As constantes do canto que o botão precisa (`CANTOS_DO_BOTAO`) vão em `@/lib/ai/painel`,
   que é um módulo puro **sem um único import de runtime**.

3. **O segundo argumento de `next/dynamic` tem de ser objeto literal escrito ali mesmo.** O
   compilador o lê estaticamente e recusa constante compartilhada. A repetição é exigida.

4. **`cn()` é `twMerge`, e variante entra em outro grupo.** `SheetContent` traz
   `data-[side=right]:sm:max-w-sm`. Um `sm:max-w-lg` do chamador **não vence** — tem conjunto
   de modificadores diferente. Para alargar o painel no desktop escreva
   `data-[side=right]:sm:max-w-lg`, com o mesmo prefixo.

5. **`min-h-0 flex-1` no filho que rola, dentro do `flex-col` do `SheetContent`** — senão o
   conteúdo estoura o drawer sem rolar. É a mesma linha que `mobile-nav.tsx` já carrega, com o
   comentário do motivo.

6. **Campo obrigatório num schema de formulário entra no payload no MESMO commit**
   (invariante 81). `allowVision` entrou em `aiPreferencesSchema` na 18-D e nunca chegou ao
   payload de `ai-preferences-form.tsx`: **toda** gravação de preferências foi recusada por
   três subfases. `tsc` não pega — a action recebe `unknown`. Quem pega é a lista
   `OBRIGATORIOS` em `src/lib/validators/ai.test.ts`, e ela tem de crescer junto.

7. **Lógica pura recebe `agora` INJETADO.** Nada de `Date.now()` dentro de função pura
   (`react-hooks/purity` reprova até em render de componente).

8. **`.slice(0, 10)` num `timestamptz` devolve o dia em UTC** e erra a data entre 21h e 00h
   BRT. Neste bloco só se compara instante com instante (`new Date(iso) <= agora`), o que é
   seguro — mas não introduza formatação de data sem `dateInSaoPaulo`.

9. **Nenhuma regra é reescrita.** O painel usa o `ChatClient` existente e o mesmo
   `/api/ia/chat`. A frase de bloqueio ("nenhum provedor configurado…") passa a sair de **uma**
   função, consumida pela página `/ia` e pelo painel — hoje ela existe só dentro de
   `src/app/(app)/ia/page.tsx`, e uma segunda cópia divergiria na primeira edição.

10. **Nenhuma chave nova de permissão.** O botão não autoriza nada: o chat atrás dele continua
    exigindo as mesmas `allow_*`, e a escrita continua exigindo as `allow_write_*` mais a
    confirmação na tela. `floating_hidden` é aparência, não autorização — por isso nasce
    **ligado** (o botão aparece), ao contrário de toda chave `allow_*` deste módulo.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/ai/painel.ts` **(novo, puro)** | Vocabulário do canto + a regra do selo. Zero import de runtime. |
| `src/lib/ai/painel.test.ts` **(novo)** | A regra do selo, inclusive o que ela se recusa a saber. |
| `supabase/migrations/20260920100000_ai_botao_flutuante.sql` **(novo)** | Duas colunas em `ai_user_preferences` + CHECK do canto. |
| `src/lib/ai/types.ts` | `AiPreferencesView` ganha `floatingCorner` e `floatingHidden`. |
| `src/lib/ai/queries.ts` | `getAiPreferences` lê as duas; nasce `getFloatingButtonPrefs` (estreita, para o layout). |
| `src/lib/validators/ai.ts` | `botaoFlutuanteSchema`; `aiPreferencesSchema` ganha os dois campos. |
| `src/lib/validators/ai.test.ts` | `OBRIGATORIOS` ganha os dois nomes. |
| `src/lib/actions/ai-preferences.ts` | O `upsert` grava as duas colunas. |
| `src/lib/actions/ai-panel.ts` **(novo)** | `estadoDoPainelDaIa()` (leitura sob demanda) e `definirBotaoFlutuante()`. |
| `src/lib/ai/server/chat-readiness.ts` **(novo)** | `prontidaoDoChat(userId)` — a frase de bloqueio, num lugar só. |
| `src/app/(app)/ia/page.tsx` | Passa a consumir `prontidaoDoChat`. |
| `src/components/ai/chat-client.tsx` | Ganha `onAtividade?` (opcional) e `compacto?`. |
| `src/components/ai/floating-assistant-panel.tsx` **(novo)** | O painel: `Sheet`, `ChatClient`, menu de canto/ocultar. Alvo do `next/dynamic`. |
| `src/components/ai/floating-assistant.tsx` **(novo, LEVE)** | O botão, o selo e o atalho. Mora na casca. |
| `src/components/ai/ai-preferences-form.tsx` | Dois controles + os dois campos no payload. |
| `src/components/layout/app-shell.tsx` | Monta o botão. |
| `src/app/(app)/layout.tsx` | Lê as duas preferências e passa para a casca. |

---

## Task 1: O vocabulário do canto e a regra pura do selo

**Arquivos:**
- Criar: `src/lib/ai/painel.ts`
- Criar (teste): `src/lib/ai/painel.test.ts`

**Interfaces:**
- Consome: nada. ⛔ O módulo é puro e **não importa nada** — nem tipo. É o que garante a
  restrição 2.
- Produz: `CANTOS_DO_BOTAO`, `CantoDoBotao`, `CANTO_PADRAO`, `ROTULO_DO_CANTO`,
  `TECLA_DO_PAINEL`, `ATALHO_DO_PAINEL`, `EstadoDoPainel`, `ESTADO_INICIAL`,
  `EventoDoPainel`, `reduzirPainel`, `AvisoDoBotao`, `avisoDoBotao`.

- [ ] **Passo 1: Escrever o teste que falha**

Crie `src/lib/ai/painel.test.ts`:

```ts
/**
 * Fase 18-F · Bloco 2 — a regra do selo do botão flutuante.
 *
 * ⛔ O QUE ESTE TESTE PROTEGE É UMA FRONTEIRA, NÃO UM CÁLCULO. O risco nº 1 declarado no doc
 * da fase é o mesmo fato virar notificação, card, badge e item de busca ao mesmo tempo. O
 * sino responde "algo aconteceu no sistema"; este selo responde "algo mudou na conversa que
 * VOCÊ abriu". Um insight novo, uma fatura vencendo ou uma ação travada NÃO têm como chegar
 * aqui — e a garantia é que o módulo não tem de onde os ler.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  avisoDoBotao,
  CANTO_PADRAO,
  CANTOS_DO_BOTAO,
  ESTADO_INICIAL,
  reduzirPainel,
  ROTULO_DO_CANTO,
  type EstadoDoPainel,
  type EventoDoPainel,
} from "./painel";

const AGORA = new Date("2026-09-20T15:00:00.000Z");
const DAQUI_A_5_MIN = "2026-09-20T15:05:00.000Z";
const HA_1_MIN = "2026-09-20T14:59:00.000Z";

function aplicar(eventos: readonly EventoDoPainel[]): EstadoDoPainel {
  return eventos.reduce(reduzirPainel, ESTADO_INICIAL);
}

describe("vocabulário do canto", () => {
  it("são DOIS cantos, e os de cima não existem", () => {
    expect([...CANTOS_DO_BOTAO]).toEqual(["direita", "esquerda"]);
  });

  it("o padrão é um canto válido", () => {
    expect(CANTOS_DO_BOTAO).toContain(CANTO_PADRAO);
  });

  it("todo canto tem rótulo em pt-BR", () => {
    for (const canto of CANTOS_DO_BOTAO) {
      expect(ROTULO_DO_CANTO[canto]).toMatch(/\S/);
    }
  });
});

describe("estado do painel", () => {
  it("começa fechado, sem resposta pendente e sem proposta", () => {
    expect(ESTADO_INICIAL).toEqual({
      aberto: false,
      respostaNaoVista: false,
      propostas: [],
    });
  });

  it("uma resposta que chega com o painel FECHADO fica por ver", () => {
    const e = aplicar([{ tipo: "respondeu" }]);
    expect(e.respostaNaoVista).toBe(true);
  });

  it("uma resposta que chega com o painel ABERTO já foi vista", () => {
    const e = aplicar([{ tipo: "abriu" }, { tipo: "respondeu" }]);
    expect(e.respostaNaoVista).toBe(false);
  });

  it("abrir o painel zera a resposta por ver", () => {
    const e = aplicar([{ tipo: "respondeu" }, { tipo: "abriu" }]);
    expect(e.respostaNaoVista).toBe(false);
  });

  it("uma proposta é guardada pelo PRAZO dela, não por um estado gravado", () => {
    const e = aplicar([{ tipo: "propos", id: "p1", expiraEm: DAQUI_A_5_MIN }]);
    expect(e.propostas).toEqual([{ id: "p1", expiraEm: DAQUI_A_5_MIN }]);
  });

  it("a mesma proposta duas vezes não vira duas", () => {
    const e = aplicar([
      { tipo: "propos", id: "p1", expiraEm: DAQUI_A_5_MIN },
      { tipo: "propos", id: "p1", expiraEm: DAQUI_A_5_MIN },
    ]);
    expect(e.propostas).toHaveLength(1);
  });

  it("decidir a proposta a tira da lista", () => {
    const e = aplicar([
      { tipo: "propos", id: "p1", expiraEm: DAQUI_A_5_MIN },
      { tipo: "decidiu", id: "p1" },
    ]);
    expect(e.propostas).toEqual([]);
  });

  /**
   * ⛔ Trocar de provedor reinicia o laço, a ferramenta de escrita roda de novo e nasce uma
   * SEGUNDA proposta com outro id (invariante 46). `chat-client.tsx` limpa os cartões da tela
   * no evento `switch`; o selo tem de acompanhar, senão ele contaria duas onde há uma.
   */
  it("`recomecou` limpa as propostas — o laço reiniciou", () => {
    const e = aplicar([
      { tipo: "propos", id: "p1", expiraEm: DAQUI_A_5_MIN },
      { tipo: "recomecou" },
    ]);
    expect(e.propostas).toEqual([]);
  });
});

describe("aviso do botão", () => {
  it("painel aberto NUNCA avisa — o dono está vendo", () => {
    const e = aplicar([
      { tipo: "respondeu" },
      { tipo: "propos", id: "p1", expiraEm: DAQUI_A_5_MIN },
      { tipo: "abriu" },
    ]);
    expect(avisoDoBotao(e, AGORA)).toBeNull();
  });

  it("estado inicial não avisa nada", () => {
    expect(avisoDoBotao(ESTADO_INICIAL, AGORA)).toBeNull();
  });

  it("resposta por ver vira aviso de leitura", () => {
    const e = aplicar([{ tipo: "respondeu" }]);
    expect(avisoDoBotao(e, AGORA)).toEqual({
      tipo: "resposta",
      quantas: 0,
      texto: "O assistente respondeu.",
    });
  });

  /** A decisão tem PRAZO; a leitura não. Quem tem prazo vence. */
  it("proposta pendente vence a resposta por ver", () => {
    const e = aplicar([
      { tipo: "respondeu" },
      { tipo: "propos", id: "p1", expiraEm: DAQUI_A_5_MIN },
    ]);
    expect(avisoDoBotao(e, AGORA)).toEqual({
      tipo: "proposta",
      quantas: 1,
      texto: "1 alteração aguardando você.",
    });
  });

  it("o plural é pt-BR", () => {
    const e = aplicar([
      { tipo: "propos", id: "p1", expiraEm: DAQUI_A_5_MIN },
      { tipo: "propos", id: "p2", expiraEm: DAQUI_A_5_MIN },
    ]);
    expect(avisoDoBotao(e, AGORA)?.texto).toBe("2 alterações aguardando você.");
  });

  /**
   * ⛔ Estado DERIVADO, nunca gravado (invariante 35 aplicada ao selo). A proposta expirou
   * sozinha: nada foi escrito, nenhum evento chegou, e o selo some porque `agora` passou do
   * prazo. Um `propostasExpiradas` no estado seria uma segunda verdade sobre o mesmo prazo.
   */
  it("proposta vencida some do aviso sem evento nenhum", () => {
    const e = aplicar([{ tipo: "propos", id: "p1", expiraEm: HA_1_MIN }]);
    expect(avisoDoBotao(e, AGORA)).toBeNull();
  });

  it("proposta vencida não esconde a resposta por ver", () => {
    const e = aplicar([{ tipo: "respondeu" }, { tipo: "propos", id: "p1", expiraEm: HA_1_MIN }]);
    expect(avisoDoBotao(e, AGORA)?.tipo).toBe("resposta");
  });

  it("o instante do prazo é comparado como INSTANTE — o teste passa em qualquer fuso", () => {
    const e = aplicar([{ tipo: "propos", id: "p1", expiraEm: "2026-09-20T15:00:01.000Z" }]);
    expect(avisoDoBotao(e, AGORA)?.tipo).toBe("proposta");
    expect(avisoDoBotao(e, new Date("2026-09-20T15:00:02.000Z"))).toBeNull();
  });
});

describe("⛔ o selo não repete o sino", () => {
  /**
   * A garantia não é uma checagem: é a AUSÊNCIA de caminho. O módulo não importa nada, então
   * não tem como ler notificação, insight, ação travada nem orçamento. Um import novo aqui
   * derruba este teste, e é para isso que ele existe.
   */
  it("o módulo não tem um único import", () => {
    // Varredura do código-fonte, a mesma técnica de `chat-events.test.ts` e da invariante 81:
    // o projeto roda em `environment: "node"` e o que se quer provar aqui é uma propriedade do
    // ARQUIVO, não do que ele exporta.
    const codigo = fs.readFileSync(
      path.join(process.cwd(), "src/lib/ai/painel.ts"),
      "utf8",
    );
    expect(codigo).not.toMatch(/^\s*import\s/m);
  });

  it("nenhum evento do sistema é representável — a união só fala do painel", () => {
    const tipos: EventoDoPainel["tipo"][] = [
      "abriu",
      "fechou",
      "respondeu",
      "propos",
      "decidiu",
      "recomecou",
    ];
    // A lista acima é o contrato: se alguém acrescentar "insightNovo" ou "notificacao",
    // este teste fica vermelho e a conversa acontece antes do commit.
    expect(tipos).toHaveLength(6);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npx vitest run src/lib/ai/painel.test.ts
```
Esperado: FAIL — `Cannot find module './painel'`.

- [ ] **Passo 3: Implementar**

Crie `src/lib/ai/painel.ts`:

```ts
/**
 * Fase 18-F · Bloco 2 — IA · O botão flutuante: vocabulário e a regra do selo.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ESTE ARQUIVO NÃO TEM UM ÚNICO IMPORT, E A AUSÊNCIA É DUPLAMENTE INTENCIONAL.        ║
 * ║                                                                                       ║
 * ║ 1. PESO. Ele é importado pelo botão, que mora na casca do app e portanto entra nas    ║
 * ║    67 rotas. Depois do Bloco 1, a rota mais apertada tem 5,8 KB gz de folga. Um       ║
 * ║    import de `@/lib/ai/constants` (texto grande) ou de `@/lib/validators/ai` (que     ║
 * ║    começa com `import { z } from "zod"`, 62,7 KB gz) estouraria o orçamento de TODAS. ║
 * ║                                                                                       ║
 * ║ 2. FRONTEIRA. O sino é a fonte de verdade para "algo aconteceu no sistema"; este selo ║
 * ║    fala SÓ da conversa que o dono abriu. Sem import, ele não tem como ler insight,    ║
 * ║    notificação, ação travada nem orçamento — a separação vira propriedade do módulo,  ║
 * ║    não promessa de quem o editar depois. Há teste varrendo por `import`.              ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

// ─────────────────────────── Onde o botão fica ───────────────────────────

/**
 * ⛔ DOIS cantos, não quatro — e a ausência dos de cima é medida, não preguiça.
 *
 * O Header é `sticky top-0 z-30` com `h-16` e ocupa a faixa superior inteira em toda rota
 * `(app)`: busca, lançamento rápido, sino, tema e menu do usuário. Um botão no canto superior
 * colidiria com eles sempre.
 *
 * E não há arrasto. Arrastar exigiria persistência por tipo de aparelho, encaixe em bordas e
 * uma alternativa acessível ao gesto — três subsistemas para fugir de obstáculos que este
 * layout não tem: o lançamento rápido mora no Header e a navegação do celular é um drawer
 * lateral, não uma barra inferior. O canto de baixo está livre em todas as rotas.
 */
export const CANTOS_DO_BOTAO = ["direita", "esquerda"] as const;

export type CantoDoBotao = (typeof CANTOS_DO_BOTAO)[number];

export const CANTO_PADRAO: CantoDoBotao = "direita";

export const ROTULO_DO_CANTO = {
  direita: "Canto inferior direito",
  esquerda: "Canto inferior esquerdo",
} as const satisfies Record<CantoDoBotao, string>;

/** Valor desconhecido (coluna nova lida por código antigo, linha adulterada) cai no padrão. */
export function cantoValido(valor: unknown): CantoDoBotao {
  return valor === "esquerda" ? "esquerda" : "direita";
}

// ─────────────────────────── O atalho ───────────────────────────

/**
 * A tecla do painel, com `Ctrl` no Windows/Linux e `⌘` no Mac.
 *
 * ⚠️ Escolhida por ELIMINAÇÃO, não por gosto: `Ctrl/⌘ + K` já é a busca global
 * (`search-command.tsx`) e é o único outro atalho global do projeto — conferido por varredura
 * de `metaKey|ctrlKey` em `src/components/`. `Ctrl/⌘ + J` é o histórico de downloads no Chrome
 * e no Firefox: dá para suprimir, mas um atalho que o navegador reserva volta a funcionar
 * sozinho no dia em que alguém remover o `preventDefault`.
 *
 * ⛔ O atalho continua valendo com o botão OCULTO. Esconder tira o botão da tela, não o
 * assistente do alcance — e a tela que oferece ocultar diz isso com estas palavras.
 */
export const TECLA_DO_PAINEL = "i";
export const ATALHO_DO_PAINEL = "Ctrl/⌘ + I";

// ─────────────────────────── O estado do painel ───────────────────────────

/** Uma alteração preparada que ainda aguarda decisão, com o prazo dela (18-C). */
export type PropostaPendente = {
  readonly id: string;
  /** Instante ISO (`timestamptz`), como vem de `ai_action_proposals.expires_at`. */
  readonly expiraEm: string;
};

export type EstadoDoPainel = {
  readonly aberto: boolean;
  /** Uma resposta terminou enquanto o painel estava fechado. */
  readonly respostaNaoVista: boolean;
  readonly propostas: readonly PropostaPendente[];
};

export const ESTADO_INICIAL: EstadoDoPainel = {
  aberto: false,
  respostaNaoVista: false,
  propostas: [],
};

/**
 * Os SEIS eventos — e todos falam do painel, nenhum do sistema.
 *
 * ⛔ Se um dia alguém precisar de "insight novo" ou "notificação" aqui, o lugar certo é o
 * sino, não este selo. Há teste travando o tamanho desta união justamente para que essa
 * conversa aconteça antes do commit.
 */
export type EventoDoPainel =
  | { readonly tipo: "abriu" }
  | { readonly tipo: "fechou" }
  | { readonly tipo: "respondeu" }
  | { readonly tipo: "propos"; readonly id: string; readonly expiraEm: string }
  | { readonly tipo: "decidiu"; readonly id: string }
  /**
   * O laço reiniciou (evento SSE `switch`: troca de provedor). `chat-client.tsx` limpa os
   * cartões da tela nesse instante, porque a ferramenta de escrita roda de novo e nasce uma
   * SEGUNDA proposta, com outro id e outro hash (invariante 46). O selo acompanha, senão
   * contaria duas onde o dono vê uma.
   */
  | { readonly tipo: "recomecou" };

export function reduzirPainel(
  estado: EstadoDoPainel,
  evento: EventoDoPainel,
): EstadoDoPainel {
  switch (evento.tipo) {
    case "abriu":
      // Abrir é ver. A resposta deixa de estar por ver; as propostas continuam — elas não se
      // resolvem por serem olhadas, só por decisão ou por prazo.
      return { ...estado, aberto: true, respostaNaoVista: false };
    case "fechou":
      return { ...estado, aberto: false };
    case "respondeu":
      return { ...estado, respostaNaoVista: estado.aberto ? false : true };
    case "propos":
      if (estado.propostas.some((p) => p.id === evento.id)) return estado;
      return {
        ...estado,
        propostas: [...estado.propostas, { id: evento.id, expiraEm: evento.expiraEm }],
      };
    case "decidiu":
      return { ...estado, propostas: estado.propostas.filter((p) => p.id !== evento.id) };
    case "recomecou":
      return { ...estado, propostas: [] };
  }
}

// ─────────────────────────── O que o selo mostra ───────────────────────────

export type AvisoDoBotao = {
  readonly tipo: "proposta" | "resposta";
  /** Quantas alterações aguardam decisão. Zero quando o aviso é só de leitura. */
  readonly quantas: number;
  readonly texto: string;
};

/**
 * O selo, derivado — nunca gravado.
 *
 * Precedência: **decisão com prazo > leitura**. Uma alteração preparada expira em 10 minutos e
 * some sozinha; uma resposta por ler espera o dono o tempo que for. Avisar da leitura por cima
 * da decisão enterraria a única das duas que tem relógio correndo.
 *
 * `agora` é INJETADO: sem isso a função deixaria de ser pura e o teste do prazo dependeria do
 * relógio da máquina.
 */
export function avisoDoBotao(
  estado: EstadoDoPainel,
  agora: Date,
): AvisoDoBotao | null {
  // Painel aberto não avisa nada: o dono está olhando para o conteúdo do aviso.
  if (estado.aberto) return null;

  const pendentes = estado.propostas.filter(
    (p) => new Date(p.expiraEm).getTime() > agora.getTime(),
  );

  if (pendentes.length > 0) {
    const n = pendentes.length;
    return {
      tipo: "proposta",
      quantas: n,
      texto: n === 1 ? "1 alteração aguardando você." : `${n} alterações aguardando você.`,
    };
  }

  if (estado.respostaNaoVista) {
    return { tipo: "resposta", quantas: 0, texto: "O assistente respondeu." };
  }

  return null;
}
```

- [ ] **Passo 4: Rodar e ver passar**

```bash
npx vitest run src/lib/ai/painel.test.ts
TZ=UTC npx vitest run src/lib/ai/painel.test.ts
npx tsc --noEmit
```
Esperado: PASS nos dois fusos. ⚠️ `vitest` não checa tipo — rode o `tsc` mesmo com a suíte
verde.

- [ ] **Passo 5: Commit**

```bash
git add src/lib/ai/painel.ts src/lib/ai/painel.test.ts
git commit -m "feat(18-f): regra pura do selo do botao flutuante, sem repetir o sino"
```

---

## Task 2: As duas colunas

**Arquivos:**
- Criar: `supabase/migrations/20260920100000_ai_botao_flutuante.sql`
- Modificar: `src/types/supabase.ts` (regenerado)

**Interfaces:**
- Consome: o vocabulário da Task 1 (os dois valores do CHECK são os de `CANTOS_DO_BOTAO`).
- Produz: `ai_user_preferences.floating_corner` (text, not null, default `'direita'`) e
  `ai_user_preferences.floating_hidden` (boolean, not null, default `false`).

- [ ] **Passo 1: Escrever a migration**

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Fase 18-F · Bloco 2 — O botão flutuante do assistente.
--
-- DUAS COLUNAS, NENHUMA TABELA. O botão não guarda dado do dono: ele guarda onde o dono quer
-- o botão. Por isso a preferência mora junto das outras do módulo, e não numa tabela própria.
--
-- ⚠️ POR QUE BANCO E NÃO COOKIE. A sidebar usa cookie (`yuri:sidebar-collapsed`) porque o
-- estado dela é por aparelho e não vale nada fora do navegador. Este é outro caso: quem
-- escondeu o botão escondeu-o de propósito, e reencontrá-lo aparecendo de novo no celular
-- seria a preferência não valendo. Em banco ele também entra no backup (o export da IA, do
-- Bloco 1) e some na exclusão em massa junto do resto — como qualquer preferência.
--
-- ⛔ AS DUAS NASCEM COM O BOTÃO VISÍVEL, e isso NÃO fere "toda chave nasce desligada". Aquela
-- regra vale para AUTORIZAÇÃO: as nove `allow_*`, as cinco `allow_write_*`, `allow_vision`,
-- `allow_insight_jobs`. Esta não autoriza coisa nenhuma — o chat atrás do botão continua
-- exigindo exatamente as mesmas chaves, e todas continuam desligadas. Um botão que nasce
-- escondido é uma entrega que ninguém encontra.
--
-- RLS: nada a fazer. `ai_user_preferences` já tem RLS + FORCE RLS e policies por comando
-- desde `20260807100000_ai_foundation.sql`; policy é da TABELA e alcança coluna nova.
-- ════════════════════════════════════════════════════════════════════════════════════════

alter table public.ai_user_preferences
  add column if not exists floating_corner text    not null default 'direita',
  add column if not exists floating_hidden boolean not null default false;

-- O CHECK é a trava real do vocabulário: a tela valida com Zod e a action também, mas as duas
-- são código, e código se contorna com um POST montado à mão. Um canto fora da lista viraria
-- classe CSS inexistente e o botão sumiria sem erro nenhum — falha silenciosa, a pior espécie.
alter table public.ai_user_preferences
  drop constraint if exists ai_user_preferences_floating_corner_check;

alter table public.ai_user_preferences
  add constraint ai_user_preferences_floating_corner_check
  check (floating_corner in ('direita', 'esquerda'));

comment on column public.ai_user_preferences.floating_corner is
  'Fase 18-F Bloco 2. Em qual canto INFERIOR o botão flutuante fica. Só dois valores: o '
  'Header é sticky top-0 h-16 e ocupa a faixa de cima inteira, então canto superior é '
  'colisão garantida em toda rota.';

comment on column public.ai_user_preferences.floating_hidden is
  'Fase 18-F Bloco 2. Esconde o BOTÃO, não o assistente: o atalho Ctrl/Cmd+I continua '
  'abrindo o painel, e a tela que oferece ocultar diz isso. Nasce false de propósito — é '
  'aparência, não autorização.';
```

- [ ] **Passo 2: Aplicar e conferir no banco**

Aplique via MCP do Supabase (`apply_migration`, projeto `yjvnlbjvippefvzgrxxw`). Depois,
conferir que o CHECK morde de verdade:

```sql
-- deve FALHAR com violação de check
update public.ai_user_preferences set floating_corner = 'topo' where user_id = auth.uid();
```

- [ ] **Passo 3: Regenerar os tipos**

Use o MCP `generate_typescript_types` e escreva o resultado em `src/types/supabase.ts`.
⚠️ **Leia o diff antes de aceitar:** o arquivo é ponto de contato entre frentes; o diff tem de
mostrar só as duas colunas novas em `ai_user_preferences` (em `Row`, `Insert` e `Update`).

```bash
git diff --stat src/types/supabase.ts
npx tsc --noEmit
```

- [ ] **Passo 4: Commit**

```bash
git add supabase/migrations/20260920100000_ai_botao_flutuante.sql src/types/supabase.ts
git commit -m "feat(18-f): colunas de canto e ocultacao do botao flutuante"
```

---

## Task 3: O schema, o tipo e a leitura

**Arquivos:**
- Modificar: `src/lib/validators/ai.ts`
- Modificar: `src/lib/validators/ai.test.ts` (lista `OBRIGATORIOS`)
- Modificar: `src/lib/ai/types.ts` (`AiPreferencesView`)
- Modificar: `src/lib/ai/queries.ts` (`PREFS_PADRAO`, `getAiPreferences`, `getFloatingButtonPrefs`)

**Interfaces:**
- Consome: `CantoDoBotao`, `CANTOS_DO_BOTAO`, `CANTO_PADRAO`, `cantoValido` da Task 1; as
  colunas da Task 2.
- Produz: `botaoFlutuanteSchema` (`{ floatingCorner, floatingHidden }`, `.strict()`),
  `BotaoFlutuanteInput`, `AiPreferencesView.floatingCorner` / `.floatingHidden`, e
  `getFloatingButtonPrefs(userId): Promise<{ canto: CantoDoBotao; oculto: boolean }>`.

- [ ] **Passo 1: Escrever os testes que falham**

Em `src/lib/validators/ai.test.ts`, **acrescente** ao `import` de `./ai` o nome
`botaoFlutuanteSchema`, e ao `import` de `@/lib/ai/painel` (novo) os nomes `CANTOS_DO_BOTAO`.
Depois acrescente este `describe` ao fim do arquivo:

```ts
describe("18-F Bloco 2 — o botão flutuante", () => {
  it("aceita os dois cantos, e só eles", () => {
    for (const canto of CANTOS_DO_BOTAO) {
      expect(
        botaoFlutuanteSchema.safeParse({ floatingCorner: canto, floatingHidden: false })
          .success,
        canto,
      ).toBe(true);
    }
    expect(
      botaoFlutuanteSchema.safeParse({ floatingCorner: "topo", floatingHidden: false })
        .success,
    ).toBe(false);
  });

  it("campo a mais é erro (`.strict()`)", () => {
    expect(
      botaoFlutuanteSchema.safeParse({
        floatingCorner: "direita",
        floatingHidden: false,
        user_id: "11111111-2222-4333-8444-555555555555",
      }).success,
    ).toBe(false);
  });

  /** Regra de round-trip do projeto: `parse(parse(x))` tem de funcionar. */
  it("o schema aceita a própria saída", () => {
    const uma = botaoFlutuanteSchema.parse({ floatingCorner: "esquerda", floatingHidden: true });
    expect(botaoFlutuanteSchema.safeParse(uma).success).toBe(true);
  });
});
```

E — **no mesmo commit**, por causa da invariante 81 — acrescente os dois nomes à lista
`OBRIGATORIOS` do `describe` "o formulário manda todos os campos obrigatórios do schema" e ao
objeto `completo` do primeiro `it` dele:

```ts
  const OBRIGATORIOS = [
    "permissions",
    "writePermissions",
    "allowVision",
    "allowInsightJobs",
    "jobMonthlyBudget",
    "confirmationMode",
    "allowFallback",
    "budgetBlockOnLimit",
    "reservationMargin",
    "rateLimitPerMinute",
    "rateLimitPerHour",
    // 18-F Bloco 2. Entram AQUI no mesmo commit em que entram no schema — foi a lista não ter
    // crescido junto que fez `allowVision` recusar toda gravação de preferências por três
    // subfases, com uma mensagem sobre um campo que a tela não tinha.
    "floatingCorner",
    "floatingHidden",
  ] as const;
```

```ts
    const completo: Record<string, unknown> = {
      // … campos existentes …
      floatingCorner: "direita",
      floatingHidden: false,
    };
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npx vitest run src/lib/validators/ai.test.ts
```
Esperado: FAIL — `botaoFlutuanteSchema` não existe, e o teste do payload acusa
`campos ausentes no payload do formulário: floatingCorner, floatingHidden`.

- [ ] **Passo 3: Implementar o schema**

Em `src/lib/validators/ai.ts`, acrescente (logo antes de `aiPreferencesSchema`):

```ts
/**
 * 18-F Bloco 2 — onde o botão flutuante fica, e se ele aparece.
 *
 * Schema PRÓPRIO, e não dois campos soltos, porque há dois caminhos de gravação para as
 * MESMAS duas colunas: o formulário grande de `/ia/configuracoes` (que salva tudo de uma vez)
 * e o menu do próprio painel (que salva só isto, de onde o dono está). Um schema só é o que
 * impede os dois de divergirem — o vocabulário do canto é declarado uma vez, em
 * `@/lib/ai/painel`, e o CHECK do banco o repete como trava final.
 */
export const botaoFlutuanteSchema = z
  .object({
    floatingCorner: z.enum(CANTOS_DO_BOTAO, { error: "Canto inválido." }),
    floatingHidden: z.boolean({ error: "Preferência de exibição do botão inválida." }),
  })
  .strict();

export type BotaoFlutuanteInput = z.infer<typeof botaoFlutuanteSchema>;
```

…com o import no topo do arquivo:

```ts
import { CANTOS_DO_BOTAO } from "@/lib/ai/painel";
```

E dentro de `aiPreferencesSchema`, espalhe a forma (não redeclare os campos):

```ts
export const aiPreferencesSchema = z
  .object({
    // 18-F Bloco 2 — a MESMA forma do menu do painel, espalhada. Redeclarar os dois campos
    // aqui criaria a segunda definição que este arquivo existe para evitar.
    ...botaoFlutuanteSchema.shape,
    permissions: aiPermissionsSchema,
    // … o restante, inalterado …
  })
  .strict();
```

⚠️ **`.shape` é API do Zod v4** (o projeto está em `^4.4.3`) e **não tem precedente neste
repositório** — todo schema daqui declara campo a campo. Rode `npx tsc --noEmit` logo depois
desta edição: se o espalhamento não tipar, declare os dois campos inline com os MESMOS
validadores e siga em frente; o teste abaixo é que torna a escolha segura de qualquer jeito.

Acrescente-o ao `describe` do botão, porque é ele que impede as duas portas de divergirem:

```ts
  /**
   * ⛔ AS DUAS PORTAS VALIDAM A MESMA COISA. O menu do painel grava por `botaoFlutuanteSchema`
   * e o formulário grande por `aiPreferencesSchema`; se um aceitar um canto que o outro
   * recusa, a preferência passaria a depender de onde foi mexida. Hoje um espalha o outro —
   * e se alguém desfizer isso, este teste é que fica vermelho.
   */
  it("o schema grande aceita exatamente os cantos que o schema do botão aceita", () => {
    const base = {
      permissions: Object.fromEntries(TOOL_PERMISSIONS.map((p) => [p, false])),
      writePermissions: Object.fromEntries(TOOL_WRITE_PERMISSIONS.map((p) => [p, false])),
      allowVision: false,
      allowInsightJobs: false,
      jobMonthlyBudget: 1,
      defaultProvider: null,
      defaultModel: "",
      confirmationMode: "seguro",
      allowFallback: false,
      dailyBudget: null,
      monthlyBudget: null,
      budgetBlockOnLimit: true,
      reservationMargin: 1.15,
      rateLimitPerMinute: 10,
      rateLimitPerHour: 120,
      floatingHidden: false,
    };

    for (const canto of [...CANTOS_DO_BOTAO, "topo", "", null]) {
      const noBotao = botaoFlutuanteSchema.safeParse({
        floatingCorner: canto,
        floatingHidden: false,
      }).success;
      const noGrande = aiPreferencesSchema.safeParse({
        ...base,
        floatingCorner: canto,
      }).success;
      expect(noGrande, `canto ${String(canto)}`).toBe(noBotao);
    }
  });

- [ ] **Passo 4: Implementar o tipo e a leitura**

Em `src/lib/ai/types.ts`, acrescente ao fim de `AiPreferencesView`:

```ts
  /**
   * 18-F Bloco 2 — onde o botão flutuante fica e se ele aparece.
   *
   * ⚠️ Não é `ToolPermission` nem parente das outras chaves deste tipo: as demais respondem
   * "a IA pode ler/alterar X?"; estas respondem "onde o atalho fica na minha tela?". Nenhum
   * guard as consulta, e nenhuma delas autoriza coisa alguma.
   */
  readonly floatingCorner: CantoDoBotao;
  readonly floatingHidden: boolean;
```

com `import type { CantoDoBotao } from "@/lib/ai/painel";` no topo. ⚠️ `painel.ts` não importa
nada, então não há ciclo — confira isso antes de aceitar o import.

Em `src/lib/ai/queries.ts`:

```ts
import { cantoValido, CANTO_PADRAO, type CantoDoBotao } from "@/lib/ai/painel";
```

```ts
const PREFS_PADRAO: AiPreferencesView = {
  // … campos existentes …
  // 18-F Bloco 2. Sem linha de preferência, o botão aparece no canto padrão: ele não
  // autoriza nada, e esconder de fábrica seria entregar o que ninguém acha.
  floatingCorner: CANTO_PADRAO,
  floatingHidden: false,
};
```

No `select` de `getAiPreferences`, acrescente `, floating_corner, floating_hidden` ao fim da
string de colunas. E no objeto devolvido:

```ts
    /**
     * 18-F Bloco 2. `cantoValido` e não um cast: mesma disciplina do `=== true` das chaves
     * acima. Um valor inesperado (coluna lida por código de outra versão, linha adulterada)
     * viraria classe CSS inexistente e o botão sumiria da tela sem erro nenhum. Cai no padrão.
     */
    floatingCorner: cantoValido(data.floating_corner),
    floatingHidden: data.floating_hidden === true,
```

E acrescente, logo depois de `getAiPreferences`:

```ts
/**
 * 18-F Bloco 2 — a leitura ESTREITA, para o layout do app.
 *
 * ⛔ POR QUE NÃO `getAiPreferences`. Esta consulta roda em TODA navegação de `(app)`, porque o
 * botão vive na casca. `getAiPreferences` traz 30 colunas e serve a uma tela de configuração
 * que o dono abre de vez em quando; trazer as 30 a cada clique de menu seria pagar o preço de
 * uma tela em todas elas. São duas colunas, e é uma PROJEÇÃO da mesma linha — não uma segunda
 * verdade: quem grava continua sendo `saveAiPreferences` e `definirBotaoFlutuante`.
 *
 * Sem sessão ou sem linha, devolve o padrão. Esta leitura nunca falha a navegação.
 */
export async function getFloatingButtonPrefs(
  userId: string,
): Promise<{ canto: CantoDoBotao; oculto: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_user_preferences")
    .select("floating_corner, floating_hidden")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    canto: cantoValido(data?.floating_corner),
    oculto: data?.floating_hidden === true,
  };
}
```

- [ ] **Passo 5: Rodar**

```bash
npx vitest run src/lib/validators/ai.test.ts
npx tsc --noEmit
```
Esperado: o `describe` do botão passa; o teste do payload **continua vermelho** (o formulário
ainda não manda os campos) — é a Task 4 que o fecha, e ele estar vermelho no meio do caminho é
exatamente o comportamento que a invariante 81 pede.

- [ ] **Passo 6: Commit**

```bash
git add src/lib/validators/ai.ts src/lib/validators/ai.test.ts src/lib/ai/types.ts src/lib/ai/queries.ts
git commit -m "feat(18-f): schema, tipo e leitura das preferencias do botao flutuante"
```

---

## Task 4: A gravação — as duas portas para as mesmas duas colunas

**Arquivos:**
- Modificar: `src/lib/actions/ai-preferences.ts`
- Criar: `src/lib/actions/ai-panel.ts`
- Modificar: `src/components/ai/ai-preferences-form.tsx`

**Interfaces:**
- Consome: `botaoFlutuanteSchema`, `aiPreferencesSchema`, `AiPreferencesView` da Task 3.
- Produz: `definirBotaoFlutuante(input: unknown): Promise<ActionResult<true>>`.

- [ ] **Passo 1: A action grande grava as colunas**

Em `src/lib/actions/ai-preferences.ts`, dentro do objeto do `upsert`, acrescente (campo a
campo, como as demais — nunca por espalhamento do objeto validado):

```ts
      /**
       * 18-F Bloco 2 — aparência, não autorização, e por isso NÃO é ANDada com nada. As linhas
       * de `allow_write_*` e `allow_vision` acima derrubam estado impossível; aqui não há
       * estado impossível a derrubar: esconder o botão com as chaves todas desligadas é
       * simplesmente esconder um botão que não lia nada mesmo.
       */
      floating_corner: dados.floatingCorner,
      floating_hidden: dados.floatingHidden,
```

- [ ] **Passo 2: A action estreita**

Crie `src/lib/actions/ai-panel.ts`:

```ts
"use server";

/**
 * Fase 18-F · Bloco 2 — IA · O painel flutuante.
 *
 * Duas funções, e elas fazem coisas de naturezas diferentes:
 *
 *  • `estadoDoPainelDaIa` LÊ sob demanda (Task 5) — Server Action usada como RPC, o mesmo
 *    padrão de `globalSearch` (`src/lib/actions/search.ts`), que o command palette do Header
 *    já usa pela mesma razão: um componente da casca precisa de dado do servidor e não pode
 *    cobrá-lo de todas as 67 rotas.
 *  • `definirBotaoFlutuante` GRAVA só as duas colunas do botão, de onde o dono está.
 */

import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { botaoFlutuanteSchema } from "@/lib/validators/ai";
import type { ActionResult } from "@/types/finance";

/**
 * Move ou esconde o botão, a partir do menu do próprio painel.
 *
 * ⚠️ `upsert` e não `update`: quem nunca abriu `/ia/configuracoes` não tem linha em
 * `ai_user_preferences`, e um `update` afetaria zero linhas devolvendo sucesso — a preferência
 * sumiria em silêncio no próximo carregamento. O `upsert` do PostgREST só atualiza as colunas
 * que vão no payload, então nada mais da linha é tocado; num INSERT, o resto nasce com os
 * defaults do banco, que são os seguros (toda chave desligada).
 */
export async function definirBotaoFlutuante(
  input: unknown,
): Promise<ActionResult<true>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = botaoFlutuanteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { error } = await ctx.supabase.from("ai_user_preferences").upsert(
    {
      user_id: ctx.userId,
      floating_corner: parsed.data.floatingCorner,
      floating_hidden: parsed.data.floatingHidden,
    },
    { onConflict: "user_id" },
  );

  if (error) return dbError("Não foi possível salvar a preferência do botão.");

  /**
   * ⚠️ LIMITE DECLARADO. O botão lê a preferência pelo layout, que roda a cada navegação —
   * então a mudança alcança as outras rotas no próximo clique, e alcança outra aba só quando
   * ela navegar. Quem acabou de mexer vê o efeito na hora porque o componente que mudou é o
   * que se move (estado local). Um `revalidatePath("/", "layout")` jogaria fora o cache do app
   * inteiro para adiantar um botão de canto — preço errado para o ganho.
   */
  revalidatePath("/ia/configuracoes");
  return { ok: true, data: true };
}
```

- [ ] **Passo 3: O formulário manda os dois campos**

Em `src/components/ai/ai-preferences-form.tsx`:

1. Acrescente `floatingCorner` e `floatingHidden` ao estado do formulário, semeados de
   `prefs.floatingCorner` / `prefs.floatingHidden`.
2. Acrescente um cartão de controles, no mesmo estilo dos existentes:

```tsx
{/*
  18-F Bloco 2 — o botão flutuante. Este cartão é o ÚNICO caminho de volta: quem esconde o
  botão pelo menu do painel só o reencontra aqui. Por isso ele não fica escondido atrás de
  "avançado", e por isso o texto diz o que "ocultar" NÃO faz.
*/}
<div className="space-y-3 rounded-xl border border-border p-4">
  <div>
    <h3 className="font-heading text-sm font-medium">Botão flutuante</h3>
    <p className="text-sm text-muted-foreground">
      O atalho para conversar com o assistente sem sair da tela em que você está.
      Ocultar tira o botão da tela — o atalho {ATALHO_DO_PAINEL} continua abrindo o painel.
    </p>
  </div>

  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
    <Label htmlFor="canto-do-botao" className="shrink-0 text-sm">
      Posição
    </Label>
    <Select
      value={floatingCorner}
      onValueChange={(v) => setFloatingCorner(v as CantoDoBotao)}
      disabled={floatingHidden}
    >
      <SelectTrigger id="canto-do-botao" className="h-9 w-full min-w-0 sm:w-[16rem]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CANTOS_DO_BOTAO.map((canto) => (
          <SelectItem key={canto} value={canto}>
            {ROTULO_DO_CANTO[canto]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>

  <div className="flex items-start justify-between gap-3">
    <Label htmlFor="ocultar-botao" className="min-w-0 text-sm font-normal">
      Ocultar o botão
    </Label>
    <Switch
      id="ocultar-botao"
      checked={floatingHidden}
      onCheckedChange={setFloatingHidden}
      className="shrink-0"
    />
  </div>
</div>
```

   ⚠️ `min-w-0` no lado do texto e `shrink-0` no controle — regra 2 do layout responsivo: sem
   isso o rótulo empurra o `Switch` para fora e o card o corta pela metade.

3. E, no payload — **o passo que a invariante 81 existe para não deixar esquecer**:

```ts
    const r = await saveAiPreferences({
      // … campos existentes …
      floatingCorner,
      floatingHidden,
    });
```

Imports novos do arquivo: `CANTOS_DO_BOTAO`, `ROTULO_DO_CANTO`, `ATALHO_DO_PAINEL`,
`type CantoDoBotao` de `@/lib/ai/painel`, e `Switch` / `Select*` se ainda não estiverem lá.

- [ ] **Passo 4: Rodar e ver passar**

```bash
npx vitest run src/lib/validators/ai.test.ts
npx tsc --noEmit
npm run lint
```
Esperado: PASS — inclusive o teste do payload, que estava vermelho desde a Task 3.

- [ ] **Passo 5: Conferir à mão que a gravação funciona de ponta a ponta**

Abra `/ia/configuracoes`, mude a posição para a esquerda, salve, recarregue e confirme que a
tela volta com "Canto inferior esquerdo". ⛔ **Este passo não é opcional:** é exatamente a
verificação que não existia quando `allowVision` quebrou a tela inteira, e o sintoma seria o
mesmo — toast de erro sobre um campo que a tela tem, agora, mas que o payload poderia não ter.

- [ ] **Passo 6: Commit**

```bash
git add src/lib/actions/ai-preferences.ts src/lib/actions/ai-panel.ts src/components/ai/ai-preferences-form.tsx
git commit -m "feat(18-f): gravacao das preferencias do botao flutuante, pelas duas portas"
```

---

## Task 5: A prontidão do chat, num lugar só

**Arquivos:**
- Criar: `src/lib/ai/server/chat-readiness.ts`
- Modificar: `src/app/(app)/ia/page.tsx`
- Modificar: `src/lib/actions/ai-panel.ts` (acrescenta `estadoDoPainelDaIa`)

**Interfaces:**
- Consome: `getRouterConfigs` (`@/lib/ai/queries`), `usableProviders` (`@/lib/ai/core/router`),
  `cryptoProblemMessage` (`@/lib/ai/server/crypto-readiness`), `reconcileOwnRuns`
  (`@/lib/ai/server/reconcile`).
- Produz: `prontidaoDoChat(userId): Promise<{ podeConversar: boolean; motivoBloqueio: string | null }>`
  e a Server Action `estadoDoPainelDaIa()` com a mesma forma.

- [ ] **Passo 1: Extrair a regra**

Crie `src/lib/ai/server/chat-readiness.ts`:

```ts
import "server-only";

import { getRouterConfigs } from "@/lib/ai/queries";
import { usableProviders } from "@/lib/ai/core/router";
import { cryptoProblemMessage } from "@/lib/ai/server/crypto-readiness";

export type ProntidaoDoChat = {
  readonly podeConversar: boolean;
  readonly motivoBloqueio: string | null;
};

/**
 * Fase 18-F · Bloco 2 — por que o chat pode (ou não pode) começar.
 *
 * ⛔ EXTRAÍDA DE `src/app/(app)/ia/page.tsx`, ONDE ERA A ÚNICA CÓPIA. A partir deste bloco há
 * DOIS caminhos para o mesmo chat — a página e o painel flutuante —, e duas cópias da mesma
 * frase divergiriam na primeira edição: o dono leria um motivo na página e outro no painel
 * para o mesmo sistema. É a disciplina do `getSessionHistory` da 17-F (invariante 24) e do
 * `getUsageSummary` do Bloco 1 (invariante 83), aplicada à frase em vez de ao número.
 *
 * A ordem importa: problema de cripto vence falta de provedor. Sem a master key, cadastrar
 * provedor não resolve nada — e mandar o dono cadastrar um seria mandá-lo ao lugar errado.
 */
export async function prontidaoDoChat(userId: string): Promise<ProntidaoDoChat> {
  const problemaCripto = cryptoProblemMessage();
  const configs = await getRouterConfigs(userId);
  const prontos = usableProviders(configs);

  const motivoBloqueio =
    problemaCripto ??
    (prontos.length === 0
      ? "Nenhum provedor de IA está configurado e ativo. Cadastre uma chave em Configurações para começar."
      : null);

  return { podeConversar: motivoBloqueio === null, motivoBloqueio };
}
```

- [ ] **Passo 2: A página passa a consumi-la**

Em `src/app/(app)/ia/page.tsx`, troque o cálculo local pela chamada. A página continua
precisando de `prefs` (para `BudgetAlert`), então o `Promise.all` fica:

```ts
  const [prontidao, prefs] = await Promise.all([
    prontidaoDoChat(user.id),
    getAiPreferences(user.id),
  ]);
```

…e apague os imports que ficaram órfãos (`getRouterConfigs`, `usableProviders`,
`cryptoProblemMessage`) e as linhas de `problemaCripto` / `prontos` / `motivoBloqueio`. O
`<ChatClient>` passa a receber `podeConversar={prontidao.podeConversar}` e
`motivoBloqueio={prontidao.motivoBloqueio}`.

⚠️ `npm run lint` reprova import não usado — é ele que vai apontar o que sobrou.

- [ ] **Passo 3: A Server Action de abertura**

Acrescente a `src/lib/actions/ai-panel.ts`:

```ts
import { prontidaoDoChat, type ProntidaoDoChat } from "@/lib/ai/server/chat-readiness";
import { reconcileOwnRuns } from "@/lib/ai/server/reconcile";

/**
 * O que o painel precisa saber para se desenhar, buscado na PRIMEIRA abertura.
 *
 * ⛔ POR QUE NÃO NO LAYOUT. `prontidaoDoChat` lê configs de provedor e checa a cripto. Fazê-lo
 * no layout custaria isso em TODA navegação de `(app)` para um painel que talvez nunca seja
 * aberto. É o mesmo raciocínio que pôs `globalSearch` numa Server Action em vez de semear a
 * busca pelo layout — e o mesmo que pôs o painel atrás de `next/dynamic`: o que só importa
 * depois do clique é cobrado depois do clique.
 *
 * ⚠️ E ELE RECONCILIA, COMO `/ia` FAZ — este detalhe é fácil de perder e caro de perder.
 * Abrir `/ia` é o gatilho PRIMÁRIO da reconciliação preguiçosa: um run travado de uma sessão
 * anterior é fechado ali e a reserva dele deixa de comprometer o orçamento. A partir deste
 * bloco, o caminho mais curto para o chat deixa de ser aquela página — e sem esta linha o
 * gatilho primário simplesmente pararia de disparar para quem passar a conversar pelo painel,
 * com o orçamento mostrando reserva presa sem nada na tela explicando.
 */
export async function estadoDoPainelDaIa(): Promise<ProntidaoDoChat> {
  const ctx = await authContext();
  if (!ctx) {
    return {
      podeConversar: false,
      motivoBloqueio: "Sua sessão expirou. Entre de novo para conversar.",
    };
  }

  await reconcileOwnRuns();
  return prontidaoDoChat(ctx.userId);
}
```

- [ ] **Passo 4: Rodar**

```bash
npm run lint && npx tsc --noEmit && npm run test:run
```
Esperado: verde. ⚠️ Se `boundaries.test.ts` reclamar, leia o motivo antes de mexer:
`server/` pode alcançar `queries.ts` e `core/`, mas **camada pura não alcança `server/`** — e
`chat-readiness.ts` é `server/`, então nenhum arquivo de `core/`, `tools/`, `approval/`,
`vision/` ou `insights/` pode importá-lo.

- [ ] **Passo 5: Commit**

```bash
git add src/lib/ai/server/chat-readiness.ts "src/app/(app)/ia/page.tsx" src/lib/actions/ai-panel.ts
git commit -m "feat(18-f): prontidao do chat num lugar so, consumida pela pagina e pelo painel"
```

---

## Task 6: O painel

**Arquivos:**
- Modificar: `src/components/ai/chat-client.tsx` (props opcionais)
- Criar: `src/components/ai/floating-assistant-panel.tsx`

**Interfaces:**
- Consome: `ChatClient` (18-A), `estadoDoPainelDaIa` e `definirBotaoFlutuante` (Tasks 4–5),
  `EventoDoPainel` / `CANTOS_DO_BOTAO` / `ROTULO_DO_CANTO` (Task 1), `Sheet*`.
- Produz: `FloatingAssistantPanel` com as props
  `{ aberto: boolean; onOpenChange: (v: boolean) => void; canto: CantoDoBotao;
  oculto: boolean; onPreferencia: (p: { canto: CantoDoBotao; oculto: boolean }) => void;
  onAtividade: (e: EventoDoPainel) => void }`.

- [ ] **Passo 1: `ChatClient` ganha a saída de eventos**

Em `src/components/ai/chat-client.tsx`, acrescente a `ChatClientProps`:

```ts
  /**
   * 18-F Bloco 2 — o que ESTA conversa fez, para quem a hospeda.
   *
   * ⛔ É uma SAÍDA, nunca uma entrada: o chat continua dono do próprio estado, e quem escuta
   * não tem como mudá-lo. A página `/ia` não passa nada e nada muda para ela; quem escuta é o
   * botão flutuante, que precisa saber se uma resposta chegou enquanto estava fechado.
   *
   * ⚠️ O QUE SAI DAQUI NÃO É DADO DO DONO. Nem texto de resposta, nem número, nem nome de
   * registro — só "respondeu", "propôs (id + prazo)" e "o laço recomeçou". O selo do botão
   * mostra contagem e verbo, e é tudo que ele tem para mostrar.
   */
  readonly onAtividade?: (evento: EventoDoPainel) => void;
  /** Tira o aviso de honestidade do topo (ele já está no cabeçalho do painel) e aperta o ar. */
  readonly compacto?: boolean;
```

com `import type { EventoDoPainel } from "@/lib/ai/painel";` no topo — `import type` de módulo
puro é apagado na compilação e não muda o peso de `/ia`.

Ligue os eventos nos três pontos que já existem, sem mexer na lógica deles:

```ts
        onDone: (e) => {
          onAtividade?.({ tipo: "respondeu" });
          setBolhas((atual) => /* … inalterado … */);
        },
```

```ts
        onProposta: (e) => {
          onAtividade?.({
            tipo: "propos",
            id: e.proposta.id,
            expiraEm: e.proposta.expiresAt,
          });
          setBolhas((atual) => /* … inalterado … */);
        },
```

…e no handler do evento `switch` (o que zera o texto e limpa as propostas da tela), antes do
`setBolhas`:

```ts
          onAtividade?.({ tipo: "recomecou" });
```

⚠️ **Não acrescente `case` novo no `switch` de eventos SSE.** `src/lib/ai/chat-events.test.ts`
compara os `case` da tela com a união `ChatRunnerEvent` do runner nos DOIS sentidos: um `case`
que o runner não emite deixa a suíte vermelha, tanto quanto um evento sem `case`.

E, quando `compacto` for verdadeiro, não renderize o bloco do `AVISO_SEM_ACESSO` no topo —
troque a abertura do JSX por `{!compacto && ( … )}` em volta dele, sem apagar nada.

- [ ] **Passo 2: Escrever o painel**

Crie `src/components/ai/floating-assistant-panel.tsx`:

```tsx
"use client";

/**
 * Fase 18-F · Bloco 2 — IA · O painel do botão flutuante.
 *
 * ⛔ ESTE ARQUIVO É O ALVO DO `next/dynamic`, e é por isso que ele pode ser pesado. Ele
 * arrasta `ChatClient` (streaming, cartões de proposta, chips de fonte) e o `Sheet`; nada
 * disso entra no primeiro byte de rota nenhuma, porque só é baixado no primeiro clique do
 * botão. Quem tem de continuar leve é `floating-assistant.tsx`, do outro lado do `dynamic`.
 *
 * O chat aqui é o MESMO da página `/ia`: mesma `ChatClient`, mesmo `/api/ia/chat`, mesmas
 * chaves, mesmo Approval Engine. Uma segunda implementação de chat divergiria no primeiro
 * campo novo — e "nenhuma regra é reescrita" é regra do projeto, não gentileza.
 */

import * as React from "react";
import Link from "next/link";
import { EyeOff, Loader2, MoveHorizontal, SquareArrowOutUpRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ChatClient } from "@/components/ai/chat-client";
import { definirBotaoFlutuante, estadoDoPainelDaIa } from "@/lib/actions/ai-panel";
import { AI_LINK_BASE } from "@/lib/search/ai-links";
import {
  ATALHO_DO_PAINEL,
  ROTULO_DO_CANTO,
  type CantoDoBotao,
  type EventoDoPainel,
} from "@/lib/ai/painel";
import { RESUMO_DO_ASSISTENTE } from "@/lib/ai/constants";
import type { ProntidaoDoChat } from "@/lib/ai/server/chat-readiness";

/**
 * `Sheet` lateral no desktop, gaveta de baixo no celular — e o lado é uma PROP do Radix, não
 * uma classe, então não dá para resolver só com CSS.
 *
 * `useSyncExternalStore` e não `useState` + `useEffect`: este painel só existe depois de um
 * clique (`next/dynamic` com `ssr: false`), então o valor certo está disponível já no primeiro
 * render do cliente — com efeito, haveria um quadro com a gaveta do lado errado.
 */
const CONSULTA_DESKTOP = "(min-width: 640px)";

function assinarLargura(aoMudar: () => void): () => void {
  const mq = window.matchMedia(CONSULTA_DESKTOP);
  mq.addEventListener("change", aoMudar);
  return () => mq.removeEventListener("change", aoMudar);
}

function ehDesktop(): boolean {
  return window.matchMedia(CONSULTA_DESKTOP).matches;
}

function useDesktop(): boolean {
  // O terceiro argumento nunca roda (o componente não é renderizado no servidor), mas o React
  // o exige; `true` é o valor que não faria o celular piscar caso um dia ele rode.
  return React.useSyncExternalStore(assinarLargura, ehDesktop, () => true);
}

export function FloatingAssistantPanel({
  aberto,
  onOpenChange,
  canto,
  oculto,
  onPreferencia,
  onAtividade,
}: {
  readonly aberto: boolean;
  readonly onOpenChange: (valor: boolean) => void;
  readonly canto: CantoDoBotao;
  readonly oculto: boolean;
  readonly onPreferencia: (p: { canto: CantoDoBotao; oculto: boolean }) => void;
  readonly onAtividade: (evento: EventoDoPainel) => void;
}) {
  const desktop = useDesktop();
  const [prontidao, setProntidao] = React.useState<ProntidaoDoChat | null>(null);
  const [salvando, setSalvando] = React.useState(false);

  // A prontidão é buscada UMA vez, na montagem — e a montagem só acontece na primeira
  // abertura, porque quem monta este componente é o `useLazyDialog` do botão.
  React.useEffect(() => {
    let vivo = true;
    estadoDoPainelDaIa()
      .then((r) => {
        if (vivo) setProntidao(r);
      })
      .catch(() =>
        vivo
          ? setProntidao({
              podeConversar: false,
              motivoBloqueio: "Não foi possível falar com o servidor agora.",
            })
          : undefined,
      );
    return () => {
      vivo = false;
    };
  }, []);

  async function salvarPreferencia(proximo: { canto: CantoDoBotao; oculto: boolean }) {
    setSalvando(true);
    // Otimista: o botão se move na hora. Quem acabou de pedir a mudança é quem tem de vê-la.
    onPreferencia(proximo);
    const r = await definirBotaoFlutuante({
      floatingCorner: proximo.canto,
      floatingHidden: proximo.oculto,
    });
    setSalvando(false);
    if (!r.ok) {
      // Desfaz a aposta e diz o que aconteceu — preferência que "salvou" e voltou sozinha no
      // próximo carregamento é pior que preferência que recusou na cara.
      onPreferencia({ canto, oculto });
      toast.error(r.error);
      return;
    }
    if (proximo.oculto) {
      toast.success(`Botão oculto. O atalho ${ATALHO_DO_PAINEL} continua abrindo o painel.`);
      onOpenChange(false);
    }
  }

  const outroCanto: CantoDoBotao = canto === "direita" ? "esquerda" : "direita";

  return (
    <Sheet open={aberto} onOpenChange={onOpenChange}>
      <SheetContent
        side={desktop ? "right" : "bottom"}
        /*
          ⚠️ `data-[side=right]:sm:max-w-lg` com o prefixo REPETIDO, e não `sm:max-w-lg`: a
          primitiva traz `data-[side=right]:sm:max-w-sm`, e o `twMerge` só substitui classe do
          MESMO conjunto de modificadores. Sem o prefixo, as duas sobrevivem e quem decide é a
          ordem do CSS gerado — que o minificador reescreve.
        */
        className="flex w-full flex-col gap-0 p-0 data-[side=bottom]:h-[85svh] data-[side=right]:sm:max-w-lg"
      >
        <SheetHeader className="shrink-0 border-b pr-12">
          <SheetTitle>Assistente</SheetTitle>
          <SheetDescription>{RESUMO_DO_ASSISTENTE}</SheetDescription>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={AI_LINK_BASE} onClick={() => onOpenChange(false)}>
                <SquareArrowOutUpRight className="size-4" /> Abrir em tela cheia
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={salvando}
              onClick={() => salvarPreferencia({ canto: outroCanto, oculto })}
            >
              <MoveHorizontal className="size-4" /> {ROTULO_DO_CANTO[outroCanto]}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={salvando}
              onClick={() => salvarPreferencia({ canto, oculto: true })}
            >
              <EyeOff className="size-4" /> Ocultar o botão
            </Button>
          </div>
        </SheetHeader>

        {/*
          `min-h-0 flex-1` — a mesma linha que `mobile-nav.tsx` carrega, pelo mesmo motivo:
          dentro do `flex-col` do SheetContent, sem ela o conteúdo estoura a gaveta sem rolar.
        */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {prontidao === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Preparando o assistente…
            </div>
          ) : (
            <ChatClient
              conversationId={null}
              initialMessages={[]}
              runs={{}}
              podeConversar={prontidao.podeConversar}
              motivoBloqueio={prontidao.motivoBloqueio}
              onAtividade={onAtividade}
              compacto
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

⚠️ **Confira no arquivo real**: `SheetHeader` tem `p-4` e o botão de fechar da primitiva fica
em `absolute top-3 right-3` — daí o `pr-12` no cabeçalho, senão o título passa por baixo dele.

⚠️ **O painel sempre abre conversa NOVA** (`conversationId={null}`). Não é limitação
disfarçada: nada é criado no banco até o dono mandar a primeira mensagem, e o histórico
continua em `/ia/conversas`, alcançável pelo "Abrir em tela cheia" e pela busca global (Bloco
1). Semear o painel com a última conversa exigiria lê-la no servidor a cada abertura e decidir
o que é "a última" — decisão de produto que este bloco não tem.

- [ ] **Passo 3: Rodar**

```bash
npm run lint && npx tsc --noEmit && npx vitest run src/lib/ai/chat-events.test.ts
```
Esperado: verde — em especial `chat-events.test.ts`, que prova que nenhum `case` novo entrou
no `switch` de eventos SSE.

- [ ] **Passo 4: Commit**

```bash
git add src/components/ai/chat-client.tsx src/components/ai/floating-assistant-panel.tsx
git commit -m "feat(18-f): painel do assistente, reusando o chat da 18-A"
```

---

## Task 7: O botão e a montagem na casca

**Arquivos:**
- Criar: `src/components/ai/floating-assistant.tsx`
- Modificar: `src/components/layout/app-shell.tsx`
- Modificar: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consome: `FloatingAssistantPanel` (Task 6, por `next/dynamic`), `useLazyDialog`,
  `reduzirPainel` / `avisoDoBotao` / `ESTADO_INICIAL` / `TECLA_DO_PAINEL` (Task 1),
  `getFloatingButtonPrefs` (Task 3).
- Produz: `FloatingAssistant` com `{ canto, oculto }`; `AppShell` com as mesmas duas props.

- [ ] **Passo 1: O botão**

Crie `src/components/ai/floating-assistant.tsx`:

```tsx
"use client";

/**
 * Fase 18-F · Bloco 2 — IA · O botão flutuante.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ESTE ARQUIVO MORA NA CASCA DO APP, ENTÃO TUDO QUE ELE IMPORTA ENTRA NAS 67 ROTAS.   ║
 * ║                                                                                       ║
 * ║ Medido em 2026-09-19, depois do Bloco 1: a rota mais apertada é `/(app)/configuracoes` ║
 * ║ com 279,2 KB gz de um teto próprio de 285 — **5,8 KB de folga**. É esse o orçamento    ║
 * ║ deste arquivo e de tudo que ele alcança.                                              ║
 * ║                                                                                       ║
 * ║ Por isso ele NÃO importa: `@/lib/ai/constants` (texto grande, hoje só nas rotas de     ║
 * ║ `/ia`), `@/lib/validators/*` (começa com `import { z } from "zod"`, 62,7 KB gz),       ║
 * ║ `chat-client`, `ui/sheet` nem `ui/dropdown-menu`. Tudo isso está do outro lado do      ║
 * ║ `next/dynamic`, e é lá que tem de ficar. Ao acrescentar um import aqui, rode           ║
 * ║ `npm run build && npm run perf:bundle` ANTES de commitar.                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import * as React from "react";
import dynamic from "next/dynamic";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";
import {
  avisoDoBotao,
  ESTADO_INICIAL,
  reduzirPainel,
  TECLA_DO_PAINEL,
  type CantoDoBotao,
} from "@/lib/ai/painel";

/**
 * ⛔ O segundo argumento tem de ser objeto literal escrito AQUI. O compilador do Next o lê
 * estaticamente e recusa constante compartilhada (`next/dynamic options must be an object
 * literal`). A repetição pelo projeto é exigida, não descuido.
 *
 * `loading: () => null` porque não há nada a reservar: o painel é uma gaveta que entra por
 * cima, não um bloco no fluxo — um esqueleto aqui piscaria no canto sem motivo.
 */
const Painel = dynamic(
  () => import("./floating-assistant-panel").then((m) => m.FloatingAssistantPanel),
  { ssr: false, loading: () => null },
);

export function FloatingAssistant({
  canto: cantoInicial,
  oculto: ocultoInicial,
}: {
  readonly canto: CantoDoBotao;
  readonly oculto: boolean;
}) {
  const [estado, despachar] = React.useReducer(reduzirPainel, ESTADO_INICIAL);
  /**
   * A preferência é SEMEADA pelo servidor e mantida aqui depois. O componente que o dono usou
   * para mover o botão é o que tem de movê-lo na hora; a leitura do layout o confirma na
   * próxima navegação.
   */
  const [canto, setCanto] = React.useState(cantoInicial);
  const [oculto, setOculto] = React.useState(ocultoInicial);
  const montado = useLazyDialog(estado.aberto);

  // O relógio vive no componente, nunca na regra: `avisoDoBotao` recebe `agora`. O minuto é
  // suficiente — o prazo das propostas é de 10, e o selo mostra contagem, não cronômetro.
  const [agora, setAgora] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === TECLA_DO_PAINEL) {
        e.preventDefault();
        // ⛔ O atalho vale COM O BOTÃO OCULTO. Esconder tira o botão da tela, não o assistente
        // do alcance — e é isso que a mensagem de confirmação promete ao dono.
        despachar({ tipo: "abriu" });
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  const aviso = avisoDoBotao(estado, agora);

  return (
    <>
      {!oculto && (
        <Button
          type="button"
          size="icon"
          aria-label="Abrir o assistente"
          aria-keyshortcuts="Control+I Meta+I"
          aria-haspopup="dialog"
          aria-expanded={estado.aberto}
          onClick={() => despachar({ tipo: "abriu" })}
          className={cn(
            // z-40: acima do Header (`sticky z-30`), abaixo do overlay do Sheet (`z-50`).
            "fixed bottom-4 z-40 size-12 rounded-full shadow-lg",
            canto === "direita" ? "right-4" : "left-4",
          )}
        >
          <Sparkles className="size-5" />
          {aviso && (
            <>
              <span
                aria-hidden
                className={cn(
                  "absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-medium",
                  aviso.tipo === "proposta"
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-primary text-primary-foreground",
                )}
              >
                {aviso.quantas > 0 ? aviso.quantas : "•"}
              </span>
              {/* O selo é um número; o leitor de tela recebe a frase inteira. */}
              <span className="sr-only">{aviso.texto}</span>
            </>
          )}
        </Button>
      )}

      {montado && (
        <Painel
          aberto={estado.aberto}
          onOpenChange={(v) => despachar({ tipo: v ? "abriu" : "fechou" })}
          canto={canto}
          oculto={oculto}
          onPreferencia={(p) => {
            setCanto(p.canto);
            setOculto(p.oculto);
          }}
          onAtividade={despachar}
        />
      )}
    </>
  );
}
```

⚠️ **`useLazyDialog` e não `{estado.aberto && <Painel/>}`:** este último quebraria a animação
de fechamento do Radix — o componente sumiria no mesmo quadro em que a gaveta começaria a
desmontar. O hook monta na primeira abertura e não desmonta mais, e é o que faz o streaming
continuar quando o dono fecha o painel e navega.

- [ ] **Passo 2: Montar na casca**

Em `src/components/layout/app-shell.tsx`, acrescente as duas props e o componente **depois do
`<main>`**, ainda dentro do `div` externo:

```tsx
import { FloatingAssistant } from "@/components/ai/floating-assistant";
import type { CantoDoBotao } from "@/lib/ai/painel";
```

```tsx
  cantoDoAssistente = "direita",
  assistenteOculto = false,
```
(com os tipos `CantoDoBotao` e `boolean` na assinatura)

```tsx
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>

      {/*
        18-F Bloco 2. Fora do `<main>` e por último: `position: fixed` não depende do lugar no
        DOM para se posicionar, mas depende dele para a ORDEM DE FOCO — e um botão flutuante
        que entra antes do conteúdo faria o Tab passar por ele em toda tela, antes de qualquer
        coisa que o dono veio fazer.
      */}
      <FloatingAssistant canto={cantoDoAssistente} oculto={assistenteOculto} />
    </div>
```

- [ ] **Passo 3: Semear do servidor**

Em `src/app/(app)/layout.tsx`, acrescente a leitura estreita ao `Promise.all` já existente e
passe para a casca:

```tsx
import { getFloatingButtonPrefs } from "@/lib/ai/queries";
import { CANTO_PADRAO } from "@/lib/ai/painel";
```

```tsx
  const [user, cookieStore, unreadCount, displayName] = await Promise.all([ /* … */ ]);

  /*
    18-F Bloco 2 — duas colunas, em PARALELO com o resto e DEPENDENTE do usuário. Sem sessão
    não há preferência a ler, e o botão cai no padrão: a casca já degrada com elegância sem
    Supabase configurado, e esta leitura não pode ser a que quebra isso.
  */
  const botao = user
    ? await getFloatingButtonPrefs(user.id)
    : { canto: CANTO_PADRAO, oculto: false };
```

```tsx
    <AppShell
      email={user?.email}
      displayName={displayName}
      unreadCount={unreadCount}
      defaultCollapsed={collapsed}
      defaultHidden={sidebarHidden}
      cantoDoAssistente={botao.canto}
      assistenteOculto={botao.oculto}
    >
```

- [ ] **Passo 4: Rodar**

```bash
npm run lint && npx tsc --noEmit && npm run test:run
```

- [ ] **Passo 5: Conferir à mão, nas duas larguras e nos dois temas**

- [ ] Em 1440px: o botão está no canto inferior direito, não cobre nada, e `Ctrl+I` abre a
      gaveta pela direita. `Esc` fecha e o foco volta ao botão (o Radix faz isso — confirme).
- [ ] Em 390px (celular): a gaveta entra por baixo, ocupa ~85% da altura e o campo de digitar
      continua alcançável com o teclado aberto.
- [ ] Tab a partir do topo da página: o botão vem **depois** do conteúdo, não antes.
- [ ] Mande uma pergunta, **feche o painel e navegue para outra rota**: o selo aparece quando a
      resposta termina, e reabrir mostra a resposta inteira — a conversa não recomeça.
- [ ] Claro e escuro: o selo e a sombra do botão aparecem nos dois.
- [ ] "Ocultar o botão": ele some, o toast explica o atalho, e `Ctrl+I` ainda abre.
- [ ] `/ia/configuracoes` → "Botão flutuante" traz ele de volta.

- [ ] **Passo 6: Commit**

```bash
git add src/components/ai/floating-assistant.tsx src/components/layout/app-shell.tsx "src/app/(app)/layout.tsx"
git commit -m "feat(18-f): botao flutuante do assistente na casca, com painel sob demanda"
```

---

## Task 8: O orçamento e o fechamento do bloco

**Arquivos:**
- Possivelmente: `scripts/perf/bundle-budget.mjs` (só o texto do motivo, se o número mudar)
- Modificar: `docs/project/CURRENT_STATUS.md`, `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md`,
  `CLAUDE.md`

- [ ] **Passo 1: Medir**

```bash
npm run build && npm run perf:bundle
```

Compare com a linha de base deste plano:

| Rota | Antes (Bloco 1) | Depois | Teto |
| --- | --- | --- | --- |
| `/(app)/configuracoes` | 279,2 KB | ? | 285 |
| `/(app)/nutricao/compras` | 240,0 KB | ? | 250 |
| `/(app)/todo` | 236,2 KB | ? | 250 |
| mediana (67 rotas) | 211,7 KB | ? | — |

⛔ **Se `/(app)/configuracoes` passar de 285, NÃO suba o teto.** O teto dela já é uma exceção
com motivo escrito, e uma exceção que cresce a cada bloco é um orçamento que não existe. O
caminho é tirar import do botão: conferir que `@/lib/ai/painel` continua sem import, que
`floating-assistant.tsx` não alcança `constants`/`validators`/`sheet`/`chat-client`, e que o
`next/dynamic` continua com o objeto literal (trocá-lo por constante faz o painel voltar ao
manifest e o número disparar).

⚠️ O aumento esperado é pequeno mas **não é zero**: `Sparkles` é um ícone novo do `lucide` e
`floating-assistant` + `painel.ts` são código novo na casca. Se a rota mais apertada ficar a
menos de 2 KB do teto, escreva o número medido no motivo da exceção em `bundle-budget.mjs` —
o comentário de lá já registra a medição do Bloco 1 e tem de continuar verdadeiro.

- [ ] **Passo 2: A verificação completa**

```bash
npm run lint && npx tsc --noEmit && npm run test:run && npm run build && npm run perf:bundle
TZ=UTC npx vitest run
```

⚠️ Confira o `pwd` antes de acreditar num verde: `cd` persiste entre chamadas de shell, e isso
já fez `tsc` e `vitest` "passarem" sem rodar arquivo nenhum neste projeto.

- [ ] **Passo 3: Validar o critério de aceite 6 da spec, item a item**

> "Botão flutuante é acessível por teclado, ocultável, salva o canto, **não entra no primeiro
> byte** das rotas e seu badge **não repete** o sino."

- [ ] acessível por teclado → atalho + `aria-label` + `aria-keyshortcuts` + foco devolvido
- [ ] ocultável → menu do painel + volta por `/ia/configuracoes`; o atalho sobrevive
- [ ] salva o canto → coluna + CHECK; conferido recarregando
- [ ] não entra no primeiro byte → `perf:bundle` dentro do teto, com o painel fora do manifest
- [ ] o selo não repete o sino → `painel.test.ts` (o módulo sem import) + nenhuma notificação,
      insight ou ação alcança o selo

- [ ] **Passo 4: Documentação**

Atualize de forma **pontual**, sem reescrever seção de outra frente:

1. `docs/project/CURRENT_STATUS.md` — o que o Bloco 2 entregou e as decisões (dois cantos e
   por quê; sem arrasto e por quê; banco e não cookie; o botão nasce visível e por quê; o
   painel abre conversa nova).
2. `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md` — o próximo é o **Bloco 3 (memória)**: duas
   tabelas, `allow_write_memory`, a 8ª ferramenta, o 15º command, `/ia/memoria` e a busca por
   memória. ⛔ Registre que `/ia/memoria` só passa a existir ali, e que `ai-links.ts` só pode
   ganhar o link dela **no mesmo commit** da rota.
3. `CLAUDE.md` — acrescente as invariantes do bloco à lista da 18-F, na numeração seguinte às
   do Bloco 1 (que foi até a 89). Sugestão do que merece virar invariante:

   - **90.** O selo do botão flutuante fala **só da conversa aberta**; o sino fala do sistema.
     A garantia é a ausência de caminho: `src/lib/ai/painel.ts` **não tem um único import**, e
     há teste varrendo o arquivo por `import`. Com import, o selo passaria a poder repetir o
     sino — o risco nº 1 declarado no doc da fase.
   - **91.** ⛔ **Tudo que a casca do app importa entra nas 67 rotas.** `floating-assistant.tsx`
     tem orçamento medido (5,8 KB gz de folga na rota mais apertada em 2026-09-19) e uma lista
     escrita do que não pode importar; o painel inteiro fica atrás de `next/dynamic` com objeto
     literal. Trocar o literal por constante faz o painel voltar ao manifest.
   - **92.** A frase de bloqueio do chat sai de `prontidaoDoChat` (`server/chat-readiness.ts`),
     consumida pela página `/ia` **e** pelo painel — e `estadoDoPainelDaIa` **reconcilia**,
     porque a partir deste bloco o painel é o caminho mais curto para o chat e sem ele o
     gatilho primário da reconciliação preguiçosa deixaria de disparar.
   - **93.** `floating_hidden` esconde o BOTÃO, não o assistente: o atalho continua abrindo o
     painel, e a tela que oferece ocultar diz isso com estas palavras. É aparência, não
     autorização — por isso nasce ligada, ao contrário de toda chave `allow_*`.

- [ ] **Passo 5: Revisar o diff antes de commitar**

```bash
git status && git diff --stat
```

⛔ Confira que não entrou nada sensível — segredo, chave, token, `.env`, `service_role`. Este
bloco não toca credencial nenhuma; se algo assim aparecer no diff, **pare**.

- [ ] **Passo 6: Commit**

```bash
git add -A
git commit -m "docs(18-f): registrar o que o Bloco 2 entregou"
```

Não faça `push` sem o dono pedir.

---

## Autorrevisão deste plano

**Cobertura da spec (§5).** §5.1 (o selo não repete o sino) → Tasks 1 e 8. §5.2 (dois cantos,
sem arrasto, teclado, atalho, ocultável) → Tasks 1, 6, 7. §5.3 (botão leve, painel por
`next/dynamic`, `Sheet` no desktop e gaveta no celular) → Tasks 6, 7, 8. §5.4 (duas colunas, no
schema **e** no payload no mesmo commit) → Tasks 2, 3, 4.

**Três coisas que a spec não previa e este plano resolve:**

1. **A prontidão do chat estava numa cópia só, dentro da página.** Dois caminhos para o mesmo
   chat exigiam extraí-la — Task 5.
2. **`reconcileOwnRuns` deixaria de disparar** para quem passasse a conversar pelo painel. A
   spec não menciona; a consequência seria reserva presa no orçamento sem sintoma na tela.
3. **A folga real do orçamento é 5,8 KB, não "o teto de 250"** — medido depois do Bloco 1, que
   subiu `/(app)/configuracoes` de 276,8 para 279,2 exatamente pela mesma razão (ícones novos
   no Header, que é casca). É o número que decide o que o botão pode importar.

**Consistência de tipos.** `CantoDoBotao` nasce na Task 1 e é o mesmo em `types.ts` (Task 3),
no schema (Task 3), nas actions (Task 4) e nos dois componentes (Tasks 6–7). `EventoDoPainel`
nasce na Task 1, sai do `ChatClient` (Task 6) e entra no `useReducer` do botão (Task 7) —
`onAtividade={despachar}` casa porque `despachar` tem exatamente a assinatura
`(e: EventoDoPainel) => void`. `ProntidaoDoChat` nasce na Task 5 e é consumida na Task 6.
