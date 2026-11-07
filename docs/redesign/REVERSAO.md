# REVERSAO — como desfazer o PR único do redesign (#65)

**Escrito na REDESIGN-08 (2026-11-07).** Vale para o merge de `feat/redesign-00-auditoria` em
`main` pelo PR #65 (D67). As levas anteriores (PRs #56 a #64, fases 00 a 03-G) já estão em `main`
e **não** são desfeitas por este documento.

## 1. Antes do merge — anote dois números

1. O **deploy de produção atual** na Vercel (o id `dpl_…` e o commit de `main`). É o alvo do
   rollback do §3.
2. O **md5 dos saldos** (é o mesmo SQL de toda fase do redesign):

   ```sql
   select md5(string_agg(id::text || ':' || public.account_balance(id)::text, ',' order by id))
     from public.accounts;
   ```

   Na 08 ele deu `15d93bd1c1d3e55a40db6210dff0eb3b` no início e no fim. Um número diferente antes
   do merge só significa que você lançou algo desde então — anote o novo.

## 2. Reverter o código

Por PR, nunca push direto em `main`:

```bash
git switch main && git pull
git switch -c revert/redesign-65
git revert -m 1 <commit do merge do #65>   # -m 1: mantém o lado de main
git push -u origin revert/redesign-65       # e abra o PR de reversão
```

O CI roda os cinco comandos. O merge desse PR gera um deploy novo, igual ao `main` anterior.

## 3. Reverter a produção sem esperar o CI (Vercel)

Se a produção quebrou e não dá para esperar o PR de reversão: **Instant Rollback** para o deploy
anotado no §1 (painel da Vercel → Deployments → o deploy → *Instant Rollback*). Ele troca só o
código servido; o banco não muda. Depois, faça o §2 mesmo assim — sem ele, o próximo push em
`main` publica o redesign de novo.

## 4. O que NÃO reverte: o banco

Nenhuma migration é desfeita por `git revert` nem pelo rollback. O PR #65 leva **quatro**, todas
já aplicadas no projeto `yjvnlbjvippefvzgrxxw`. Nomeadas **pelo arquivo** — a 04-C reusou os
nomes "M1/M2/M3", que já eram de migrations da 03.

| Arquivo | Fase | O que cria | Efeito com o código antigo |
| --- | --- | --- | --- |
| `20261025120000_salvar_lancamento_atomico.sql` | 03-G2 | `salvar_lancamento`, `criar_compra_parcelada` | Nenhum: o código de `main` não chama nenhuma das duas |
| `20261102120000_reembolso_vinculo.sql` | 04-C | `transactions.reembolso_pessoa_id`, FKs compostas, colunas da revisão de importação | Colunas nulas ficam paradas; o código antigo não as lê nem escreve |
| `20261102120100_reembolso_realocacao.sql` | 04-C | `realocar_reembolsos_da_pessoa` + **6 triggers** em `transactions` e `receivables` | ⚠️ **Continuam ativos** (ver abaixo) |
| `20261102120200_reembolso_salvar_lancamento.sql` | 04-C | nova versão de `salvar_lancamento` | Nenhum: o código antigo não a chama |

As anteriores (M1 `receivable_receipts`, M2 e M2b `liquidado_em` / `account_balance_before`, M3
`categories.classificacao_padrao`, M-F `pagar_fatura`) já estão em `main` e continuam valendo.

### ⚠️ Os triggers de realocação da 04-C

Eles disparam em todo insert, update e delete de `transactions` e `receivables`, mas **só agem**
quando há receita com `reembolso_pessoa_id` preenchido. Com o código antigo nada novo ganha essa
coluna. O que já tiver sido vinculado depois do deploy continua realocando sozinho, e a tela antiga
de `/terceiros` (com o "Receber" manual) passa a conviver com essas alocações automáticas.

**Para saber se isso importa**, depois de reverter:

```sql
select count(*) from public.transactions where reembolso_pessoa_id is not null;
select count(*) from public.receivable_receipts where transaction_id is not null;
```

Zero nas duas: nada a fazer. Diferente de zero: a decisão de desligar os triggers é **sua** — o
SQL de reversão está no cabeçalho do próprio arquivo (`drop trigger …`, `drop function …`) e o
`delete from public.receivable_receipts where transaction_id is not null` só se você reverter a
fase inteira. Rode o md5 do §1 antes e depois.

### Conferir a função `salvar_lancamento`

```sql
select pg_get_function_identity_arguments(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('salvar_lancamento', 'criar_compra_parcelada');
```

Com o código revertido, `grep -rn "salvar_lancamento\|criar_compra_parcelada" src` não acha
nada — as funções ficam no banco sem chamador. Removê-las é opcional e também é decisão sua.

## 5. Depois de reverter — confira

1. `curl -sD - -o /dev/null https://app.yurimoraes.com.br/login | grep x-vercel-id` →
   `gru1::gru1` (a região do banco; ver `CLAUDE.md`).
2. md5 dos saldos (§1) igual ao anotado.
3. `/dashboard`, `/dashboard/financeiro`, `/faturas`, `/terceiros` e `/relatorios` abrem sem erro.
4. As duas contagens do §4.
