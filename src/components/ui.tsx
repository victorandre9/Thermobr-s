import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert, Inbox, type LucideIcon } from "lucide-react";
import { formatBRL } from "@/lib/money";
import { Voltar } from "./voltar";
import { formatQtd } from "@/lib/quantidade";
import { LOGO_SRC, LOGO_LARGURA, LOGO_ALTURA } from "@/lib/marca";

export function cx(...c: Array<string | false | null | undefined>) { return c.filter(Boolean).join(" "); }

export function Marca({ compacta = false }: { compacta?: boolean }) {
  if (LOGO_SRC) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <span className="inline-flex flex-col items-start leading-tight">
        <span className="inline-block rounded-xl bg-white px-1.5 py-1 shadow-[0_1px_4px_rgba(16,34,56,0.08)]"><img src={LOGO_SRC} alt="Thermobrás Ar Condicionado" width={compacta ? Math.round(LOGO_LARGURA * 0.62) : LOGO_LARGURA} height={compacta ? Math.round(LOGO_ALTURA * 0.62) : LOGO_ALTURA} className="block h-auto" /></span>
        {!compacta && <span className="mt-1.5 block text-[11px] font-semibold text-muted">Projeto de Gestão Integrada</span>}
      </span>
    );
  }
  return (
    <span className="leading-tight">
      <span className={cx("block font-extrabold tracking-tight text-navy", compacta ? "text-lg" : "text-xl")}>Thermobrás</span>
      {!compacta && <span className="block text-[11px] font-medium text-muted">Projeto de Gestão Integrada</span>}
    </span>
  );
}

export function PageHeader({ titulo, subtitulo, acoes, voltar }: { titulo: string; subtitulo?: ReactNode; acoes?: ReactNode; voltar?: { href: string; rotulo: string } }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div>{voltar ? <Voltar href={voltar.href} rotulo={voltar.rotulo} /> : <Voltar />}</div>
        <h1 className="text-[22px] font-bold tracking-tight text-navy">{titulo}</h1>
        {subtitulo && <div className="mt-0.5 text-[13.5px] text-muted">{subtitulo}</div>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function Card({ titulo, acoes, children, className, pad = true, icone: I }: { titulo?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string; pad?: boolean; icone?: LucideIcon }) {
  return (
    <section className={cx("card", className)}>
      {(titulo || acoes) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-2 text-[14.5px] font-semibold text-navy">{I && <span className="ic !h-7 !w-7 !rounded-lg"><I size={15} aria-hidden /></span>}{titulo}</h2>
          {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
        </div>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export type Tom = "neutro" | "info" | "ok" | "atencao" | "alerta" | "critico" | "navy";
const TONS: Record<Tom, string> = {
  neutro: "bg-surface-2 text-text-2 border-line",
  info: "bg-ice-soft text-ice-strong border-frost",
  ok: "bg-ok-soft text-ok border-[#BFE5D1]",
  atencao: "bg-warn-soft text-warn border-[#F5D9A8]",
  alerta: "bg-[#FFE9D6] text-[#9A3B00] border-[#F6C59B]",
  critico: "bg-bad-soft text-bad border-[#F2C4C4]",
  navy: "bg-navy text-white border-navy",
};
const ICONES: Partial<Record<Tom, LucideIcon>> = { ok: CheckCircle2, atencao: AlertTriangle, alerta: AlertTriangle, critico: OctagonAlert, info: Info };

/** Selo de situação: sempre texto + ícone (não depende só de cor). */
export function Badge({ tom = "neutro", children, icone = true }: { tom?: Tom; children: ReactNode; icone?: boolean }) {
  const I = icone ? ICONES[tom] : undefined;
  return <span className={cx("inline-flex h-fit shrink-0 items-center gap-1 self-start whitespace-nowrap rounded-full border px-2 py-0.5 text-[12px] font-semibold", TONS[tom])}>{I && <I size={12} aria-hidden />}{children}</span>;
}

export function Aviso({ tom = "info", titulo, children }: { tom?: Tom; titulo?: string; children: ReactNode }) {
  const I = ICONES[tom] ?? Info;
  return (
    <div role={tom === "critico" ? "alert" : "status"} className={cx("flex gap-2.5 rounded-xl border px-3.5 py-3 text-[13.5px]", TONS[tom])}>
      <I size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">{titulo && <div className="font-semibold">{titulo}</div>}<div className="font-normal">{children}</div></div>
    </div>
  );
}

export function Vazio({ titulo, children, acao }: { titulo: string; children?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <span className="ic ok !h-12 !w-12 !rounded-2xl"><Inbox size={22} aria-hidden /></span>
      <div className="font-semibold text-navy">{titulo}</div>
      {children && <div className="max-w-md text-[13.5px] text-muted">{children}</div>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}

export function Dinheiro({ v, className }: { v: number | null | undefined; className?: string }) {
  return <span className={cx("num whitespace-nowrap", v !== null && v !== undefined && v < 0 && "text-bad", className)}>{formatBRL(v)}</span>;
}
export function Qtd({ v, u }: { v: string | number | null | undefined; u?: string }) {
  return <span className="num whitespace-nowrap">{formatQtd(v, u)}</span>;
}

export function Campo({ rotulo, nome, children, dica, obrigatorio }: { rotulo: string; nome?: string; children: ReactNode; dica?: ReactNode; obrigatorio?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={nome}>{rotulo}{obrigatorio && <span className="text-bad"> *</span>}</label>
      {children}
      {dica && <div className="hint">{dica}</div>}
    </div>
  );
}

export function Dl({ itens }: { itens: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {itens.map(([k, v]) => (
        <div key={k} className="min-w-0"><dt className="text-[12px] font-semibold uppercase tracking-wide text-muted">{k}</dt><dd className="mt-0.5 break-words text-[14px]">{v ?? "—"}</dd></div>
      ))}
    </dl>
  );
}

export function Filtros({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}
export function ChipLink({ href, ativo, children }: { href: string; ativo?: boolean; children: ReactNode }) {
  return <Link href={href} className="chip" aria-current={ativo ? "true" : undefined}>{children}</Link>;
}

export function Paginacao({ total, limite, offset, base }: { total: number; limite: number; offset: number; base: string }) {
  if (total <= limite) return total ? <div className="px-4 py-3 text-[12.5px] text-muted">{total} registro(s)</div> : null;
  const sep = base.includes("?") ? "&" : "?";
  return (
    <div className="flex items-center justify-between px-4 py-3 text-[13px] text-muted">
      <span>{offset + 1}–{Math.min(offset + limite, total)} de {total}</span>
      <span className="flex gap-2">
        {offset > 0 && <Link className="btn btn-ghost btn-sm" href={`${base}${sep}offset=${Math.max(0, offset - limite)}`}>Anterior</Link>}
        {offset + limite < total && <Link className="btn btn-ghost btn-sm" href={`${base}${sep}offset=${offset + limite}`}>Próxima</Link>}
      </span>
    </div>
  );
}
