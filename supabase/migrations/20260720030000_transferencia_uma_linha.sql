-- Correção — Transferência passa a ser UMA linha (antes eram duas, espelhadas).
--
-- Bug: `createTransaction` gravava DUAS linhas por transferência (A→B e B→A com o mesmo
-- `transfer_group_id`), enquanto `public.account_balance` (20260625120600) já deriva os
-- dois lados de UMA linha: -amount em `account_id`, +amount em `transfer_account_id`.
-- Resultado: cada conta recebia -amount de uma perna e +amount da outra, as pernas se
-- anulavam e o saldo das contas nunca mudava.
--
-- Efeito colateral do par espelhado: nada distinguia origem de destino, então a direção
-- exibida na lista dependia do desempate arbitrário do ORDER BY.
--
-- Aqui: remove a perna espelhada (mantém a linha de ORIGEM — a gravada primeiro, de menor
-- `ctid`, que é a que o app sempre exibiu) e cria índice único para o par não voltar.
-- Idempotente: rodar de novo é no-op.

-- 1) Dedup: uma linha por transferência, mantendo a de origem.
with ranked as (
  select id,
         row_number() over (partition by transfer_group_id order by ctid) as rn
  from public.transactions
  where transfer_group_id is not null
)
delete from public.transactions t
using ranked r
where t.id = r.id
  and r.rn > 1;

-- 2) Guarda contra regressão: uma transferência = uma linha.
create unique index if not exists transactions_transfer_group_unique
  on public.transactions (transfer_group_id)
  where transfer_group_id is not null;
