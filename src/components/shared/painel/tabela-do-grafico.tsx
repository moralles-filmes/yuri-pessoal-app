import type { LeituraDoGrafico } from "@/lib/painel/leitura-dos-graficos";
import { ValorComOlho } from "./valor-com-olho";

/**
 * Leitura textual do gráfico (C5.2): a mesma informação em tabela visualmente oculta, para quem
 * usa leitor de tela. Mora na FACHADA do gráfico, então sai no HTML do servidor — sem `recharts`
 * e sem estado. Valor nulo é "sem registro", nunca zero.
 */
export function TabelaDoGrafico({
  titulo,
  leitura,
}: {
  titulo: string;
  leitura: LeituraDoGrafico;
}) {
  if (leitura === null) return null;

  return (
    <table className="sr-only">
      <caption>{titulo}</caption>
      <thead>
        <tr>
          {leitura.colunas.map((coluna, i) => (
            <th key={i} scope="col">
              {coluna}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {leitura.linhas.map((linha, i) => (
          <tr key={i}>
            <th scope="row">{linha.rotulo}</th>
            {linha.valores.map((valor, j) => (
              <td key={j}>{valor === null ? "sem registro" : <ValorComOlho texto={valor} />}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
