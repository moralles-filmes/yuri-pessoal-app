import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

/**
 * REDESIGN-07-B — o que alguém desfaria sem perceber em Hábitos e Estudos. Uma linha por
 * contrato: arquivo × padrão exigido × por quê (molde `CONTRATOS` da 07-A). Lê o código, não o
 * renderiza (invariante 25: o projeto não tem teste de componente); comentários saem antes.
 */
const SRC = path.resolve(__dirname, "..");

type Contrato = { arquivo: string; exige: RegExp; porque: string };

export const CONTRATOS: Contrato[] = [
  // H3 — alternâncias anunciam o estado
  { arquivo: "app/(app)/habitos/habit-form.tsx", exige: /aria-pressed=\{active\}/, porque: "dia da semana anuncia se está marcado" },
  { arquivo: "app/(app)/habitos/habit-form.tsx", exige: /aria-label=\{d\.nome\}/, porque: "dia da semana é lido por extenso, não \"S\" ambíguo" },
  { arquivo: "app/(app)/habitos/habit-form.tsx", exige: /role="group"\s+aria-labelledby="habit-form-dias"/, porque: "os dias formam um grupo com nome" },
  { arquivo: "app/(app)/habitos/habit-form.tsx", exige: /aria-pressed=\{!field\.value\}/, porque: "\"cor da categoria\" anuncia quando está escolhida" },
  { arquivo: "app/(app)/habitos/habit-form.tsx", exige: /aria-pressed=\{field\.value === c\}/, porque: "cor escolhida é anunciada" },
  { arquivo: "app/(app)/habitos/habit-form.tsx", exige: /focus-visible:ring-3/, porque: "foco visível nos dias (o outline: auto do navegador não aparece no headless)" },
  { arquivo: "app/(app)/habitos/habit-form.tsx", exige: /focus-visible:outline-solid/, porque: "Tailwind v4: sem outline-solid o contorno de foco da amostra não existe" },
  { arquivo: "app/(app)/estudos/course-form.tsx", exige: /aria-pressed=\{!field\.value\}/, porque: "\"sem cor própria\" anuncia quando está escolhida" },
  { arquivo: "app/(app)/estudos/course-form.tsx", exige: /aria-pressed=\{field\.value === c\}/, porque: "cor escolhida é anunciada" },
  { arquivo: "app/(app)/estudos/course-form.tsx", exige: /focus-visible:outline-solid/, porque: "Tailwind v4: sem outline-solid o contorno de foco da amostra não existe" },
  { arquivo: "components/studies/vocabulary-view.tsx", exige: /aria-pressed=\{filter === f\}/, porque: "filtro de domínio anuncia o ativo" },
  { arquivo: "app/(app)/habitos/habits-client.tsx", exige: /`Desativar \$\{h\.name\}`/, porque: "o botão Power diz o que faz e a quem" },
  // D2 — heatmap e semana da água sem depender de cor
  { arquivo: "components/habits/habit-heatmap.tsx", exige: /<ol\s+aria-label="Consistência diária das últimas 15 semanas"/, porque: "a grade do heatmap é uma lista com nome" },
  { arquivo: "components/habits/habit-heatmap.tsx", exige: /<span className="sr-only">\{textoDaCelula\(cell, hoje\)\}<\/span>/, porque: "cada célula diz o estado em texto, não só em cor" },
  { arquivo: "components/habits/habit-heatmap.tsx", exige: /aria-current=\{eHoje \? "date" : undefined\}/, porque: "hoje no heatmap é anunciado" },
  { arquivo: "components/habits/habit-heatmap.tsx", exige: /const eHoje = ehHoje\(cell\.date, hoje\)/, porque: "hoje é o todayIso do servidor, não a última célula" },
  { arquivo: "components/habits/habit-heatmap.tsx", exige: /cell\.scheduled === 0 \? SEM_HABITOS/, porque: "sem hábito agendado tem forma própria (tracejado): ausência não é 0%" },
  { arquivo: "components/habits/habit-heatmap.tsx", exige: /<ul\s+aria-label="Legenda"/, porque: "a legenda tem rótulos visíveis" },
  { arquivo: "components/habits/water-view.tsx", exige: /<ol\s+aria-label="Últimos 7 dias"/, porque: "a semana da água é uma lista com nome" },
  { arquivo: "components/habits/water-view.tsx", exige: /aria-current=\{eHoje \? "date" : undefined\}/, porque: "hoje na semana da água é anunciado" },
  { arquivo: "components/habits/water-view.tsx", exige: /const texto = textoDoDiaDaAgua\(d, hoje,/, porque: "cada dia diz valor, meta e se bateu, em texto" },
  { arquivo: "components/habits/water-view.tsx", exige: /<span className="sr-only">\s*\{texto\}\s*<\/span>/, porque: "o texto do dia chega ao leitor de tela, não só ao title" },
  { arquivo: "components/habits/water-view.tsx", exige: /\{d\.done && <Check\b/, porque: "meta batida tem ícone, não só cor" },
  // D1 — o hábito que reflete os treinos se identifica
  { arquivo: "app/(app)/habitos/page.tsx", exige: /getTrainingPreferences\(\)/, porque: "a página lê qual hábito está vinculado aos Treinos (só leitura)" },
  { arquivo: "app/(app)/habitos/page.tsx", exige: /habitoVinculadoId=\{treinos\.habitId\}/, porque: "o vínculo chega à tela" },
  { arquivo: "components/habits/habit-card.tsx", exige: /refleteOsTreinos\(habit\.id, habitoVinculadoId\)/, porque: "o cartão de Hoje decide pela regra pura" },
  { arquivo: "components/habits/habit-card.tsx", exige: /\{reflete && <AvisoReflexoDosTreinos \/>\}/, porque: "o cartão de Hoje diz o que o vínculo faz ao registro manual" },
  { arquivo: "components/habits/water-view.tsx", exige: /\{reflete && <AvisoReflexoDosTreinos \/>\}/, porque: "o cartão da água diz o que o vínculo faz ao registro manual" },
  { arquivo: "components/habits/session-view.tsx", exige: /\{reflete && <AvisoReflexoDosTreinos \/>\}/, porque: "o cartão de sessão diz o que o vínculo faz ao registro manual" },
  { arquivo: "app/(app)/habitos/habits-client.tsx", exige: /refleteOsTreinos\(h\.id, habitoVinculadoId\) && <SeloReflexoDosTreinos \/>/, porque: "em Gerenciar, o hábito vinculado tem o selo" },
  { arquivo: "components/habits/vinculo-treinos.tsx", exige: /o valor marcado à mão é substituído/, porque: "a frase diz a sobrescrita" },
  { arquivo: "components/habits/vinculo-treinos.tsx", exige: /apagado \(com a observação\)/, porque: "a frase diz a exclusão, observação junto" },
  { arquivo: "components/habits/vinculo-treinos.tsx", exige: /href="\/treinos\/configuracoes"/, porque: "o caminho para desligar o vínculo está na frase" },
  // D3 — abas do curso
  { arquivo: "app/(app)/estudos/[id]/course-detail-client.tsx", exige: /<SeletorDeVisao\s+rotulo="Seções do curso"/, porque: "as abas do curso usam o seletor compartilhado (estado anunciado)" },
  // Alinhamento visual — Hábitos
  { arquivo: "app/(app)/habitos/habits-client.tsx", exige: /todays\.length === 0 \? \(\s*<EmptyState/, porque: "seção vazia de Hoje usa o EmptyState compartilhado" },
  { arquivo: "app/(app)/habitos/habits-client.tsx", exige: /<div className="min-w-0">\s*<p className="font-medium text-amber/, porque: "regra 2: a lista de esquecidos não empurra o ícone" },
  { arquivo: "components/habits/consistency-view.tsx", exige: /consistency\.ranking\.length === 0 \? \(\s*<EmptyState/, porque: "ranking vazio usa o EmptyState compartilhado" },
  { arquivo: "components/habits/badges.tsx", exige: /rotulo: string;/, porque: "a barra de progresso EXIGE nome (o TypeScript cobra cada uso)" },
  { arquivo: "components/habits/badges.tsx", exige: /role="progressbar"\s+aria-label=\{rotulo\}/, porque: "a barra de progresso tem nome acessível" },
  { arquivo: "components/habits/badges.tsx", exige: /<span className="sr-only">\{textoDaSequencia\(count\)\}<\/span>/, porque: "a chama diz \"dias seguidos\", não só o número" },
  { arquivo: "components/habits/habit-card.tsx", exige: /flex flex-wrap items-center justify-between gap-x-3 gap-y-0\.5/, porque: "a linha de valor quebra em vez de empurrar" },
  { arquivo: "components/habits/session-view.tsx", exige: /flex flex-wrap items-center justify-between gap-x-3 gap-y-0\.5/, porque: "a linha de valor quebra em vez de empurrar" },
  { arquivo: "components/habits/consistency-chart.tsx", exige: /<table className="sr-only">/, porque: "o gráfico tem alternativa textual na FACHADA (regra 1 do carregamento sob demanda)" },
  // Alinhamento visual — Estudos
  { arquivo: "app/(app)/estudos/studies-client.tsx", exige: /nextLessons\.length === 0 \? \(\s*<EmptyState/, porque: "\"próximas aulas\" vazio usa o EmptyState compartilhado" },
  { arquivo: "app/(app)/estudos/studies-client.tsx", exige: /overdue\.length === 0 \? \(\s*<EmptyState/, porque: "\"estudos atrasados\" vazio usa o EmptyState compartilhado" },
  { arquivo: "app/(app)/estudos/studies-client.tsx", exige: /inProgress\.length === 0 \? \(\s*<EmptyState/, porque: "\"progresso por curso\" vazio usa o EmptyState compartilhado" },
  { arquivo: "components/studies/practice-view.tsx", exige: /practice\.length === 0 \? \(\s*<EmptyState/, porque: "histórico de prática vazio usa o EmptyState compartilhado" },
  { arquivo: "components/studies/vocabulary-view.tsx", exige: /shown\.length === 0 \? \(\s*<EmptyState/, porque: "filtro de vocabulário sem termos usa o EmptyState compartilhado" },
  { arquivo: "components/studies/badges.tsx", exige: /rotulo: string;/, porque: "a barra de progresso EXIGE nome (o TypeScript cobra cada uso)" },
  { arquivo: "components/studies/badges.tsx", exige: /role="progressbar"\s+aria-label=\{rotulo\}/, porque: "a barra de progresso tem nome acessível" },
  { arquivo: "app/(app)/estudos/course-form.tsx", exige: /aria-label="Sem cor própria \(usa a cor de destaque\)"/, porque: "a amostra \"—\" diz o que acontece (o fallback é var(--primary), não a cor da categoria)" },
  { arquivo: "components/studies/evolution-chart.tsx", exige: /<table className="sr-only">/, porque: "o gráfico tem alternativa textual na FACHADA (regra 1 do carregamento sob demanda)" },
  // Alinhamento visual — Curso
  { arquivo: "app/(app)/estudos/[id]/course-detail-client.tsx", exige: /detail\.sessions\.length === 0 \? \(\s*<EmptyState/, porque: "sessões vazias do curso usam o EmptyState compartilhado" },
  { arquivo: "components/studies/course-tree.tsx", exige: /aria-label=\{`Concluir \$\{lesson\.title\}`\}/, porque: "o checkbox da aula diz QUAL aula (o estado já vem do aria-checked)" },
  // Exceção DECLARADA (critério da 07-A): dentro de uma lista, o vazio de módulo é dica em linha,
  // não seção. Se alguém o trocar por EmptyState, esta linha avisa que o critério mudou.
  { arquivo: "components/studies/course-tree.tsx", exige: /module\.lessons\.length === 0 \? \(\s*<p\b/, porque: "módulo sem aula continua dica em linha (critério da 07-A), não EmptyState" },
];

/** O que não pode VOLTAR. Mesma varredura, sentido contrário. */
export const PROIBIDOS: { arquivo: string; proibe: RegExp; porque: string }[] = [
  { arquivo: "components/habits/badges.tsx", proibe: /<Badge[^>]*style=\{\{\s*color/, porque: "D5: a cor da categoria fica no ponto; como texto ela reprova o contraste (20/20 no claro)" },
  { arquivo: "components/habits/consistency-chart-impl.tsx", proibe: /sr-only/, porque: "a alternativa textual não pode ir para o -impl: sairia do HTML do servidor" },
  { arquivo: "components/studies/badges.tsx", proibe: /<Badge[^>]*style=\{\{\s*color/, porque: "D5: a cor de status/prioridade/dificuldade/domínio fica no ponto; como texto reprova o contraste" },
  { arquivo: "components/studies/evolution-chart-impl.tsx", proibe: /sr-only/, porque: "a alternativa textual não pode ir para o -impl: sairia do HTML do servidor" },
  { arquivo: "app/(app)/estudos/course-form.tsx", proibe: /Cor padrão da categoria/, porque: "Estudos não tem cor padrão por categoria: a promessa era falsa" },
];

describe("07-B — contratos visuais de Hábitos e Estudos", () => {
  it.each(CONTRATOS)("$arquivo — $porque", ({ arquivo, exige }) => {
    const fonte = semComentarios(fs.readFileSync(path.join(SRC, arquivo), "utf8"));
    expect(fonte).toMatch(exige);
  });

  it.each(PROIBIDOS)("$arquivo NÃO — $porque", ({ arquivo, proibe }) => {
    const fonte = semComentarios(fs.readFileSync(path.join(SRC, arquivo), "utf8"));
    expect(fonte).not.toMatch(proibe);
  });
});
