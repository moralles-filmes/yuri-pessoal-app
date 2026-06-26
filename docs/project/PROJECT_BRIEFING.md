# PROJECT_BRIEFING — Sistema Pessoal Yuri

> **Fonte de verdade do projeto.** Todo agente que entrar no projeto deve ler este arquivo **primeiro**, junto com `PROJECT_RULES.md`, `PROJECT_ARCHITECTURE.md`, `PROJECT_ROADMAP.md` e `CURRENT_STATUS.md`.

---

## 1. Visão geral

Sistema pessoal completo — uma **central pessoal** para organizar a vida do usuário em um só lugar: finanças, cartões/faturas, agenda, demandas/tarefas/rotinas, hábitos, estudos, dashboards, busca global, lançamento rápido e notificações.

O sistema deve ser **acima da média**: bonito, premium, rápido, responsivo e muito fácil de usar no dia a dia.

## 2. Objetivo

Controlar, em um único produto:

1. Controle financeiro pessoal
2. Cartão de crédito e faturas
3. Contas, gastos e recebimentos
4. Gastos pessoais e gastos de terceiros
5. Agenda integrada ao Google Agenda
6. Demandas, tarefas e rotinas
7. Hábitos (leitura, exercícios, água, sono, rotina diária etc.)
8. Estudos (cursos online, marketing, idiomas, desenvolvimento pessoal)
9. Dashboard geral com visão de todos os módulos
10. Buscador global
11. Lançamento rápido
12. Notificações importantes

## 3. Público de uso

**Sistema pessoal de usuário único** (o próprio usuário). Há autenticação para proteger os dados, mas o modelo é single-user (todos os dados pertencem ao usuário autenticado). Não é multi-tenant/SaaS.

## 4. Prioridades do projeto

A parte **mais importante** do sistema é a financeira — em especial:

1. **Cartão de crédito**
2. **Faturas** (regra de fechamento/vencimento)
3. **Parcelamentos**
4. **Gastos de terceiros** (divisão de despesas, a receber)
5. **Dashboard financeiro**

A construção segue esta ordem de prioridade geral:

1. Base visual, arquitetura, autenticação e layout
2. Financeiro → 3. Cartão → 4. Faturas → 5. Parcelamentos → 6. Gastos de terceiros → 7. Importação → 8. Dashboard financeiro
9. Agenda → 10. Tarefas/rotinas/hábitos → 11. Estudos
12. Dashboard geral → 13. Busca global → 14. Lançamento rápido → 15. Notificações
16. Polimento, segurança e responsividade

> A divisão executável em fases está em `PROJECT_ROADMAP.md`.

---

## 5. Identidade visual (UI/UX)

### Paleta
- **Preto**, **Branco**, **Dourado/Ouro** como identidade principal.
- Tons auxiliares neutros quando necessário: cinza, off-white, grafite, bege claro.
- Excelente contraste e leitura confortável (meta WCAG AA).

### Fonte
- **Arial** ou fonte padrão semelhante (simples, limpa, legível).
- **Não** usar fontes extravagantes.

### Tema (Light e Dark)
- **Dark:** fundo preto/grafite, cards elegantes, detalhes em dourado. Realmente bonito.
- **Light:** branco/off-white, preto e detalhes dourados. Limpo e premium.
- Alternância de tema no header. Persistência da preferência. Sem "flash" ao carregar.

### Layout
- **Sidebar** moderna, responsiva e recolhível.
- **Header** superior com: buscador global, botão de **lançamento rápido**, **sino de notificações**, **alternância de tema**, menu do usuário.
- Cards bem organizados: bordas suaves, sombras leves, ícones, indicadores e gráficos.
- Dashboard rico, bonito e útil.
- Responsivo para desktop, tablet e celular.
- Evitar poluição visual. Priorizar clareza, praticidade e velocidade de lançamento.

---

## 6. Módulos

### Módulo 1 — Financeiro pessoal
- **Dashboard financeiro:** saldo atual, entradas/saídas do mês, gastos no cartão, gastos à vista, próximas contas a pagar, próximos recebimentos, faturas abertas/fechadas, **valor pessoal real do mês**, **valor de terceiros dentro das faturas**, **valores que outras pessoas precisam me pagar**, gráfico por categoria, gráfico por forma de pagamento, comparativo mês atual x anterior, evolução mensal, projeção dos próximos meses, alertas de excesso de gasto.
- **Lançamentos financeiros:** tipo (despesa, receita, transferência, ajuste), forma de pagamento (cartão de crédito, débito, pix, dinheiro, boleto, transferência, conta corrente), conta vinculada, cartão vinculado (quando cartão), data da compra, data de competência, valor total, categoria, subcategoria, descrição, observações, tags, anexo/comprovante (quando possível), recorrente?, parcelado?, pessoa responsável pelo gasto, separação pessoal x terceiro, status (pendente, pago, recebido, cancelado).
- **Categorias:** Alimentação, Mercado, Delivery, Transporte, Combustível, Moradia, Contas fixas, Assinaturas, Saúde, Lazer, Educação, Trabalho, Marketing, Equipamentos, Viagens, Outros. Criar/editar/excluir/personalizar (cor e ícone). Subcategorias.

### Módulo 2 — Cartão de crédito
- **Cadastro:** nome, banco/instituição, bandeira, limite total, limite disponível, **dia de fechamento**, **dia de vencimento**, cor personalizada, status ativo/inativo, observações.
- **Regra obrigatória de fechamento/vencimento:** o sistema entende automaticamente em qual fatura uma compra entra.
  - Exemplo: cartão fecha dia 10, vence dia 20. Compra feita até o fechamento entra na fatura atual; compra após o fechamento entra na próxima.
  - Calcular automaticamente com base em **data da compra + dia de fechamento + dia de vencimento**.
  - Tratar corretamente meses diferentes, **virada de ano**, fechamento em dias 28, 29, 30 e 31, e meses com menos dias.
- **Lançamentos no cartão:** manual e por importação (Excel/CSV/OFX). Toda despesa cai automaticamente na fatura correta. Permitir editar a fatura vinculada manualmente em ajuste. Marcar pessoal/terceiro/compartilhada. Anexar comprovante. Categoria/subcategoria/tags. Parcelamento.
- **Parcelamento no cartão:** opção "Essa compra é parcelada?". Se sim: quantidade de parcelas, valor total → sistema calcula valor de cada parcela, ajuste manual de centavos na última parcela, cria todas as parcelas, cada parcela cai na fatura correta conforme o fechamento, identificação "Parcela 1/6, 2/6...", ver todas as parcelas vinculadas, editar/cancelar parcelamento com segurança.
- **Provisão das próximas 6 faturas** por cartão: compras já lançadas, parcelamentos ativos, recorrentes, valores pessoais, valores de terceiros, total da fatura, valor que realmente será meu, valor que outras pessoas precisam me pagar.
- **Aba de faturas:** fatura atual, próxima, histórico; filtros por cartão/mês/status (aberta, fechada, paga, atrasada); total da fatura, total pessoal, total de terceiros; lista de lançamentos; marcar como paga; exportar; indicador visual de vencimento; alerta de fatura próxima do vencimento.

### Módulo 3 — Gastos de terceiros e divisão de despesas
- Separar gasto **pessoal**, **de terceiro** e **compartilhado**.
  - Ex.: compra de R$500 → R$250 meu, R$250 de outra pessoa.
- Definir uma ou mais pessoas, valor ou porcentagem de cada, minha parte, parte de cada terceiro, status de cobrança (pendente, cobrado, pago, ignorado), data prevista de pagamento, data em que a pessoa pagou, observações.
- **Cadastro de pessoas:** nome, telefone, e-mail, observações, status ativo/inativo.
- **Aba "A Receber de Terceiros":** pessoa, valor pendente, origem do gasto, cartão usado, fatura onde entrou, data da compra, data prevista, status, marcar como recebido; filtros por pessoa/mês/cartão/status; total geral a receber, total recebido no mês, histórico de pagamentos recebidos.
- Na fatura: deixar claro valor total, valor realmente meu, valor de terceiros, quem precisa pagar e quanto.

### Módulo 4 — Importação de faturas e extratos
- Importar **Excel, CSV e OFX** (cartão de crédito e conta corrente).
- Fluxo: selecionar arquivo → identificar colunas → pré-visualização → mapear colunas (data, descrição, valor, categoria, cartão/conta, parcela, nº de parcelas, identificador) → sugerir categoria pela descrição → detectar duplicados → revisar → importar.
- **Importante:** lançamento importado tem **as mesmas funcionalidades** do manual (categoria, subcategoria, tags, cartão, conta, parcelamento, fatura, terceiros, divisão, observações, status, edição completa). Mesmo modelo de dados.

### Módulo 5 — Parcelamentos (aba específica)
- Nome da compra, valor total, qtd de parcelas, parcelas pagas, parcelas futuras, cartão, categoria, data da 1ª e da última parcela, valor restante, faturas futuras onde entrarão, status (ativo, finalizado, cancelado).
- Abrir detalhes, ver todas as parcelas, editar, cancelar parcelas futuras; filtros por cartão/categoria/status/pessoa.

### Módulo 6 — Contas, receitas e gastos à vista
- **Contas/carteiras:** nome, banco, tipo (corrente, poupança, dinheiro, carteira digital, investimento), saldo inicial, saldo atual, status.
- **Lançamentos à vista:** despesa, receita, transferência entre contas, pix, dinheiro, débito, boleto, recorrência.
- **Recebimentos:** salário, freelance, clientes, reembolsos, pagamento de terceiros, outros.
- **Contas fixas:** nome, valor, vencimento, categoria, recorrência mensal, status, notificações antes do vencimento.

### Módulo 7 — Agenda com Google Agenda
- Conectar conta Google; listar/criar/editar/excluir/sincronizar eventos; visão diária, semanal e mensal; compromissos (pessoal, trabalho, estudos, exercícios, rotinas); lembretes; vincular tarefas a eventos; rotina recorrente; próximos compromissos no dashboard.
- Visual: calendário bonito, cards de eventos, cores por tipo.

### Módulo 8 — Demandas, tarefas e rotinas
- Tarefas, projetos/listas, prioridade (baixa, média, alta, urgente), status (pendente, em andamento, concluída, atrasada, cancelada), datas (início/vencimento), tags, checklist, observações, anexos, recorrência, lembretes; relacionar com agenda/estudos/hábitos.
- Visões: lista, kanban, calendário, hoje, semana, atrasadas, concluídas.
- Rotinas: manhã, noite, trabalho, estudos, exercícios; marcar execução diária; acompanhar frequência.

### Módulo 9 — Hábitos
- Leitura, exercícios, água, sono, estudos, caminhada, alimentação e qualquer hábito customizado.
- Cadastro: nome, categoria, frequência (diária, semanal, dias específicos), meta, unidade (vezes, minutos, horas, litros, páginas...), horário ideal, lembrete, cor/ícone, status.
- Tela: hábitos do dia, check-in rápido, progresso da semana, sequência/streak, histórico, gráfico de consistência, taxa de conclusão, ranking dos mais consistentes, alertas de hábitos esquecidos.
- **Água:** meta diária (ml/L), botão rápido (copos), histórico, progresso visual.
- **Leitura:** livro atual, páginas lidas, meta diária/semanal, histórico, tempo, observações.
- **Exercícios:** tipo, frequência, tempo, status, histórico.

### Módulo 10 — Estudos
- Foco em cursos online, marketing, idiomas, desenvolvimento pessoal (não faculdade/escola).
- Cursos: cadastrar curso, módulos/aulas, plataforma, link, categoria (marketing, tráfego pago, inglês, idiomas, negócios, tecnologia, design, vendas...), status (não iniciado, em andamento, pausado, concluído), progresso %, carga horária, tempo estudado, data de início, meta de conclusão, prioridade, notas, materiais/links, revisões, próxima aula, tarefas relacionadas.
- Sessão de estudo: curso, aula/módulo, tempo, o que aprendi, próxima ação, dificuldade, marcar aula concluída.
- Dashboard de estudos: cursos em andamento, horas na semana/mês, progresso por curso, próximas aulas, estudos atrasados, sequência de dias estudando, gráfico de evolução.
- Idiomas: plano de estudos, vocabulário, prática (listening/speaking/reading/writing), meta semanal, histórico.

### Módulo 11 — Dashboard geral
- Visão unificada de todos os módulos (financeiro, agenda, tarefas, hábitos, estudos, notificações).
- Personalizável: reordenar cards (se possível), esconder/exibir cards, filtros por período, visão diária/semanal/mensal.

### Módulo 12 — Buscador global
- Buscar em: transações, faturas, cartões, pessoas, contas, tarefas, rotinas, hábitos, estudos, cursos, eventos da agenda, notificações.
- Resultados agrupados por tipo; rápido; abrir item diretamente.

### Módulo 13 — Lançamento rápido
- Botão fixo no header ou flutuante → modal rápido e prático.
- Criar: despesa, receita, gasto no cartão, gasto à vista, transferência, tarefa rápida, evento rápido, hábito/check-in, sessão de estudo.
- Financeiro: tipo, valor, descrição, data, categoria, forma de pagamento, conta, cartão, parcelamento, qtd de parcelas, terceiros, divisão de valor, observação. Objetivo: lançar em poucos segundos.

### Módulo 14 — Notificações
- Sino no topo. Tipos: fatura próxima/vencida, conta próxima/atrasada, pessoa que precisa me pagar, tarefa atrasada/do dia, evento próximo, hábito pendente, meta de água incompleta, estudo planejado não realizado, parcelamento relevante, alerta de gasto alto, alerta de limite do cartão.
- Cada notificação: título, descrição, tipo, prioridade, data/hora, status lida/não lida, link para o item, marcar como lida, resolver (quando aplicável).

### Módulo 15 — Relatórios e análises
- Financeiro: gastos por mês/categoria/cartão, pessoais x terceiros, receitas x despesas, evolução mensal, projeção, maiores gastos, assinaturas/recorrências.
- Cartão: faturas por mês, próximas 6 faturas, parcelamentos ativos, compras por cartão, valores de terceiros por fatura.
- Hábitos: consistência semanal/mensal, mais/menos realizados.
- Estudos: horas estudadas, cursos em andamento, progresso por curso, evolução.
- Tarefas: concluídas, atrasadas, produtividade semanal, projetos ativos.

### Módulo 16 — Banco de dados (entidades mínimas)
`users, accounts, credit_cards, card_statements, transactions, transaction_installments, categories, subcategories, people, shared_expenses, receivables, bills, recurring_transactions, tasks, projects, routines, habits, habit_logs, study_courses, study_modules, study_lessons, study_sessions, calendar_events, notifications, attachments, import_batches, import_rows, settings`.

**Regras financeiras consistentes:** não duplicar transações importadas; permitir conciliação; manter histórico; edição segura; parcelas vinculadas à compra original; faturas calculadas pelo fechamento/vencimento; valores de terceiros **não** distorcem meu gasto pessoal real; dashboard diferencia **valor total movimentado** x **valor realmente meu**.

### Módulo 17 — Segurança e privacidade
Autenticação segura; rotas privadas protegidas; validação no backend; sanitização de inputs; não expor dados sensíveis no frontend; estrutura preparada para backup/exportação; evitar logs com dados financeiros sensíveis. (No Supabase: **RLS em todas as tabelas**, sempre filtrando por `user_id = auth.uid()`.)

### Módulo 18 — Configurações
Perfil; preferência de tema; moeda padrão (BRL); formato de data brasileiro; configurações de notificações; configurações de cartões; configurações de categorias; integração Google Agenda; exportação de dados; preferências do dashboard.

### Módulo 19 — Experiência do usuário
Poucos cliques para lançar; telas limpas; informação importante visível rápido; gráficos úteis (não decorativos); filtros claros; tabelas bonitas e legíveis; modais rápidos; feedback visual ao salvar/editar/excluir; **estados vazios** bonitos e explicativos; **loading skeletons**; responsividade real; boa experiência no celular.
Componentes-chave: cards de resumo, tabelas com filtros, drawer/modal de lançamento, calendário, kanban, gráficos, badges de status, avatares/iniciais para pessoas, ícones por categoria, toasts de sucesso/erro, confirmações antes de excluir, empty states, skeleton loading, botões rápidos.

---

## 7. Critérios gerais de aceite

- [ ] Cadastrar cartões com fechamento e vencimento.
- [ ] Lançar compra no cartão → cai na **fatura correta** automaticamente.
- [ ] Lançar compra **parcelada** → parcelas distribuídas nas faturas corretas.
- [ ] Ver **provisão das próximas 6 faturas**.
- [ ] Importar fatura por **Excel/CSV/OFX**.
- [ ] Lançamentos importados têm as **mesmas opções** dos manuais.
- [ ] Separar gasto **pessoal** x **terceiros**.
- [ ] Ver **quem precisa me pagar**, quanto e de qual compra/fatura veio.
- [ ] Ver fatura de **qualquer mês**.
- [ ] Controlar contas, receitas e despesas à vista.
- [ ] Usar **dashboard financeiro** completo.
- [ ] Integrar **Google Agenda**.
- [ ] Controlar tarefas, rotinas, hábitos (água, leitura, exercícios) e estudos.
- [ ] Usar **buscador global** e **lançamento rápido**.
- [ ] Receber **notificações** importantes.
- [ ] Modo **dark** e **light**.
- [ ] Sistema bonito, premium, responsivo e fácil de usar.

> **Lembrete final do briefing:** não é uma tela simples ou genérica. É um sistema pessoal acima da média, visual premium preto/branco/dourado, boa usabilidade e **lógica financeira bem feita**. Priorizar cartão, faturas, parcelamentos, terceiros e dashboard financeiro.
