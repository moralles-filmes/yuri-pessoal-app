/**
 * REDESIGN-07-D · D2 — IA · Preferências: o que se vê é o que se salva.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ DESLIGAR A LEITURA DESLIGA A ESCRITA QUE DEPENDE DELA. LIGAR NÃO LIGA NADA ALÉM DELA. ║
 * ║                                                                                       ║
 * ║ O formulário é `useState` sem `key`, e o `router.refresh()` não o reinicia. Antes,    ║
 * ║ desligar a leitura deixava a escrita marcada no estado: o servidor gravava `false`    ║
 * ║ (ele ANDa as duas chaves), a tela continuava mostrando `true`, e religar a leitura    ║
 * ║ religava a escrita sozinha — o interruptor voltava habilitado e marcado, e salvar     ║
 * ║ gravava `true`. Religar uma permissão de escrita tem de ser um clique do dono.        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * A dependência escrita → leitura chega por `escritas`, que o Server Component deriva do
 * REGISTRY (`catalogoDasPermissoes`, de `permissaoDeLeituraDaEscrita`) — nunca de uma lista à
 * mão, e sem levar o registry ao navegador. A do envio de comprovantes é a da 18-D
 * (`allow_vision` ANDada com `allow_finance` E `allow_write_finance`), a mesma que a action e
 * o RPC conferem.
 *
 * O servidor continua ANDando (`actions/ai-preferences.ts`) — isto é a tela concordando com
 * ele, não substituindo a trava. Sem import de runtime: `import type` é apagado na compilação.
 */

import type { ToolPermission, ToolWritePermission } from "@/lib/ai/tools/contracts";
import type { CatalogoDasPermissoes } from "@/lib/ai/permissoes-da-tela";

export type PermissoesDoForm = {
  readonly permissions: Readonly<Record<ToolPermission, boolean>>;
  readonly writePermissions: Readonly<Record<ToolWritePermission, boolean>>;
  readonly allowVision: boolean;
};

export type EscritasDoCatalogo = CatalogoDasPermissoes["escritas"];

/** As duas chaves de que o envio de comprovantes depende (invariante da 18-D). */
const LEITURA_DA_VISAO = "allow_finance" satisfies ToolPermission;
const ESCRITA_DA_VISAO = "allow_write_finance" satisfies ToolWritePermission;

const chavesDeEscrita = (escritas: EscritasDoCatalogo) =>
  Object.keys(escritas) as ToolWritePermission[];

export function alternarLeitura<T extends PermissoesDoForm>(
  f: T,
  chave: ToolPermission,
  valor: boolean,
  escritas: EscritasDoCatalogo,
): T {
  const permissions = { ...f.permissions, [chave]: valor };
  if (valor) return { ...f, permissions };

  const writePermissions = { ...f.writePermissions };
  for (const escrita of chavesDeEscrita(escritas)) {
    if (escritas[escrita].leitura === chave) writePermissions[escrita] = false;
  }
  return {
    ...f,
    permissions,
    writePermissions,
    allowVision: chave === LEITURA_DA_VISAO ? false : f.allowVision,
  };
}

export function alternarEscrita<T extends PermissoesDoForm>(
  f: T,
  chave: ToolWritePermission,
  valor: boolean,
  escritas: EscritasDoCatalogo,
): T {
  // O interruptor fica desabilitado sem a leitura; a regra também recusa, para o estado não
  // depender de o botão estar desenhado certo.
  if (valor && !leituraLigada(f, chave, escritas)) return f;
  return {
    ...f,
    writePermissions: { ...f.writePermissions, [chave]: valor },
    allowVision: !valor && chave === ESCRITA_DA_VISAO ? false : f.allowVision,
  };
}

function leituraLigada(
  f: PermissoesDoForm,
  chave: ToolWritePermission,
  escritas: EscritasDoCatalogo,
): boolean {
  const leitura = escritas[chave]?.leitura ?? null;
  return leitura !== null && f.permissions[leitura] === true;
}

/** O interruptor de escrita mostra leitura E escrita — defesa contra estado vindo do servidor. */
export function escritaVisivel(
  f: PermissoesDoForm,
  chave: ToolWritePermission,
  escritas: EscritasDoCatalogo,
): boolean {
  return leituraLigada(f, chave, escritas) && f.writePermissions[chave] === true;
}

/** O envio de comprovantes só é possível com as duas chaves do Financeiro ligadas. */
export function visaoPossivel(f: PermissoesDoForm, escritas: EscritasDoCatalogo): boolean {
  return f.permissions[LEITURA_DA_VISAO] === true && escritaVisivel(f, ESCRITA_DA_VISAO, escritas);
}

export function visaoVisivel(f: PermissoesDoForm, escritas: EscritasDoCatalogo): boolean {
  return f.allowVision && visaoPossivel(f, escritas);
}

/** O payload: exatamente o que os interruptores mostram. */
export function permissoesParaSalvar(
  f: PermissoesDoForm,
  escritas: EscritasDoCatalogo,
): {
  permissions: Record<ToolPermission, boolean>;
  writePermissions: Record<ToolWritePermission, boolean>;
  allowVision: boolean;
} {
  const writePermissions = { ...f.writePermissions };
  for (const chave of Object.keys(writePermissions) as ToolWritePermission[]) {
    writePermissions[chave] = escritaVisivel(f, chave, escritas);
  }
  return {
    permissions: { ...f.permissions },
    writePermissions,
    allowVision: visaoVisivel(f, escritas),
  };
}
