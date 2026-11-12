import Link from "next/link";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { agendaPeriodo, visitasSemAgenda } from "@/server/services/agenda";
import { listarProfissionais } from "@/server/services/usuarios";
import { ActionForm, Enviar } from "@/components/action-form";
import { Card, ChipLink, Filtros, PageHeader, Vazio, Badge } from "@/components/ui";
import { SituacaoVisita, Prioridade } from "@/components/status";
import { diaSP, diaSemana, fmtDia, fmtHora, hojeSP, inicioSemana, intervaloDiaSP, NOMES_DIA, somarDias } from "@/lib/datas";
import { acaoIndisponibilidade, acaoRemoverIndisp } from "./actions";

export const metadata = { title: "Agenda" };

export default async function Agenda({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await exigirCtx(); const sp = await searchParams;
  const modo = sp.modo === "dia" ? "dia" : "semana";
  const ref = sp.data ?? hojeSP();
  const ini = modo === "dia" ? ref : inicioSemana(ref);
  const dias = Array.from({ length: modo === "dia" ? 1 : 7 }, (_, i) => somarDias(ini, i));
  const [i0] = intervaloDiaSP(dias[0]); const [, i1] = intervaloDiaSP(dias[dias.length - 1]);
  const empresa = pode(ctx, "agenda.ver", "empresa");
  const reservas = await agendaPeriodo(db, ctx, i0, i1, { profissionalId: sp.profissionalId, situacao: sp.situacao });
  const profs = empresa ? (await listarProfissionais(db, ctx, { somenteAtivos: true })).filter((p) => ["tecnico", "ajudante"].includes(p.funcao) && (!sp.profissionalId || p.id === sp.profissionalId)) : [];
  const linhas = empresa ? profs.map((p) => ({ id: p.id, nome: p.nome, vinculo: p.vinculo })) : [{ id: ctx.profissional?.id ?? "", nome: "Minha agenda", vinculo: ctx.profissional?.vinculo ?? "" }];
  const fila = pode(ctx, "agenda.gerenciar") ? await visitasSemAgenda(db, ctx) : [];
  const qs = (o: Record<string, string>) => "/agenda?" + new URLSearchParams({ modo, data: ref, ...(sp.profissionalId ? { profissionalId: sp.profissionalId } : {}), ...o }).toString();
  const passo = modo === "dia" ? 1 : 7;
  return (
    <div className="space-y-5">
      <PageHeader titulo="Agenda" subtitulo={modo === "dia" ? fmtDia(ref) : `Semana de ${fmtDia(dias[0])} a ${fmtDia(dias[6])}`}
        acoes={<><Link className="btn btn-ghost btn-sm" href={qs({ data: somarDias(ref, -passo) })}>← Anterior</Link><Link className="btn btn-ghost btn-sm" href={qs({ data: hojeSP() })}>Hoje</Link><Link className="btn btn-ghost btn-sm" href={qs({ data: somarDias(ref, passo) })}>Próxima →</Link></>} />
      <Filtros>
        <ChipLink href={qs({ modo: "dia" })} ativo={modo === "dia"}>Dia</ChipLink><ChipLink href={qs({ modo: "semana" })} ativo={modo === "semana"}>Semana</ChipLink>
        {empresa && <form action="/agenda" className="ml-auto flex gap-2"><input type="hidden" name="modo" value={modo} /><input type="hidden" name="data" value={ref} />
          <select name="profissionalId" defaultValue={sp.profissionalId ?? ""} className="select !w-56" aria-label="Técnico"><option value="">Todos os técnicos</option>{(await listarProfissionais(db, ctx, { somenteAtivos: true })).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
          <select name="situacao" defaultValue={sp.situacao ?? ""} className="select !w-44" aria-label="Situação"><option value="">Todas as situações</option><option value="agendada">Agendadas</option><option value="em_atendimento">Em atendimento</option><option value="finalizada">Finalizadas</option></select>
          <button className="btn btn-ghost">Filtrar</button></form>}
      </Filtros>
      <Card pad={false}>
        {linhas.length === 0 ? <Vazio titulo="Nenhum técnico cadastrado" /> : (
          <div className="tbl-wrap"><table className="tbl min-w-[900px] table-fixed">
            <thead><tr><th className="w-44">Profissional</th>{dias.map((d) => <th key={d} className={d === hojeSP() ? "!text-ice-strong" : ""}>{NOMES_DIA[diaSemana(d)]} {fmtDia(d).slice(0, 5)}</th>)}</tr></thead>
            <tbody>{linhas.map((p) => (
              <tr key={p.id}>
                <td><div className="font-semibold text-navy">{p.nome}</div><div className="text-[11.5px] text-muted">{p.vinculo === "autonomo" ? "Autônomo" : p.vinculo ? "Equipe própria" : ""}</div></td>
                {dias.map((d) => {
                  const rs = reservas.filter((r) => (!empresa || r.profissionalId === p.id) && diaSP(r.inicio) === d);
                  return (
                    <td key={d} className="!p-1.5">
                      <div className="space-y-1.5">{rs.map((r) => r.tipo === "indisponibilidade" ? (
                        <div key={r.reservaId} className="rounded-xl border border-[#F5D9A8] bg-warn-soft px-2 py-1 text-[11.5px] text-warn"><b>Indisponível</b> {fmtHora(r.inicio)}–{fmtHora(r.fim)}<div>{r.motivo}</div>
                          {pode(ctx, "agenda.gerenciar") && <ActionForm action={acaoRemoverIndisp} mostrarSucesso={false}><input type="hidden" name="reservaId" value={r.reservaId} /><Enviar className="text-[11px] underline">remover</Enviar></ActionForm>}</div>
                      ) : (
                        <Link key={r.reservaId} href={`/visitas/${r.visitaId}`} className="block rounded-xl border border-white bg-white/75 px-2 py-1.5 text-[11.5px] shadow-[0_6px_10px_-6px_rgba(28,111,166,.35)] hover:bg-white">
                          <div className="font-bold text-navy">{fmtHora(r.inicio)}–{fmtHora(r.fim)} · OS {r.osNumero}</div>
                          <div className="truncate text-text-2">{r.clienteNome}</div>
                          <div className="mt-0.5 flex flex-wrap gap-1"><SituacaoVisita s={r.visitaSituacao ?? ""} r={r.visitaResultado} />{r.papel === "responsavel" && <Badge tom="navy" icone={false}>resp.</Badge>}</div>
                        </Link>
                      ))}</div>
                    </td>
                  );
                })}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      {pode(ctx, "agenda.gerenciar") && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card titulo={`Visitas a programar (${fila.length})`}>
            {fila.length === 0 ? <p className="text-[13px] text-muted">Nenhuma visita aguardando data.</p> : <ul className="space-y-2">{fila.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 text-[13px]"><span><b>OS {v.osNumero}</b> · visita {v.sequencia} · {v.clienteNome} <Prioridade p={v.prioridade} /></span><Link className="btn btn-primary btn-sm" href={`/os/${v.osId}/programar?visitaId=${v.id}`}>Programar</Link></li>
            ))}</ul>}
          </Card>
          <Card titulo="Registrar indisponibilidade">
            <ActionForm action={acaoIndisponibilidade} className="grid gap-2 sm:grid-cols-2" resetar>
              <select name="profissionalId" className="select sm:col-span-2" required aria-label="Profissional"><option value="">Profissional…</option>{(await listarProfissionais(db, ctx, { somenteAtivos: true })).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
              <input type="date" name="diaInicio" defaultValue={hojeSP()} className="input" aria-label="Dia início" /><input type="time" name="horaInicio" defaultValue="08:00" className="input" aria-label="Hora início" />
              <input type="date" name="diaFim" defaultValue={hojeSP()} className="input" aria-label="Dia fim" /><input type="time" name="horaFim" defaultValue="18:00" className="input" aria-label="Hora fim" />
              <input name="motivo" placeholder="Motivo (folga, consulta, outro serviço)" className="input sm:col-span-2" required />
              <Enviar className="btn btn-ghost sm:col-span-2">Registrar</Enviar>
            </ActionForm>
            <p className="hint mt-2">Vagas diárias e horários são editáveis em Configurações &gt; Agenda.</p>
          </Card>
        </div>
      )}
    </div>
  );
}
