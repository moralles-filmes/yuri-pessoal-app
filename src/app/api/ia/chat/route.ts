/**
 * Fase 18-A — IA · `POST /api/ia/chat`. **TRANSPORTE APENAS.**
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A SEGUNDA EXCEÇÃO ARQUITETURAL DO PROJETO (a primeira foi o auth).                    ║
 * ║                                                                                       ║
 * ║ Todo o resto do sistema muta por Server Action. Este é um Route Handler porque Server ║
 * ║ Action não serve para SSE contínuo — e só por isso. Ele NÃO tem regra de negócio:     ║
 * ║ valida o transporte, chama `runChat` e traduz eventos em linhas SSE.                  ║
 * ║                                                                                       ║
 * ║ ⚠️ ISSO NÃO AUTORIZA CRIAR OUTROS ENDPOINTS.                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ═══════════════════════ POR QUE CHECAR ORIGIN À MÃO ═══════════════════════
 *
 * Route Handler **não herda** a proteção CSRF que o Next dá a Server Action. Sem a checagem
 * abaixo, qualquer página na internet poderia disparar `fetch('/api/ia/chat')` com os
 * cookies do usuário e gastar o orçamento dele. `Sec-Fetch-Site` cobre os navegadores
 * modernos; `Origin` cobre o resto.
 */

import { NextResponse } from "next/server";
import { authContext } from "@/lib/actions/helpers";
import {
  chatExperienciaSchema,
  chatMensagemSchema,
  chatRequestSchema,
  contextoDaRota,
  MAX_CHAT_BODY_BYTES,
  MAX_CHAT_TEXT,
} from "@/lib/validators/ai";
import { runChat, type ChatRunnerEvent } from "@/lib/ai/server/chat-runner";
import {
  AI_EXPERIENCE_WITHOUT_DATA,
  runExperience,
} from "@/lib/ai/server/experience-runner";
import {
  AI_CRYPTO_NOT_CONFIGURED,
  getCryptoReadiness,
} from "@/lib/ai/server/crypto-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Menor que o `maxDuration` da plataforma, para o encerramento ser NOSSO. */
export const maxDuration = 60;

/** Status HTTP por código de erro do runner. Tradução, não decisão. */
const STATUS_POR_CODIGO: Record<string, number> = {
  AI_NOT_AUTHENTICATED: 401,
  AI_MESSAGE_EMPTY: 400,
  AI_MESSAGE_TOO_LONG: 413,
  AI_AGENT_NOT_ALLOWED: 400,
  AI_CONVERSATION_NOT_AVAILABLE: 404,
  AI_PROVIDER_NOT_AVAILABLE: 409,
  AI_CREDENTIAL_NOT_AVAILABLE: 409,
  AI_MODEL_NOT_AVAILABLE: 409,
  AI_RATE_LIMITED: 429,
  AI_ADMISSION_BUSY: 429,
  AI_BUDGET_EXCEEDED_DAILY: 402,
  AI_BUDGET_EXCEEDED_MONTHLY: 402,
  // 18-F Bloco 4 — os três do panorama. `NOT_AVAILABLE` é pedido que o sistema não atende
  // (400); os outros dois são estado do dono que ele pode mudar em Configurações (409).
  AI_EXPERIENCE_NOT_AVAILABLE: 400,
  AI_CROSS_MODULE_NOT_ALLOWED: 409,
  [AI_EXPERIENCE_WITHOUT_DATA]: 409,
  [AI_CRYPTO_NOT_CONFIGURED]: 503,
};

/**
 * A mensagem de validação que o USUÁRIO vai ler, sempre em pt-BR.
 *
 * ⚠️ O `error` desta resposta não fica no log: `chat-client.tsx` o joga direto num `toast`.
 * O Zod escreve em inglês por padrão, então `issues[0].message` só serve quando o schema
 * definiu a mensagem — e `chatRequestSchema` define uma para cada campo.
 *
 * Sobram os dois códigos que o schema NÃO consegue traduzir e que dependem só da forma do
 * JSON, nunca de um campo nosso:
 *  - `unrecognized_keys` — `.strict()` do Zod 4.4 ignora o `error` passado a ele (conferido);
 *  - `invalid_type` — JSON com o tipo errado (`text: 123`), que nenhum `.min()` alcança.
 *
 * Nenhum dos dois ecoa o valor recusado: chave e conteúdo vieram do cliente, e devolvê-los
 * é refletir entrada não confiável de volta na tela sem necessidade nenhuma.
 */
function mensagemEmPortugues(issue: { code: string; message: string } | undefined): string {
  if (!issue) return "Requisição inválida.";
  if (issue.code === "unrecognized_keys") {
    return "O pedido trouxe um campo que o servidor não aceita.";
  }
  if (issue.code === "invalid_type") return "Pedido em formato inválido.";
  /**
   * 18-F Bloco 4 — o topo da UNIÃO, quando nem `problemasDoRamo` conseguiu escolher um lado
   * (corpo vazio, por exemplo). Ele não ecoa nada do que o cliente mandou.
   */
  if (issue.code === "invalid_union") {
    return "O pedido não corresponde a uma mensagem nem a um panorama.";
  }
  return issue.message;
}

type ProblemaDeValidacao = { code: string; message: string; path: readonly PropertyKey[] };

/**
 * Os problemas do RAMO que o cliente tentou usar.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⚠️ `chatRequestSchema` é uma UNIÃO, e o Zod reporta `invalid_union` no TOPO quando     ║
 * ║ nenhuma das duas formas casou — as mensagens de dentro de cada ramo não sobem. Só que ║
 * ║ são justamente elas que o dono precisa ler ("Página de contexto não reconhecida."), e  ║
 * ║ é o `code` delas que decide entre 400 e 413.                                          ║
 * ║                                                                                       ║
 * ║ ⛔ ISTO NÃO É UMA TERCEIRA FORMA DE VALIDAR. Quem ACEITA continua sendo a união, e as  ║
 * ║ duas formas continuam `.strict()`: um corpo com `experiencia` E `text` é recusado      ║
 * ║ pelos dois caminhos, porque schema nenhum deste repositório aceita os dois juntos. A   ║
 * ║ escolha abaixo decide só a MENSAGEM e o status.                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
function problemasDoRamo(
  json: unknown,
  doTopo: readonly ProblemaDeValidacao[],
): readonly ProblemaDeValidacao[] {
  const ehPanorama =
    typeof json === "object" && json !== null && "experiencia" in json;
  const ramo = ehPanorama ? chatExperienciaSchema : chatMensagemSchema;
  const r = ramo.safeParse(json);
  // Ramo que PASSA sozinho e união que falha não é estado alcançável (a união tenta os dois),
  // mas devolver o problema do topo é o fallback honesto se um dia for.
  return r.success ? doTopo : r.error.issues;
}

export async function POST(request: Request) {
  // ── 1. Sessão. `user_id` SÓ daqui — nunca do corpo ─────────────────────────────────
  const ctx = await authContext();
  if (!ctx) {
    return NextResponse.json(
      { error: "Sessão expirada. Faça login novamente.", code: "AI_NOT_AUTHENTICATED" },
      { status: 401 },
    );
  }

  // ── 2. CSRF explícito ──────────────────────────────────────────────────────────────
  const csrf = verificarOrigem(request);
  if (!csrf.ok) {
    return NextResponse.json(
      { error: "Origem não autorizada.", code: "AI_BAD_ORIGIN" },
      { status: 403 },
    );
  }

  // ── 3. Limite do CORPO, antes de ler o JSON ────────────────────────────────────────
  const declarado = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declarado) && declarado > MAX_CHAT_BODY_BYTES) {
    return NextResponse.json(
      { error: "Corpo da requisição grande demais.", code: "AI_BODY_TOO_LARGE" },
      { status: 413 },
    );
  }

  const bruto = await request.text();
  // `content-length` pode mentir ou faltar. Medir o que chegou de fato é o que vale.
  if (Buffer.byteLength(bruto, "utf8") > MAX_CHAT_BODY_BYTES) {
    return NextResponse.json(
      { error: "Corpo da requisição grande demais.", code: "AI_BODY_TOO_LARGE" },
      { status: 413 },
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(bruto);
  } catch {
    return NextResponse.json(
      { error: "Corpo inválido.", code: "AI_BAD_BODY" },
      { status: 400 },
    );
  }

  // ── 4. Zod `.strict()`: campo a mais é 400 ─────────────────────────────────────────
  // `user_id`, `owner_id`, `attachments`, `image`, `file` e `document` caem aqui — sem
  // lista de proibidos, que alguém esqueceria de atualizar. Anexo é 18-D.
  const parsed = chatRequestSchema.safeParse(json);
  if (!parsed.success) {
    const primeiro = problemasDoRamo(json, parsed.error.issues)[0];
    const tamanho =
      primeiro?.code === "too_big" && primeiro.path[0] === "text" ? 413 : 400;
    return NextResponse.json(
      {
        error: mensagemEmPortugues(primeiro),
        code: tamanho === 413 ? "AI_MESSAGE_TOO_LONG" : "AI_BAD_REQUEST",
        limite: tamanho === 413 ? MAX_CHAT_TEXT : undefined,
      },
      { status: tamanho },
    );
  }

  // ── 5. Cripto pronta? ──────────────────────────────────────────────────────────────
  const readiness = getCryptoReadiness();
  if (!readiness.ready) {
    return NextResponse.json(
      { error: readiness.message, code: AI_CRYPTO_NOT_CONFIGURED },
      { status: 503 },
    );
  }

  // ── 6. Streaming ───────────────────────────────────────────────────────────────────
  //
  // O PRIMEIRO evento do runner decide o formato da resposta: se for `error`, ainda dá
  // tempo de devolver um JSON com status HTTP correto (que a tela sabe tratar). A partir do
  // `start`, a resposta vira SSE e todo erro viaja como evento — cabeçalho já foi enviado.
  //
  // ⚠️ 18-F Bloco 4 — A ESCOLHA ABAIXO É DE TRANSPORTE: qual gerador consumir. Nenhuma
  // decisão de negócio mora aqui — quem sabe o que é uma experiência é `experience-runner.ts`
  // (catálogo, chaves, recusa antes de gastar) e quem sabe o que é uma mensagem é
  // `chat-runner.ts`. Isto continua NÃO autorizando um segundo endpoint.
  const corpo = parsed.data;
  const iterador = (
    "experiencia" in corpo
      ? runExperience({
          userId: ctx.userId,
          experiencia: corpo.experiencia,
          providerPreference: corpo.providerPreference ?? null,
          modelPreference: corpo.modelPreference ?? null,
          abortSignal: request.signal,
          agora: new Date(),
        })
      : runChat({
          userId: ctx.userId,
          conversationId: corpo.conversationId ?? null,
          text: corpo.text,
          // ⚠️ PREFERÊNCIA, não decisão: quem escolhe o agente é `routeAgent`, no servidor,
          // com as flags `allow_*` do usuário na mão. `null` (o caso de hoje — a tela não
          // manda o campo) é "não pedi nenhum", diferente de "pedi o orquestrador".
          agentId: corpo.agentId ?? null,
          // ⚠️ Do contexto da página, SÓ A ROTA atravessa o transporte — e ela vem de uma
          // lista estática, não de texto da tela. O MÓDULO é resolvido aqui, no servidor: é
          // ele que decide o agente e, por tabela, a allowlist de ferramentas. Se a tela
          // pudesse declará-lo, o cliente escolheria o que a IA pode ler.
          pageContext: corpo.pageContext ? contextoDaRota(corpo.pageContext.rota) : null,
          providerPreference: corpo.providerPreference ?? null,
          modelPreference: corpo.modelPreference ?? null,
          abortSignal: request.signal,
          agora: new Date(),
          caixaDeEntrada: corpo.caixaDeEntrada === true,
        })
  )[Symbol.asyncIterator]();

  const primeiro = await iterador.next();

  if (primeiro.done) {
    return NextResponse.json(
      { error: "Não foi possível iniciar a resposta.", code: "AI_UNKNOWN" },
      { status: 500 },
    );
  }

  if (primeiro.value.type === "error") {
    const evento = primeiro.value;
    const status = STATUS_POR_CODIGO[evento.code] ?? 500;
    const headers: Record<string, string> = {};
    if (evento.retryAfterSeconds) {
      headers["Retry-After"] = String(evento.retryAfterSeconds);
    }
    return NextResponse.json(
      { error: evento.message, code: evento.code },
      { status, headers },
    );
  }

  const encoder = new TextEncoder();
  const primeiroEvento = primeiro.value;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enviar = (evento: ChatRunnerEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(evento)}\n\n`));
      };

      try {
        enviar(primeiroEvento);
        for (;;) {
          const passo = await iterador.next();
          if (passo.done) break;
          enviar(passo.value);
        }
      } catch {
        // O runner já fechou o run no `finally` dele. Aqui só avisamos o navegador.
        enviar({
          type: "error",
          code: "AI_STREAM_FAILED",
          message: "A resposta foi interrompida.",
        });
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },

    async cancel() {
      // O navegador fechou a aba. `return()` faz o `finally` do runner rodar, e ele fecha
      // o run como cancelado — a reserva não fica presa esperando a reconciliação.
      await iterador.return?.(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Desliga o buffer de proxies que engoliriam o streaming.
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * `Sec-Fetch-Site` primeiro (é o sinal forte, o navegador não deixa forjar), `Origin`
 * depois. Requisição sem nenhum dos dois é recusada: no fluxo real da aplicação sempre
 * existe um deles, e aceitar a ausência transformaria a checagem em decoração.
 */
function verificarOrigem(request: Request): { ok: boolean } {
  const site = request.headers.get("sec-fetch-site");
  if (site) return { ok: site === "same-origin" || site === "same-site" };

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return { ok: false };

  try {
    return { ok: new URL(origin).host === host };
  } catch {
    return { ok: false };
  }
}
