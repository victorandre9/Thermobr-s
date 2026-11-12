/**
 * Dashboards e balões de pendência. Cada número é calculado com as MESMAS condições usadas pela lista de destino
 * (condicoesOS, condicoesPendencia, condicoesParcelas, condicoesVisita), garantindo rastreabilidade do total.
 * Valores monetários só são calculados quando o usuário tem a permissão correspondente.
 */
import { and, count, eq, inArray, sql } from "drizzle-orm";
import type { DBOrTx } from "../db";
import { qc } from "../db/sql";
import {
  agendaReserva, autonomoServico, baixa, checklistResposta, cliente, cobrancaContato, ferramenta, materialDivergencia, materialMovimento, materialPosicao, materialSaldo,
  obrigacao, ordemServico, parcela, pedidoExterno, pendencia, profissional, resumoSemanalAutonomo, visita, categoriaFinanceira, transferenciaConta,
} from "../db/schema";
import { type Ctx, pode } from "../auth/contexto";
import { condicoesOS } from "./os";
import { condicoesPendencia } from "./pendencias";
import { condicoesParcelas, clientesEmAtraso, saldoParcelaSQL } from "./financeiro";
import { saldosRealizados, realizadoPeriodo, projecao } from "./fluxo";
import { alertasManutencao } from "./veiculos";
import { obterConfig } from "./config";
import { hojeSP, intervaloDiaSP, somarDias, inicioSemana } from "@/lib/datas";
import { condicoesVisita } from "./visitas";

export type Gravidade = "info" | "atencao" | "alta" | "critica";
export interface Balao { id: string; grupo: "operacional" | "recursos" | "financeiro"; titulo: string; quantidade: number | null; valorCentavos?: number | null; gravidade: Gravidade; href: string; descricao?: string; semBase?: boolean }

const grav = (n: number, alto = 1, critico = Infinity): Gravidade => (n >= critico ? "critica" : n >= alto ? "alta" : "info");

async function contarOS(dbx: DBOrTx, ctx: Ctx, f: Parameters<typeof condicoesOS>[1]) {
  const [r] = await dbx.select({ n: count() }).from(ordemServico).innerJoin(cliente, eq(cliente.id, ordemServico.clienteId)).where(and(...condicoesOS(ctx, f)));
  return r.n;
}
async function contarPend(dbx: DBOrTx, ctx: Ctx, f: Parameters<typeof condicoesPendencia>[1]) {
  const [r] = await dbx.select({ n: count() }).from(pendencia).where(and(...condicoesPendencia(ctx, f)));
  return r.n;
}
async function contarVisitas(dbx: DBOrTx, ctx: Ctx, f: Parameters<typeof condicoesVisita>[1]) {
  const [r] = await dbx.select({ n: count() }).from(visita).innerJoin(ordemServico, eq(ordemServico.id, visita.osId)).where(and(...condicoesVisita(ctx, f)));
  return r.n;
}
async function somaParcelas(dbx: DBOrTx, ctx: Ctx, f: Parameters<typeof condicoesParcelas>[1]) {
  const [r] = await dbx.select({ n: count(), v: sql<string>`coalesce(sum(${saldoParcelaSQL}),0)` }).from(parcela).innerJoin(obrigacao, eq(obrigacao.id, parcela.obrigacaoId)).innerJoin(categoriaFinanceira, eq(categoriaFinanceira.id, obrigacao.categoriaId)).where(and(...condicoesParcelas(ctx, f)));
  return { n: r.n, v: Number(r.v) };
}

/** Técnicos próprios com visita hoje sem checklist de saída válido do veículo designado, e próprios sem veículo. */
export async function checklistsFaltantes(dbx: DBOrTx, ctx: Ctx) {
  const [ini, fim] = intervaloDiaSP(hojeSP());
  const rows = await dbx.select({ profissionalId: profissional.id, nome: profissional.nome, veiculoId: profissional.veiculoId,
    valido: sql<boolean>`exists (select 1 from ${checklistResposta} c where c.veiculo_id = ${qc(profissional.veiculoId)} and c.tipo = 'veiculo_saida' and c.valido_ate > now())` })
    .from(profissional)
    .where(and(eq(profissional.empresaId, ctx.empresaId), eq(profissional.ativo, true), eq(profissional.vinculo, "proprio"),
      sql`exists (select 1 from ${agendaReserva} ar join ${visita} v on v.id = ar.visita_id where ar.profissional_id = ${qc(profissional.id)} and ar.ativo and v.situacao in ('agendada','em_atendimento') and v.inicio_previsto >= ${ini.toISOString()} and v.inicio_previsto < ${fim.toISOString()})`));
  return rows.filter((r) => !r.veiculoId || !r.valido).map((r) => ({ ...r, motivo: r.veiculoId ? "Checklist de saída não realizado" : "Sem veículo designado" }));
}

export async function ferramentasProblema(dbx: DBOrTx, ctx: Ctx) {
  const cfg = await obterConfig(dbx, ctx.empresaId);
  return dbx.select({ id: ferramenta.id }).from(ferramenta).where(and(eq(ferramenta.empresaId, ctx.empresaId), eq(ferramenta.ativo, true),
    sql`(${ferramenta.situacao} in ('extraviada','no_cliente','devolucao_pendente') or ${ferramenta.condicao} = 'danificada' or (${ferramenta.situacao} = 'em_custodia' and ${ferramenta.custodiaDesde} < now() - make_interval(days => ${cfg.ferramentas.prazoDevolucaoDias})))`));
}

export async function baloesGestor(dbx: DBOrTx, ctx: Ctx, periodo: { de: string; ate: string }): Promise<Balao[]> {
  const b: Balao[] = [];
  const hoje = hojeSP();
  // ---------------- operacionais
  if (pode(ctx, "pedido.ver")) {
    const [r] = await dbx.select({ n: count() }).from(pedidoExterno).where(and(eq(pedidoExterno.empresaId, ctx.empresaId), eq(pedidoExterno.situacao, "para_programar")));
    const [rc] = await dbx.select({ n: count() }).from(pedidoExterno).where(and(eq(pedidoExterno.empresaId, ctx.empresaId), eq(pedidoExterno.situacao, "conferencia")));
    b.push({ id: "pedidos", grupo: "operacional", titulo: "Pedidos aguardando programação", quantidade: r.n, gravidade: grav(r.n, 1, 10), href: "/pedidos?situacao=para_programar" });
    if (rc.n) b.push({ id: "pedidos_conf", grupo: "operacional", titulo: "Pedidos alterados após OS (conferência)", quantidade: rc.n, gravidade: "alta", href: "/pedidos?situacao=conferencia" });
  }
  if (pode(ctx, "os.ver", "empresa")) {
    const sem = await contarOS(dbx, ctx, { semResponsavel: true });
    b.push({ id: "os_sem_equipe", grupo: "operacional", titulo: "OS abertas sem equipe agendada", quantidade: sem, gravidade: grav(sem, 1, 10), href: "/os?semResponsavel=1" });
    const mat = await contarOS(dbx, ctx, { materialPendente: true });
    b.push({ id: "os_material", grupo: "operacional", titulo: "OS aguardando material", quantidade: mat, gravidade: grav(mat), href: "/os?materialPendente=1" });
    const conf = await contarOS(dbx, ctx, { conferenciaPendente: true });
    b.push({ id: "os_conferencia", grupo: "operacional", titulo: "Serviços concluídos com conferência pendente", quantidade: conf, gravidade: grav(conf, 1, 15), href: "/os?conferenciaPendente=1" });
    const ret = await contarOS(dbx, ctx, { etapa: "pendente_retorno" });
    b.push({ id: "os_retorno", grupo: "operacional", titulo: "OS pendentes de retorno", quantidade: ret, gravidade: grav(ret), href: "/os?etapa=pendente_retorno" });
  }
  if (pode(ctx, "agenda.ver", "empresa")) {
    const vh = await contarVisitas(dbx, ctx, { filtro: "hoje" });
    const at = await contarVisitas(dbx, ctx, { filtro: "atrasadas" });
    const ea = await contarVisitas(dbx, ctx, { filtro: "em_atendimento" });
    const nc = await contarVisitas(dbx, ctx, { filtro: "nao_concluidas", de: periodo.de, ate: periodo.ate });
    const cf = await contarVisitas(dbx, ctx, { filtro: "conflitos" });
    b.push({ id: "visitas_hoje", grupo: "operacional", titulo: "Visitas de hoje", quantidade: vh, gravidade: "info", href: "/visitas?filtro=hoje" });
    b.push({ id: "visitas_atrasadas", grupo: "operacional", titulo: "Visitas não iniciadas após o horário", quantidade: at, gravidade: grav(at, 1, 3), href: "/visitas?filtro=atrasadas" });
    b.push({ id: "visitas_andamento", grupo: "operacional", titulo: "Em atendimento agora", quantidade: ea, gravidade: "info", href: "/visitas?filtro=em_atendimento" });
    b.push({ id: "visitas_nc", grupo: "operacional", titulo: "Visitas parciais/não realizadas no período", quantidade: nc, gravidade: grav(nc, 1, 10), href: `/visitas?filtro=nao_concluidas&de=${periodo.de}&ate=${periodo.ate}` });
    b.push({ id: "visitas_conflito", grupo: "operacional", titulo: "Agenda com equipe inválida (sem técnico ou técnico inativo)", quantidade: cf, gravidade: grav(cf, 1), href: "/visitas?filtro=conflitos", descricao: "Sobreposição de horários é bloqueada no servidor." });
  }
  if (pode(ctx, "pendencia.ver", "empresa")) {
    const sr = await contarPend(dbx, ctx, { semResponsavel: true });
    const pv = await contarPend(dbx, ctx, { vencidas: true });
    b.push({ id: "pend_sem_resp", grupo: "operacional", titulo: "Pendências sem responsável", quantidade: sr, gravidade: grav(sr, 1, 10), href: "/pendencias?semResponsavel=1" });
    b.push({ id: "pend_vencidas", grupo: "operacional", titulo: "Pendências com prazo vencido", quantidade: pv, gravidade: grav(pv, 1, 1), href: "/pendencias?vencidas=1" });
  }
  // ---------------- recursos
  if (pode(ctx, "veiculo.ver", "empresa")) {
    const cl = await checklistsFaltantes(dbx, ctx);
    b.push({ id: "checklists", grupo: "recursos", titulo: "Checklists de veículo faltantes (técnicos próprios com visita hoje)", quantidade: cl.length, gravidade: grav(cl.length, 1), href: "/veiculos?filtro=checklist_pendente" });
    const irr = await contarPend(dbx, ctx, { tipo: "veiculo_irregularidade" });
    b.push({ id: "veic_irreg", grupo: "recursos", titulo: "Irregularidades de veículos abertas", quantidade: irr, gravidade: grav(irr, 1), href: "/pendencias?tipo=veiculo_irregularidade" });
    const al = await alertasManutencao(dbx, ctx);
    const venc = al.filter((a) => a.status === "vencido").length, prox = al.filter((a) => a.status === "proximo").length, semBase = al.filter((a) => a.status === "sem_base").length;
    b.push({ id: "manutencao", grupo: "recursos", titulo: "Manutenções vencidas / próximas", quantidade: venc + prox, gravidade: venc ? "critica" : prox ? "atencao" : "info", href: "/veiculos?filtro=manutencao", descricao: `${venc} vencida(s), ${prox} próxima(s)${semBase ? ` · ${semBase} sem base para previsão` : ""}` });
  }
  if (pode(ctx, "ferramenta.ver", "empresa")) {
    const fp = await ferramentasProblema(dbx, ctx);
    b.push({ id: "ferramentas", grupo: "recursos", titulo: "Ferramentas não devolvidas, extraviadas ou danificadas", quantidade: fp.length, gravidade: grav(fp.length, 1), href: "/ferramentas?filtro=problemas" });
  }
  if (pode(ctx, "material.ver", "empresa")) {
    const [dev] = await dbx.select({ n: count() }).from(materialMovimento).where(and(eq(materialMovimento.empresaId, ctx.empresaId), eq(materialMovimento.status, "informado")));
    const [div] = await dbx.select({ n: count() }).from(materialDivergencia).where(and(eq(materialDivergencia.empresaId, ctx.empresaId), inArray(materialDivergencia.situacao, ["aberta", "em_investigacao"])));
    const cfg = await obterConfig(dbx, ctx.empresaId);
    const [ant] = await dbx.select({ n: count() }).from(materialSaldo).innerJoin(materialPosicao, eq(materialPosicao.id, materialSaldo.posicaoId))
      .where(and(eq(materialPosicao.empresaId, ctx.empresaId), eq(materialPosicao.tipo, "profissional"), sql`${materialSaldo.quantidade} > 0`, sql`${materialSaldo.atualizadoEm} < now() - make_interval(days => ${cfg.materiais.prazoCustodiaDias})`));
    b.push({ id: "mat_conferencia", grupo: "recursos", titulo: "Consumos/devoluções de material aguardando conferência", quantidade: dev.n, gravidade: grav(dev.n, 1, 20), href: "/materiais/conferencia" });
    b.push({ id: "mat_divergencias", grupo: "recursos", titulo: "Divergências de material abertas", quantidade: div.n, gravidade: grav(div.n, 1), href: "/materiais/divergencias" });
    b.push({ id: "mat_custodia", grupo: "recursos", titulo: `Material sob custódia há mais de ${cfg.materiais.prazoCustodiaDias} dias`, quantidade: ant.n, gravidade: grav(ant.n, 1), href: "/materiais/custodias?antigas=1" });
  }
  // ---------------- financeiros
  if (pode(ctx, "financeiro.fluxo.ver")) {
    const rp = await realizadoPeriodo(dbx, ctx, periodo.de, periodo.ate);
    const sal = await saldosRealizados(dbx, ctx);
    b.push({ id: "recebido", grupo: "financeiro", titulo: "Recebido no período", quantidade: null, valorCentavos: rp.registros ? rp.recebido : null, gravidade: "info", href: `/financeiro/caixa?de=${periodo.de}&ate=${periodo.ate}`, semBase: !rp.registros });
    b.push({ id: "pago", grupo: "financeiro", titulo: "Pago no período", quantidade: null, valorCentavos: rp.registros ? rp.pago : null, gravidade: "info", href: `/financeiro/caixa?de=${periodo.de}&ate=${periodo.ate}`, semBase: !rp.registros, descricao: rp.omitidoRestrito ? "Exclui categorias restritas" : undefined });
    b.push({ id: "saldo", grupo: "financeiro", titulo: "Saldo confirmado consolidado", quantidade: null, valorCentavos: sal.consolidado, gravidade: sal.incompleto ? "atencao" : "info", href: "/financeiro/caixa", semBase: sal.consolidado === null, descricao: sal.incompleto ? "Incompleto: há conta sem saldo inicial" : `${sal.contas.length} conta(s) · corte ${hoje.split("-").reverse().join("/")}` });
    const pj = await projecao(dbx, ctx, 30);
    b.push({ id: "projecao", grupo: "financeiro", titulo: "Saldo projetado em 30 dias", quantidade: null, valorCentavos: pj.saldoProjetado, gravidade: pj.primeiroNegativo ? "critica" : pj.incompleta ? "atencao" : "info", href: "/financeiro/caixa", semBase: pj.saldoProjetado === null,
      descricao: pj.primeiroNegativo ? `Risco: saldo negativo em ${pj.primeiroNegativo.dia.split("-").reverse().join("/")}` : pj.incompleta ? "Projeção incompleta" : "Premissas na tela de caixa" });
  }
  if (pode(ctx, "financeiro.ver")) {
    const atrasos = await clientesEmAtraso(dbx, ctx);
    const venc = await somaParcelas(dbx, ctx, { natureza: "receber", situacao: "vencidas" });
    b.push({ id: "atraso", grupo: "financeiro", titulo: "Clientes em atraso", quantidade: atrasos.length, valorCentavos: venc.v, gravidade: grav(atrasos.length, 1, 5), href: "/financeiro/receber?situacao=vencidas", descricao: `${venc.n} parcela(s) vencida(s)` });
    const prev = await somaParcelas(dbx, ctx, { natureza: "receber", situacao: "abertas", de: hoje, ate: somarDias(hoje, 30) });
    b.push({ id: "receber_previsto", grupo: "financeiro", titulo: "Recebimentos previstos (30 dias)", quantidade: prev.n, valorCentavos: prev.v, gravidade: "info", href: `/financeiro/receber?situacao=abertas&de=${hoje}&ate=${somarDias(hoje, 30)}`, descricao: "Previsto não é dinheiro garantido" });
    const ph = await somaParcelas(dbx, ctx, { natureza: "pagar", situacao: "hoje" });
    const p7 = await somaParcelas(dbx, ctx, { natureza: "pagar", situacao: "abertas", de: somarDias(hoje, 1), ate: somarDias(hoje, 7) });
    const pv = await somaParcelas(dbx, ctx, { natureza: "pagar", situacao: "vencidas" });
    b.push({ id: "pagar_hoje", grupo: "financeiro", titulo: "Contas a pagar hoje", quantidade: ph.n, valorCentavos: ph.v, gravidade: grav(ph.n, 1), href: "/financeiro/pagar?situacao=hoje" });
    b.push({ id: "pagar_7", grupo: "financeiro", titulo: "A pagar nos próximos 7 dias", quantidade: p7.n, valorCentavos: p7.v, gravidade: "info", href: `/financeiro/pagar?situacao=abertas&de=${somarDias(hoje, 1)}&ate=${somarDias(hoje, 7)}` });
    if (pv.n) b.push({ id: "pagar_vencido", grupo: "financeiro", titulo: "Contas a pagar vencidas", quantidade: pv.n, valorCentavos: pv.v, gravidade: "critica", href: "/financeiro/pagar?situacao=vencidas" });
    const [acao] = await dbx.select({ n: sql<number>`count(distinct ${cobrancaContato.clienteId})::int` }).from(cobrancaContato)
      .where(and(eq(cobrancaContato.empresaId, ctx.empresaId), sql`${cobrancaContato.proximaAcaoEm} < ${hoje}`, sql`${cobrancaContato.em} = (select max(c2.criado_em) from ${cobrancaContato} c2 where c2.cliente_id = ${qc(cobrancaContato.clienteId)})`));
    b.push({ id: "cobranca_acao", grupo: "financeiro", titulo: "Cobranças com próxima ação vencida", quantidade: acao.n, gravidade: grav(acao.n, 1), href: "/financeiro/cobranca?filtro=acao_vencida" });
  }
  if (pode(ctx, "financeiro.aprovar") || pode(ctx, "financeiro.baixa.confirmar")) {
    const restr = pode(ctx, "financeiro.restrito.ver") ? sql`true` : sql`${categoriaFinanceira.restrita} = false`;
    const [oa] = await dbx.select({ n: count(), v: sql<string>`coalesce(sum(${obrigacao.valorBrutoCentavos} - ${obrigacao.descontoCentavos}),0)` }).from(obrigacao).innerJoin(categoriaFinanceira, eq(categoriaFinanceira.id, obrigacao.categoriaId)).where(and(eq(obrigacao.empresaId, ctx.empresaId), eq(obrigacao.situacaoAprovacao, "aguardando_aprovacao"), restr));
    const [ba] = await dbx.select({ n: count(), v: sql<string>`coalesce(sum(${baixa.valorCentavos}),0)` }).from(baixa).innerJoin(parcela, eq(parcela.id, baixa.parcelaId)).innerJoin(obrigacao, eq(obrigacao.id, parcela.obrigacaoId)).innerJoin(categoriaFinanceira, eq(categoriaFinanceira.id, obrigacao.categoriaId)).where(and(eq(baixa.empresaId, ctx.empresaId), eq(baixa.status, "aguardando_conferencia"), restr));
    const [tr] = await dbx.select({ n: count() }).from(transferenciaConta).where(and(eq(transferenciaConta.empresaId, ctx.empresaId), eq(transferenciaConta.status, "aguardando_conferencia")));
    if (pode(ctx, "financeiro.aprovar")) b.push({ id: "aprovacoes", grupo: "financeiro", titulo: "Lançamentos aguardando aprovação", quantidade: oa.n, valorCentavos: Number(oa.v), gravidade: grav(oa.n, 1, 10), href: "/financeiro/aprovacoes" });
    b.push({ id: "baixas_conf", grupo: "financeiro", titulo: "Baixas/transferências aguardando conferência", quantidade: ba.n + tr.n, valorCentavos: Number(ba.v), gravidade: grav(ba.n + tr.n, 1, 10), href: "/financeiro/aprovacoes" });
  }
  if (pode(ctx, "autonomo.valores.ver", "empresa")) {
    const [sv] = await dbx.select({ conferir: sql<number>`count(*) filter (where ${autonomoServico.situacao} in ('aguardando_valor','aguardando_conferencia'))::int`, valorConferir: sql<string>`coalesce(sum(${autonomoServico.valorCombinadoCentavos}) filter (where ${autonomoServico.situacao} = 'aguardando_conferencia'),0)` })
      .from(autonomoServico).where(eq(autonomoServico.empresaId, ctx.empresaId));
    const [rs] = await dbx.select({ liberar: sql<number>`count(*) filter (where ${resumoSemanalAutonomo.situacao} in ('preparado','liberacao_solicitada'))::int`, valorLiberar: sql<string>`coalesce(sum(${resumoSemanalAutonomo.liquidoCentavos}) filter (where ${resumoSemanalAutonomo.situacao} in ('preparado','liberacao_solicitada')),0)` })
      .from(resumoSemanalAutonomo).where(eq(resumoSemanalAutonomo.empresaId, ctx.empresaId));
    const semana = inicioSemana(hoje);
    const pagar = await somaParcelas(dbx, ctx, { natureza: "pagar", situacao: "abertas", de: semana, ate: somarDias(semana, 6), categoriaId: await categoriaId(dbx, ctx, "autonomo") });
    b.push({ id: "autonomos", grupo: "financeiro", titulo: "Autônomos: a conferir / liberar / pagar na semana", quantidade: sv.conferir + rs.liberar + pagar.n, valorCentavos: Number(sv.valorConferir) + Number(rs.valorLiberar) + pagar.v, gravidade: grav(rs.liberar + pagar.n, 1), href: "/financeiro/autonomos",
      descricao: `${sv.conferir} a conferir · ${rs.liberar} resumo(s) a liberar · ${pagar.n} pagamento(s) na semana` });
  }
  return b;
}

async function categoriaId(dbx: DBOrTx, ctx: Ctx, codigo: string) {
  const [c] = await dbx.select({ id: categoriaFinanceira.id }).from(categoriaFinanceira).where(and(eq(categoriaFinanceira.empresaId, ctx.empresaId), eq(categoriaFinanceira.codigo, codigo)));
  return c?.id;
}

// ---------------------------------------------------------------- gráficos (somente dados reais)
export async function graficosGestor(dbx: DBOrTx, ctx: Ctx, periodo: { de: string; ate: string }) {
  const out: Record<string, unknown> = {};
  if (pode(ctx, "os.ver", "empresa")) {
    out.osPorEtapa = await dbx.select({ etapa: ordemServico.etapa, n: count() }).from(ordemServico).where(and(eq(ordemServico.empresaId, ctx.empresaId), sql`${ordemServico.etapa} not in ('encerrada','cancelada')`)).groupBy(ordemServico.etapa);
    const [ini] = intervaloDiaSP(periodo.de); const [, fim] = intervaloDiaSP(periodo.ate);
    out.visitasResultado = await dbx.select({ resultado: visita.resultado, n: count() }).from(visita).where(and(eq(visita.empresaId, ctx.empresaId), eq(visita.situacao, "finalizada"), sql`${visita.checkoutEm} >= ${ini.toISOString()} and ${visita.checkoutEm} < ${fim.toISOString()}`)).groupBy(visita.resultado);
    out.motivos = await dbx.select({ motivo: visita.motivoResultado, n: count() }).from(visita).where(and(eq(visita.empresaId, ctx.empresaId), sql`${visita.motivoResultado} is not null`, sql`${visita.checkoutEm} >= ${ini.toISOString()} and ${visita.checkoutEm} < ${fim.toISOString()}`)).groupBy(visita.motivoResultado);
    const [dur] = await dbx.select({ n: count(), media: sql<number | null>`avg(extract(epoch from (${visita.checkoutEm} - ${visita.checkinEm})) / 60)::int`, mediana: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from (${visita.checkoutEm} - ${visita.checkinEm})) / 60)::int` })
      .from(visita).where(and(eq(visita.empresaId, ctx.empresaId), eq(visita.situacao, "finalizada"), sql`${visita.checkinEm} is not null`, sql`${visita.checkoutEm} >= ${ini.toISOString()} and ${visita.checkoutEm} < ${fim.toISOString()}`));
    out.duracao = dur;
  }
  if (pode(ctx, "financeiro.fluxo.ver")) {
    const restr = pode(ctx, "financeiro.restrito.ver") ? sql`true` : sql`${categoriaFinanceira.restrita} = false`;
    out.fluxoSemanal = await dbx.select({ semana: sql<string>`to_char(date_trunc('week', ${baixa.dataPagamento}), 'YYYY-MM-DD')`, natureza: obrigacao.natureza, total: sql<string>`sum(${baixa.valorCentavos})` })
      .from(baixa).innerJoin(parcela, eq(parcela.id, baixa.parcelaId)).innerJoin(obrigacao, eq(obrigacao.id, parcela.obrigacaoId)).innerJoin(categoriaFinanceira, eq(categoriaFinanceira.id, obrigacao.categoriaId))
      .where(and(eq(baixa.empresaId, ctx.empresaId), eq(baixa.status, "confirmada"), sql`${baixa.dataPagamento} between ${periodo.de} and ${periodo.ate}`, restr)).groupBy(sql`1`, obrigacao.natureza).orderBy(sql`1`);
    const hoje = hojeSP();
    out.vencimentos = await dbx.select({
      natureza: obrigacao.natureza,
      faixa: sql<string>`case when ${parcela.vencimento} < ${hoje} then '0_vencido' when ${parcela.vencimento} <= ${somarDias(hoje, 7)} then '1_7d' when ${parcela.vencimento} <= ${somarDias(hoje, 30)} then '2_30d' when ${parcela.vencimento} <= ${somarDias(hoje, 90)} then '3_90d' else '4_mais' end`,
      total: sql<string>`sum(${saldoParcelaSQL})`,
    }).from(parcela).innerJoin(obrigacao, eq(obrigacao.id, parcela.obrigacaoId)).innerJoin(categoriaFinanceira, eq(categoriaFinanceira.id, obrigacao.categoriaId))
      .where(and(eq(obrigacao.empresaId, ctx.empresaId), eq(parcela.cancelada, false), eq(obrigacao.situacaoAprovacao, "aprovada"), sql`${saldoParcelaSQL} > 0`, restr)).groupBy(obrigacao.natureza, sql`2`).orderBy(sql`2`);
  }
  return out;
}

