# Atribuição da base nutricional — TACO 4ª edição

Este diretório contém a base nutricional brasileira usada pelo módulo **Dieta e Alimentação**
(`/nutricao`, Fase 16-A). Os dados **não foram criados, estimados nem gerados por IA**: são a
reprodução fiel de uma tabela oficial brasileira.

## Fonte

> **NEPA/UNICAMP. Tabela brasileira de composição de alimentos — TACO.**
> 4. ed. rev. e ampl. Campinas: NEPA-UNICAMP, 2011. 161 p.

- **Instituição:** Núcleo de Estudos e Pesquisas em Alimentação (NEPA) — Universidade
  Estadual de Campinas (UNICAMP).
- **Edição:** 4ª, revista e ampliada (2011).
- **Alimentos:** 597.
- **Base de referência:** 100 g de **parte comestível** (100 ml para bebidas).
- **Página oficial:** <https://nepa.unicamp.br/publicacoes/tabela-taco-excel/>
- **Publicação completa (PDF):**
  <https://nepa.unicamp.br/tabela-brasileira-de-composicao-de-alimentos-4a-edicao/>

## Licença / permissão de uso

A própria obra declara, na página de créditos:

> © 2011. Núcleo de Estudos e Pesquisas em Alimentação – NEPA
> Universidade Estadual de Campinas – UNICAMP
> **É permitida a reprodução parcial ou total desta obra, desde que citada a fonte.**

Por isso a base pode ser distribuída dentro deste projeto **desde que a citação acima
permaneça visível**. A interface exibe a fonte, a edição e a data de verificação em cada
alimento; não remova essa exibição.

## Como a base foi obtida

1. Download do **arquivo XLSX oficial** publicado pelo NEPA na página acima.
   **Não houve scraping**, nem acesso a área restrita, nem uso de cópia de terceiros.
2. Execução do pipeline determinístico:

   ```bash
   node scripts/nutrition/build-taco-dataset.mjs <caminho-do-taco.xlsx>
   ```

   Isso gera `foods.json` (dataset normalizado) e `manifest.json` (fonte, licença, citação,
   contagens e **SHA-256 do arquivo de origem**).
3. Geração da migration idempotente de seed:

   ```bash
   node scripts/nutrition/generate-taco-migration.mjs
   ```

Para atualizar a base no futuro (nova edição da TACO ou outra fonte), repita os três passos:
o checksum no manifesto denuncia qualquer divergência em relação ao arquivo publicado.

## Como os marcadores da fonte foram preservados

A TACO usa marcadores que **não podem virar zero**. Cada um vira um estado próprio:

| Marcador na tabela | Significado oficial | Estado no banco | Efeito no cálculo |
| --- | --- | --- | --- |
| *(célula em branco)* | análises não solicitadas | *(sem registro)* → `nao_disponivel` | não entra no total; marca o total como **parcial** |
| `Tr` | traço | `traco` | conta como 0 e marca o total como **aproximado** |
| `NA` | não aplicável | `nao_aplicavel` | ignorado |
| `*` | as análises estão sendo reavaliadas | `em_revisao` | não entra no total; o alimento fica `is_verified = false` |

## Observações técnicas honestas

- **Energia, carboidrato e vitamina A (RE/RAE)** são marcados como `calculado`, não
  `analitico`: a própria TACO os obtém por cálculo (fatores de conversão, diferença e soma
  de retinol com carotenóides, respectivamente).
- **Carboidrato levemente negativo** aparece em alguns pescados e carnes magras porque é
  calculado por diferença. São valores reais da fonte e foram **preservados como publicados**,
  sem "corrigir" para zero.
- **Estado de preparo** (cru/cozido/grelhado/…) é *derivado do nome oficial* por casamento
  exato de token. Quando o nome não traz um termo conhecido, fica `nao_informado` — nunca
  chutamos o preparo.
- **A TACO 4 não publica medidas caseiras por alimento** (colher de sopa, unidade, fatia).
  Portanto **nenhuma medida caseira foi inventada**. A estrutura, a interface e o cálculo
  estão prontos: o usuário cadastra as suas, e o mesmo pipeline pode importar uma segunda
  fonte oficial no futuro.
- **Parte comestível** não consta na planilha e ficou nula, em vez de receber 100% por
  suposição.

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `foods.json` | 597 alimentos normalizados com 21.147 valores nutricionais |
| `manifest.json` | fonte, licença, citação, contagens, legenda e SHA-256 do XLSX |
| `ATTRIBUTION.md` | este arquivo |

O XLSX original **não** é versionado no repositório: ele é redistribuído pelo NEPA e o
manifesto guarda o checksum para conferência.
