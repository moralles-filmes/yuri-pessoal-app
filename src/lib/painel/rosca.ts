/**
 * 06, D15 — "Outros" na rosca de categorias. PURO: sem I/O, sem `recharts`, sem `Date`.
 *
 * Acima de `maximo` fatias, as `maximo − 1` maiores ficam e as demais viram UMA fatia
 * "Outros (N categorias)" com a soma em centavos (Σ entrada = Σ saída, sem perder centavo) e a
 * lista dos nomes dobrados. Empate pelo nome (pt-BR) decide a fronteira, para a rosca não trocar
 * de fatia a cada recarregar. Quem chama passa as fatias já filtradas por `dadosDaRosca`.
 */
import type { CategoriaSlice } from "@/lib/finance/dashboard";
import { centavosParaReais, reaisParaCentavos } from "@/lib/format";

export type FatiaDaRosca = CategoriaSlice & { dobradas?: string[] };

const porMinhaParteEmpateNome = (a: CategoriaSlice, b: CategoriaSlice) =>
  reaisParaCentavos(b.meu) - reaisParaCentavos(a.meu) ||
  a.name.localeCompare(b.name, "pt-BR") ||
  (a.categoryId ?? "").localeCompare(b.categoryId ?? "", "pt-BR");

export function dobrarEmOutros(fatias: readonly CategoriaSlice[], maximo = 8): FatiaDaRosca[] {
  const ordenadas = [...fatias].sort(porMinhaParteEmpateNome);
  if (ordenadas.length <= maximo) return ordenadas;

  const mantidas = ordenadas.slice(0, maximo - 1);
  const dobradas = ordenadas.slice(maximo - 1);

  const somaCentavos = (campo: "movimentado" | "meu") =>
    centavosParaReais(dobradas.reduce((s, f) => s + reaisParaCentavos(f[campo]), 0));

  const outros: FatiaDaRosca = {
    categoryId: null,
    name: `Outros (${dobradas.length} categorias)`,
    color: null,
    movimentado: somaCentavos("movimentado"),
    meu: somaCentavos("meu"),
    dobradas: dobradas.map((f) => f.name),
  };
  return [...mantidas, outros];
}
