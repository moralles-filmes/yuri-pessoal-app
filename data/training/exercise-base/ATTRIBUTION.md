# Base inicial de exercícios — procedência e licença

> Fase 17-A do Sistema Pessoal Yuri. Última atualização: **2026-08-03**.

## O que é este dado

`exercises.json` é a **base inicial de exercícios** do módulo Treinos: 106 movimentos comuns
de academia, cada um com nome em pt-BR, grupo muscular principal, grupos secundários,
equipamento, padrão de movimento, tipo de acompanhamento e lateralidade.

## De onde ele veio

**É conteúdo autoral, produzido especificamente para este projeto.** Não foi copiado,
extraído, raspado, exportado nem derivado de nenhum aplicativo, site, banco de dados ou base
proprietária de terceiros.

Os nomes são os termos correntes em português do Brasil usados em academia ("Supino reto com
barra", "Cadeira extensora", "Puxada frontal"), e a classificação (grupo muscular,
equipamento, padrão de movimento) é conhecimento geral de treinamento resistido — o mesmo que
está em qualquer livro-texto de fisiologia do exercício e não pertence a ninguém.

Aplicativos como Hevy, Strong, JEFIT, Fitbod e Alpha Progression foram usados **apenas como
referência funcional e de experiência de uso** — nunca como fonte de dado, texto, código,
identidade visual ou asset.

## O que NÃO existe nesta base, de propósito

- **Nenhuma imagem.** Nenhuma ilustração, foto, GIF ou diagrama.
- **Nenhum vídeo.** Nenhum link para vídeo de terceiro.
- **Nenhum ícone proprietário.** Os ícones da interface são do `lucide-react` (ISC).
- **Nenhum texto de instrução copiado.** Os campos `instructions`, `tips` e `common_mistakes`
  nascem **vazios**; quem escreve é o usuário.

Se um dia a base ganhar mídia, ela precisa ser: asset próprio, asset com licença compatível,
conteúdo criado pelo usuário ou ilustração produzida especificamente para o projeto — e a
licença tem de ser registrada **neste arquivo**.

## Como o dado entra no banco

Pipeline determinístico e reexecutável:

```bash
node scripts/training/generate-exercise-base-migration.mjs
```

Lê `exercises.json` e escreve
`supabase/migrations/20260803231000_training_exercise_base_seed.sql` — uma migration
idempotente (`on conflict (system_code) where user_id is null do update`), o que significa que
reaplicar **atualiza** em vez de duplicar.

As linhas entram com `user_id is null`, `is_system_exercise = true` e `source = 'sistema'`:
são **base do sistema, somente leitura**. O usuário favorita, arquiva e apelida via
`training_exercise_prefs`, e duplica para criar uma cópia editável.

## Precisão e limites

A classificação é uma **aproximação útil para organizar treino**, não um laudo biomecânico.
Um mesmo exercício muda de ênfase conforme pegada, amplitude, cadência e execução individual.
O sistema é ferramenta de organização e registro: **não prescreve treino, não diagnostica e
não garante resultado**.

Casos em que a escolha foi deliberada e pode ser revista pelo usuário:

- **Levantamento terra** aparece com grupo principal **Costas** (é como o briefing do módulo o
  agrupa) e com glúteos, posteriores, lombar, quadríceps, trapézio e antebraços como
  secundários. É um movimento de cadeia posterior inteira; qualquer grupo "principal" único é
  uma simplificação.
- **Flexão de tronco** (abdominal tradicional, infra, elevação de pernas) usa o padrão de
  movimento `outros`: o vocabulário de padrões definido para o módulo não tem uma entrada
  específica para flexão de tronco.
- **Exercícios de ombro compostos** usam **Ombros** como principal; os isoladores usam a
  porção específica (deltoide anterior/lateral/posterior), para o filtro por porção ser útil.

O usuário pode duplicar qualquer exercício da base e ajustar a classificação na sua cópia.
