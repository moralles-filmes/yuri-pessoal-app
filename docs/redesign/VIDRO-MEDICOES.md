# REDESIGN-09-A — medições do vidro (antes × depois)

Registro de desempenho da 09-A. Nenhum valor em R$, nenhum print. O "antes" é a base
`2fa0e01` (00-auditoria com as correções da 08 integradas na 09), medida em 2026-11-07.

## Como foi medido

- **Servidor:** produção local (`npm run build && npm run start -- -H 0.0.0.0`), com o
  `.env.local` do projeto (as `NEXT_PUBLIC_*` entram no build). Nunca o `next dev`.
- **Desktop:** Chrome do dono, com sessão, pela extensão Claude in Chrome. A janela estava
  maximizada a 2560 px e não aceitava redimensionar, então a tela é medida num **iframe da mesma
  origem de 1280×800** sobreposto à aba, com o tema forçado trocando a classe `light`/`dark` do
  `<html>` do iframe. Cada medição: 5 s de rolagem contínua (desce até o fim na 1ª metade e
  sobe na 2ª), conduzida por `requestAnimationFrame`, gravando o intervalo de cada quadro.
  3 repetições por tela e tema.
- **Telas:** `/dashboard` e `/dashboard/financeiro`. ⚠️ O plano dizia `/financeiro`, mas
  essa rota é a entrada curta do módulo e **não rola** (736 px de conteúdo numa janela de
  800 px; a 2560 px também não). A tela financeira com gráficos, a que o desenho cita, é
  `/dashboard/financeiro`.
- ⚠️ **Limite da medição:** o monitor roda a ~200 Hz e a extensão **não desacelera a CPU** (o
  desenho pedia 4×). Sem isso, a máquina sobra: o p95 fica preso em 5,1 ms, que é o intervalo
  de um quadro. O amostrador só pega engasgos grandes (o quadro máximo), e não diferenças finas
  de custo de pintura. **O teste do iPhone é a medida que decide.**

### Amostrador

```js
async function medir(path, tema) {
  const f = document.createElement("iframe");
  f.src = path;
  Object.assign(f.style, { position: "fixed", left: "0", top: "0", width: "1280px",
    height: "800px", zIndex: 2147483647, border: "0" });
  document.body.appendChild(f);
  await new Promise((r) => (f.onload = r));
  await new Promise((r) => setTimeout(r, 2500));
  const w = f.contentWindow, h = f.contentDocument.documentElement;
  h.classList.remove("light", "dark");
  h.classList.add(tema === "escuro" ? "dark" : "light");
  await new Promise((r) => setTimeout(r, 500));
  async function uma(ms = 5000) {
    const max = h.scrollHeight - w.innerHeight;
    w.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 300));
    const iv = []; let t0 = null, prev = null;
    await new Promise((res) => {
      function g(t) {
        if (t0 === null) { t0 = t; prev = t; } else { iv.push(t - prev); prev = t; }
        const p = (t - t0) / ms;
        w.scrollTo(0, max * (p < 0.5 ? p * 2 : 2 - p * 2));
        if (t - t0 < ms) w.requestAnimationFrame(g); else res();
      }
      w.requestAnimationFrame(g);
    });
    const s = [...iv].sort((a, b) => a - b), m = iv.reduce((a, b) => a + b, 0) / iv.length;
    return { quadros: iv.length, fps: +(1000 / m).toFixed(1),
      p95ms: +s[Math.floor(s.length * 0.95)].toFixed(1), maiorms: +s[s.length - 1].toFixed(1) };
  }
  const r = [];
  for (let i = 0; i < 3; i++) r.push(await uma());
  return r;
}
```

## Desktop — antes (base `2fa0e01`)

Rolagem total: `/dashboard` 1.708 px; `/dashboard/financeiro` 4.350 px.

| Tela | Tema | Rodada | Quadros | fps médio | p95 (ms) | maior quadro (ms) |
| --- | --- | --- | --- | --- | --- | --- |
| `/dashboard` | escuro | 1 | 999 | 199,6 | 5,1 | 10,9 |
| `/dashboard` | escuro | 2 | 1001 | 200,0 | 5,1 | 5,3 |
| `/dashboard` | escuro | 3 | 978 | 195,4 | 5,1 | **64,8** |
| `/dashboard` | claro | 1 | 995 | 198,8 | 5,1 | 15,1 |
| `/dashboard` | claro | 2 | 1001 | 200,0 | 5,1 | 5,2 |
| `/dashboard` | claro | 3 | 1001 | 200,0 | 5,1 | 5,2 |
| `/dashboard/financeiro` | escuro | 1 | 991 | 198,0 | 5,1 | 40,1 |
| `/dashboard/financeiro` | escuro | 2 | 1001 | 200,0 | 5,1 | 5,1 |
| `/dashboard/financeiro` | escuro | 3 | 1001 | 200,0 | 5,1 | 5,1 |
| `/dashboard/financeiro` | claro | 1 | 1001 | 200,0 | 5,1 | 5,2 |
| `/dashboard/financeiro` | claro | 2 | 1001 | 200,0 | 5,1 | 5,1 |
| `/dashboard/financeiro` | claro | 3 | 1001 | 200,0 | 5,1 | 5,1 |

⚠️ O "antes" **já tem** um quadro acima de 50 ms (64,8 ms, `/dashboard` escuro, 3ª rodada) e
um de 40 ms. Os dois são isolados e aparecem em rodadas diferentes da mesma tela, o que aponta
para trabalho de fundo (coleta de memória, carregamento sob demanda), não para pintura. Na T9, o
aceite "nenhum quadro acima de 50 ms" é lido **por repetição**: um engasgo isolado que também
aparece no "antes" não reprova, e um que se repete nas três rodadas reprova.

## iPhone — antes

Safari do iPhone do dono, na mesma Wi-Fi, em `http://<IP do PC>:3000`, rolando `/dashboard` e
`/dashboard/financeiro` nos dois temas.

> "Não travou" (resposta do dono, 2026-11-07).

## Testes e orçamento — antes

- `npm run test:run -- --testTimeout=30000`: **8.285 testes em 368 arquivos**, todos verdes.
- `npm run lint` e `npx tsc --noEmit`: limpos.
- `npm run build`: ok.
- `npm run perf:bundle`: todas as rotas dentro do orçamento. Mediana **203,0 KB** gz (build com o `.env.local`; sem ele, 202,8), 71 rotas,
  0 com teto próprio. A tabela abaixo lista **todas** as rotas (o script imprime só as 10
  maiores; a lista completa sai da mesma conta).

| KB gz | Rota | Chunks |
| --- | --- | --- |
| 226.4 | `/(app)/todo` | 19 |
| 222.2 | `/(app)/rotinas` | 18 |
| 217.4 | `/(app)/treinos/calendario` | 19 |
| 216.8 | `/(app)/tarefas` | 18 |
| 215.3 | `/(app)/financeiro/lancamentos` | 20 |
| 215.1 | `/(app)/habitos` | 19 |
| 214.7 | `/(app)/nutricao/diario` | 19 |
| 214.7 | `/(app)/treinos/treinos/[id]` | 19 |
| 214.5 | `/(app)/treinos/evolucao` | 20 |
| 213.8 | `/(app)/nutricao/relatorios` | 19 |
| 212.9 | `/(app)/agenda` | 17 |
| 212.6 | `/(app)/treinos/relatorios` | 19 |
| 211.4 | `/(app)/treinos/sessao` | 19 |
| 210.9 | `/(app)/terceiros` | 17 |
| 210.5 | `/(app)/treinos/sessao/preparar` | 18 |
| 210.0 | `/(app)/nutricao/compras` | 19 |
| 209.4 | `/(app)/relatorios` | 18 |
| 208.1 | `/(app)/treinos/historico` | 19 |
| 207.9 | `/(app)/nutricao/medidas` | 18 |
| 206.8 | `/(app)/treinos/metas` | 19 |
| 206.6 | `/(app)/importar` | 18 |
| 206.4 | `/(app)/treinos/exercicios/[id]` | 19 |
| 206.2 | `/(app)/financeiro/recorrencias` | 19 |
| 206.0 | `/(app)/cartoes/meus` | 18 |
| 205.8 | `/(app)/financeiro/contas-fixas` | 19 |
| 205.5 | `/(app)/nutricao/refeicoes` | 18 |
| 205.2 | `/(app)/financeiro/contas` | 19 |
| 204.7 | `/(app)/nutricao/planejamento` | 18 |
| 204.7 | `/(app)/dashboard/financeiro` | 18 |
| 204.3 | `/(app)/treinos/historico/[id]` | 17 |
| 204.0 | `/(app)/nutricao/alimentos` | 18 |
| 203.7 | `/(app)/treinos/sessao/revisar` | 18 |
| 203.6 | `/(app)/financeiro/categorias` | 19 |
| 203.3 | `/(app)/treinos/recordes` | 18 |
| 203.2 | `/(app)/nutricao/receitas` | 18 |
| 203.0 | `/(app)/ia/configuracoes` | 18 |
| 201.7 | `/(app)/nutricao/substituicoes` | 18 |
| 201.4 | `/(app)/treinos/treinos` | 18 |
| 201.1 | `/(app)/nutricao/metas` | 18 |
| 200.1 | `/(app)/treinos/exercicios` | 18 |
| 200.0 | `/(app)/nutricao/configuracoes` | 17 |
| 199.7 | `/(app)/treinos/configuracoes` | 17 |
| 199.5 | `/(app)/faturas` | 19 |
| 199.3 | `/(app)/dashboard` | 17 |
| 199.3 | `/(app)/ia` | 18 |
| 199.0 | `/(app)/treinos/programas` | 18 |
| 198.5 | `/(app)/parcelamentos` | 17 |
| 198.3 | `/(app)/ia/conversas/[id]` | 18 |
| 198.1 | `/(app)/ia/comprovantes` | 18 |
| 196.6 | `/(app)/configuracoes` | 17 |
| 196.0 | `/(app)/estudos/[id]` | 17 |
| 194.8 | `/(app)/ia/insights` | 17 |
| 194.5 | `/(app)/ia/acoes` | 17 |
| 194.0 | `/(app)/nutricao` | 17 |
| 192.9 | `/(app)/estudos` | 17 |
| 192.5 | `/(app)/ia/memoria` | 17 |
| 192.2 | `/(app)/treinos/hoje` | 17 |
| 191.1 | `/(app)/ia/conversas` | 17 |
| 190.6 | `/(app)/treinos` | 16 |
| 189.6 | `/(app)/cartoes/relatorios` | 17 |
| 189.1 | `/(app)/ia/consumo` | 16 |
| 189.0 | `/(app)/notificacoes` | 16 |
| 187.4 | `/(app)/cartoes/proximos-meses` | 17 |
| 186.5 | `/(app)/busca` | 16 |
| 186.4 | `/(app)/cartoes` | 16 |
| 186.0 | `/(app)/financeiro` | 17 |
| 161.5 | `/(auth)/login` | 11 |
| 161.5 | `/(auth)/cadastro` | 11 |
| 49.1 | `/` | 6 |
| 49.1 | `/_not-found` | 6 |
| 3.9 | `/_global-error` | 1 |
