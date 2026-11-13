import Link from "next/link";
import { MapPin, Clock, ChevronRight, Wrench, Package, Wallet, AlertTriangle, PlayCircle, ClipboardCheck, CheckCircle2 } from "lucide-react";
import { db } from "@/server/db";
import type { Ctx } from "@/server/auth/contexto";
import { minhasVisitas, minhasVisitasEmAndamento } from "@/server/services/agenda";
import { listarPendencias } from "@/server/services/pendencias";
import { listarFerramentas, movimentosFerramentaPendentes } from "@/server/services/ferramentas";
import { minhaCustodia } from "@/server/services/materiais";
import { listarServicosAutonomos } from "@/server/services/autonomos";
import { checklistDoDia } from "@/server/services/veiculos";
import { Aviso, Badge, Card, Dinheiro, Vazio } from "@/components/ui";
import { fmtHora, fmtDia, hojeSP, intervaloDiaSP, somarDias, diaSP, NOMES_DIA, diaSemana } from "@/lib/datas";
import { VISITA_SITUACOES, rotulo, AUTONOMO_SITUACAO } from "@/lib/dominio";

export async function HomeTecnico({ ctx }: { ctx: Ctx }) {
  const hoje = hojeSP();
  const [ini, fim] = intervaloDiaSP(hoje);
  const [, fim7] = intervaloDiaSP(somarDias(hoje, 7));
  const [doDia, proximas, andamento, pend, ferr, ferrPend, mat, pag] = await Promise.all([
    minhasVisitas(db, ctx, ini, fim), minhasVisitas(db, ctx, fim, fim7), minhasVisitasEmAndamento(db, ctx),
    listarPendencias(db, ctx, { situacao: "abertas", limite: 20 }), listarFerramentas(db, ctx), movimentosFerramentaPendentes(db, ctx), minhaCustodia(db, ctx),
    ctx.profissional?.vinculo === "autonomo" ? listarServicosAutonomos(db, ctx) : Promise.resolve([]),
  ]);
  const prof = ctx.profissional!;
  const checklist = prof.vinculo === "proprio" ? await checklistDoDia(db, ctx) : null;
  const somar = (sit: string) => pag.filter((p) => p.situacaoExibida === sit).reduce((s, p) => s + (p.s.valorCombinadoCentavos ?? 0), 0);
  return (
    <div className="space-y-5">
      <div><h1 className="text-[22px] font-bold text-navy">Olá, {ctx.nome.split(" ")[0]}</h1><p className="text-muted">{NOMES_DIA[diaSemana(hoje)]}, {fmtDia(hoje)}</p></div>
      {andamento.map((a) => (
        <Link key={a.id} href={`/visitas/${a.id}`} className="card flex items-center gap-3 border-ice bg-ice-soft p-4"><span className="ic"><PlayCircle size={20} aria-hidden /></span><div className="flex-1"><div className="font-bold text-navy">Atendimento em andamento — OS {a.osNumero}</div><div className="text-[13px] text-text-2">{a.clienteNome} · desde {fmtHora(a.checkinEm)}</div></div><ChevronRight aria-hidden /></Link>
      ))}
      {prof.vinculo === "proprio" && (checklist ? (
        <Link href="/checklist-hoje" className="card flex items-center gap-3 p-4"><span className="ic ok"><CheckCircle2 size={20} aria-hidden /></span><div className="flex-1"><div className="font-bold text-navy">Checklist do veículo de hoje feito</div><div className="text-[13px] text-text-2">{checklist.placa ?? checklist.identificacao} · às {fmtHora(checklist.r.realizadoEm)} · check-in liberado</div></div><ChevronRight className="text-muted" aria-hidden /></Link>
      ) : (
        <div className="card border-warn/40 p-4">
          <div className="flex items-start gap-3"><span className="ic warn"><ClipboardCheck size={20} aria-hidden /></span><div className="flex-1"><div className="font-bold text-navy">Antes de sair: checklist do veículo</div><div className="text-[13px] text-text-2">Escolha a placa de hoje e confira os itens. O check-in das visitas só libera depois do checklist.</div></div></div>
          <Link href="/checklist-hoje" className="btn btn-primary btn-lg mt-3 w-full"><ClipboardCheck size={18} aria-hidden />Fazer checklist de hoje</Link>
        </div>
      ))}
      <section>
        <h2 className="mb-2 text-[16px] font-semibold text-navy">Visitas de hoje</h2>
        {doDia.length === 0 ? <div className="card"><Vazio titulo="Nenhuma visita hoje">Quando o escritório agendar, ela aparece aqui.</Vazio></div> : (
          <ul className="space-y-3">{doDia.map((v) => (
            <li key={v.id}><Link href={`/visitas/${v.id}`} className="card flex items-center gap-3 p-4 active:bg-ice-faint">
              <div className="w-16 shrink-0 text-center"><div className="num text-xl font-bold text-navy">{fmtHora(v.inicio)}</div><div className="text-[11px] text-muted">até {fmtHora(v.fim)}</div></div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-navy">{v.clienteNome}</div>
                <div className="truncate text-[13px] text-text-2">OS {v.osNumero} · {v.descricao}</div>
                <div className="mt-1 flex items-center gap-1 text-[12.5px] text-muted"><MapPin size={13} aria-hidden />{[v.logradouro, v.numero, v.bairro].filter(Boolean).join(", ") || v.localNome || "Endereço não informado"}</div>
              </div>
              <div className="flex flex-col items-end gap-1"><Badge tom={v.situacao === "finalizada" ? "ok" : v.situacao === "em_atendimento" ? "info" : "neutro"}>{rotulo(VISITA_SITUACOES, v.situacao)}</Badge><ChevronRight size={18} className="text-muted" aria-hidden /></div>
            </Link></li>
          ))}</ul>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-[16px] font-semibold text-navy">Próximos atendimentos</h2>
        {proximas.length === 0 ? <p className="text-[13px] text-muted">Nenhum nos próximos 7 dias.</p> : (
          <ul className="card divide-y divide-line">{proximas.map((v) => (
            <li key={v.id}><Link href={`/visitas/${v.id}`} className="flex items-center gap-3 px-4 py-3"><Clock size={16} className="text-muted" aria-hidden /><span className="w-28 text-[13px] font-semibold">{fmtDia(diaSP(v.inicio!))} {fmtHora(v.inicio)}</span><span className="min-w-0 flex-1 truncate text-[13px]">{v.clienteNome} · OS {v.osNumero}</span><ChevronRight size={16} className="text-muted" aria-hidden /></Link></li>
          ))}</ul>
        )}
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/pendencias" className="card card-click flex items-center gap-3 p-4"><span className="ic warn"><AlertTriangle size={18} aria-hidden /></span><div className="flex-1"><div className="font-semibold text-navy">Minhas pendências</div><div className="text-[13px] text-muted">{pend.total} aberta(s)</div></div><ChevronRight className="text-muted" aria-hidden /></Link>
        <Link href="/ferramentas" className="card card-click flex items-center gap-3 p-4"><span className="ic"><Wrench size={18} aria-hidden /></span><div className="flex-1"><div className="font-semibold text-navy">Ferramentas comigo</div><div className="text-[13px] text-muted">{ferr.filter((f) => f.f.custodianteProfissionalId === prof.id).length} sob minha responsabilidade{ferrPend.length ? ` · ${ferrPend.length} para confirmar` : ""}</div></div><ChevronRight className="text-muted" aria-hidden /></Link>
        <Link href="/materiais/minha-custodia" className="card card-click flex items-center gap-3 p-4"><span className="ic"><Package size={18} aria-hidden /></span><div className="flex-1"><div className="font-semibold text-navy">Materiais sob custódia</div><div className="text-[13px] text-muted">{mat.saldos.length} item(ns){mat.pendentes.length ? ` · ${mat.pendentes.length} entrega(s) para confirmar` : ""}</div></div><ChevronRight className="text-muted" aria-hidden /></Link>
        {prof.vinculo === "autonomo" && (
          <Link href="/meus-pagamentos" className="card card-click flex items-center gap-3 p-4"><span className="ic ok"><Wallet size={18} aria-hidden /></span><div className="flex-1"><div className="font-semibold text-navy">Meus valores</div>
            <div className="text-[12.5px] text-muted">Aguardando conferência <Dinheiro v={somar("aguardando_conferencia")} /> · Liberado <Dinheiro v={somar("liberado")} /> · Pago <Dinheiro v={somar("pago")} /></div>
            <div className="text-[11.5px] text-muted">{rotulo(AUTONOMO_SITUACAO, "aguardando_valor")}: {pag.filter((p) => p.situacaoExibida === "aguardando_valor").length}</div></div><ChevronRight className="text-muted" aria-hidden /></Link>
        )}
      </div>
      {pend.rows.length > 0 && (
        <Card titulo="Pendências">
          <ul className="space-y-2 text-[13px]">{pend.rows.slice(0, 5).map(({ p }) => <li key={p.id}><Link className="font-semibold text-navy hover:underline" href={`/pendencias/${p.id}`}>{p.titulo}</Link></li>)}</ul>
        </Card>
      )}
    </div>
  );
}
