/**
 * Saldo somado das contas cruas, com saldo nulo contando como zero — a conta que o card do
 * dashboard, o relatório, a página do dashboard financeiro e as duas telas de conta faziam cada
 * uma com o seu `reduce`. Recebe as contas CRUAS: devolver `saldo: number` de `lerFinanceiro`
 * obrigaria a inventar `0` para "não pedi contas".
 *
 * REDESIGN-03-B2 (A6).
 * Este módulo não importa nada: accounts-client.tsx é "use client", e importar
 * pipeline.ts arrastaria dashboard.ts para o bundle do cliente. O pipeline
 * reexporta esta função para preservar os chamadores existentes.
 */
export function saldoDasContas(contas: readonly { current_balance: number | null }[]): number {
  return contas.reduce((s, a) => s + (a.current_balance ?? 0), 0);
}
