import * as React from "react";
import Link from "next/link";
import { formatar, type Inline } from "@/lib/ai/formatacao";

function Trecho({ nos }: { readonly nos: readonly Inline[] }): React.JSX.Element {
  return <>{nos.map((no, i) => {
    switch (no.t) {
      case "texto": return <React.Fragment key={i}>{no.v}</React.Fragment>;
      case "negrito": return <strong key={i}><Trecho nos={no.v} /></strong>;
      case "italico": return <em key={i}><Trecho nos={no.v} /></em>;
      case "codigo": return <code key={i} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">{no.v}</code>;
      case "quebra": return <br key={i} />;
      case "link": return <Link key={i} href={no.href} className="underline underline-offset-4"><Trecho nos={no.v} /></Link>;
    }
  })}</>;
}

export function RespostaFormatada({ texto }: { readonly texto: string }): React.JSX.Element {
  return <div className="min-w-0 space-y-3 break-words">
    {formatar(texto).map((bloco, i) => {
      switch (bloco.t) {
        case "paragrafo": return <p key={i}><Trecho nos={bloco.v} /></p>;
        case "titulo": return bloco.nivel === 2
          ? <h2 key={i} className="text-base font-semibold"><Trecho nos={bloco.v} /></h2>
          : <h3 key={i} className="font-semibold"><Trecho nos={bloco.v} /></h3>;
        case "lista": {
          const itens = bloco.itens.map((nos, j) => <li key={j}><Trecho nos={nos} /></li>);
          return bloco.ordenada
            ? <ol key={i} className="list-decimal space-y-1 pl-5">{itens}</ol>
            : <ul key={i} className="list-disc space-y-1 pl-5">{itens}</ul>;
        }
      }
    })}
  </div>;
}
