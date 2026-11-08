import { beforeEach, describe, expect, it, vi } from "vitest";
const d=vi.hoisted(() => ({ auth:vi.fn(), conferir:vi.fn(), decidir:vi.fn(), executar:vi.fn() }));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("./helpers",()=>({authContext:d.auth,notAuthed:{ok:false,error:"Sem sessão"},invalid:()=>({ok:false,error:"Inválido"})}));
vi.mock("@/lib/ai/approval/execute",()=>({conferirConfirmacao:d.conferir,registrarDecisao:d.decidir,executarAcaoAprovada:d.executar}));
vi.mock("@/lib/ai/approval/undo",()=>({prepararDesfazer:vi.fn()}));
const { confirmarAcaoDaIa }=await import("./ai-actions");
const entrada={proposalId:"11111111-1111-4111-8111-111111111111",hash:"a".repeat(64)};
beforeEach(()=>{vi.resetAllMocks();d.auth.mockResolvedValue({userId:"dono"});d.conferir.mockResolvedValue({ok:true});d.decidir.mockResolvedValue({ok:true,approvalId:"a"});d.executar.mockResolvedValue({ok:true,status:"sucesso",executionId:"e",targetId:null,targetRoute:null,revalidar:[]});});
describe("checagens antes de consumir a confirmação",()=>{
  it.each(["PROPOSTA_EXPIRADA","COMMAND_DESCONHECIDO"])("%s não grava decisão",async motivo=>{
    d.conferir.mockResolvedValue({ok:false,motivo,mensagem:"Nada foi alterado."});
    expect(await confirmarAcaoDaIa(entrada)).toEqual({ok:false,error:"Nada foi alterado."});
    expect(d.conferir).toHaveBeenCalledWith(expect.objectContaining({userId:"dono",proposalId:entrada.proposalId,hashDaTela:entrada.hash,agora:expect.any(Date)}));
    expect(d.decidir).not.toHaveBeenCalled();expect(d.executar).not.toHaveBeenCalled();
  });
  it("confere antes de registrar e executa somente depois da decisão",async()=>{
    expect((await confirmarAcaoDaIa(entrada)).ok).toBe(true);
    expect(d.conferir.mock.invocationCallOrder[0]).toBeLessThan(d.decidir.mock.invocationCallOrder[0]);
    expect(d.decidir.mock.invocationCallOrder[0]).toBeLessThan(d.executar.mock.invocationCallOrder[0]);
  });
  it("sem sessão ou entrada inválida não consulta proposta nem grava decisão",async()=>{
    d.auth.mockResolvedValueOnce(null);await confirmarAcaoDaIa(entrada);await confirmarAcaoDaIa({});
    expect(d.conferir).not.toHaveBeenCalled();expect(d.decidir).not.toHaveBeenCalled();
  });
});
