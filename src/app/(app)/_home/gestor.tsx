import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { db } from "@/server/db";
import type { Ctx } from "@/server/auth/contexto";
import { pode } from "@/server/auth/contexto";
import { produtividadeTecnicos } from "@/server/services/produtividade";
import { somarDias } from "@/lib/datas";
import { resumoVisitasHoje, resumoFinanceiro, proximosDias, decisoesDonos, indicadoresGestor, avisoConfiguracao } from "@/server/services/inicio";
import { Badge, Card, Dinheiro } from "@/components/ui";
import { Barras } from "@/components/barras";
import { GradeKpi, Secao, Chips } from "./blocos";
import { AvisoConfig, Cabecalho, SeletorPeriodo, SeletorVisao, periodoDe, type SP } from "./comum";
import { fmtDia, hojeSP, NOMES_DIA, diaSemana } from "@/lib/datas";
import { formatBRL } from "@/lib/money";
import { MOTIVOS_RESULTADO, rotulo } from "@/lib/dominio";

export async function HomeGestor({ ctx, sp }: { ctx: Ctx; sp: SP }) {
  const per = periodoDe(sp);
  const h = [7, 15, 30].includes(Number(sp.h)) ? Number(sp.h) : 7;
  const [hoje, fin, prox, dec, ind, aviso] = await Promise.all([
    resumoVisitasHoje(db, ctx), resumoFinanceiro(db, ctx, per), proximosDias(db, ctx, h), decisoesDonos(db, ctx), indicadoresGestor(db, ctx), avisoConfiguracao(db, ctx),
  ]);
  const prod = pode(ctx, "agenda.ver", "empresa") ? (await produtividadeTecnicos(db, ctx, somarDias(hojeSP(), -29), hojeSP())).filter((p) => p.agendadas > 0) : [];
  const hm = (m: number | null) => (m === null ? "—" : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`);
  const q = (o: Record<string, string>) => "/?" + new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v) as [string, string][]), ...o }).toString();
  const dia = hojeSP();
  return (
    <div className="space-y-6">
      <Cabecalho titulo="Visão geral" sub={`${NOMES_DIA[diaSemana(dia)]}, ${fmtDia(dia)}`} direita={<SeletorVisao ctx={ctx} atual="gestor" />} />
      <AvisoConfig a={aviso} />

      <Secao titulo="Hoje na operação" sub="Situação atual dos atendimentos (data de hoje)">
        <GradeKpi itens={hoje} />
      </Secao>

      <div className="grid gap-6 xl:grid-cols-2">
        {fin && (
          <Secao titulo="Financeiro" sub={`Realizado: ${per.rotulo} · saldo na data de corte`} acao={<SeletorPeriodo sp={sp} />}>
            <GradeKpi itens={fin.indicadores} colunasDesktop={2} />
          </Secao>
        )}
        {prox && (
          <Secao titulo="Próximos dias" sub={`Previsão a partir de ${fmtDia(prox.dataCorte)} — previsto não é garantido`} acao={<Chips ativo={String(h)} opcoes={[7, 15, 30].map((n) => ({ chave: String(n), rotulo: `${n} dias`, href: q({ h: String(n) }) }))} />}>
            <Card pad={false}>
              <div className="grid grid-cols-3 divide-x divide-white text-center">
                <div className="px-2 py-3 sm:p-3"><div className="text-[12px] text-muted">Entradas previstas</div><div className="num whitespace-nowrap text-[15px] font-bold sm:text-[17px] text-ok">{formatBRL(prox.receberPrevisto)}</div></div>
                <div className="px-2 py-3 sm:p-3"><div className="text-[12px] text-muted">Saídas previstas</div><div className="num whitespace-nowrap text-[15px] font-bold sm:text-[17px] text-bad">{formatBRL(prox.pagarPrevisto + prox.pagarVencido)}</div></div>
                <div className="px-2 py-3 sm:p-3"><div className="text-[12px] text-muted">Saldo em {fmtDia(prox.fim).slice(0, 5)}</div><div className={`num whitespace-nowrap text-[15px] font-bold sm:text-[17px] ${prox.saldoProjetado !== null && prox.saldoProjetado < 0 ? "text-bad" : "text-navy"}`}>{prox.saldoProjetado === null ? "Sem base" : formatBRL(prox.saldoProjetado)}</div></div>
              </div>
              <div className="border-t border-white px-4 py-2.5 text-[12.5px]">
                {prox.primeiroNegativo ? <span className="font-semibold text-bad">⚠ Falta de caixa prevista em {fmtDia(prox.primeiroNegativo.dia)}: saldo {formatBRL(prox.primeiroNegativo.saldo)}.</span> : <span className="text-text-2">Sem falta de caixa prevista no horizonte.</span>}
                {prox.receberVencido > 0 && <span className="text-muted"> Vencidos a receber sem previsão ({formatBRL(prox.receberVencido)}) não entram na conta.</span>}
                {prox.incompleta && <span className="text-warn"> Projeção incompleta (faltam saldos iniciais).</span>}
                <Link href="/financeiro/caixa" className="ml-1 font-semibold text-ice-strong">Detalhes</Link>
              </div>
            </Card>
          </Secao>
        )}
      </div>

      <Secao titulo="Decisões que precisam dos donos" sub="Aprovações, exceções, divergências e serviços parados" acao={<Link href="/pendencias" className="btn btn-ghost btn-sm">Central de pendências</Link>}>
        <Card pad={false}>
          {dec.length === 0 ? <p className="px-4 py-3 text-[13px] text-muted">Nenhuma decisão pendente para os donos.</p> : (
            <ul>{dec.slice(0, 5).map((d) => (
              <li key={d.id} className="linha-acao">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5"><Badge tom={d.ordem <= 1 ? "critico" : "atencao"}>{d.tipo}</Badge><b className="truncate text-[13.5px] text-navy">{d.titulo}</b></div>
                  <div className="text-[12px] text-muted">{d.motivo}{d.responsavel ? ` · resp.: ${d.responsavel}` : ""}{d.prazo ? ` · ${fmtDia(d.prazo)}` : ""}</div>
                </div>
                {d.valorCentavos !== null && <b className="num hidden text-[13.5px] sm:block"><Dinheiro v={d.valorCentavos} /></b>}
                <Link href={d.href} className="btn btn-primary btn-sm shrink-0">{d.acao.length > 12 ? <><span className="sm:hidden">Abrir</span><span className="hidden sm:inline">{d.acao}</span></> : d.acao}</Link>
              </li>
            ))}</ul>
          )}
          {dec.length > 5 && <div className="px-4 py-2 text-[12.5px]"><Link href="/financeiro/aprovacoes" className="font-semibold text-ice-strong">Ver todas ({dec.length})</Link></div>}
        </Card>
      </Secao>

      {prod.length > 0 && (
        <Secao titulo="Produtividade por técnico" sub="Últimos 30 dias: agendadas x realizadas e tempo em campo" acao={<Link href={`/relatorios/produtividade?de=${somarDias(hojeSP(), -29)}&ate=${hojeSP()}`} className="btn btn-ghost btn-sm">Relatório completo</Link>}>
          <Card pad={false}>
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Técnico</th><th>Concluídas / agendadas</th><th>Cumprimento</th><th>Parciais · não realiz.</th><th>Tempo em campo</th><th>Média/visita</th></tr></thead>
              <tbody>{prod.map((p) => (
                <tr key={p.profissionalId}>
                  <td><Link href={`/relatorios/visitas?profissionalId=${p.profissionalId}&de=${somarDias(hojeSP(), -29)}&ate=${hojeSP()}`} className="font-semibold text-navy hover:underline">{p.nome}</Link><div className="text-[11.5px] text-muted">{p.vinculo === "autonomo" ? "Autônomo" : "Equipe própria"}</div></td>
                  <td className="num">{p.concluidas} / {p.agendadas}</td>
                  <td className={`num font-semibold ${p.cumprimento !== null && p.cumprimento < 70 ? "text-warn" : "text-navy"}`}>{p.cumprimento === null ? "—" : `${p.cumprimento}%`}</td>
                  <td className="num">{p.parciais} · {p.naoRealizadas}{p.naoIniciadas > 0 && <div className="text-[11.5px] text-bad">{p.naoIniciadas} não iniciada(s)</div>}</td>
                  <td className="num">{hm(p.minutosCampo)}</td>
                  <td className="num">{hm(p.mediaMinutos)}</td>
                </tr>
              ))}</tbody></table></div>
          </Card>
        </Secao>
      )}

      <Secao titulo="Indicadores" sub="Últimos 30 dias, a partir dos registros" acao={pode(ctx, "relatorio.operacional") ? <Link href="/relatorios" className="btn btn-ghost btn-sm">Relatórios <ChevronRight size={14} /></Link> : undefined}>
        <div className="grid gap-3 lg:grid-cols-3">
          {ind.agenda && <Card titulo="Cumprimento da agenda" acoes={<Link href="/visitas?filtro=finalizadas" className="btn btn-ghost btn-sm">Ver</Link>}>
            {ind.agenda.finalizadas + ind.agenda.naoIniciadas === 0 ? <p className="text-[13px] text-muted">Sem visitas no período.</p> : <div className="text-[13.5px]"><p><b className="num text-[20px] text-navy">{ind.agenda.concluidas}</b> de {ind.agenda.finalizadas} visitas finalizadas foram concluídas.</p>{ind.agenda.naoIniciadas > 0 && <p className="text-warn">{ind.agenda.naoIniciadas} agendada(s) não iniciada(s) após o horário.</p>}</div>}
          </Card>}
          {ind.motivos && <Card titulo="Retornos e motivos" acoes={<Link href="/visitas?filtro=nao_concluidas" className="btn btn-ghost btn-sm">Ver</Link>}><Barras dados={ind.motivos.map((m) => ({ rotulo: rotulo(MOTIVOS_RESULTADO, m.motivo), valor: m.n, tom: "warn" }))} vazio="Nenhum retorno registrado." /></Card>}
          {ind.vencidosHist !== undefined && <Card titulo="Recebíveis vencidos (fim de mês)" acoes={<Link href="/financeiro/receber?situacao=vencidas" className="btn btn-ghost btn-sm">Ver</Link>}>{ind.vencidosHist ? <Barras dados={ind.vencidosHist.map((x) => ({ rotulo: fmtDia(x.mes), valor: x.valor, tom: "bad" }))} formato={formatBRL} /> : <p className="text-[13px] text-muted">Histórico insuficiente.</p>}</Card>}
        </div>
      </Secao>
    </div>
  );
}
