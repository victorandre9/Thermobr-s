import Link from "next/link";
import { ChevronRight, CheckCircle2, AlertTriangle, OctagonAlert, Info } from "lucide-react";
import type { Balao } from "@/server/services/dashboard";
import { formatBRL } from "@/lib/money";

const EST = {
  info: { cls: "", icone: Info, rot: "Informativo", cor: "text-ice-strong", ic: "" },
  atencao: { cls: "border-[#F5D9A8]", icone: AlertTriangle, rot: "Atenção", cor: "text-warn", ic: "warn" },
  alta: { cls: "border-[#F6C59B]", icone: AlertTriangle, rot: "Prioridade alta", cor: "text-[#9A3B00]", ic: "warn" },
  critica: { cls: "border-[#F2C4C4] bg-[#FFF9F9]", icone: OctagonAlert, rot: "Crítico", cor: "text-bad", ic: "bad" },
} as const;

/** Balão de pendência clicável: quantidade, valor (se autorizado), gravidade em texto+ícone e acesso à lista filtrada. */
export function BalaoCard({ b }: { b: Balao }) {
  const zero = b.quantidade === 0 && !b.valorCentavos;
  const e = zero ? { cls: "", icone: CheckCircle2, rot: "Sem pendências", cor: "text-ok", ic: "ok" } : EST[b.gravidade];
  const I = e.icone;
  return (
    <Link href={b.href} className={`card card-click group flex flex-col gap-2.5 p-4 ${e.cls}`}>
      <div className="flex items-start gap-3">
        <span className={`ic ${e.ic}`}><I size={18} aria-hidden /></span>
        <span className="flex-1 pt-0.5 text-[13px] font-semibold leading-snug text-text-2">{b.titulo}</span>
        <ChevronRight size={16} className="mt-0.5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
      <div className="flex items-baseline gap-3">
        {b.quantidade !== null && <span className="num text-[28px] font-extrabold leading-none tracking-tight text-navy">{b.quantidade}</span>}
        {b.valorCentavos !== undefined && (
          b.semBase || b.valorCentavos === null
            ? <span className="text-[13px] font-medium text-muted">Sem base registrada</span>
            : <span className={`num font-bold ${b.quantidade === null ? "text-[22px] text-navy" : "text-[14px] text-text-2"} ${b.valorCentavos < 0 ? "!text-bad" : ""}`}>{formatBRL(b.valorCentavos)}</span>
        )}
      </div>
      <div className={`flex items-center gap-1.5 text-[12px] font-semibold ${e.cor}`}><I size={13} aria-hidden />{e.rot}{b.descricao && <span className="font-normal text-muted">· {b.descricao}</span>}</div>
    </Link>
  );
}
