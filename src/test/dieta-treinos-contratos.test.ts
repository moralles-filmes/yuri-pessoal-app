import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

/**
 * REDESIGN-07-C — o que alguém desfaria sem perceber em Dieta e Treinos. Uma linha por
 * contrato: arquivo × padrão exigido × por quê (molde `CONTRATOS` da 07-A/07-B). Lê o código,
 * não o renderiza (invariante 25: o projeto não tem teste de componente); comentários saem
 * antes.
 */
const SRC = path.resolve(__dirname, "..");

type Contrato = { arquivo: string; exige: RegExp; porque: string };

export const CONTRATOS: Contrato[] = [
  // D2 — os 13 que fechavam secos desenham o último item até o fim da animação
  { arquivo: "components/nutrition/food-detail-sheet.tsx", exige: /const food = useItemRetido\(foodAtual\);/, porque: "o detalhe do alimento não some num corte seco ao fechar" },
  { arquivo: "components/nutrition/measure-dialog.tsx", exige: /const food = useItemRetido\(foodAtual\);/, porque: "a medida não some quando o detalhe fecha junto" },
  { arquivo: "components/nutrition/recipe-detail-sheet.tsx", exige: /const recipe = useItemRetido\(recipeAtual\);/, porque: "o detalhe da receita não some num corte seco" },
  { arquivo: "components/nutrition/recipe-detail-sheet.tsx", exige: /const seen = recipeAtual\?\.id \?\? null;/, porque: "o escopo porção/total continua zerando pelo item ATUAL (reabrir a mesma receita nasce limpo)" },
  { arquivo: "components/nutrition/substitution-compare-dialog.tsx", exige: /const target = useItemRetido\(targetAtual\);/, porque: "a comparação não some num corte seco" },
  { arquivo: "components/nutrition/substitution-compare-dialog.tsx", exige: /const seen = targetAtual\?\.originalLabel \?\? null;/, porque: "a escolha continua zerando pelo item ATUAL" },
  { arquivo: "components/training/workout-exercise-sheet.tsx", exige: /const item = useItemRetido\(itemAtual\);/, porque: "o exercício do treino-modelo não some num corte seco" },
  { arquivo: "components/training/session/substitute-sheet.tsx", exige: /const exercise = useItemRetido\(exerciseAtual\);/, porque: "a substituição na sessão não some num corte seco" },
  { arquivo: "components/training/session/substitute-sheet.tsx", exige: /\(exerciseAtual\?\.id \?\? null\) !== lastExerciseId/, porque: "o formulário da substituição continua zerando pelo exercício ATUAL" },
  { arquivo: "app/(app)/nutricao/refeicoes/meal-templates-client.tsx", exige: /const detail = useItemRetido\(detailAtual\);/, porque: "a gaveta da refeição-modelo não desliza vazia ao fechar" },
  { arquivo: "app/(app)/nutricao/refeicoes/meal-templates-client.tsx", exige: /<Sheet open=\{detailAtual !== null\}/, porque: "quem decide abrir é o item atual, não o retido" },
  { arquivo: "app/(app)/treinos/calendario/calendar-client.tsx", exige: /const novaDataExibida = useItemRetido\(newDate\);/, porque: "o novo dia planejado não fecha num corte seco" },
  { arquivo: "app/(app)/treinos/calendario/calendar-client.tsx", exige: /const resultadoExibido = useItemRetido\(outcomeEntry\);/, porque: "o resultado do dia não fecha num corte seco" },
  { arquivo: "app/(app)/treinos/calendario/calendar-client.tsx", exige: /const gerarMontado = useLazyDialog\(generateOpen\);/, porque: "gerar a semana não fecha num corte seco" },
  { arquivo: "app/(app)/treinos/calendario/calendar-client.tsx", exige: /const duplicarMontado = useLazyDialog\(duplicateOpen\);/, porque: "duplicar a semana não fecha num corte seco" },
  { arquivo: "app/(app)/treinos/calendario/calendar-client.tsx", exige: /key=\{chaveNovo\}/, porque: "cada abertura nasce limpa, como quando era {x && <Dialog/>}" },
  { arquivo: "app/(app)/treinos/treinos/workouts-client.tsx", exige: /const exclusaoExibida = useItemRetido\(deleting\);/, porque: "a exclusão com destino não fecha num corte seco" },
  { arquivo: "app/(app)/treinos/treinos/workouts-client.tsx", exige: /key=\{chaveExclusao\}/, porque: "a escolha de destino nasce limpa a cada exclusão" },
  { arquivo: "app/(app)/treinos/programas/programs-client.tsx", exige: /const exclusaoExibida = useItemRetido\(deleting\);/, porque: "a exclusão com destino não fecha num corte seco" },
  { arquivo: "app/(app)/treinos/programas/programs-client.tsx", exige: /key=\{chaveExclusao\}/, porque: "a escolha de destino nasce limpa a cada exclusão" },

  // D3 — alternâncias soltas (fora do alcance da V1: sem .map, ou com outra assinatura visual)
  { arquivo: "app/(app)/nutricao/compras/shopping-client.tsx", exige: /aria-pressed=\{aba === "lista"\}/, porque: "a aba Lista anuncia se está escolhida" },
  { arquivo: "app/(app)/nutricao/compras/shopping-client.tsx", exige: /aria-pressed=\{aba === "despensa"\}/, porque: "a aba Despensa anuncia se está escolhida" },
  { arquivo: "app/(app)/nutricao/compras/shopping-client.tsx", exige: /aria-pressed=\{reordering\}/, porque: "\"Reordenar\" anuncia se está ligado" },
  { arquivo: "app/(app)/nutricao/metas/goals-client.tsx", exige: /aria-current=\{selected\?\.id === period\.id \? "true" : undefined\}/, porque: "o período selecionado das metas é anunciado" },
  { arquivo: "app/(app)/nutricao/planejamento/model-days-sheet.tsx", exige: /aria-pressed=\{weekIndex === index\}/, porque: "\"Semana N\" do modelo anuncia a escolhida (Array.from, fora da V1)" },
  { arquivo: "app/(app)/nutricao/receitas/recipes-client.tsx", exige: /aria-pressed=\{onlyFavorites\}/, porque: "\"Favoritas\" anuncia se está ligado" },
  { arquivo: "app/(app)/nutricao/receitas/recipes-client.tsx", exige: /aria-pressed=\{showArchived\}/, porque: "\"Arquivadas\" anuncia se está ligado" },
  { arquivo: "app/(app)/nutricao/refeicoes/meal-templates-client.tsx", exige: /aria-pressed=\{showArchived\}/, porque: "\"Arquivadas\" anuncia se está ligado" },
  { arquivo: "app/(app)/treinos/calendario/generate-dialog.tsx", exige: /aria-pressed=\{mode === "rotina"\}/, porque: "o modo de gerar a semana anuncia o escolhido" },
  { arquivo: "app/(app)/treinos/calendario/generate-dialog.tsx", exige: /aria-pressed=\{mode === "programa"\}/, porque: "o modo de gerar a semana anuncia o escolhido" },
  { arquivo: "app/(app)/treinos/metas/goals-client.tsx", exige: /aria-pressed=\{showClosed\}/, porque: "\"Mostrar encerradas\" anuncia se está ligado" },
  { arquivo: "app/(app)/treinos/programas/programs-client.tsx", exige: /aria-pressed=\{showArchived\}/, porque: "\"Arquivados\" anuncia se está ligado" },
  { arquivo: "app/(app)/treinos/treinos/workouts-client.tsx", exige: /aria-pressed=\{onlyFavorites\}/, porque: "\"Favoritos\" anuncia se está ligado" },
  { arquivo: "app/(app)/treinos/treinos/workouts-client.tsx", exige: /aria-pressed=\{showSuperseded\}/, porque: "\"Versões antigas\" anuncia se está ligado" },
  { arquivo: "app/(app)/treinos/treinos/workouts-client.tsx", exige: /aria-pressed=\{showArchived\}/, porque: "\"Arquivados\" anuncia se está ligado" },
  { arquivo: "components/training/exercise-picker-dialog.tsx", exige: /aria-pressed=\{onlyFavorites\}/, porque: "\"Favoritos\" do seletor de exercícios anuncia se está ligado" },
  { arquivo: "components/training/session/exercise-list-sheet.tsx", exige: /aria-current=\{isCurrent \? "step" : undefined\}/, porque: "o exercício atual da sessão é anunciado" },
  { arquivo: "components/training/session/substitute-sheet.tsx", exige: /aria-pressed=\{selected === item\.id\}/, porque: "o substituto escolhido é anunciado (assinatura border-primary, fora da V1)" },

  // D4 — calendários dizem estado e hoje sem depender da cor
  { arquivo: "components/training/consistency-calendar.tsx", exige: /aria-current=\{date === hoje \? "date" : undefined\}/, porque: "hoje na consistência é anunciado" },
  { arquivo: "components/training/consistency-calendar.tsx", exige: /textoDoDiaDaConsistencia\(date, day, hoje\)/, porque: "cada dia da consistência diz o estado e \"hoje\" em palavras" },
  { arquivo: "components/training/consistency-calendar.tsx", exige: /futuro: "[^"]*ring-1 ring-inset ring-border/, porque: "o dia que ainda vai chegar tem contorno (não é um buraco no fundo)" },
  { arquivo: "components/training/consistency-calendar.tsx", exige: /<span className="sr-only">\{WEEKDAY_LABELS\[weekday\]\}<\/span>/, porque: "S S / Q Q de uma letra ganham o nome inteiro para o leitor de tela" },
  { arquivo: "app/(app)/treinos/calendario/calendar-client.tsx", exige: /aria-label=\{textoDaColunaDaSemana\(date, hoje\)\}/, porque: "a coluna da semana tem nome com a data escrita e \"hoje\"" },
  { arquivo: "app/(app)/treinos/calendario/calendar-client.tsx", exige: /\{isToday && <p className="[^"]*">Hoje<\/p>\}/, porque: "hoje em palavra na semana, em linha própria" },
  { arquivo: "app/(app)/treinos/calendario/calendar-client.tsx", exige: /aria-label=\{rotuloDeAdicionar\(date, hoje\)\}/, porque: "o botão de adicionar diz a data escrita, não ISO" },
  { arquivo: "app/(app)/treinos/calendario/calendar-client.tsx", exige: /aria-label=\{rotuloDaCelulaDoMes\(/, porque: "a célula do mês diz cada treino e o status dele" },
  { arquivo: "app/(app)/treinos/calendario/calendar-client.tsx", exige: /const Icone = STATUS_ICONE\[status\]/, porque: "o status do chip do mês tem forma, não só cor" },
  { arquivo: "app/(app)/treinos/page.tsx", exige: /aria-current=\{day\.isToday \? "date" : undefined\}/, porque: "hoje na faixa \"Sua semana\" é anunciado" },
  { arquivo: "app/(app)/treinos/historico/history-client.tsx", exige: /aria-current=\{date === hoje \? "date" : undefined\}/, porque: "hoje no calendário do histórico é anunciado" },
  { arquivo: "app/(app)/nutricao/diario/diary-client.tsx", exige: /aria-current=\{day === hoje \? "date" : undefined\}/, porque: "hoje na semana do diário é anunciado" },
  { arquivo: "app/(app)/nutricao/planejamento/planning-client.tsx", exige: /aria-current=\{day === hoje \? "date" : undefined\}/, porque: "hoje na semana do planejamento é anunciado" },
  { arquivo: "components/nutrition/diary-month-view.tsx", exige: /aria-label=\{textoDaCelulaDoMes\(cell, hoje\)\}/, porque: "o dia do mês diz data, hoje, fora do mês, pendentes e planejado sem registro" },
  { arquivo: "components/nutrition/diary-month-view.tsx", exige: /role="group"/, porque: "a grade do mês é um grupo com nome (grid exigiria setas)" },
  { arquivo: "components/training/session/session-live-client.tsx", exige: /aria-label=\{rotuloDoChipDeSerie\(set\)\}/, porque: "o chip de série diz feita, pulada ou pendente" },
  { arquivo: "components/nutrition/goal-progress-bar.tsx", exige: /<span className="sr-only">aderência de <\/span>/, porque: "a aderência tem nome; a cor é só ênfase" },

  // D6 — links pelos construtores (href= fica fora do extrator de links: G10 da 07-B)
  { arquivo: "app/(app)/nutricao/page.tsx", exige: /href=\{waterLink\(\)\}/, porque: "\"Registrar em Hábitos\" abre a água, não o topo de Hábitos" },
  { arquivo: "app/(app)/nutricao/diario/diary-client.tsx", exige: /href=\{waterLink\(\)\}/, porque: "o cartão da água do diário abre a água" },
  { arquivo: "components/training/integrations-card.tsx", exige: /href=\{habitsManageLink\(\)\}/, porque: "\"Criar em Hábitos\" abre Gerenciar, onde o hábito se cria" },
  { arquivo: "lib/notifications/nutrition.ts", exige: /link: planningWeekLink\(week\.weekStart\)/, porque: "a notificação do planejamento abre a SEMANA, não o dia" },

  // L2/G5 — campo numérico e data: texto local, URL depois da pausa
  { arquivo: "components/nutrition/food-filters.tsx", exige: /onChange=\{\(event\) => onTextoNumerico\(campo, event\.target\.value\)\}/, porque: "o campo numérico de Alimentos não grava na URL a cada tecla" },
  { arquivo: "app/(app)/nutricao/alimentos/foods-client.tsx", exige: /useUrlText\(numeroComoTexto\(urlFilters\.minKcal\)/, porque: "kcal mínima pelo mesmo caminho da busca" },
  { arquivo: "app/(app)/treinos/historico/history-client.tsx", exige: /onChange=\{\(event\) => setMinutosTexto\(event\.target\.value\)\}/, porque: "duração mínima do histórico não grava na URL a cada tecla" },
  { arquivo: "app/(app)/treinos/historico/history-client.tsx", exige: /onChange=\{\(event\) => setVolumeTexto\(event\.target\.value\)\}/, porque: "volume mínimo do histórico não grava na URL a cada tecla" },
  { arquivo: "app/(app)/treinos/historico/history-client.tsx", exige: /onChange=\{\(event\) => setDeTexto\(event\.target\.value\)\}/, porque: "a data De do histórico não grava na URL a cada segmento" },
  { arquivo: "app/(app)/treinos/historico/history-client.tsx", exige: /<Label htmlFor=\{id\}/, porque: "o rótulo do filtro do histórico é associado ao campo" },
  { arquivo: "components/nutrition/food-filters.tsx", exige: /<Label htmlFor="filtro-categoria"/, porque: "o rótulo do filtro de Alimentos é associado ao campo" },

  // G — o gráfico nunca é a única leitura do dado
  { arquivo: "components/training/training-charts.tsx", exige: /function EquivalentTable\(/, porque: "a tabela equivalente mora na fachada: sai no HTML do servidor, fora do recharts" },
  { arquivo: "components/training/training-charts.tsx", exige: /<EquivalentTable points=\{props\.points\} valueLabel=\{props\.valueLabel\} \/>/, porque: "cada gráfico de Treinos traz a sua tabela" },
  { arquivo: "app/(app)/nutricao/relatorios/reports-client.tsx", exige: /<TabelaDoGrafico caption="Energia por dia registrado"/, porque: "o gráfico de energia por dia tem leitura textual" },
  { arquivo: "app/(app)/nutricao/relatorios/reports-client.tsx", exige: /<TabelaDoGrafico caption="Consumo de energia no período"/, porque: "o gráfico de consumo tem leitura textual" },
  { arquivo: "app/(app)/nutricao/relatorios/reports-client.tsx", exige: /<MeasurementTable\b/, porque: "a medida corporal tem a tabela ao lado do gráfico" },
  { arquivo: "app/(app)/nutricao/relatorios/reports-client.tsx", exige: /aria-label="Medida exibida no gráfico"/, porque: "o seletor da medida tem nome" },
  // T — textos que descrevem o sistema de hoje
  { arquivo: "app/(app)/treinos/sessao/revisar/page.tsx", exige: /O histórico completo fica em Treinos → Histórico\./, porque: "a revisão aponta para o histórico que existe" },

  // V · Diário e Planejamento — G6 (CardHeader é grid: sem `flex`, título e ações empilham)
  { arquivo: "app/(app)/nutricao/diario/diary-client.tsx", exige: /<CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 pb-3">/, porque: "G6: o cabeçalho da refeição põe título e ações lado a lado" },
  { arquivo: "app/(app)/nutricao/planejamento/planning-client.tsx", exige: /<CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 pb-3">/, porque: "G6: o cabeçalho da refeição planejada põe título e ações lado a lado" },
  { arquivo: "app/(app)/nutricao/planejamento/model-days-sheet.tsx", exige: /<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">/, porque: "G6: o dia do modelo põe o nome e o botão lado a lado" },
  { arquivo: "app/(app)/nutricao/diario/diary-client.tsx", exige: /<li key=\{entry\.id\} className="flex flex-wrap items-start justify-between/, porque: "o item do diário quebra linha em vez de esmagar o nome (regra 2)" },
  // V · barras com nome
  { arquivo: "app/(app)/nutricao/diario/diary-client.tsx", exige: /\{\.\.\.ariaDeProgresso\(\s*"Água do dia",/, porque: "a barra da água diz o que mede e quanto" },
  { arquivo: "components/nutrition/goal-progress-bar.tsx", exige: /\{\.\.\.ariaDeProgresso\(\s*label,\s*percent,/, porque: "a barra da meta limita aria-valuenow e diz o valor real no texto" },
  { arquivo: "components/nutrition/goal-progress-bar.tsx", exige: /"sem percentual: a meta é zero"/, porque: "meta zero não é anunciada como \"0% da meta\"" },
  // V · vazios — seção usa EmptyState; dentro de Card, sem borda e com py-6
  { arquivo: "components/nutrition/diary-month-view.tsx", exige: /registeredDays\.length === 0 \? \(\s*<EmptyState[^>]*?className="border-0 bg-transparent py-6"/, porque: "o mês sem registro usa o EmptyState, ajustado para dentro do Card" },
  // Exceção DECLARADA (critério da 07-A): item de lista repetida, picker e diálogo ficam <p>.
  { arquivo: "app/(app)/nutricao/diario/diary-client.tsx", exige: /meal\.entries\.length === 0 \? \(\s*<p\b/, porque: "refeição sem item é dica em linha dentro do cartão repetido, não seção" },
  { arquivo: "app/(app)/nutricao/planejamento/planning-client.tsx", exige: /meal\.items\.length === 0 \? \(\s*<p\b/, porque: "refeição planejada sem item é dica em linha, não seção" },
  { arquivo: "app/(app)/nutricao/planejamento/model-days-sheet.tsx", exige: /day\.meals\.length === 0 \? \(\s*<p\b/, porque: "dia do modelo sem refeição é dica em linha dentro da gaveta" },
  { arquivo: "app/(app)/nutricao/diario/template-picker-dialog.tsx", exige: /active\.length === 0 \? \(\s*<p\b/, porque: "picker vazio continua <p> dentro do diálogo" },

  // V · demais telas da Dieta — G6
  { arquivo: "app/(app)/nutricao/medidas/measurements-client.tsx", exige: /<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">/, porque: "G6: \"Histórico\" e \"Excluir N\" lado a lado" },
  { arquivo: "app/(app)/nutricao/substituicoes/substitutions-client.tsx", exige: /<CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 pb-3">/, porque: "G6: o grupo de substituição põe nome e ações lado a lado" },
  { arquivo: "components/body/progress-photos.tsx", exige: /<CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">/, porque: "G6: \"Fotos de evolução\" e os botões lado a lado" },
  { arquivo: "app/(app)/nutricao/relatorios/reports-client.tsx", exige: /(?:<CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 pb-2">\s*<div className="min-w-0">[\s\S]*?){4}/, porque: "G6: os quatro cabeçalhos com ação dos relatórios são flex, com o título encolhível" },
  // V · barras com nome
  { arquivo: "app/(app)/nutricao/medidas/measurements-client.tsx", exige: /\{\.\.\.ariaDeProgresso\(\s*`Meta de \$\{selectedType\?\.name \?\? "medida"\}`/, porque: "a barra da meta de medida diz QUAL medida" },
  // V · favorito em palavra, não só no ícone (o lucide põe aria-hidden no ícone sem rótulo)
  { arquivo: "app/(app)/nutricao/receitas/recipes-client.tsx", exige: /recipe\.isFavorite && \([\s\S]{0,200}?<span className="sr-only">Favorito<\/span>/, porque: "a receita favorita é anunciada" },
  { arquivo: "app/(app)/nutricao/refeicoes/meal-templates-client.tsx", exige: /template\.isFavorite && \([\s\S]{0,200}?<span className="sr-only">Favorito<\/span>/, porque: "a refeição-modelo favorita é anunciada" },
  // V · vazios de seção — EmptyState; dentro de Card, sem borda e com py-6
  { arquivo: "app/(app)/nutricao/page.tsx", exige: /<EmptyState\s+icon=\{CalendarRange\}\s+title="Nada pendente para hoje"\s+className="border-0 bg-transparent py-6"/, porque: "o dia sem pendência usa o EmptyState dentro do Card" },
  { arquivo: "app/(app)/nutricao/configuracoes/settings-client.tsx", exige: /sources\.length === 0 \? \(\s*<EmptyState[^>]*?className="border-0 bg-transparent py-6"/, porque: "sem fonte cadastrada usa o EmptyState" },
  { arquivo: "app/(app)/nutricao/configuracoes/settings-client.tsx", exige: /mealTypes\.length === 0 && \(\s*<li>\s*<EmptyState/, porque: "sem tipo de refeição usa o EmptyState (dentro do <li>: o <ul> continua válido)" },
  { arquivo: "app/(app)/nutricao/configuracoes/settings-client.tsx", exige: /items\.length === 0 && \(\s*<li>\s*<EmptyState icon=\{Icon\} title=\{emptyLabel\}/, porque: "lista simples vazia usa o EmptyState" },
  { arquivo: "app/(app)/nutricao/relatorios/reports-client.tsx", exige: /props\.topMeals\.length === 0 \? \(\s*<EmptyState/, porque: "sem refeição registrada usa o EmptyState" },
  { arquivo: "app/(app)/nutricao/relatorios/reports-client.tsx", exige: /title="Nenhum micronutriente registrado no período"/, porque: "sem micronutriente usa o EmptyState" },
  { arquivo: "app/(app)/nutricao/relatorios/reports-client.tsx", exige: /title="Nenhuma medida corporal registrada neste período"/, porque: "sem medida corporal usa o EmptyState, com o caminho para registrar" },
  { arquivo: "components/body/measurement-chart.tsx", exige: /<EmptyState[^>]*?className="border-0 bg-transparent py-6"/, porque: "o gráfico sem medição usa o EmptyState (decidido antes de baixar o recharts)" },
  // Exceção DECLARADA: item repetido, picker, diálogo e gaveta ficam <p>.
  { arquivo: "app/(app)/nutricao/substituicoes/substitutions-client.tsx", exige: /options\.length === 0 \? \(\s*<p\b/, porque: "grupo sem alternativa é dica em linha dentro do cartão repetido" },
  { arquivo: "app/(app)/nutricao/refeicoes/meal-templates-client.tsx", exige: /detail\.items\.length === 0 \? \(\s*<p\b/, porque: "refeição-modelo sem item é dica dentro da gaveta" },
  { arquivo: "components/nutrition/food-picker-dialog.tsx", exige: /results\.length === 0 && \(\s*<p\b/, porque: "picker vazio continua <p>" },
  { arquivo: "components/nutrition/recipe-picker-dialog.tsx", exige: /results\.length === 0 && \(\s*<p\b/, porque: "picker vazio continua <p>" },
  { arquivo: "components/nutrition/substitution-compare-dialog.tsx", exige: /options\.length === 0 \? \(\s*<p\b/, porque: "diálogo sem alternativa continua <p>" },
];

/** O que não pode voltar. */
export const PROIBIDOS: Contrato[] = [
  { arquivo: "app/(app)/treinos/calendario/calendar-client.tsx", exige: /\{(newDate|outcomeEntry|generateOpen|duplicateOpen) && \(/, porque: "montagem condicional sem o hook quebra a animação de fechamento" },
  { arquivo: "app/(app)/treinos/treinos/workouts-client.tsx", exige: /\{deleting && \(/, porque: "montagem condicional sem o hook quebra a animação de fechamento" },
  { arquivo: "app/(app)/treinos/programas/programs-client.tsx", exige: /\{deleting && \(/, porque: "montagem condicional sem o hook quebra a animação de fechamento" },
  { arquivo: "app/(app)/treinos/metas/goals-client.tsx", exige: /Escondendo nada/, porque: "com aria-pressed o rótulo é fixo — trocar o texto apagava o nome do botão" },
  { arquivo: "app/(app)/treinos/calendario/calendar-client.tsx", exige: /derivePlannedStatus\(/, porque: "G2: o calendário lê statusExibido (descanso nunca vira \"Atrasado\")" },
  { arquivo: "components/nutrition/diary-month-view.tsx", exige: /role="grid"/, porque: "grid sem navegação por setas promete o que não entrega" },
  { arquivo: "app/(app)/nutricao/page.tsx", exige: /href="\/habitos"/, porque: "link para o topo de Hábitos: a água é uma visão (waterLink)" },
  { arquivo: "app/(app)/nutricao/diario/diary-client.tsx", exige: /href="\/habitos"/, porque: "link para o topo de Hábitos: a água é uma visão (waterLink)" },
  { arquivo: "components/training/integrations-card.tsx", exige: /href="\/habitos"/, porque: "link para o topo de Hábitos: criar o hábito é em Gerenciar" },
  { arquivo: "components/nutrition/food-filters.tsx", exige: /onChange\(\{\s*\[key\]/, porque: "o campo numérico voltaria a gravar na URL a cada tecla" },
  { arquivo: "app/(app)/treinos/historico/history-client.tsx", exige: /setParam\("(?:min_min|min_volume|de|ate)", event\.target\.value/, porque: "o campo voltaria a gravar na URL a cada tecla" },
  { arquivo: "components/training/training-charts-impl.tsx", exige: /EquivalentTable/, porque: "a tabela voltaria a existir só depois de o recharts carregar" },
  { arquivo: "app/(app)/treinos/sessao/revisar/page.tsx", exige: /Subfase/, porque: "texto de quando o módulo estava em construção" },
  { arquivo: "app/(app)/treinos/calendario/outcome-dialog.tsx", exige: /chega na Subfase/, porque: "texto de quando o módulo estava em construção" },
  { arquivo: "app/(app)/treinos/treinos/[id]/builder-client.tsx", exige: /chega na Subfase/, porque: "texto de quando o módulo estava em construção" },
  { arquivo: "app/(app)/treinos/page.tsx", exige: /O que ainda vem/, porque: "o card de subfases futuras: todas as seções estão prontas" },
  { arquivo: "components/nutrition/nutrition-nav.tsx", exige: /SectionPlaceholder/, porque: "tela de espera sem chamador (todas as seções prontas)" },
  { arquivo: "components/training/training-nav.tsx", exige: /SectionPlaceholder/, porque: "tela de espera sem chamador (todas as seções prontas)" },
  { arquivo: "components/nutrition/goal-progress-bar.tsx", exige: /percent \?\? 0/, porque: "meta zero viraria \"0% da meta\" no nome da barra" },
  { arquivo: "components/nutrition/goal-progress-bar.tsx", exige: /aria-valuenow=\{[^}]*Math\.round\(percent\)\}/, porque: "aria-valuenow sem limite passa de aria-valuemax com o consumo acima da meta" },
  { arquivo: "app/(app)/nutricao/medidas/measurements-client.tsx", exige: /aria-label="Progresso da meta"/, porque: "barra sem dizer qual medida" },
];

const fonte = (arquivo: string) => semComentarios(fs.readFileSync(path.join(SRC, arquivo), "utf8"));

describe("07-C — contratos de Dieta e Treinos", () => {
  it.each(CONTRATOS.map((c) => [c.arquivo, c.porque, c] as const))("%s — %s", (_a, _p, c) => {
    expect(fonte(c.arquivo)).toMatch(c.exige);
  });

  it.each(PROIBIDOS.map((c) => [c.arquivo, c.porque, c] as const))("%s não tem: %s", (_a, _p, c) => {
    expect(fonte(c.arquivo)).not.toMatch(c.exige);
  });
});
