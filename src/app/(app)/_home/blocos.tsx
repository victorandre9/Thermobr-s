import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, ChevronRight, type LucideIcon } from "lucide-react";
import type { Indicador } from "@/server/services/inicio";
import { formatBRL } from "@/lib/money";

/** Indicador compacto: número + rótulo + link para a lista com os mesmos critérios. Problema sinalizado por ícone e texto, não só cor. */
export function Kpi({ i }: { i: Indicador }) {
  const prob = i.tom === "problema" && (i.valor ?? 0) !== 0;
  return (
    <Link href={i.href} className={`tile-kpi ${prob ? "problema" : i.tom === "ok" ? "ok" : ""}`}>
      <span className="flex items-start justify-between gap-1 text-[12.5px] font-semibold leading-tight text-text-2">{i.rotulo}<ChevronRight size={14} className="mt-0.5 shrink-0 text-muted" aria-hidden /></span>
      <span className={`v num text-[21px] font-extrabold leading-tight tracking-tight ${prob ? "text-[#9A3B00]" : "text-navy"}`}>
        {i.semBase || (i.moeda && i.valor === null) ? <span className="text-[13px] font-semibold text-muted">Sem base registrada</span> : i.valor === null ? "" : i.moeda ? formatBRL(i.valor) : i.valor}
      </span>
      {(prob || i.dica) && <span className="flex items-center gap-1 text-[11.5px] leading-snug text-muted">{prob && <AlertTriangle size={12} className="shrink-0 text-warn" aria-label="Atenção" />}{i.dica ?? "Requer atenção"}</span>}
    </Link>
  );
}

export function GradeKpi({ itens, colunasDesktop = 4 }: { itens: Indicador[]; colunasDesktop?: 2 | 3 | 4 }) {
  const cols = { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" }[colunasDesktop];
  return <div className={`grid grid-cols-2 gap-2.5 ${cols}`}>{itens.map((i) => <Kpi key={i.id} i={i} />)}</div>;
}

export function Secao({ titulo, sub, acao, children, className }: { titulo: string; sub?: ReactNode; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="sec-tit"><div><h2>{titulo}</h2>{sub && <p className="text-[12px] text-muted">{sub}</p>}</div>{acao}</div>
      {children}
    </section>
  );
}

export function AcoesRapidas({ itens }: { itens: Array<{ href: string; rotulo: string; icone: LucideIcon }> }) {
  if (!itens.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {itens.map(({ href, rotulo, icone: I }) => <Link key={rotulo} href={href} className="btn btn-ghost !justify-start !rounded-2xl !px-3 !py-2.5 text-left"><span className="ic !h-8 !w-8"><I size={16} aria-hidden /></span><span className="whitespace-normal leading-tight">{rotulo}</span></Link>)}
    </div>
  );
}

export function Chips({ opcoes, ativo }: { opcoes: Array<{ href: string; rotulo: string; chave: string }>; ativo: string }) {
  return <div className="flex flex-wrap gap-1.5">{opcoes.map((o) => <Link key={o.chave} href={o.href} className="chip !py-1 !text-[12px]" aria-current={o.chave === ativo ? "true" : undefined}>{o.rotulo}</Link>)}</div>;
}
