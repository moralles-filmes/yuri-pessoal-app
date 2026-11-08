"use client";

/**
 * Tela única dos limites de erro do Next (03-G, L3).
 *
 * Nenhuma mensagem do `error` é exibida: em produção só chega o `digest`, e
 * em desenvolvimento a mensagem poderia trazer texto vindo do banco. O
 * `digest` é o único identificador mostrado, para casar com o log do servidor.
 *
 * Deliberadamente mínima: este arquivo entra no JS de todas as rotas (D-G15), uma
 * cópia por limite. Por isso não há ícone e o botão é nativo, com as classes da
 * variante padrão do `Button`: importar o `Button` trazia o `cva` e todas as
 * variantes para cada limite — medido em +4,4 KB gz em todas as 68 rotas.
 */
export function TelaDeErro({
  digest,
  aoTentar,
}: {
  digest?: string;
  aoTentar: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-dashed px-6 py-16 text-center"
    >
      <h2 className="font-semibold">Não foi possível ler os dados desta tela.</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">Nada foi alterado.</p>
      <button
        type="button"
        onClick={aoTentar}
        className="mt-5 h-8 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
      >
        Tentar de novo
      </button>
      {digest && <p className="mt-4 text-xs text-muted-foreground">Código: {digest}</p>}
    </div>
  );
}

/**
 * O limite de erro inteiro — o que os três limites exportam: `(app)/error.tsx` e
 * `(app)/financeiro/error.tsx` REEXPORTAM este componente; o `global-error` o embrulha em
 * `<html>`/`<body>`.
 *
 * ⚠️ BUNDLE (D-G15, decisão do dono em 2026-10-25). O Turbopack põe uma cópia deste módulo em
 * CADA limite (~0,6 KB gz cada), e toda rota do app carrega todos os que estão acima dela. Com
 * quatro limites e um `useEffect` de log, a mediana subia +2,2 KB contra um teto de 1,5. Por isso:
 * - não há `src/app/error.tsx` — a falha do `(app)/layout.tsx` cai no `global-error` (tema
 *   claro, sem a casca);
 * - não há log no cliente — o servidor já registra o erro com o MESMO `digest` que a tela mostra.
 * Limite novo ou import novo aqui custa em TODAS as rotas: meça antes (`npm run perf:bundle`).
 */
export function LimiteDeErro({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl py-6">
      <TelaDeErro digest={error.digest} aoTentar={unstable_retry} />
    </div>
  );
}
