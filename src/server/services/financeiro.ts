/**
 * Financeiro operacional: obrigações (receber/pagar) → parcelas → baixas.
 *  - Registrar baixa = registrar um FATO para conferência (não movimenta banco).
 *  - Só baixa confirmada altera o realizado. Estorno = baixa inversa vinculada; nada é apagado.
 *  - chave_unicidade impede duplicar obrigação ao reabrir OS, sincronizar pedido, gerar recorrência ou repetir clique.
 *  - Aprovação explícita; autoaprovação registrada; dupla aprovação configurável por categoria/valor.
 */
import { and, asc, desc, eq, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { qc } from "../db/sql";
import type { DBOrTx } from "../db";
import {
  aprovacao, baixa, categoriaFinanceira, cliente, cobrancaContato, contaFinanceira, contrato, fornecedor, obrigacao, ordemServico, osItem, parcela,
  profissional, transferenciaConta, usuario,
} from "../db/schema";
import { type Ctx, exigir, pode } from "../auth/contexto";
import type { Permissao } from "../auth/permissoes";
import { ErroAcesso, ErroNegocio, traduzirErroBanco } from "../erros";
import { auditar } from "./auditoria";
import { notificarPorPermissao, encerrarNotificacoes } from "./notificacoes";
import { diaDoMes, hojeSP, primeiroDiaMes } from "@/lib/datas";
import { valorItem } from "@/lib/quantidade";

// ---------------------------------------------------------------- categorias e contas
export async function listarCategorias(dbx: DBOrTx, ctx: Ctx, natureza?: "receber" | "pagar") {
  if (!pode(ctx, "financeiro.ver") && !pode(ctx, "material.movimentar")) throw new ErroAcesso();
  const conds: SQL[] = [eq(categoriaFinanceira.empresaId, ctx.empresaId), eq(categoriaFinanceira.ativo, true)];
  if (natureza) conds.push(eq(categoriaFinanceira.natureza, natureza));
  if (!pode(ctx, "financeiro.restrito.ver")) conds.push(eq(categoriaFinanceira.restrita, false));
  return dbx.select().from(categoriaFinanceira).where(and(...conds)).orderBy(asc(categoriaFinanceira.natureza), asc(categoriaFinanceira.nome));
}

export async function configurarCategoria(tx: DBOrTx, ctx: Ctx, id: string, d: { duplaAprovacaoAcimaCentavos: number | null; restrita: boolean }) {
  exigir(ctx, "configuracao.gerenciar"); exigir(ctx, "financeiro.aprovar");
  const [antes] = await tx.select().from(categoriaFinanceira).where(and(eq(categoriaFinanceira.id, id), eq(categoriaFinanceira.empresaId, ctx.empresaId)));
  if (!antes) throw new ErroAcesso();
  await tx.update(categoriaFinanceira).set(d).where(eq(categoriaFinanceira.id, id));
  await auditar(tx, ctx, { acao: "financeiro.categoria_configurada", entidadeTipo: "categoria_financeira", entidadeId: id, antes, depois: d, sensivel: true });
}

export async function listarContas(dbx: DBOrTx, ctx: Ctx) {
  if (!pode(ctx, "financeiro.ver") && !pode(ctx, "financeiro.baixa.registrar")) throw new ErroAcesso();
  return dbx.select().from(contaFinanceira).where(eq(contaFinanceira.empresaId, ctx.empresaId)).orderBy(asc(contaFinanceira.nome));
}

export async function salvarConta(tx: DBOrTx, ctx: Ctx, id: string | null, d: { nome: string; tipo: string; ativo: boolean }) {
  exigir(ctx, "financeiro.saldo_inicial");
  if (id) { await tx.update(contaFinanceira).set(d).where(and(eq(contaFinanceira.id, id), eq(contaFinanceira.empresaId, ctx.empresaId))); return; }
  const [c] = await tx.insert(contaFinanceira).values({ ...d, empresaId: ctx.empresaId }).returning();
  await auditar(tx, ctx, { acao: "financeiro.conta_criada", entidadeTipo: "conta_financeira", entidadeId: c.id, depois: d });
  return c;
}

/** Saldo inicial por data — somente gestor. Alteração exige motivo e preserva o anterior na auditoria. */
export async function definirSaldoInicial(tx: DBOrTx, ctx: Ctx, contaId: string, valorCentavos: number, data: string, motivo: string) {
  exigir(ctx, "financeiro.saldo_inicial");
  const [antes] = await tx.select().from(contaFinanceira).where(and(eq(contaFinanceira.id, contaId), eq(contaFinanceira.empresaId, ctx.empresaId)));
  if (!antes) throw new ErroAcesso();
  if (antes.saldoInicialCentavos !== null && !motivo?.trim()) throw new ErroNegocio("Alteração de saldo inicial exige motivo.");
  if (!Number.isInteger(valorCentavos)) throw new ErroNegocio("Valor inválido.");
  await tx.update(contaFinanceira).set({ saldoInicialCentavos: valorCentavos, saldoInicialData: data, saldoInicialPor: ctx.usuarioId }).where(eq(contaFinanceira.id, contaId));
  await auditar(tx, ctx, { acao: antes.saldoInicialCentavos === null ? "financeiro.saldo_inicial_definido" : "financeiro.saldo_inicial_alterado", entidadeTipo: "conta_financeira", entidadeId: contaId, motivo, antes: { valor: antes.saldoInicialCentavos, data: antes.saldoInicialData }, depois: { valor: valorCentavos, data }, sensivel: true });
}

// ---------------------------------------------------------------- obrigações
export interface NovaObrigacao {
  natureza: "receber" | "pagar"; categoriaId: string; descricao: string;
  clienteId?: string | null; fornecedorId?: string | null; profissionalId?: string | null; beneficiarioNome?: string | null;
  competencia?: string | null; valorBrutoCentavos: number; descontoCentavos?: number;
  origemTipo: string; origemId?: string | null; osId?: string | null; veiculoId?: string | null; chaveUnicidade?: string | null;
  contaPrevistaId?: string | null; documento?: string | null; notaFiscalRef?: string | null;
  parcelas: Array<{ vencimento: string; valorCentavos: number; descricao?: string | null }>;
  /** Origem já aprovada (OS aprovada, contrato ativo, resumo liberado pelo gestor) — não exige nova aprovação. */
  origemAprovada?: boolean; demo?: boolean;
  /** Obrigação anterior à data de corte (implantação). */
  legado?: boolean;
}

export async function criarObrigacao(tx: DBOrTx, ctx: Ctx, d: NovaObrigacao, opts: { permissaoAlternativa?: Permissao; solicitacaoTecnico?: boolean } = {}) {
  // solicitacaoTecnico: só pelo serviço de despesas (técnico próprio, categorias diárias/reembolso, sempre aguardando aprovação).
  if (!pode(ctx, "financeiro.lancar") && !(opts.permissaoAlternativa && pode(ctx, opts.permissaoAlternativa)) && !opts.solicitacaoTecnico) throw new ErroAcesso();
  const [cat] = await tx.select().from(categoriaFinanceira).where(and(eq(categoriaFinanceira.id, d.categoriaId), eq(categoriaFinanceira.empresaId, ctx.empresaId)));
  if (!cat || cat.natureza !== d.natureza) throw new ErroNegocio("Categoria inválida para a natureza.");
  if (cat.restrita && !pode(ctx, "financeiro.restrito.ver")) throw new ErroAcesso("Categoria restrita (salários/retiradas) exige permissão específica.");
  if (!d.descricao?.trim()) throw new ErroNegocio("Descrição obrigatória.");
  if (!Number.isInteger(d.valorBrutoCentavos) || d.valorBrutoCentavos <= 0) throw new ErroNegocio("Valor deve ser maior que zero.");
  const desconto = d.descontoCentavos ?? 0;
  if (desconto && !pode(ctx, "financeiro.desconto")) throw new ErroAcesso("Desconto exige autorização do gestor.");
  if (desconto < 0 || desconto > d.valorBrutoCentavos) throw new ErroNegocio("Desconto inválido.");
  const liquido = d.valorBrutoCentavos - desconto;
  if (!d.parcelas.length) throw new ErroNegocio("Informe ao menos uma parcela.");
  const soma = d.parcelas.reduce((s, p) => s + p.valorCentavos, 0);
  if (soma !== liquido) throw new ErroNegocio(`A soma das parcelas (${(soma / 100).toFixed(2)}) difere do valor líquido (${(liquido / 100).toFixed(2)}).`);
  if (d.parcelas.some((p) => !Number.isInteger(p.valorCentavos) || p.valorCentavos <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(p.vencimento))) throw new ErroNegocio("Parcela com valor ou vencimento inválido.");
  if (d.natureza === "receber" && !d.clienteId) throw new ErroNegocio("Conta a receber exige cliente.");
  if (d.clienteId) { const [c] = await tx.select().from(cliente).where(and(eq(cliente.id, d.clienteId), eq(cliente.empresaId, ctx.empresaId))); if (!c) throw new ErroNegocio("Cliente inválido."); }
  const exigeDupla = cat.duplaAprovacaoAcimaCentavos !== null && liquido >= cat.duplaAprovacaoAcimaCentavos;
  const podeAprovar = pode(ctx, "financeiro.aprovar");
  const autoAprovar = !opts.solicitacaoTecnico && (d.origemAprovada || (podeAprovar && !exigeDupla));
  let ob;
  try {
    ob = await tx.transaction(async (sp) => {
      const [o] = await sp.insert(obrigacao).values({
        empresaId: ctx.empresaId, natureza: d.natureza, categoriaId: cat.id, clienteId: d.clienteId ?? null, fornecedorId: d.fornecedorId ?? null, profissionalId: d.profissionalId ?? null,
        beneficiarioNome: d.beneficiarioNome ?? null, descricao: d.descricao.trim(), competencia: d.competencia ?? null, valorBrutoCentavos: d.valorBrutoCentavos, descontoCentavos: desconto,
        descontoAutorizadoPor: desconto ? ctx.usuarioId : null, origemTipo: d.origemTipo, origemId: d.origemId ?? null, osId: d.osId ?? null, veiculoId: d.veiculoId ?? null,
        chaveUnicidade: d.chaveUnicidade ?? null, situacaoAprovacao: autoAprovar ? "aprovada" : "aguardando_aprovacao", contaPrevistaId: d.contaPrevistaId ?? null,
        documento: d.documento ?? null, notaFiscalRef: d.notaFiscalRef ?? null, criadoPor: ctx.usuarioId, demo: d.demo ?? false, legado: d.legado ?? false,
      }).returning();
      await sp.insert(parcela).values(d.parcelas.map((p, i) => ({ obrigacaoId: o.id, numero: i + 1, vencimento: p.vencimento, valorCentavos: p.valorCentavos, descricao: p.descricao ?? (d.parcelas.length > 1 ? `${i + 1}/${d.parcelas.length}` : null) })));
      return o;
    });
  } catch (e) { throw traduzirErroBanco(e); }
  if (autoAprovar && !d.origemAprovada) {
    await tx.insert(aprovacao).values({ empresaId: ctx.empresaId, entidadeTipo: "obrigacao", entidadeId: ob.id, acao: "aprovar_obrigacao", decisao: "aprovada", solicitadoPor: ctx.usuarioId, decididoPor: ctx.usuarioId, autoaprovacao: true, motivo: "Lançada e aprovada pelo próprio aprovador", valorCentavos: liquido });
  }
  if (!autoAprovar) await notificarPorPermissao(tx, ctx.empresaId, "financeiro.aprovar", { tipo: "aprovacao_pendente", chave: "obrigacoes_aguardando_aprovacao", titulo: "Lançamentos aguardando aprovação", link: "/financeiro/aprovacoes", prioridade: "alta" });
  await auditar(tx, ctx, { acao: "financeiro.obrigacao_criada", entidadeTipo: "obrigacao", entidadeId: ob.id, depois: { natureza: d.natureza, valor: liquido, chave: d.chaveUnicidade, autoaprovada: autoAprovar && !d.origemAprovada }, sensivel: cat.restrita });
  return ob;
}

/** Versão idempotente: se a chave já existe, devolve a existente (sem duplicar). */
export async function garantirObrigacao(tx: DBOrTx, ctx: Ctx, d: NovaObrigacao & { chaveUnicidade: string }, opts: { permissaoAlternativa?: Permissao } = {}) {
  const [ex] = await tx.select().from(obrigacao).where(and(eq(obrigacao.empresaId, ctx.empresaId), eq(obrigacao.chaveUnicidade, d.chaveUnicidade)));
  if (ex) return { obrigacao: ex, criada: false };
  return { obrigacao: await criarObrigacao(tx, ctx, d, opts), criada: true };
}

async function beneficiarioEhUsuario(tx: DBOrTx, ob: typeof obrigacao.$inferSelect, usuarioId: string) {
  if (!ob.profissionalId) return false;
  const [p] = await tx.select({ u: profissional.usuarioId }).from(profissional).where(eq(profissional.id, ob.profissionalId));
  return p?.u === usuarioId;
}

export async function decidirObrigacao(tx: DBOrTx, ctx: Ctx, obrigacaoId: string, aprovar: boolean, motivo?: string | null) {
  exigir(ctx, "financeiro.aprovar");
  const [ob] = await tx.select().from(obrigacao).where(and(eq(obrigacao.id, obrigacaoId), eq(obrigacao.empresaId, ctx.empresaId))).for("update");
  if (!ob) throw new ErroAcesso();
  if (ob.situacaoAprovacao !== "aguardando_aprovacao") throw new ErroNegocio("Lançamento não está aguardando aprovação.");
  if (!aprovar && !motivo?.trim()) throw new ErroNegocio("Informe o motivo da rejeição.");
  const ehBenef = await beneficiarioEhUsuario(tx, ob, ctx.usuarioId);
  if (ehBenef && !ctx.papeis.includes("gestor")) throw new ErroAcesso("Você não pode aprovar pagamento a si mesmo.");
  const [cat] = await tx.select().from(categoriaFinanceira).where(eq(categoriaFinanceira.id, ob.categoriaId));
  if (cat.restrita && !pode(ctx, "financeiro.restrito.ver")) throw new ErroAcesso();
  const auto = ob.criadoPor === ctx.usuarioId || ehBenef;
  const liquido = ob.valorBrutoCentavos - ob.descontoCentavos;
  try {
    await tx.transaction(async (sp) => sp.insert(aprovacao).values({ empresaId: ctx.empresaId, entidadeTipo: "obrigacao", entidadeId: ob.id, acao: "aprovar_obrigacao", decisao: aprovar ? "aprovada" : "rejeitada", solicitadoPor: ob.criadoPor, decididoPor: ctx.usuarioId, autoaprovacao: auto, motivo: motivo ?? null, valorCentavos: liquido }));
  } catch (e) { throw traduzirErroBanco(e); }
  let situacao: string = aprovar ? "aprovada" : "rejeitada";
  if (aprovar && cat.duplaAprovacaoAcimaCentavos !== null && liquido >= cat.duplaAprovacaoAcimaCentavos) {
    const aps = await tx.select().from(aprovacao).where(and(eq(aprovacao.entidadeTipo, "obrigacao"), eq(aprovacao.entidadeId, ob.id), eq(aprovacao.acao, "aprovar_obrigacao"), eq(aprovacao.decisao, "aprovada")));
    if (new Set(aps.map((a) => a.decididoPor)).size < 2) situacao = "aguardando_aprovacao"; // aguarda segundo aprovador
  }
  if (situacao !== ob.situacaoAprovacao) await tx.update(obrigacao).set({ situacaoAprovacao: situacao }).where(eq(obrigacao.id, ob.id));
  await auditar(tx, ctx, { acao: aprovar ? "financeiro.obrigacao_aprovada" : "financeiro.obrigacao_rejeitada", entidadeTipo: "obrigacao", entidadeId: ob.id, motivo, depois: { situacao, autoaprovacao: auto, duplaPendente: situacao === "aguardando_aprovacao" }, sensivel: true });
  return { situacao, autoaprovacao: auto };
}

/** Cancela obrigação aprovada (gestor). Com baixas confirmadas líquidas, exige estorno antes. Histórico preservado. */
export async function cancelarObrigacao(tx: DBOrTx, ctx: Ctx, obrigacaoId: string, motivo: string) {
  if (!motivo?.trim()) throw new ErroNegocio("Motivo obrigatório.");
  const [ob] = await tx.select().from(obrigacao).where(and(eq(obrigacao.id, obrigacaoId), eq(obrigacao.empresaId, ctx.empresaId))).for("update");
  if (!ob) throw new ErroAcesso();
  if (ob.situacaoAprovacao === "aprovada") exigir(ctx, "financeiro.estornar"); else exigir(ctx, "financeiro.lancar");
  if (ob.situacaoAprovacao === "cancelada") return;
  const [{ liq }] = await tx.select({ liq: sql<number>`coalesce(sum(${qc(baixa.valorCentavos)}) filter (where ${qc(baixa.status)} = 'confirmada'),0)::bigint` }).from(baixa).innerJoin(parcela, eq(parcela.id, baixa.parcelaId)).where(eq(parcela.obrigacaoId, ob.id));
  if (Number(liq) !== 0) throw new ErroNegocio("Há recebimentos/pagamentos confirmados. Para cancelar a venda, registre antes o estorno/devolução de cada baixa (o histórico é preservado).");
  const [{ pend }] = await tx.select({ pend: sql<number>`count(*)::int` }).from(baixa).innerJoin(parcela, eq(parcela.id, baixa.parcelaId)).where(and(eq(parcela.obrigacaoId, ob.id), eq(baixa.status, "aguardando_conferencia")));
  if (pend > 0) throw new ErroNegocio("Há baixas aguardando conferência. Rejeite-as antes de cancelar.");
  await tx.update(obrigacao).set({ situacaoAprovacao: "cancelada", canceladaPor: ctx.usuarioId, canceladaMotivo: motivo }).where(eq(obrigacao.id, ob.id));
  await tx.update(parcela).set({ cancelada: true, canceladaMotivo: motivo }).where(eq(parcela.obrigacaoId, ob.id));
  await auditar(tx, ctx, { acao: "financeiro.obrigacao_cancelada", entidadeTipo: "obrigacao", entidadeId: ob.id, motivo, antes: { situacao: ob.situacaoAprovacao }, sensivel: true });
}

export async function anexarNotaFiscalRef(tx: DBOrTx, ctx: Ctx, obrigacaoId: string, ref: string) {
  exigir(ctx, "financeiro.lancar");
  const [ob] = await tx.update(obrigacao).set({ notaFiscalRef: ref }).where(and(eq(obrigacao.id, obrigacaoId), eq(obrigacao.empresaId, ctx.empresaId))).returning();
  if (!ob) throw new ErroAcesso();
  await auditar(tx, ctx, { acao: "financeiro.nf_referenciada", entidadeTipo: "obrigacao", entidadeId: obrigacaoId, depois: { ref } });
}

// ---------------------------------------------------------------- baixas
async function lerParcelaParaBaixa(tx: DBOrTx, ctx: Ctx, parcelaId: string) {
  const [r] = await tx.select({ p: parcela, ob: obrigacao }).from(parcela).innerJoin(obrigacao, eq(obrigacao.id, parcela.obrigacaoId))
    .where(and(eq(parcela.id, parcelaId), eq(obrigacao.empresaId, ctx.empresaId))).for("update", { of: parcela });
  if (!r) throw new ErroAcesso();
  return r;
}

async function comprometidoParcela(tx: DBOrTx, parcelaId: string) {
  const [r] = await tx.select({
    confirmado: sql<string>`coalesce(sum(${qc(baixa.valorCentavos)}) filter (where ${qc(baixa.status)} = 'confirmada'),0)`,
    aguardando: sql<string>`coalesce(sum(${qc(baixa.valorCentavos)}) filter (where ${qc(baixa.status)} = 'aguardando_conferencia'),0)`,
  }).from(baixa).where(eq(baixa.parcelaId, parcelaId));
  return { confirmado: Number(r.confirmado), aguardando: Number(r.aguardando) };
}

function podeConfirmarBaixa(ctx: Ctx, natureza: string, obAprovada: boolean) {
  if (pode(ctx, "financeiro.aprovar")) return true;
  if (pode(ctx, "financeiro.baixa.confirmar")) return natureza === "receber" || obAprovada;
  return false;
}

/** Registra recebimento/pagamento efetivamente realizado. Parcial permitido; nunca acima do saldo da parcela. */
export async function registrarBaixa(tx: DBOrTx, ctx: Ctx, d: { parcelaId: string; contaId: string; valorCentavos: number; dataPagamento: string; forma?: string | null; motivo?: string | null; chave?: string | null;
  /** Pagamento que já aconteceu sem aprovação prévia: exige permissão específica, justificativa e comprovante anexado. */
  excecao?: { justificativa: string; comprovanteAnexado: boolean } | null }) {
  exigir(ctx, "financeiro.baixa.registrar");
  if (d.chave) {
    const [ex] = await tx.select().from(baixa).where(eq(baixa.chaveIdempotencia, d.chave));
    if (ex) return { baixa: ex, repetido: true };
  }
  const { p, ob } = await lerParcelaParaBaixa(tx, ctx, d.parcelaId);
  if (p.cancelada || ob.situacaoAprovacao === "cancelada") throw new ErroNegocio("Parcela cancelada.");
  const excecao = ob.natureza === "pagar" && ob.situacaoAprovacao === "aguardando_aprovacao" && !!d.excecao;
  if (excecao) {
    exigir(ctx, "financeiro.baixa.excecao");
    if (!d.excecao!.justificativa?.trim()) throw new ErroNegocio("Justifique por que o pagamento ocorreu sem aprovação prévia.");
    if (!d.excecao!.comprovanteAnexado) throw new ErroNegocio("Anexe o comprovante do pagamento realizado.");
    if ((await beneficiarioEhUsuario(tx, ob, ctx.usuarioId)) && !ctx.papeis.includes("gestor")) throw new ErroAcesso("Você não pode registrar exceção de pagamento a si mesmo.");
  } else if (ob.situacaoAprovacao !== "aprovada") throw new ErroNegocio(ob.natureza === "pagar" ? "Pagamento ainda não aprovado pelo gestor. Se ele já foi efetivamente realizado, registre como exceção (com comprovante)." : "Conta a receber ainda não aprovada.");
  const [conta] = await tx.select().from(contaFinanceira).where(and(eq(contaFinanceira.id, d.contaId), eq(contaFinanceira.empresaId, ctx.empresaId), eq(contaFinanceira.ativo, true)));
  if (!conta) throw new ErroNegocio("Conta financeira inválida.");
  if (!Number.isInteger(d.valorCentavos) || d.valorCentavos <= 0) throw new ErroNegocio("Valor deve ser maior que zero.");
  if (conta.saldoInicialData && d.dataPagamento < conta.saldoInicialData) throw new ErroNegocio(`Data anterior ao saldo inicial da conta (${conta.saldoInicialData.split("-").reverse().join("/")}): esse valor já está no saldo inicial e não pode ser somado de novo.`);
  const c = await comprometidoParcela(tx, p.id);
  const restante = p.valorCentavos - c.confirmado - c.aguardando;
  if (d.valorCentavos > restante) throw new ErroNegocio(`Valor acima do saldo da parcela (restante: R$ ${(restante / 100).toFixed(2).replace(".", ",")}${c.aguardando ? ", considerando baixas aguardando conferência" : ""}).`);
  // Exceção: o dinheiro já saiu — entra no realizado (não esconder saída real), marcada para revisão do gestor.
  const confirmarDireto = excecao || (podeConfirmarBaixa(ctx, ob.natureza, true) && !(ob.natureza === "pagar" && (await beneficiarioEhUsuario(tx, ob, ctx.usuarioId)) && !ctx.papeis.includes("gestor")));
  let b;
  try {
    [b] = await tx.transaction(async (sp) => sp.insert(baixa).values({
      empresaId: ctx.empresaId, parcelaId: p.id, contaId: conta.id, valorCentavos: d.valorCentavos, dataPagamento: d.dataPagamento, forma: d.forma ?? null,
      status: confirmarDireto ? "confirmada" : "aguardando_conferencia", registradaPor: ctx.usuarioId,
      confirmadaPor: confirmarDireto ? ctx.usuarioId : null, confirmadaEm: confirmarDireto ? new Date() : null, autoconfirmacao: confirmarDireto, excecaoSemAprovacao: excecao, motivo: excecao ? d.excecao!.justificativa : d.motivo ?? null, chaveIdempotencia: d.chave ?? null,
    }).returning());
  } catch (e) { throw traduzirErroBanco(e); }
  if (excecao) await notificarPorPermissao(tx, ctx.empresaId, "financeiro.aprovar", { tipo: "pagamento_excecao", chave: `pagamento_excecao:${ob.id}`, titulo: "Pagamento realizado sem aprovação prévia — revisar", link: `/financeiro/obrigacoes/${ob.id}`, prioridade: "alta" });
  if (!confirmarDireto) await notificarPorPermissao(tx, ctx.empresaId, "financeiro.aprovar", { tipo: "baixa_conferencia", chave: "baixas_aguardando_conferencia", titulo: "Baixas aguardando conferência", link: "/financeiro/aprovacoes", prioridade: "media" });
  await auditar(tx, ctx, { acao: confirmarDireto ? "financeiro.baixa_registrada_confirmada" : "financeiro.baixa_registrada", entidadeTipo: "baixa", entidadeId: b.id, depois: { parcelaId: p.id, valor: d.valorCentavos, data: d.dataPagamento, autoconfirmacao: confirmarDireto } });
  return { baixa: b, repetido: false };
}

export async function decidirBaixa(tx: DBOrTx, ctx: Ctx, baixaId: string, confirmar: boolean, motivo?: string | null) {
  const [r] = await tx.select({ b: baixa, ob: obrigacao }).from(baixa).innerJoin(parcela, eq(parcela.id, baixa.parcelaId)).innerJoin(obrigacao, eq(obrigacao.id, parcela.obrigacaoId))
    .where(and(eq(baixa.id, baixaId), eq(baixa.empresaId, ctx.empresaId)));
  if (!r) throw new ErroAcesso();
  if (!podeConfirmarBaixa(ctx, r.ob.natureza, r.ob.situacaoAprovacao === "aprovada")) throw new ErroAcesso();
  if (r.ob.natureza === "pagar" && (await beneficiarioEhUsuario(tx, r.ob, ctx.usuarioId)) && !ctx.papeis.includes("gestor")) throw new ErroAcesso("Você não pode confirmar pagamento a si mesmo.");
  if (!confirmar && !motivo?.trim()) throw new ErroNegocio("Informe o motivo da rejeição.");
  const auto = r.b.registradaPor === ctx.usuarioId;
  const [up] = await tx.update(baixa).set({ status: confirmar ? "confirmada" : "rejeitada", confirmadaPor: ctx.usuarioId, confirmadaEm: new Date(), autoconfirmacao: auto, motivo: motivo ?? r.b.motivo })
    .where(and(eq(baixa.id, baixaId), eq(baixa.status, "aguardando_conferencia"))).returning();
  if (!up) { if (r.b.status === (confirmar ? "confirmada" : "rejeitada")) return { repetido: true }; throw new ErroNegocio("Baixa não está aguardando conferência."); }
  await tx.insert(aprovacao).values({ empresaId: ctx.empresaId, entidadeTipo: "baixa", entidadeId: baixaId, acao: "conferir_baixa", decisao: confirmar ? "aprovada" : "rejeitada", solicitadoPor: r.b.registradaPor, decididoPor: ctx.usuarioId, autoaprovacao: auto, motivo: motivo ?? null, valorCentavos: r.b.valorCentavos }).onConflictDoNothing();
  await auditar(tx, ctx, { acao: confirmar ? "financeiro.baixa_confirmada" : "financeiro.baixa_rejeitada", entidadeTipo: "baixa", entidadeId: baixaId, motivo, depois: { autoconfirmacao: auto }, sensivel: true });
  return { repetido: false };
}

/** Estorno definitivo (gestor): cria baixa inversa vinculada. A original permanece. */
export async function estornarBaixa(tx: DBOrTx, ctx: Ctx, baixaId: string, motivo: string) {
  exigir(ctx, "financeiro.estornar");
  if (!motivo?.trim()) throw new ErroNegocio("Motivo do estorno é obrigatório.");
  const [b] = await tx.select().from(baixa).where(and(eq(baixa.id, baixaId), eq(baixa.empresaId, ctx.empresaId))).for("update");
  if (!b) throw new ErroAcesso();
  if (b.status !== "confirmada" || b.estornoDeId) throw new ErroNegocio("Somente baixas confirmadas (não-estorno) podem ser estornadas.");
  let e;
  try {
    [e] = await tx.transaction(async (sp) => sp.insert(baixa).values({ empresaId: ctx.empresaId, parcelaId: b.parcelaId, contaId: b.contaId, valorCentavos: -b.valorCentavos, dataPagamento: hojeSP(), status: "confirmada", estornoDeId: b.id, motivo, registradaPor: ctx.usuarioId, confirmadaPor: ctx.usuarioId, confirmadaEm: new Date(), autoconfirmacao: true }).returning());
  } catch (err) { const t = traduzirErroBanco(err); throw t instanceof ErroNegocio ? new ErroNegocio("Esta baixa já foi estornada.") : t; }
  await tx.insert(aprovacao).values({ empresaId: ctx.empresaId, entidadeTipo: "baixa", entidadeId: b.id, acao: "estorno", decisao: "aprovada", solicitadoPor: ctx.usuarioId, decididoPor: ctx.usuarioId, autoaprovacao: true, motivo, valorCentavos: b.valorCentavos }).onConflictDoNothing();
  await auditar(tx, ctx, { acao: "financeiro.estorno", entidadeTipo: "baixa", entidadeId: b.id, motivo, depois: { estornoId: e.id, valor: -b.valorCentavos }, sensivel: true });
  return e;
}

// ---------------------------------------------------------------- transferências entre contas
export async function registrarTransferencia(tx: DBOrTx, ctx: Ctx, d: { origemContaId: string; destinoContaId: string; valorCentavos: number; data: string; descricao?: string | null; chave?: string | null }) {
  exigir(ctx, "financeiro.baixa.registrar");
  if (d.origemContaId === d.destinoContaId) throw new ErroNegocio("Contas de origem e destino devem ser diferentes.");
  const contas = await tx.select().from(contaFinanceira).where(and(inArray(contaFinanceira.id, [d.origemContaId, d.destinoContaId]), eq(contaFinanceira.empresaId, ctx.empresaId)));
  if (contas.length !== 2) throw new ErroNegocio("Conta inválida.");
  if (d.chave) { const [ex] = await tx.select().from(transferenciaConta).where(eq(transferenciaConta.chaveIdempotencia, d.chave)); if (ex) return ex; }
  const direto = pode(ctx, "financeiro.aprovar") || pode(ctx, "financeiro.baixa.confirmar");
  const [t] = await tx.insert(transferenciaConta).values({ ...d, chaveIdempotencia: d.chave ?? null, empresaId: ctx.empresaId, registradaPor: ctx.usuarioId, status: direto ? "confirmada" : "aguardando_conferencia", confirmadaPor: direto ? ctx.usuarioId : null, confirmadaEm: direto ? new Date() : null }).returning();
  await auditar(tx, ctx, { acao: "financeiro.transferencia", entidadeTipo: "transferencia_conta", entidadeId: t.id, depois: d });
  return t;
}

export async function decidirTransferencia(tx: DBOrTx, ctx: Ctx, id: string, confirmar: boolean, motivo?: string) {
  if (!pode(ctx, "financeiro.aprovar") && !pode(ctx, "financeiro.baixa.confirmar")) throw new ErroAcesso();
  const [t] = await tx.update(transferenciaConta).set({ status: confirmar ? "confirmada" : "rejeitada", confirmadaPor: ctx.usuarioId, confirmadaEm: new Date() })
    .where(and(eq(transferenciaConta.id, id), eq(transferenciaConta.empresaId, ctx.empresaId), eq(transferenciaConta.status, "aguardando_conferencia"))).returning();
  if (!t) throw new ErroNegocio("Transferência não está aguardando conferência.");
  await auditar(tx, ctx, { acao: confirmar ? "financeiro.transferencia_confirmada" : "financeiro.transferencia_rejeitada", entidadeTipo: "transferencia_conta", entidadeId: id, motivo });
}

// ---------------------------------------------------------------- geração a partir da operação
/**
 * Conta a receber da OS avulsa aprovada. Chave os:<id>:principal — reabrir/concluir a OS ou repetir clique não duplica.
 * Extras aprovados geram cobrança adicional própria (os:<id>:extra:<item>). Retorno/garantia e visitas de contrato não geram venda.
 * Item sem preço = valor desconhecido: não gera obrigação definitiva (não é gratuidade).
 */
export async function gerarRecebivelOS(tx: DBOrTx, ctx: Ctx, osId: string, d: { parcelas: Array<{ vencimento: string; valorCentavos: number }>; descontoCentavos?: number; itemExtraId?: string | null; contaPrevistaId?: string | null }) {
  exigir(ctx, "financeiro.lancar"); exigir(ctx, "os.valores.ver");
  const [o] = await tx.select().from(ordemServico).where(and(eq(ordemServico.id, osId), eq(ordemServico.empresaId, ctx.empresaId)));
  if (!o) throw new ErroAcesso();
  if (o.situacaoComercial !== "aprovada") throw new ErroNegocio("OS em rascunho/cancelada não gera cobrança definitiva.");
  const itens = await tx.select().from(osItem).where(eq(osItem.osId, osId));
  let alvo: typeof itens; let chave: string; let categoriaCodigo: string;
  if (d.itemExtraId) {
    alvo = itens.filter((i) => i.id === d.itemExtraId && i.situacao === "aprovado" && !i.incluidoContrato);
    if (!alvo.length) throw new ErroNegocio("Extra não aprovado ou incluso no contrato.");
    chave = `os:${osId}:extra:${d.itemExtraId}`; categoriaCodigo = o.origem === "contrato" ? "extra_contrato" : "servico_avulso";
  } else {
    if (o.origem !== "avulso") throw new ErroNegocio(o.origem === "contrato" ? "Visita de contrato não gera nova cobrança. Cobre apenas extras aprovados." : "Retorno/garantia não gera nova venda automaticamente. Cobre apenas extras aprovados, se houver.");
    alvo = itens.filter((i) => i.situacao === "previsto" && !i.incluidoContrato);
    chave = `os:${osId}:principal`; categoriaCodigo = "servico_avulso";
  }
  if (!alvo.length) throw new ErroNegocio("Não há itens cobráveis.");
  const semPreco = alvo.filter((i) => i.precoUnitarioCentavos === null);
  if (semPreco.length) throw new ErroNegocio(`Itens sem preço definido (${semPreco.map((i) => i.descricao).join(", ")}). Valor desconhecido não gera obrigação.`);
  const bruto = alvo.reduce((s, i) => s + valorItem(i.precoUnitarioCentavos, i.quantidade), 0);
  const [cat] = await tx.select().from(categoriaFinanceira).where(and(eq(categoriaFinanceira.empresaId, ctx.empresaId), eq(categoriaFinanceira.codigo, categoriaCodigo)));
  const r = await garantirObrigacao(tx, ctx, {
    natureza: "receber", categoriaId: cat.id, clienteId: o.clienteId, descricao: `OS ${o.numero}${d.itemExtraId ? " — extra" : ""}: ${o.descricao.slice(0, 80)}`, competencia: primeiroDiaMes(hojeSP()),
    valorBrutoCentavos: bruto, descontoCentavos: d.descontoCentavos ?? 0, origemTipo: "os", origemId: osId, osId, chaveUnicidade: chave, parcelas: d.parcelas, origemAprovada: true, contaPrevistaId: d.contaPrevistaId ?? null, demo: o.demo,
  });
  if (!r.criada) throw new ErroNegocio("A cobrança desta OS já foi gerada (proteção contra duplicidade).");
  return r.obrigacao;
}

/** Mensalidades por competência: uma por contrato/competência (chave única). Visitas não geram mensalidade. */
export async function gerarMensalidades(tx: DBOrTx, ctx: Ctx, competencia: string) {
  exigir(ctx, "financeiro.lancar"); exigir(ctx, "contrato.valores.ver");
  const comp = primeiroDiaMes(competencia);
  const cs = await tx.select().from(contrato).where(and(eq(contrato.empresaId, ctx.empresaId), eq(contrato.status, "ativo"), lte(contrato.inicio, sql`(${comp}::date + interval '1 month' - interval '1 day')::date`), or(isNull(contrato.fim), sql`${qc(contrato.fim)} >= ${comp}::date`)));
  const [cat] = await tx.select().from(categoriaFinanceira).where(and(eq(categoriaFinanceira.empresaId, ctx.empresaId), eq(categoriaFinanceira.codigo, "contrato")));
  const res = { geradas: 0, existentes: 0, semValor: [] as string[] };
  for (const c of cs) {
    if (c.valorMensalCentavos === null || c.valorMensalCentavos <= 0) { res.semValor.push(c.numero); continue; }
    const r = await garantirObrigacao(tx, ctx, {
      natureza: "receber", categoriaId: cat.id, clienteId: c.clienteId, descricao: `Contrato ${c.numero} — ${comp.slice(5, 7)}/${comp.slice(0, 4)}`, competencia: comp,
      valorBrutoCentavos: c.valorMensalCentavos, origemTipo: "contrato", origemId: c.id, chaveUnicidade: `contrato:${c.id}:${comp.slice(0, 7)}`,
      parcelas: [{ vencimento: diaDoMes(comp, c.diaVencimento), valorCentavos: c.valorMensalCentavos }], origemAprovada: true,
    });
    if (r.criada) res.geradas++; else res.existentes++;
  }
  await auditar(tx, ctx, { acao: "financeiro.mensalidades_geradas", entidadeTipo: "contrato", entidadeId: null, depois: { competencia: comp, ...res } });
  return res;
}

// ---------------------------------------------------------------- cobrança
export async function registrarContatoCobranca(tx: DBOrTx, ctx: Ctx, d: { clienteId: string; obrigacaoId?: string | null; canal: string; resumo: string; proximaAcao?: string | null; proximaAcaoEm?: string | null }) {
  exigir(ctx, "financeiro.cobranca");
  if (!d.resumo?.trim()) throw new ErroNegocio("Descreva o contato.");
  const [c] = await tx.select().from(cliente).where(and(eq(cliente.id, d.clienteId), eq(cliente.empresaId, ctx.empresaId)));
  if (!c) throw new ErroAcesso();
  const [r] = await tx.insert(cobrancaContato).values({ ...d, empresaId: ctx.empresaId, responsavelId: ctx.usuarioId }).returning();
  await auditar(tx, ctx, { acao: "financeiro.cobranca_contato", entidadeTipo: "cliente", entidadeId: d.clienteId, depois: { canal: d.canal, proximaAcaoEm: d.proximaAcaoEm } });
  await encerrarNotificacoes(tx, ctx.empresaId, `cobranca:${d.clienteId}`);
  return r;
}

// ---------------------------------------------------------------- consultas
/** Expressões SQL de situação da parcela. Vencimento e parcialidade coexistem. */
export const parcelaSQL = {
  confirmado: sql<string>`coalesce((select sum(b.valor_centavos) from ${baixa} b where b.parcela_id = ${qc(parcela.id)} and b.status = 'confirmada'),0)`,
  aguardando: sql<string>`coalesce((select sum(b.valor_centavos) from ${baixa} b where b.parcela_id = ${qc(parcela.id)} and b.status = 'aguardando_conferencia'),0)`,
};
export const saldoParcelaSQL = sql`(${qc(parcela.valorCentavos)} - coalesce((select sum(b.valor_centavos) from ${baixa} b where b.parcela_id = ${qc(parcela.id)} and b.status = 'confirmada'),0))`;

export function situacaoParcela(p: { valorCentavos: number; cancelada: boolean; vencimento: string }, confirmado: number, hoje = hojeSP()) {
  if (p.cancelada) return { codigo: "cancelada", rotulo: "Cancelada", vencida: false, parcial: false };
  const saldo = p.valorCentavos - confirmado;
  if (saldo <= 0) return { codigo: "quitada", rotulo: "Quitada", vencida: false, parcial: false };
  const vencida = p.vencimento < hoje; const parcial = confirmado > 0;
  const rot = vencida ? (parcial ? "Vencida · parcialmente paga" : "Vencida") : parcial ? "Parcialmente paga" : "A vencer";
  return { codigo: vencida ? "vencida" : parcial ? "parcial" : "a_vencer", rotulo: rot, vencida, parcial };
}

export interface FiltroParcelas { natureza: "receber" | "pagar"; situacao?: "abertas" | "vencidas" | "a_vencer" | "quitadas" | "todas" | "hoje"; ate?: string; de?: string; clienteId?: string; aprovacao?: string; categoriaId?: string; limite?: number; offset?: number }

export function condicoesParcelas(ctx: Ctx, f: FiltroParcelas): SQL[] {
  exigir(ctx, "financeiro.ver");
  const hoje = hojeSP();
  const c: SQL[] = [eq(obrigacao.empresaId, ctx.empresaId), eq(obrigacao.natureza, f.natureza)];
  if (!pode(ctx, "financeiro.restrito.ver")) c.push(eq(categoriaFinanceira.restrita, false));
  const sit = f.situacao ?? "abertas";
  if (sit !== "todas") c.push(eq(parcela.cancelada, false), ne(obrigacao.situacaoAprovacao, "cancelada"), ne(obrigacao.situacaoAprovacao, "rejeitada"));
  if (sit === "abertas" || sit === "vencidas" || sit === "hoje" || sit === "a_vencer") c.push(sql`${saldoParcelaSQL} > 0`);
  if (sit === "vencidas") c.push(sql`${qc(parcela.vencimento)} < ${hoje}`);
  if (sit === "hoje") c.push(eq(parcela.vencimento, hoje));
  if (sit === "a_vencer") c.push(sql`${qc(parcela.vencimento)} >= ${hoje}`);
  if (sit === "quitadas") c.push(sql`${saldoParcelaSQL} <= 0`);
  if (f.ate) c.push(lte(parcela.vencimento, f.ate));
  if (f.de) c.push(sql`${qc(parcela.vencimento)} >= ${f.de}`);
  if (f.clienteId) c.push(eq(obrigacao.clienteId, f.clienteId));
  if (f.aprovacao) c.push(eq(obrigacao.situacaoAprovacao, f.aprovacao));
  if (f.categoriaId) c.push(eq(obrigacao.categoriaId, f.categoriaId));
  return c;
}

export async function listarParcelas(dbx: DBOrTx, ctx: Ctx, f: FiltroParcelas) {
  const rows = await dbx.select({
    parcelaId: parcela.id, numero: parcela.numero, descricaoParcela: parcela.descricao, vencimento: parcela.vencimento, valorCentavos: parcela.valorCentavos, cancelada: parcela.cancelada,
    obrigacaoId: obrigacao.id, descricao: obrigacao.descricao, situacaoAprovacao: obrigacao.situacaoAprovacao, origemTipo: obrigacao.origemTipo, osId: obrigacao.osId, competencia: obrigacao.competencia,
    notaFiscalRef: obrigacao.notaFiscalRef, categoriaNome: categoriaFinanceira.nome, restrita: categoriaFinanceira.restrita,
    clienteId: cliente.id, clienteNome: cliente.nome, fornecedorNome: fornecedor.nome, profissionalNome: profissional.nome, beneficiarioNome: obrigacao.beneficiarioNome,
    confirmado: parcelaSQL.confirmado, aguardando: parcelaSQL.aguardando,
    proximaAcaoEm: sql<string | null>`(select max(cc.proxima_acao_em) from ${cobrancaContato} cc where cc.obrigacao_id = ${qc(obrigacao.id)})`,
    total: sql<number>`count(*) over()::int`,
    somaSaldo: sql<string>`sum(${saldoParcelaSQL}) over()`,
  }).from(parcela).innerJoin(obrigacao, eq(obrigacao.id, parcela.obrigacaoId)).innerJoin(categoriaFinanceira, eq(categoriaFinanceira.id, obrigacao.categoriaId))
    .leftJoin(cliente, eq(cliente.id, obrigacao.clienteId)).leftJoin(fornecedor, eq(fornecedor.id, obrigacao.fornecedorId)).leftJoin(profissional, eq(profissional.id, obrigacao.profissionalId))
    .where(and(...condicoesParcelas(ctx, f))).orderBy(asc(parcela.vencimento), asc(obrigacao.descricao)).limit(f.limite ?? 100).offset(f.offset ?? 0);
  const hoje = hojeSP();
  return {
    rows: rows.map((r) => ({ ...r, confirmado: Number(r.confirmado), aguardando: Number(r.aguardando), saldo: r.valorCentavos - Number(r.confirmado), situacao: situacaoParcela(r, Number(r.confirmado), hoje) })),
    total: rows[0]?.total ?? 0, somaSaldo: Number(rows[0]?.somaSaldo ?? 0),
  };
}

export async function obterObrigacao(dbx: DBOrTx, ctx: Ctx, id: string) {
  exigir(ctx, "financeiro.ver");
  const [r] = await dbx.select({ ob: obrigacao, cat: categoriaFinanceira, clienteNome: cliente.nome, fornecedorNome: fornecedor.nome, profissionalNome: profissional.nome, criadoPorNome: usuario.nome })
    .from(obrigacao).innerJoin(categoriaFinanceira, eq(categoriaFinanceira.id, obrigacao.categoriaId)).leftJoin(cliente, eq(cliente.id, obrigacao.clienteId)).leftJoin(fornecedor, eq(fornecedor.id, obrigacao.fornecedorId))
    .leftJoin(profissional, eq(profissional.id, obrigacao.profissionalId)).innerJoin(usuario, eq(usuario.id, obrigacao.criadoPor))
    .where(and(eq(obrigacao.id, id), eq(obrigacao.empresaId, ctx.empresaId)));
  if (!r) throw new ErroAcesso();
  if (r.cat.restrita && !pode(ctx, "financeiro.restrito.ver")) throw new ErroAcesso();
  const ps = await dbx.select().from(parcela).where(eq(parcela.obrigacaoId, id)).orderBy(asc(parcela.numero));
  const bs = ps.length ? await dbx.select({ b: baixa, contaNome: contaFinanceira.nome, registradaPorNome: usuario.nome }).from(baixa).innerJoin(contaFinanceira, eq(contaFinanceira.id, baixa.contaId)).innerJoin(usuario, eq(usuario.id, baixa.registradaPor))
    .where(inArray(baixa.parcelaId, ps.map((p) => p.id))).orderBy(asc(baixa.registradaEm)) : [];
  const aps = await dbx.select({ a: aprovacao, nome: usuario.nome }).from(aprovacao).innerJoin(usuario, eq(usuario.id, aprovacao.decididoPor)).where(and(eq(aprovacao.entidadeTipo, "obrigacao"), eq(aprovacao.entidadeId, id))).orderBy(asc(aprovacao.em));
  const contatos = r.ob.clienteId ? await dbx.select({ c: cobrancaContato, nome: usuario.nome }).from(cobrancaContato).innerJoin(usuario, eq(usuario.id, cobrancaContato.responsavelId)).where(eq(cobrancaContato.obrigacaoId, id)).orderBy(desc(cobrancaContato.em)) : [];
  const hoje = hojeSP();
  const parcelas = ps.map((p) => {
    const conf = bs.filter((b) => b.b.parcelaId === p.id && b.b.status === "confirmada").reduce((s, b) => s + b.b.valorCentavos, 0);
    const aguard = bs.filter((b) => b.b.parcelaId === p.id && b.b.status === "aguardando_conferencia").reduce((s, b) => s + b.b.valorCentavos, 0);
    return { ...p, confirmado: conf, aguardando: aguard, saldo: p.valorCentavos - conf, situacao: situacaoParcela(p, conf, hoje) };
  });
  return { ...r, parcelas, baixas: bs, aprovacoes: aps, contatos };
}

export async function pendentesAprovacao(dbx: DBOrTx, ctx: Ctx) {
  if (!pode(ctx, "financeiro.aprovar") && !pode(ctx, "financeiro.baixa.confirmar")) throw new ErroAcesso();
  const restr = pode(ctx, "financeiro.restrito.ver") ? sql`true` : eq(categoriaFinanceira.restrita, false);
  const obrigs = pode(ctx, "financeiro.aprovar") ? await dbx.select({ ob: obrigacao, categoriaNome: categoriaFinanceira.nome, criadoPorNome: usuario.nome, clienteNome: cliente.nome, fornecedorNome: fornecedor.nome, profissionalNome: profissional.nome,
    aprovacoes: sql<number>`(select count(*)::int from ${aprovacao} a where a.entidade_tipo = 'obrigacao' and a.entidade_id = ${qc(obrigacao.id)} and a.decisao = 'aprovada')`,
    jaAprovei: sql<boolean>`exists (select 1 from ${aprovacao} a where a.entidade_tipo = 'obrigacao' and a.entidade_id = ${qc(obrigacao.id)} and a.decidido_por = ${ctx.usuarioId})`,
    exigeDupla: sql<boolean>`${qc(categoriaFinanceira.duplaAprovacaoAcimaCentavos)} is not null and (${qc(obrigacao.valorBrutoCentavos)} - ${qc(obrigacao.descontoCentavos)}) >= ${qc(categoriaFinanceira.duplaAprovacaoAcimaCentavos)}`,
  }).from(obrigacao).innerJoin(categoriaFinanceira, eq(categoriaFinanceira.id, obrigacao.categoriaId)).innerJoin(usuario, eq(usuario.id, obrigacao.criadoPor))
    .leftJoin(cliente, eq(cliente.id, obrigacao.clienteId)).leftJoin(fornecedor, eq(fornecedor.id, obrigacao.fornecedorId)).leftJoin(profissional, eq(profissional.id, obrigacao.profissionalId))
    .where(and(eq(obrigacao.empresaId, ctx.empresaId), eq(obrigacao.situacaoAprovacao, "aguardando_aprovacao"), restr)).orderBy(asc(obrigacao.criadoEm)) : [];
  const baixas = await dbx.select({ b: baixa, natureza: obrigacao.natureza, descricao: obrigacao.descricao, obrigacaoId: obrigacao.id, contaNome: contaFinanceira.nome, registradaPorNome: usuario.nome, vencimento: parcela.vencimento, parcelaValor: parcela.valorCentavos })
    .from(baixa).innerJoin(parcela, eq(parcela.id, baixa.parcelaId)).innerJoin(obrigacao, eq(obrigacao.id, parcela.obrigacaoId)).innerJoin(categoriaFinanceira, eq(categoriaFinanceira.id, obrigacao.categoriaId))
    .innerJoin(contaFinanceira, eq(contaFinanceira.id, baixa.contaId)).innerJoin(usuario, eq(usuario.id, baixa.registradaPor))
    .where(and(eq(baixa.empresaId, ctx.empresaId), eq(baixa.status, "aguardando_conferencia"), restr)).orderBy(asc(baixa.registradaEm));
  const transfs = await dbx.select().from(transferenciaConta).where(and(eq(transferenciaConta.empresaId, ctx.empresaId), eq(transferenciaConta.status, "aguardando_conferencia")));
  return { obrigacoes: obrigs, baixas, transferencias: transfs };
}

export async function clientesEmAtraso(dbx: DBOrTx, ctx: Ctx) {
  exigir(ctx, "financeiro.ver");
  const hoje = hojeSP();
  return dbx.select({
    clienteId: cliente.id, clienteNome: cliente.nome, telefone: cliente.telefone,
    totalVencido: sql<string>`sum(${saldoParcelaSQL})`, parcelas: sql<number>`count(*)::int`, maisAntigo: sql<string>`min(${qc(parcela.vencimento)})`,
    ultimoContato: sql<string | null>`(select max(cc.criado_em) from ${cobrancaContato} cc where cc.cliente_id = ${qc(cliente.id)})`,
    proximaAcaoEm: sql<string | null>`(select cc.proxima_acao_em from ${cobrancaContato} cc where cc.cliente_id = ${qc(cliente.id)} order by cc.criado_em desc limit 1)`,
    proximaAcao: sql<string | null>`(select cc.proxima_acao from ${cobrancaContato} cc where cc.cliente_id = ${qc(cliente.id)} order by cc.criado_em desc limit 1)`,
  }).from(parcela).innerJoin(obrigacao, eq(obrigacao.id, parcela.obrigacaoId)).innerJoin(cliente, eq(cliente.id, obrigacao.clienteId))
    .where(and(eq(obrigacao.empresaId, ctx.empresaId), eq(obrigacao.natureza, "receber"), eq(parcela.cancelada, false), eq(obrigacao.situacaoAprovacao, "aprovada"), sql`${qc(parcela.vencimento)} < ${hoje}`, sql`${saldoParcelaSQL} > 0`))
    .groupBy(cliente.id).orderBy(sql`min(${qc(parcela.vencimento)})`);
}

export async function historicoCobranca(dbx: DBOrTx, ctx: Ctx, clienteId: string) {
  exigir(ctx, "financeiro.ver");
  return dbx.select({ c: cobrancaContato, nome: usuario.nome }).from(cobrancaContato).innerJoin(usuario, eq(usuario.id, cobrancaContato.responsavelId))
    .where(and(eq(cobrancaContato.empresaId, ctx.empresaId), eq(cobrancaContato.clienteId, clienteId))).orderBy(desc(cobrancaContato.em));
}

/** Data esperada de recebimento/pagamento (acordada na cobrança). Não altera o vencimento contratual. */
export async function definirDataEsperada(tx: DBOrTx, ctx: Ctx, parcelaId: string, data: string | null, motivo?: string | null) {
  if (!pode(ctx, "financeiro.cobranca") && !pode(ctx, "financeiro.lancar")) throw new ErroAcesso();
  const [r] = await tx.select({ p: parcela, emp: obrigacao.empresaId }).from(parcela).innerJoin(obrigacao, eq(obrigacao.id, parcela.obrigacaoId)).where(eq(parcela.id, parcelaId));
  if (!r || r.emp !== ctx.empresaId) throw new ErroAcesso();
  await tx.update(parcela).set({ dataEsperada: data }).where(eq(parcela.id, parcelaId));
  await auditar(tx, ctx, { acao: "financeiro.data_esperada", entidadeTipo: "parcela", entidadeId: parcelaId, motivo, antes: { dataEsperada: r.p.dataEsperada }, depois: { dataEsperada: data } });
}

/** Ao revisar a exceção, o gestor aprova (ou rejeita) a obrigação; o pagamento já registrado permanece no histórico. */
export async function excecoesPendentes(dbx: DBOrTx, ctx: Ctx) {
  exigir(ctx, "financeiro.aprovar");
  return dbx.select({ b: baixa, descricao: obrigacao.descricao, obrigacaoId: obrigacao.id, registradaPorNome: usuario.nome }).from(baixa).innerJoin(parcela, eq(parcela.id, baixa.parcelaId)).innerJoin(obrigacao, eq(obrigacao.id, parcela.obrigacaoId)).innerJoin(usuario, eq(usuario.id, baixa.registradaPor))
    .where(and(eq(baixa.empresaId, ctx.empresaId), eq(baixa.excecaoSemAprovacao, true), eq(obrigacao.situacaoAprovacao, "aguardando_aprovacao")));
}
