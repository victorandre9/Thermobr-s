/**
 * Dados das páginas iniciais por perfil (Gestor, Administrativo/Agenda, Financeiro).
 * Todos os números vêm das MESMAS funções de lista usadas nas telas de destino (listarVisitas, listarOS,
 * listarParcelas, listarPendencias…), com os mesmos filtros do link — o total do cartão é o total da lista.
 * Valores só são calculados quando o usuário tem a permissão correspondente.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DBOrTx } from "../db";
import { qc } from "../db/sql";
import { autonomoServico, baixa, categoriaFinanceira, materialDivergencia, obrigacao, ordemServico, parcela, pedidoExterno, resumoSemanalAutonomo, visita, cliente, usuario } from "../db/schema";
import { type Ctx, pode } from "../auth/contexto";
import { listarVisitas, type FiltroVisita } from "./visitas";
import { listarOS } from "./os";
import { listarParcelas, clientesEmAtraso, pendentesAprovacao, excecoesPendentes, saldoParcelaSQL } from "./financeiro";
import { saldosRealizados, realizadoPeriodo, projecao } from "./fluxo";
import { listarPendencias } from "./pendencias";
import { movimentosAguardandoConferencia } from "./materiais";
import { movimentosFerramentaPendentes } from "./ferramentas";
import { obterConfig } from "./config";
import { hojeSP, intervaloDiaSP, somarDias, somarMeses, primeiroDiaMes } from "@/lib/datas";

export type Visao = "gestor" | "administrativo" | "financeiro";

/** Visões iniciais que o usuário pode usar (derivadas das permissões; trocar a visão não concede acesso). */
export function visoesDisponiveis(ctx: Ctx): Visao[] {
  const v: Visao[] = [];
  if (ctx.papeis.includes("gestor")) v.push("gestor");
  if (pode(ctx, "agenda.gerenciar") || pode(ctx, "os.gerenciar")) v.push("administrativo");
  if (pode(ctx, "financeiro.ver")) v.push("financeiro");
  return v;
}

export interface Indicador { id: string; rotulo: string; valor: number | null; moeda?: boolean; href: string; dica?: string; tom?: "normal" | "problema" | "ok" | "info"; semBase?: boolean }

// ---------------------------------------------------------------- comuns
export async function resumoVisitasHoje(dbx: DBOrTx, ctx: Ctx): Promise<Indicador[]> {
  const t = async (filtro: FiltroVisita["filtro"]) => (await listarVisitas(dbx, ctx, { filtro, limite: 1 })).total;
  const [prev, concl, andam, prob] = await Promise.all([t("hoje"), t("concluidas_hoje"), t("em_atendimento"), t("problemas_hoje")]);
  return [
    { id: "hoje", rotulo: "Visitas previstas hoje", valor: prev, href: "/visitas?filtro=hoje", tom: "normal" },
    { id: "concluidas", rotulo: "Concluídas hoje", valor: concl, href: "/visitas?filtro=concluidas_hoje", tom: concl ? "ok" : "normal" },
    { id: "andamento", rotulo: "Em atendimento agora", valor: andam, href: "/visitas?filtro=em_atendimento", tom: "info" },
    { id: "problemas", rotulo: "Atrasadas ou com impedimento", valor: prob, href: "/visitas?filtro=problemas_hoje", tom: prob ? "problema" : "normal", dica: "Não iniciadas após o horário + parciais/não realizadas hoje" },
  ];
}

export async function resumoFinanceiro(dbx: DBOrTx, ctx: Ctx, periodo: { de: string; ate: string }) {
  if (!pode(ctx, "financeiro.fluxo.ver")) return null;
  const [sal, rp, venc] = await Promise.all([saldosRealizados(dbx, ctx), realizadoPeriodo(dbx, ctx, periodo.de, periodo.ate), listarParcelas(dbx, ctx, { natureza: "receber", situacao: "vencidas", limite: 1 })]);
  return {
    saldo: sal, incompleto: sal.incompleto, dataCorte: sal.dataCorte, periodo, restritoOmitido: rp.omitidoRestrito,
    indicadores: [
      { id: "saldo", rotulo: `Saldo confirmado em ${sal.dataCorte.split("-").reverse().join("/")}`, valor: sal.consolidado, moeda: true, href: "/financeiro/caixa", semBase: sal.consolidado === null, dica: sal.incompleto ? "Visão incompleta: conta sem saldo inicial" : `${sal.contas.length} conta(s)`, tom: sal.incompleto ? "problema" : "normal" },
      { id: "recebido", rotulo: "Recebido no período", valor: rp.recebido, moeda: true, href: `/financeiro/caixa?de=${periodo.de}&ate=${periodo.ate}`, tom: "normal" },
      { id: "pago", rotulo: "Pago no período", valor: rp.pago, moeda: true, href: `/financeiro/caixa?de=${periodo.de}&ate=${periodo.ate}`, tom: "normal", dica: rp.omitidoRestrito ? "Sem categorias restritas" : undefined },
      { id: "vencido", rotulo: "Vencido a receber", valor: venc.somaSaldo, moeda: true, href: "/financeiro/receber?situacao=vencidas", tom: venc.total ? "problema" : "ok", dica: `${venc.total} parcela(s) — saldo após recebimentos parciais` },
    ] as Indicador[],
  };
}

export async function proximosDias(dbx: DBOrTx, ctx: Ctx, horizonte: number) {
  if (!pode(ctx, "financeiro.fluxo.ver")) return null;
  return projecao(dbx, ctx, [7, 15, 30].includes(horizonte) ? horizonte : 7);
}

// ---------------------------------------------------------------- gestor
export interface Decisao { id: string; tipo: string; titulo: string; motivo: string; responsavel: string | null; prazo: string | null; valorCentavos: number | null; href: string; acao: string; ordem: number }

/** Decisões que exigem os donos (não toda tarefa rotineira). Ordenadas por prioridade. */
export async function decisoesDonos(dbx: DBOrTx, ctx: Ctx): Promise<Decisao[]> {
  const out: Decisao[] = [];
  const hoje = hojeSP();
  if (pode(ctx, "financeiro.aprovar")) {
    const [p, exc] = await Promise.all([pendentesAprovacao(dbx, ctx), excecoesPendentes(dbx, ctx)]);
    for (const e of exc) out.push({ id: `exc:${e.b.id}`, tipo: "Exceção financeira", titulo: e.descricao, motivo: "Pagamento já realizado sem aprovação prévia — revisar", responsavel: e.registradaPorNome, prazo: e.b.dataPagamento, valorCentavos: e.b.valorCentavos, href: `/financeiro/obrigacoes/${e.obrigacaoId}`, acao: "Revisar", ordem: 0 });
    for (const o of p.obrigacoes.filter((x) => !x.jaAprovei)) out.push({ id: `ob:${o.ob.id}`, tipo: "Aprovação de pagamento", titulo: o.ob.descricao, motivo: `${o.categoriaNome}${o.exigeDupla ? ` · dupla aprovação ${o.aprovacoes}/2` : ""}`, responsavel: o.criadoPorNome, prazo: null, valorCentavos: o.ob.valorBrutoCentavos - o.ob.descontoCentavos, href: "/financeiro/aprovacoes", acao: "Aprovar ou rejeitar", ordem: 2 });
  }
  if (pode(ctx, "divergencia.aprovar")) {
    const divs = await dbx.select({ d: materialDivergencia, nome: sql<string>`(select nome from material where id = ${qc(materialDivergencia.materialId)})`, un: sql<string>`(select unidade from material where id = ${qc(materialDivergencia.materialId)})` })
      .from(materialDivergencia).where(and(eq(materialDivergencia.empresaId, ctx.empresaId), inArray(materialDivergencia.situacao, ["aberta", "em_investigacao"]))).limit(10);
    for (const { d, nome, un } of divs) out.push({ id: `div:${d.id}`, tipo: "Divergência de material", titulo: `${Number(d.quantidade)} ${un} de ${nome}`, motivo: d.tipo === "falta" ? "Diferença na devolução — a localizar, manter ou aprovar perda" : `Diferença (${d.tipo})`, responsavel: null, prazo: null, valorCentavos: null, href: "/materiais/divergencias", acao: "Decidir", ordem: 1 });
  }
  if (pode(ctx, "pendencia.ver", "empresa")) {
    // somente críticas que dependem de liberação excepcional do gestor (ex.: veículo) — o resto é rotina do escritório
    const { rows } = await listarPendencias(dbx, ctx, { situacao: "abertas", limite: 50 });
    for (const { p, responsavelNome, veiculoIdent } of rows.filter((r) => r.p.prioridade === "critica" && !r.p.liberacaoExcepcional))
      out.push({ id: `pend:${p.id}`, tipo: "Exceção operacional", titulo: p.titulo, motivo: veiculoIdent ? "Irregularidade crítica: liberar uso, trocar veículo ou corrigir" : "Pendência crítica", responsavel: responsavelNome, prazo: p.prazo, valorCentavos: null, href: `/pendencias/${p.id}`, acao: "Decidir", ordem: 1 });
  }
  if (pode(ctx, "os.ver", "empresa")) {
    // serviços parados: OS abertas sem nenhum avanço há 7+ dias
    const parados = await dbx.select({ id: ordemServico.id, numero: ordemServico.numero, descricao: ordemServico.descricao, etapa: ordemServico.etapa, ultimo: ordemServico.ultimoAvancoEm, resp: usuario.nome, proxima: ordemServico.proximaAcao, clienteNome: cliente.nome })
      .from(ordemServico).innerJoin(cliente, eq(cliente.id, ordemServico.clienteId)).leftJoin(usuario, eq(usuario.id, ordemServico.responsavelResolucaoId))
      .where(and(eq(ordemServico.empresaId, ctx.empresaId), sql`${ordemServico.etapa} not in ('encerrada','cancelada','aberta','em_planejamento')`, sql`${ordemServico.ultimoAvancoEm} < now() - interval '7 days'`)).limit(10);
    for (const o of parados) out.push({ id: `os:${o.id}`, tipo: "Serviço parado", titulo: `OS ${o.numero} · ${o.clienteNome}`, motivo: `Sem avanço há ${Math.floor((Date.now() - o.ultimo.getTime()) / 86400000)} dias${o.proxima ? ` · ${o.proxima}` : ""}`, responsavel: o.resp, prazo: null, valorCentavos: null, href: `/os/${o.id}`, acao: "Abrir OS", ordem: 3 });
  }
  void hoje;
  return out.sort((a, b) => a.ordem - b.ordem);
}

/** Indicadores compactos e reais (sem metas inventadas). */
export async function indicadoresGestor(dbx: DBOrTx, ctx: Ctx) {
  const hoje = hojeSP();
  const [ini] = intervaloDiaSP(somarDias(hoje, -30));
  const out: { agenda?: { finalizadas: number; concluidas: number; naoIniciadas: number }; motivos?: Array<{ motivo: string | null; n: number }>; vencidosHist?: Array<{ mes: string; valor: number }> | null } = {};
  if (pode(ctx, "agenda.ver", "empresa")) {
    const [a] = await dbx.select({ fin: sql<number>`count(*) filter (where ${visita.situacao} = 'finalizada')::int`, conc: sql<number>`count(*) filter (where ${visita.resultado} = 'concluida')::int`, nao: sql<number>`count(*) filter (where ${visita.situacao} = 'agendada' and ${visita.inicioPrevisto} < now())::int` })
      .from(visita).where(and(eq(visita.empresaId, ctx.empresaId), sql`coalesce(${visita.checkoutEm}, ${visita.inicioPrevisto}) >= ${ini.toISOString()}`, sql`coalesce(${visita.checkoutEm}, ${visita.inicioPrevisto}) < now()`));
    out.agenda = { finalizadas: a.fin, concluidas: a.conc, naoIniciadas: a.nao };
    out.motivos = await dbx.select({ motivo: visita.motivoResultado, n: sql<number>`count(*)::int` }).from(visita).where(and(eq(visita.empresaId, ctx.empresaId), sql`${visita.motivoResultado} is not null`, sql`${visita.checkoutEm} >= ${ini.toISOString()}`)).groupBy(visita.motivoResultado);
  }
  if (pode(ctx, "financeiro.ver")) {
    // vencido a receber ao fim de cada mês (considerando recebimentos confirmados até a data) — só se houver histórico
    const restr = pode(ctx, "financeiro.restrito.ver") ? sql`true` : sql`${qc(categoriaFinanceira.restrita)} = false`;
    void restr;
    const hist: Array<{ mes: string; valor: number }> = [];
    for (let m = -2; m <= 0; m++) {
      const fim = m === 0 ? hoje : somarDias(primeiroDiaMes(somarMeses(hoje, m + 1)), -1);
      const [r] = await dbx.select({ v: sql<string>`coalesce(sum(${parcela.valorCentavos} - coalesce((select sum(b.valor_centavos) from ${baixa} b where b.parcela_id = ${qc(parcela.id)} and b.status = 'confirmada' and b.data_pagamento <= ${fim}),0)),0)`, n: sql<number>`count(*)::int` })
        .from(parcela).innerJoin(obrigacao, eq(obrigacao.id, parcela.obrigacaoId)).where(and(eq(obrigacao.empresaId, ctx.empresaId), eq(obrigacao.natureza, "receber"), eq(parcela.cancelada, false), eq(obrigacao.situacaoAprovacao, "aprovada"), sql`${parcela.vencimento} < ${fim}`, sql`(${obrigacao.criadoEm} at time zone 'America/Sao_Paulo')::date <= ${fim}::date`));
      hist.push({ mes: fim, valor: Number(r.v) });
    }
    // evolução só com pelo menos dois meses com registros; caso contrário, histórico insuficiente
    out.vencidosHist = hist.filter((h) => h.valor > 0).length >= 2 ? hist : null;
  }
  return out;
}

// ---------------------------------------------------------------- administrativo
export async function resumoOperacional(dbx: DBOrTx, ctx: Ctx): Promise<Indicador[]> {
  const out: Indicador[] = [];
  if (pode(ctx, "pedido.ver")) {
    const [r] = await dbx.select({ n: sql<number>`count(*)::int` }).from(pedidoExterno).where(and(eq(pedidoExterno.empresaId, ctx.empresaId), eq(pedidoExterno.situacao, "para_programar")));
    out.push({ id: "pedidos", rotulo: "Pedidos para programar", valor: r.n, href: "/pedidos?situacao=para_programar", tom: r.n ? "problema" : "ok" });
  }
  if (pode(ctx, "os.ver", "empresa")) {
    const [sem, mat, conf] = await Promise.all([listarOS(dbx, ctx, { semResponsavel: true, limite: 1 }), listarOS(dbx, ctx, { materialPendente: true, limite: 1 }), listarOS(dbx, ctx, { conferenciaPendente: true, limite: 1 })]);
    out.push({ id: "sem_equipe", rotulo: "OS sem equipe agendada", valor: sem.total, href: "/os?semResponsavel=1", tom: sem.total ? "problema" : "ok" });
    out.push({ id: "material", rotulo: "OS aguardando material", valor: mat.total, href: "/os?materialPendente=1", tom: mat.total ? "problema" : "ok" });
    out.push({ id: "conferencia", rotulo: "Conclusões para conferir", valor: conf.total, href: "/os?conferenciaPendente=1", tom: conf.total ? "problema" : "ok" });
  }
  return out;
}

export interface ItemResolver { id: string; problema: string; detalhe: string; proximaAcao: string; href: string; gravidade: "alta" | "media" | "baixa" }

/** Lista única priorizada do que o escritório precisa resolver (sem um cartão por tipo). */
export async function oQueResolver(dbx: DBOrTx, ctx: Ctx, limite = 8): Promise<{ itens: ItemResolver[]; total: number }> {
  const itens: ItemResolver[] = [];
  if (pode(ctx, "agenda.ver", "empresa")) {
    const at = await listarVisitas(dbx, ctx, { filtro: "atrasadas", limite: 10 });
    for (const v of at.rows) itens.push({ id: `v:${v.id}`, problema: "Visita não iniciada após o horário", detalhe: `OS ${v.osNumero} · ${v.clienteNome} · ${v.equipe ?? "sem equipe"}`, proximaAcao: "Contatar a equipe ou reagendar", href: `/visitas/${v.id}`, gravidade: "alta" });
  }
  if (pode(ctx, "pedido.ver")) {
    const ps = await dbx.select().from(pedidoExterno).where(and(eq(pedidoExterno.empresaId, ctx.empresaId), inArray(pedidoExterno.situacao, ["para_programar", "conferencia"]))).limit(10);
    for (const p of ps) itens.push({ id: `p:${p.id}`, problema: p.situacao === "conferencia" ? "Pedido alterado após a OS" : "Pedido para programar", detalhe: `${p.idExterno} · ${(p.dadosOriginais as { cliente?: { nome?: string } }).cliente?.nome ?? ""}`, proximaAcao: p.situacao === "conferencia" ? "Conferir alteração" : "Montar a OS", href: `/pedidos/${p.id}`, gravidade: p.situacao === "conferencia" ? "alta" : "media" });
  }
  if (pode(ctx, "os.ver", "empresa")) {
    const [sem, ret, mat, conf] = await Promise.all([listarOS(dbx, ctx, { semResponsavel: true, limite: 10 }), listarOS(dbx, ctx, { etapa: "pendente_retorno", limite: 10 }), listarOS(dbx, ctx, { materialPendente: true, limite: 10 }), listarOS(dbx, ctx, { conferenciaPendente: true, limite: 10 })]);
    for (const o of ret.rows) itens.push({ id: `r:${o.id}`, problema: "Retorno para organizar", detalhe: `OS ${o.numero} · ${o.clienteNome}${o.motivoEtapa ? ` · ${o.motivoEtapa}` : ""}`, proximaAcao: "Programar nova visita", href: `/os/${o.id}`, gravidade: "alta" });
    for (const o of sem.rows) itens.push({ id: `s:${o.id}`, problema: "OS sem equipe agendada", detalhe: `OS ${o.numero} · ${o.clienteNome} · ${o.descricao.slice(0, 50)}`, proximaAcao: "Definir equipe e data", href: `/os/${o.id}`, gravidade: o.prioridade === "urgente" ? "alta" : "media" });
    for (const o of mat.rows) itens.push({ id: `m:${o.id}`, problema: "Aguardando material", detalhe: `OS ${o.numero} · ${o.clienteNome}${o.motivoEtapa ? ` · ${o.motivoEtapa}` : ""}`, proximaAcao: o.proximaAcao ?? "Providenciar material", href: `/os/${o.id}`, gravidade: "media" });
    for (const o of conf.rows) itens.push({ id: `c:${o.id}`, problema: "Conclusão para conferir", detalhe: `OS ${o.numero} · ${o.clienteNome}`, proximaAcao: "Conferir fichas e fotos e encerrar", href: `/os/${o.id}`, gravidade: "baixa" });
  }
  if (pode(ctx, "material.conferir")) {
    const mv = await movimentosAguardandoConferencia(dbx, ctx);
    if (mv.length) itens.push({ id: "mat", problema: "Materiais informados aguardando conferência", detalhe: `${mv.length} registro(s) de consumo/devolução/perda`, proximaAcao: "Conferir no almoxarifado", href: "/materiais/conferencia", gravidade: "media" });
  }
  if (pode(ctx, "ferramenta.movimentar")) {
    const fp = await movimentosFerramentaPendentes(dbx, ctx);
    const dev = fp.filter((f) => f.m.tipo === "devolucao").length;
    if (dev) itens.push({ id: "ferr", problema: "Devoluções de ferramenta para conferir", detalhe: `${dev} ferramenta(s)`, proximaAcao: "Conferir condição e receber", href: "/ferramentas", gravidade: "media" });
  }
  const peso = { alta: 0, media: 1, baixa: 2 };
  itens.sort((a, b) => peso[a.gravidade] - peso[b.gravidade]);
  return { itens: itens.slice(0, limite), total: itens.length };
}

// ---------------------------------------------------------------- financeiro
export async function compromissosHoje(dbx: DBOrTx, ctx: Ctx): Promise<Indicador[]> {
  const hoje = hojeSP();
  const restr = pode(ctx, "financeiro.restrito.ver") ? sql`true` : sql`${qc(categoriaFinanceira.restrita)} = false`;
  const [rec, pag] = await Promise.all([listarParcelas(dbx, ctx, { natureza: "receber", situacao: "hoje", limite: 1 }), listarParcelas(dbx, ctx, { natureza: "pagar", situacao: "hoje", limite: 1 })]);
  const [mov] = await dbx.select({
    recebido: sql<string>`coalesce(sum(${baixa.valorCentavos}) filter (where ${obrigacao.natureza} = 'receber'),0)`, pago: sql<string>`coalesce(sum(${baixa.valorCentavos}) filter (where ${obrigacao.natureza} = 'pagar'),0)`,
  }).from(baixa).innerJoin(parcela, eq(parcela.id, baixa.parcelaId)).innerJoin(obrigacao, eq(obrigacao.id, parcela.obrigacaoId)).innerJoin(categoriaFinanceira, eq(categoriaFinanceira.id, obrigacao.categoriaId))
    .where(and(eq(baixa.empresaId, ctx.empresaId), eq(baixa.status, "confirmada"), eq(baixa.dataPagamento, hoje), restr));
  return [
    { id: "receber_hoje", rotulo: "A receber hoje (em aberto)", valor: rec.somaSaldo, moeda: true, href: "/financeiro/receber?situacao=hoje", dica: `${rec.total} parcela(s)`, tom: "normal" },
    { id: "pagar_hoje", rotulo: "A pagar hoje (em aberto)", valor: pag.somaSaldo, moeda: true, href: "/financeiro/pagar?situacao=hoje", dica: `${pag.total} parcela(s)`, tom: pag.total ? "problema" : "normal" },
    { id: "recebido_hoje", rotulo: "Recebido hoje (confirmado)", valor: Number(mov.recebido), moeda: true, href: `/financeiro/caixa?de=${hoje}&ate=${hoje}`, tom: "ok" },
    { id: "pago_hoje", rotulo: "Pago hoje (confirmado)", valor: Number(mov.pago), moeda: true, href: `/financeiro/caixa?de=${hoje}&ate=${hoje}`, tom: "normal" },
  ];
}

export async function cobrancas(dbx: DBOrTx, ctx: Ctx) {
  const hoje = hojeSP();
  const [atrasos, venc] = await Promise.all([clientesEmAtraso(dbx, ctx), listarParcelas(dbx, ctx, { natureza: "receber", situacao: "vencidas", limite: 1 })]);
  const acaoHoje = atrasos.filter((a) => a.proximaAcaoEm && a.proximaAcaoEm <= hoje).length;
  return { totalVencido: venc.somaSaldo, parcelasVencidas: venc.total, clientes: atrasos.length, acaoHojeOuAtrasada: acaoHoje, lista: atrasos.slice(0, 6) };
}

export async function pagamentosEConferencias(dbx: DBOrTx, ctx: Ctx): Promise<Indicador[]> {
  const [aguard, autoriz] = await Promise.all([
    listarParcelas(dbx, ctx, { natureza: "pagar", situacao: "abertas", aprovacao: "aguardando_aprovacao", limite: 1 }),
    listarParcelas(dbx, ctx, { natureza: "pagar", situacao: "abertas", aprovacao: "aprovada", limite: 1 }),
  ]);
  const restrB = pode(ctx, "financeiro.restrito.ver") ? sql`true` : sql`${qc(categoriaFinanceira.restrita)} = false`;
  const [conf] = await dbx.select({ n: sql<number>`count(*)::int` }).from(baixa).innerJoin(parcela, eq(parcela.id, baixa.parcelaId)).innerJoin(obrigacao, eq(obrigacao.id, parcela.obrigacaoId)).innerJoin(categoriaFinanceira, eq(categoriaFinanceira.id, obrigacao.categoriaId))
    .where(and(eq(baixa.empresaId, ctx.empresaId), eq(baixa.status, "aguardando_conferencia"), restrB));
  const confere = pode(ctx, "financeiro.aprovar") || pode(ctx, "financeiro.baixa.confirmar");
  const out: Indicador[] = [
    { id: "aguard_aut", rotulo: "Pagamentos aguardando autorização", valor: aguard.somaSaldo, moeda: true, href: "/financeiro/pagar?situacao=abertas&aprovacao=aguardando_aprovacao", dica: `${aguard.total} parcela(s) — não autorizados`, tom: aguard.total ? "problema" : "ok" },
    { id: "autorizados", rotulo: "Autorizados ainda não pagos", valor: autoriz.somaSaldo, moeda: true, href: "/financeiro/pagar?situacao=abertas&aprovacao=aprovada", dica: `${autoriz.total} parcela(s) — autorização não é pagamento`, tom: "normal" },
    { id: "conferencia", rotulo: "Registros aguardando conferência", valor: conf.n, href: confere ? "/financeiro/aprovacoes" : "/financeiro/pagar?situacao=abertas", dica: confere ? "Recebimentos/pagamentos para você conferir" : "Aguardando conferência do gestor", tom: conf.n ? "problema" : "ok" },
  ];
  if (pode(ctx, "autonomo.valores.ver", "empresa")) {
    const [a] = await dbx.select({ conferir: sql<number>`count(*) filter (where ${autonomoServico.situacao} = 'aguardando_conferencia')::int` }).from(autonomoServico).where(eq(autonomoServico.empresaId, ctx.empresaId));
    const [r] = await dbx.select({ liberar: sql<number>`count(*) filter (where ${resumoSemanalAutonomo.situacao} in ('preparado','liberacao_solicitada'))::int`,
      pagar: sql<number>`count(*) filter (where ${resumoSemanalAutonomo.situacao} = 'liberado' and exists (select 1 from ${parcela} pa where pa.obrigacao_id = ${qc(resumoSemanalAutonomo.obrigacaoId)} and pa.valor_centavos > coalesce((select sum(b.valor_centavos) from ${baixa} b where b.parcela_id = pa.id and b.status = 'confirmada'),0)))::int` })
      .from(resumoSemanalAutonomo).where(eq(resumoSemanalAutonomo.empresaId, ctx.empresaId));
    out.push({ id: "autonomos", rotulo: "Autônomos: conferir / liberar / pagar", valor: null, href: "/financeiro/autonomos", dica: `${a.conferir} a conferir · ${r.liberar} a liberar · ${r.pagar} a pagar`, tom: a.conferir + r.liberar + r.pagar ? "problema" : "ok" });
  }
  return out;
}

export async function avisoConfiguracao(dbx: DBOrTx, ctx: Ctx) {
  if (!pode(ctx, "financeiro.ver")) return null; // administrativo sem função financeira não vê
  const cfg = await obterConfig(dbx, ctx.empresaId);
  const faltas: string[] = [];
  if (!cfg.implantacao.dataCorte) faltas.push("data de corte e saldos iniciais");
  if (!cfg.financeiro.politicaDelegacaoDefinida) faltas.push("política de delegação financeira");
  if (!faltas.length) return null;
  const podeConfigurar = pode(ctx, "configuracao.gerenciar");
  return { faltas, podeConfigurar, texto: podeConfigurar ? `Configuração pendente: ${faltas.join(" e ")}.` : `Limitação: ${faltas.join(" e ")} ainda não definida(s) pelos donos. Seus registros de pagamento ficam aguardando conferência.` };
}

export { saldoParcelaSQL };
