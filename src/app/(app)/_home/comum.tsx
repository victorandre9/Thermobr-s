import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { Ctx } from "@/server/auth/contexto";
import { visoesDisponiveis, type Visao } from "@/server/services/inicio";
import { hojeSP, inicioSemana, primeiroDiaMes, fmtDia } from "@/lib/datas";
import { escolherVisao } from "./actions";
import { Chips } from "./blocos";

export type SP = Record<string, string | undefined>;

/** Período para "realizado": Hoje, Esta semana, Este mês, Personalizado (datas SP). */
export function periodoDe(sp: SP) {
  const hoje = hojeSP();
  const p = sp.p ?? "mes";
  if (p === "hoje") return { chave: p, de: hoje, ate: hoje, rotulo: "hoje" };
  if (p === "semana") return { chave: p, de: inicioSemana(hoje), ate: hoje, rotulo: "esta semana" };
  if (p === "custom" && sp.de && sp.ate) return { chave: p, de: sp.de, ate: sp.ate, rotulo: `${fmtDia(sp.de)} a ${fmtDia(sp.ate)}` };
  return { chave: "mes", de: primeiroDiaMes(hoje), ate: hoje, rotulo: "este mês" };
}

export function SeletorPeriodo({ sp, base = "/" }: { sp: SP; base?: string }) {
  const per = periodoDe(sp);
  const q = (o: Record<string, string>) => base + "?" + new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && !["p", "de", "ate"].includes(k)) as [string, string][]), ...o }).toString();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chips ativo={per.chave} opcoes={[{ chave: "hoje", rotulo: "Hoje", href: q({ p: "hoje" }) }, { chave: "semana", rotulo: "Esta semana", href: q({ p: "semana" }) }, { chave: "mes", rotulo: "Este mês", href: q({ p: "mes" }) }]} />
      <details className="relative"><summary className="chip !py-1 !text-[12px] cursor-pointer" aria-current={per.chave === "custom" ? "true" : undefined}>Personalizado</summary>
        <form action={base} className="card absolute right-0 z-10 mt-1 flex gap-2 p-2"><input type="hidden" name="p" value="custom" /><input type="date" name="de" defaultValue={per.de} className="input !w-36 !py-1" aria-label="De" /><input type="date" name="ate" defaultValue={per.ate} className="input !w-36 !py-1" aria-label="Até" /><button className="btn btn-ghost btn-sm">OK</button></form>
      </details>
    </div>
  );
}

const NOMES: Record<Visao, string> = { gestor: "Gestor", administrativo: "Operação", financeiro: "Financeiro" };
/** Troca de visão inicial: só aparece para quem tem mais de uma função; não concede acesso. */
export function SeletorVisao({ ctx, atual }: { ctx: Ctx; atual: Visao }) {
  const vs = visoesDisponiveis(ctx);
  if (vs.length < 2) return null;
  return (
    <form action={escolherVisao} className="flex flex-wrap items-center gap-1.5" aria-label="Visão inicial">
      <span className="text-[12px] text-muted">Visão:</span>
      {vs.map((v) => <button key={v} name="visao" value={v} className="chip !py-1 !text-[12px]" aria-current={v === atual ? "true" : undefined}>{NOMES[v]}</button>)}
    </form>
  );
}

export function AvisoConfig({ a }: { a: { texto: string; podeConfigurar: boolean } | null }) {
  if (!a) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#F5D9A8] bg-warn-soft px-3 py-2 text-[13px] text-warn" role="status">
      <AlertTriangle size={16} className="shrink-0" aria-hidden /><span className="flex-1">{a.texto}</span>
      {a.podeConfigurar && <Link href="/configuracoes/implantacao" className="btn btn-ghost btn-sm">Configurar</Link>}
    </div>
  );
}

export function Cabecalho({ titulo, sub, direita }: { titulo: string; sub?: string; direita?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="text-[21px] font-bold tracking-tight text-navy">{titulo}</h1>{sub && <p className="text-[12.5px] text-muted">{sub}</p>}</div>
      {direita}
    </div>
  );
}
