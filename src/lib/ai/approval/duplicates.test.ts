import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { AVISO_DUPLICATA, duplicataNoChat, idsDePropostasDuplicadas } from "./duplicates";
const p={id:"a",runId:"run",effectHash:"hash",pendente:true};
describe("aviso de possível duplicata",()=>{
  it("usa ids distintos, mesmo run e hash, somente pendentes",()=>{
    expect([...idsDePropostasDuplicadas([p,{...p,id:"b"}])]).toEqual(["a","b"]);
    expect([...idsDePropostasDuplicadas([p,p])]).toEqual([]);
    for(const outra of [{...p,id:"b",runId:"outro"},{...p,id:"b",effectHash:"outro"},{...p,id:"b",pendente:false},{...p,id:"b",runId:null}]) expect([...idsDePropostasDuplicadas([p,outra])]).toEqual([]);
  });
  it("no chat compara somente os cartões ainda no prazo da mesma resposta",()=>{
    const a={id:"a",effectHash:"h",expiresAt:"2026-11-08T15:00:00Z"};const b={...a,id:"b"};
    expect(duplicataNoChat(a,[a,b],Date.parse("2026-11-08T14:59:00Z"))).toBe(true);
    expect(duplicataNoChat(a,[a,b],Date.parse(a.expiresAt))).toBe(false);
    expect(duplicataNoChat(a,[a,{...b,expiresAt:"inválida"}],0)).toBe(false);
    expect(duplicataNoChat(a,[a],0)).toBe(false);
  });
  it("o histórico recebe run_id e os dois hosts ligam o aviso ao cartão",()=>{
    const consultas=fs.readFileSync("src/lib/ai/approval/queries.ts","utf8");
    const chat=fs.readFileSync("src/components/ai/chat-client.tsx","utf8");
    const historico=fs.readFileSync("src/components/ai/action-history-client.tsx","utf8");
    const cartao=fs.readFileSync("src/components/ai/proposal-card.tsx","utf8");
    expect(consultas.match(/conversation_id, run_id, undoes_execution_id/g)).toHaveLength(2);
    expect(consultas).toContain("runId: linha.run_id");
    expect(chat).toMatch(/propostasPendentes=\{\(b.propostas \?\? \[\]\).filter/);
    expect(chat).toContain('desfechos[q.id].tipo === "pendente"');
    expect(historico).toContain("possivelDuplicata={acao.possivelDuplicata}");
    expect(historico).toContain("min-w-0 flex-auto truncate font-medium");
    expect(cartao).toContain("duplicataNoChat(proposta, propostasPendentes, agora)");
    expect(cartao).toMatch(/duplicada && <p role="status"[^>]*>\{AVISO_DUPLICATA\}/);
    expect(cartao).toContain("disabled={agora === null || !vista.podeConfirmar}");
    expect(AVISO_DUPLICATA).toBe("possível duplicata — há outra igual nesta conversa");
  });
});
