/**
 * Caixa realizado e previsto.
 *  Realizado = saldo inicial (por data) + baixas CONFIRMADAS (receber − pagar) + transferências confirmadas (entre contas).
 *  Projeção  = saldo confirmado na data de corte + entradas previstas em aberto − saídas previstas em aberto.
 *  Parcelas já recebidas não reaparecem como futuras (saldo da parcela = valor − confirmado).
 *  Transferências não são receita/despesa no consolidado. Recebimento previsto ≠ dinheiro garantido.
 */
import { and, eq, sql } from "drizzle-orm";
import { qc } from "../db/sql";
import type { DBOrTx } from "../db";
import { baixa, categoriaFinanceira, contaFinanceira, obrigacao, parcela, transferenciaConta } from "../db/schema";
import { type Ctx, exigir, pode } from "../auth/contexto";
import { hojeSP, somarDias } from "@/lib/datas";
import { saldoParcelaSQL } from "./financeiro";

export interface SaldoConta { contaId: string; nome: string; saldoInicial: number | null; saldoInicialData: string | null; entradas: number; saidas: number; transfEntrada: number; transfSaida: number; saldo: number | null; aguardandoConferencia: number }

export async function saldosRealizados(dbx: DBOrTx, ctx: Ctx, ate: string = hojeSP()) {
  exigir(ctx, "financeiro.fluxo.ver");
  const contas = await dbx.select().from(contaFinanceira).where(and(eq(contaFinanceira.empresaId, ctx.empresaId), eq(contaFinanceira.ativo, true)));
  const out: SaldoConta[] = [];
  for (const c of contas) {
    const desde = c.saldoInicialData ?? "1900-01-01";
    const [m] = await dbx.select({
      entradas: sql<string>`coalesce(sum(${qc(baixa.valorCentavos)}) filter (where ${qc(obrigacao.natureza)} = 'receber' and ${qc(baixa.status)} = 'confirmada'),0)`,
      saidas: sql<string>`coalesce(sum(${qc(baixa.valorCentavos)}) filter (where ${qc(obrigacao.natureza)} = 'pagar' and ${qc(baixa.status)} = 'confirmada'),0)`,
      aguardando: sql<string>`coalesce(sum(abs(${qc(baixa.valorCentavos)})) filter (where ${qc(baixa.status)} = 'aguardando_conferencia'),0)`,
    }).from(baixa).innerJoin(parcela, eq(parcela.id, baixa.parcelaId)).innerJoin(obrigacao, eq(obrigacao.id, parcela.obrigacaoId))
      .where(and(eq(baixa.contaId, c.id), sql`${qc(baixa.dataPagamento)} >= ${desde} and ${qc(baixa.dataPagamento)} <= ${ate}`));
    const [t] = await dbx.select({
      ent: sql<string>`coalesce(sum(${qc(transferenciaConta.valorCentavos)}) filter (where ${qc(transferenciaConta.destinoContaId)} = ${c.id}),0)`,
      sai: sql<string>`coalesce(sum(${qc(transferenciaConta.valorCentavos)}) filter (where ${qc(transferenciaConta.origemContaId)} = ${c.id}),0)`,
    }).from(transferenciaConta).where(and(eq(transferenciaConta.status, "confirmada"), sql`${qc(transferenciaConta.data)} >= ${desde} and ${qc(transferenciaConta.data)} <= ${ate}`, sql`(${qc(transferenciaConta.origemContaId)} = ${c.id} or ${qc(transferenciaConta.destinoContaId)} = ${c.id})`));
    const entradas = Number(m.entradas), saidas = Number(m.saidas), te = Number(t.ent), ts = Number(t.sai);
    out.push({ contaId: c.id, nome: c.nome, saldoInicial: c.saldoInicialCentavos, saldoInicialData: c.saldoInicialData, entradas, saidas, transfEntrada: te, transfSaida: ts,
      saldo: c.saldoInicialCentavos === null ? null : c.saldoInicialCentavos + entradas - saidas + te - ts, aguardandoConferencia: Number(m.aguardando) });
  }
  const incompleto = out.length === 0 || out.some((c) => c.saldo === null);
  const consolidado = out.length === 0 ? null : out.reduce((s, c) => s + (c.saldo ?? 0), 0);
  return { contas: out, consolidado, incompleto, dataCorte: ate };
}

/** Recebido/pago no período (realizado, baixas confirmadas por data de pagamento). Transferências excluídas. */
export async function realizadoPeriodo(dbx: DBOrTx, ctx: Ctx, de: string, ate: string) {
  exigir(ctx, "financeiro.fluxo.ver");
  const restr = pode(ctx, "financeiro.restrito.ver") ? sql`true` : sql`${qc(categoriaFinanceira.restrita)} = false`;
  const rows = await dbx.select({ natureza: obrigacao.natureza, categoria: categoriaFinanceira.nome, restrita: categoriaFinanceira.restrita, total: sql<string>`sum(${qc(baixa.valorCentavos)})` })
    .from(baixa).innerJoin(parcela, eq(parcela.id, baixa.parcelaId)).innerJoin(obrigacao, eq(obrigacao.id, parcela.obrigacaoId)).innerJoin(categoriaFinanceira, eq(categoriaFinanceira.id, obrigacao.categoriaId))
    .where(and(eq(baixa.empresaId, ctx.empresaId), eq(baixa.status, "confirmada"), sql`${qc(baixa.dataPagamento)} between ${de} and ${ate}`, restr))
    .groupBy(obrigacao.natureza, categoriaFinanceira.nome, categoriaFinanceira.restrita);
  const recebido = rows.filter((r) => r.natureza === "receber").reduce((s, r) => s + Number(r.total), 0);
  const pago = rows.filter((r) => r.natureza === "pagar").reduce((s, r) => s + Number(r.total), 0);
  // categorias restritas omitidas para quem não tem permissão: total pago é parcial — sinalizado
  const omitidoRestrito = !pode(ctx, "financeiro.restrito.ver");
  return { recebido, pago, diferencaCaixa: recebido - pago, porCategoria: rows.map((r) => ({ ...r, total: Number(r.total) })), omitidoRestrito, registros: rows.length };
}

export interface DiaProjecao { dia: string; entradas: number; saidas: number; saldo: number }

export async function projecao(dbx: DBOrTx, ctx: Ctx, horizonteDias: number) {
  exigir(ctx, "financeiro.fluxo.ver");
  const hoje = hojeSP();
  const fim = somarDias(hoje, horizonteDias);
  const saldos = await saldosRealizados(dbx, ctx, hoje);
  const restr = pode(ctx, "financeiro.restrito.ver") ? sql`true` : sql`${qc(categoriaFinanceira.restrita)} = false`;
  const abertas = await dbx.select({ natureza: obrigacao.natureza, vencimento: parcela.vencimento, saldo: sql<string>`${saldoParcelaSQL}`, descricao: obrigacao.descricao, obrigacaoId: obrigacao.id, aprovacao: obrigacao.situacaoAprovacao })
    .from(parcela).innerJoin(obrigacao, eq(obrigacao.id, parcela.obrigacaoId)).innerJoin(categoriaFinanceira, eq(categoriaFinanceira.id, obrigacao.categoriaId))
    .where(and(eq(obrigacao.empresaId, ctx.empresaId), eq(parcela.cancelada, false), sql`${qc(obrigacao.situacaoAprovacao)} in ('aprovada','aguardando_aprovacao')`, sql`${saldoParcelaSQL} > 0`, sql`${qc(parcela.vencimento)} <= ${fim}`, restr));
  const ls = abertas.map((a) => ({ ...a, saldo: Number(a.saldo) }));
  const aprov = ls.filter((l) => l.aprovacao === "aprovada");
  const receberVencido = aprov.filter((l) => l.natureza === "receber" && l.vencimento < hoje).reduce((s, l) => s + l.saldo, 0);
  const pagarVencido = aprov.filter((l) => l.natureza === "pagar" && l.vencimento < hoje).reduce((s, l) => s + l.saldo, 0);
  const receberPrevisto = aprov.filter((l) => l.natureza === "receber" && l.vencimento >= hoje).reduce((s, l) => s + l.saldo, 0);
  const pagarPrevisto = aprov.filter((l) => l.natureza === "pagar" && l.vencimento >= hoje).reduce((s, l) => s + l.saldo, 0);
  const pagarAguardandoAprovacao = ls.filter((l) => l.natureza === "pagar" && l.aprovacao === "aguardando_aprovacao").reduce((s, l) => s + l.saldo, 0);
  // Série diária: vencidos a pagar contam hoje (obrigação já exigível); vencidos a receber NÃO entram (incerteza), exibidos à parte.
  const serie: DiaProjecao[] = [];
  let saldo = saldos.consolidado ?? 0;
  let primeiroNegativo: DiaProjecao | null = null;
  for (let i = 0; i <= horizonteDias; i++) {
    const dia = somarDias(hoje, i);
    const ent = aprov.filter((l) => l.natureza === "receber" && l.vencimento === dia).reduce((s, l) => s + l.saldo, 0);
    const sai = aprov.filter((l) => l.natureza === "pagar" && (l.vencimento === dia || (i === 0 && l.vencimento < hoje))).reduce((s, l) => s + l.saldo, 0);
    saldo += ent - sai;
    const d = { dia, entradas: ent, saidas: sai, saldo };
    serie.push(d);
    if (!primeiroNegativo && saldo < 0) primeiroNegativo = d;
  }
  const compromissosNoDia = primeiroNegativo ? aprov.filter((l) => l.natureza === "pagar" && (l.vencimento === primeiroNegativo!.dia || (primeiroNegativo!.dia === hoje && l.vencimento < hoje))) : [];
  const avisos: string[] = [];
  if (saldos.contas.length === 0) avisos.push("Nenhuma conta financeira cadastrada: não há base para saldo.");
  else if (saldos.incompleto) avisos.push(`Saldo inicial não informado para: ${saldos.contas.filter((c) => c.saldo === null).map((c) => c.nome).join(", ")}. A projeção está incompleta.`);
  if (ls.length === 0) avisos.push("Não há recebimentos ou pagamentos em aberto no período: a projeção reflete apenas o saldo confirmado.");
  if (!pode(ctx, "financeiro.restrito.ver")) avisos.push("Categorias restritas (salários/retiradas) não estão incluídas na sua visão.");
  if (pagarAguardandoAprovacao) avisos.push("Há pagamentos aguardando aprovação que não entram na projeção principal.");
  return {
    dataCorte: hoje, horizonteDias, fim, saldoConfirmado: saldos.consolidado, incompleta: saldos.incompleto || saldos.contas.length === 0,
    receberPrevisto, pagarPrevisto, receberVencido, pagarVencido, pagarAguardandoAprovacao,
    saldoProjetado: saldos.consolidado === null ? null : saldo, serie, primeiroNegativo, compromissosNoDia, avisos,
    premissas: [
      "Saldo de partida = saldo inicial por conta + baixas confirmadas até a data de corte.",
      "Entradas e saídas previstas = parcelas aprovadas em aberto (valor − recebido/pago confirmado).",
      "Recebimentos vencidos não entram na série (podem não ocorrer); pagamentos vencidos entram na data de corte.",
      "Baixas aguardando conferência não alteram o saldo realizado.",
      "Transferências entre contas não alteram o consolidado.",
    ],
  };
}
