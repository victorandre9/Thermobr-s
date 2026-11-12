/**
 * Pagamento de técnicos autônomos por serviço.
 *  - Valor combinado definido pelo gestor (sem tabela fixa). Técnico só consulta os próprios.
 *  - Fluxo: aguardando_valor → aguardando_conferencia → conferido → (resumo semanal) → liberado → pago (quitação da obrigação).
 *  - Adiantamento é explícito e abatido uma única vez (resumo_id preenchido por UPDATE condicional).
 *  - Equipe própria nunca gera pagamento por OS.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { qc } from "../db/sql";
import type { DBOrTx } from "../db";
import { adiantamento, autonomoServico, baixa, categoriaFinanceira, cliente, ordemServico, parcela, profissional, resumoSemanalAutonomo } from "../db/schema";
import { type Ctx, exigir, pode } from "../auth/contexto";
import { ErroAcesso, ErroNegocio } from "../erros";
import { auditar } from "./auditoria";
import { criarObrigacao } from "./financeiro";
import { obterConfig } from "./config";
import { inicioSemana, somarDias } from "@/lib/datas";

export async function definirValorAutonomo(tx: DBOrTx, ctx: Ctx, servicoId: string, valorCentavos: number, descricao: string | null, motivo?: string | null) {
  exigir(ctx, "autonomo.valores.definir");
  const [s] = await tx.select().from(autonomoServico).where(and(eq(autonomoServico.id, servicoId), eq(autonomoServico.empresaId, ctx.empresaId))).for("update");
  if (!s) throw new ErroAcesso();
  if (["liberado", "pago", "cancelado"].includes(s.situacao)) throw new ErroNegocio("Serviço já liberado/pago/cancelado: valor não pode ser alterado.");
  if (s.valorCombinadoCentavos !== null && s.valorCombinadoCentavos !== valorCentavos && !motivo?.trim()) throw new ErroNegocio("Alteração de valor combinado exige motivo.");
  if (!Number.isInteger(valorCentavos) || valorCentavos < 0) throw new ErroNegocio("Valor inválido.");
  const [o] = await tx.select({ etapa: ordemServico.etapa }).from(ordemServico).where(eq(ordemServico.id, s.osId));
  const situacao = s.situacao === "aguardando_valor" && o.etapa === "encerrada" ? "aguardando_conferencia" : s.situacao === "conferido" ? "aguardando_conferencia" : s.situacao;
  await tx.update(autonomoServico).set({ valorCombinadoCentavos: valorCentavos, valorDefinidoPor: ctx.usuarioId, descricao: descricao ?? s.descricao, situacao }).where(eq(autonomoServico.id, servicoId));
  await auditar(tx, ctx, { acao: "autonomo.valor_definido", entidadeTipo: "autonomo_servico", entidadeId: servicoId, motivo, antes: { valor: s.valorCombinadoCentavos }, depois: { valor: valorCentavos }, sensivel: true });
}

/** Conferência do serviço realizado (OS encerrada/conferida). */
export async function conferirServicoAutonomo(tx: DBOrTx, ctx: Ctx, servicoId: string) {
  if (!pode(ctx, "autonomo.resumo.preparar") && !pode(ctx, "autonomo.liberar")) throw new ErroAcesso();
  const [s] = await tx.select({ s: autonomoServico, etapa: ordemServico.etapa, profUsuario: profissional.usuarioId }).from(autonomoServico).innerJoin(ordemServico, eq(ordemServico.id, autonomoServico.osId)).innerJoin(profissional, eq(profissional.id, autonomoServico.profissionalId))
    .where(and(eq(autonomoServico.id, servicoId), eq(autonomoServico.empresaId, ctx.empresaId)));
  if (!s) throw new ErroAcesso();
  if (s.profUsuario === ctx.usuarioId) throw new ErroAcesso("Você não pode conferir o próprio pagamento.");
  if (s.etapa !== "encerrada") throw new ErroNegocio("A OS ainda não foi conferida/encerrada pelo escritório.");
  if (s.s.valorCombinadoCentavos === null) throw new ErroNegocio("O gestor ainda não definiu o valor combinado.");
  const [up] = await tx.update(autonomoServico).set({ situacao: "conferido", conferidoPor: ctx.usuarioId, conferidoEm: new Date() })
    .where(and(eq(autonomoServico.id, servicoId), inArray(autonomoServico.situacao, ["aguardando_conferencia", "aguardando_valor"]))).returning();
  if (!up) return;
  await auditar(tx, ctx, { acao: "autonomo.servico_conferido", entidadeTipo: "autonomo_servico", entidadeId: servicoId });
}

export async function registrarAdiantamento(tx: DBOrTx, ctx: Ctx, d: { profissionalId: string; valorCentavos: number; data: string; descricao?: string | null }) {
  exigir(ctx, "autonomo.resumo.preparar"); exigir(ctx, "financeiro.lancar");
  const [p] = await tx.select().from(profissional).where(and(eq(profissional.id, d.profissionalId), eq(profissional.empresaId, ctx.empresaId)));
  if (!p || p.vinculo !== "autonomo") throw new ErroNegocio("Adiantamento só para técnico autônomo.");
  const [a] = await tx.insert(adiantamento).values({ ...d, empresaId: ctx.empresaId, registradoPor: ctx.usuarioId }).returning();
  const [cat] = await tx.select().from(categoriaFinanceira).where(and(eq(categoriaFinanceira.empresaId, ctx.empresaId), eq(categoriaFinanceira.codigo, "adiantamento_autonomo")));
  const ob = await criarObrigacao(tx, ctx, { natureza: "pagar", categoriaId: cat.id, profissionalId: p.id, descricao: `Adiantamento — ${p.nome}`, competencia: d.data.slice(0, 7) + "-01", valorBrutoCentavos: d.valorCentavos, origemTipo: "adiantamento", origemId: a.id, chaveUnicidade: `adiantamento:${a.id}`, parcelas: [{ vencimento: d.data, valorCentavos: d.valorCentavos }] });
  await tx.update(adiantamento).set({ obrigacaoId: ob.id }).where(eq(adiantamento.id, a.id));
  await auditar(tx, ctx, { acao: "autonomo.adiantamento", entidadeTipo: "adiantamento", entidadeId: a.id, depois: d, sensivel: true });
  return a;
}

/** Prepara resumo semanal (padrão: previsão na sexta). Abate adiantamentos pendentes uma única vez. */
export async function prepararResumoSemanal(tx: DBOrTx, ctx: Ctx, profissionalId: string, dataReferencia: string) {
  exigir(ctx, "autonomo.resumo.preparar");
  const [p] = await tx.select().from(profissional).where(and(eq(profissional.id, profissionalId), eq(profissional.empresaId, ctx.empresaId)));
  if (!p || p.vinculo !== "autonomo") throw new ErroNegocio("Resumo semanal só para técnico autônomo.");
  if (p.usuarioId === ctx.usuarioId) throw new ErroAcesso("Você não pode preparar o próprio pagamento.");
  const semana = inicioSemana(dataReferencia);
  const cfg = await obterConfig(tx, ctx.empresaId);
  const dow = cfg.autonomos.diaSemanaPrevisaoPagamento; // 0..6
  const previsao = somarDias(semana, (dow + 6) % 7);
  const [ex] = await tx.select().from(resumoSemanalAutonomo).where(and(eq(resumoSemanalAutonomo.profissionalId, profissionalId), eq(resumoSemanalAutonomo.semanaInicio, semana)));
  if (ex && ex.situacao !== "cancelado") throw new ErroNegocio("Já existe resumo para esta semana.");
  const servs = await tx.select().from(autonomoServico).where(and(eq(autonomoServico.profissionalId, profissionalId), eq(autonomoServico.situacao, "conferido"), isNull(autonomoServico.resumoId)));
  if (!servs.length) throw new ErroNegocio("Não há serviços conferidos pendentes de resumo para este profissional.");
  const total = servs.reduce((s, x) => s + (x.valorCombinadoCentavos ?? 0), 0);
  const adts = await tx.select().from(adiantamento).where(and(eq(adiantamento.profissionalId, profissionalId), isNull(adiantamento.resumoId))).orderBy(asc(adiantamento.data));
  let abatido = 0; const usados: string[] = [];
  for (const a of adts) { if (abatido + a.valorCentavos <= total) { abatido += a.valorCentavos; usados.push(a.id); } }
  const [r] = ex
    ? await tx.update(resumoSemanalAutonomo).set({ situacao: "preparado", totalServicosCentavos: total, totalAdiantamentosCentavos: abatido, liquidoCentavos: total - abatido, dataPrevistaPagamento: previsao, preparadoPor: ctx.usuarioId }).where(eq(resumoSemanalAutonomo.id, ex.id)).returning()
    : await tx.insert(resumoSemanalAutonomo).values({ empresaId: ctx.empresaId, profissionalId, semanaInicio: semana, dataPrevistaPagamento: previsao, totalServicosCentavos: total, totalAdiantamentosCentavos: abatido, liquidoCentavos: total - abatido, situacao: "preparado", preparadoPor: ctx.usuarioId }).returning();
  await tx.update(autonomoServico).set({ resumoId: r.id }).where(and(inArray(autonomoServico.id, servs.map((s) => s.id)), isNull(autonomoServico.resumoId)));
  if (usados.length) {
    const marcados = await tx.update(adiantamento).set({ resumoId: r.id }).where(and(inArray(adiantamento.id, usados), isNull(adiantamento.resumoId))).returning();
    if (marcados.length !== usados.length) throw new ErroNegocio("Adiantamento já abatido por outro resumo. Recarregue e tente novamente.");
  }
  await auditar(tx, ctx, { acao: "autonomo.resumo_preparado", entidadeTipo: "resumo_semanal_autonomo", entidadeId: r.id, depois: { total, abatido, servicos: servs.length }, sensivel: true });
  return r;
}

/** Gestor libera: gera obrigação a pagar aprovada (uma por resumo) e marca serviços como liberados. */
export async function liberarResumo(tx: DBOrTx, ctx: Ctx, resumoId: string) {
  exigir(ctx, "autonomo.liberar");
  const [r] = await tx.select().from(resumoSemanalAutonomo).where(and(eq(resumoSemanalAutonomo.id, resumoId), eq(resumoSemanalAutonomo.empresaId, ctx.empresaId))).for("update");
  if (!r) throw new ErroAcesso();
  if (r.situacao === "liberado") return;
  if (r.situacao !== "preparado" && r.situacao !== "liberacao_solicitada") throw new ErroNegocio("Resumo não está pronto para liberação.");
  const [p] = await tx.select().from(profissional).where(eq(profissional.id, r.profissionalId));
  const auto = p.usuarioId === ctx.usuarioId;
  if (auto && !ctx.papeis.includes("gestor")) throw new ErroAcesso();
  const [cat] = await tx.select().from(categoriaFinanceira).where(and(eq(categoriaFinanceira.empresaId, ctx.empresaId), eq(categoriaFinanceira.codigo, "autonomo")));
  let obrigacaoId: string | null = null;
  if (r.liquidoCentavos > 0) {
    const ob = await criarObrigacao(tx, ctx, { natureza: "pagar", categoriaId: cat.id, profissionalId: p.id, descricao: `Autônomo ${p.nome} — semana de ${r.semanaInicio.split("-").reverse().join("/")}`, competencia: r.semanaInicio.slice(0, 7) + "-01", valorBrutoCentavos: r.liquidoCentavos, origemTipo: "autonomo", origemId: r.id, chaveUnicidade: `autonomo-resumo:${r.id}`, parcelas: [{ vencimento: r.dataPrevistaPagamento, valorCentavos: r.liquidoCentavos }], origemAprovada: true });
    obrigacaoId = ob.id;
  }
  await tx.update(resumoSemanalAutonomo).set({ situacao: "liberado", obrigacaoId }).where(eq(resumoSemanalAutonomo.id, r.id));
  await tx.update(autonomoServico).set({ situacao: "liberado", liberadoPor: ctx.usuarioId, liberadoEm: new Date() }).where(eq(autonomoServico.resumoId, r.id));
  await auditar(tx, ctx, { acao: "autonomo.resumo_liberado", entidadeTipo: "resumo_semanal_autonomo", entidadeId: r.id, depois: { liquido: r.liquidoCentavos, autoaprovacao: auto }, sensivel: true });
}

export async function solicitarLiberacao(tx: DBOrTx, ctx: Ctx, resumoId: string) {
  exigir(ctx, "autonomo.resumo.preparar");
  const [r] = await tx.update(resumoSemanalAutonomo).set({ situacao: "liberacao_solicitada" }).where(and(eq(resumoSemanalAutonomo.id, resumoId), eq(resumoSemanalAutonomo.empresaId, ctx.empresaId), eq(resumoSemanalAutonomo.situacao, "preparado"))).returning();
  if (!r) throw new ErroNegocio("Resumo não está preparado.");
  const { notificarPorPermissao } = await import("./notificacoes");
  await notificarPorPermissao(tx, ctx.empresaId, "autonomo.liberar", { tipo: "autonomo_liberacao", chave: "autonomos_liberacao", titulo: "Resumos de autônomos aguardando liberação", link: "/financeiro/autonomos", prioridade: "alta" });
  await auditar(tx, ctx, { acao: "autonomo.liberacao_solicitada", entidadeTipo: "resumo_semanal_autonomo", entidadeId: resumoId });
}

/** Situação "pago" é derivada: obrigação do resumo quitada por baixas confirmadas. */
const pagoSQL = sql<boolean>`exists (select 1 from ${parcela} pa where pa.obrigacao_id = ${qc(resumoSemanalAutonomo.obrigacaoId)} and pa.valor_centavos <= coalesce((select sum(b.valor_centavos) from ${baixa} b where b.parcela_id = pa.id and b.status = 'confirmada'),0))`;

export async function listarServicosAutonomos(dbx: DBOrTx, ctx: Ctx, f: { profissionalId?: string; situacao?: string } = {}) {
  exigir(ctx, "autonomo.valores.ver", "proprio");
  const conds = [eq(autonomoServico.empresaId, ctx.empresaId)];
  if (!pode(ctx, "autonomo.valores.ver", "empresa")) {
    if (!ctx.profissional || ctx.profissional.vinculo !== "autonomo") return [];
    conds.push(eq(autonomoServico.profissionalId, ctx.profissional.id));
  } else if (f.profissionalId) conds.push(eq(autonomoServico.profissionalId, f.profissionalId));
  if (f.situacao) conds.push(eq(autonomoServico.situacao, f.situacao));
  const rows = await dbx.select({
    s: autonomoServico, profissionalNome: profissional.nome, osNumero: ordemServico.numero, osEtapa: ordemServico.etapa, osDescricao: ordemServico.descricao, clienteNome: cliente.nome,
    resumoSituacao: resumoSemanalAutonomo.situacao, previsao: resumoSemanalAutonomo.dataPrevistaPagamento, pago: pagoSQL,
  }).from(autonomoServico).innerJoin(profissional, eq(profissional.id, autonomoServico.profissionalId)).innerJoin(ordemServico, eq(ordemServico.id, autonomoServico.osId)).innerJoin(cliente, eq(cliente.id, ordemServico.clienteId))
    .leftJoin(resumoSemanalAutonomo, eq(resumoSemanalAutonomo.id, autonomoServico.resumoId))
    .where(and(...conds)).orderBy(desc(ordemServico.numero));
  // Técnico vê somente o necessário dos próprios serviços (sem preço ao cliente).
  return rows.map((r) => ({ ...r, situacaoExibida: r.pago ? "pago" : r.s.situacao }));
}

export async function listarResumos(dbx: DBOrTx, ctx: Ctx) {
  exigir(ctx, "autonomo.valores.ver", "empresa");
  return dbx.select({ r: resumoSemanalAutonomo, profissionalNome: profissional.nome, pago: pagoSQL }).from(resumoSemanalAutonomo).innerJoin(profissional, eq(profissional.id, resumoSemanalAutonomo.profissionalId))
    .where(eq(resumoSemanalAutonomo.empresaId, ctx.empresaId)).orderBy(desc(resumoSemanalAutonomo.semanaInicio));
}

export async function listarAdiantamentos(dbx: DBOrTx, ctx: Ctx) {
  exigir(ctx, "autonomo.valores.ver", "empresa");
  return dbx.select({ a: adiantamento, profissionalNome: profissional.nome }).from(adiantamento).innerJoin(profissional, eq(profissional.id, adiantamento.profissionalId))
    .where(eq(adiantamento.empresaId, ctx.empresaId)).orderBy(desc(adiantamento.data));
}


/**
 * Acordo adicional (gestor): visita específica, pacote ou adicional de retorno autorizado.
 * Não gera receita ao cliente. A chave impede duplicar a mesma linha.
 */
export async function adicionarAcordoAutonomo(tx: DBOrTx, ctx: Ctx, d: { osId: string; profissionalId: string; base: "servico" | "visita" | "pacote" | "adicional_retorno"; visitaId?: string | null; descricao: string; valorCentavos: number; motivo: string }) {
  exigir(ctx, "autonomo.valores.definir");
  if (!d.motivo?.trim()) throw new ErroNegocio("Justifique o acordo adicional.");
  const [p] = await tx.select().from(profissional).where(and(eq(profissional.id, d.profissionalId), eq(profissional.empresaId, ctx.empresaId)));
  if (!p || p.vinculo !== "autonomo") throw new ErroNegocio("Acordos de remuneração por serviço são apenas para autônomos.");
  const [o] = await tx.select().from(ordemServico).where(and(eq(ordemServico.id, d.osId), eq(ordemServico.empresaId, ctx.empresaId)));
  if (!o) throw new ErroAcesso();
  const chave = d.base === "visita" && d.visitaId ? `visita:${d.visitaId}` : `${d.base}:${Date.now()}`;
  const [r] = await tx.insert(autonomoServico).values({ empresaId: ctx.empresaId, osId: d.osId, profissionalId: p.id, descricao: d.descricao, base: d.base, chave, visitaId: d.visitaId ?? null, valorCombinadoCentavos: d.valorCentavos, valorDefinidoPor: ctx.usuarioId, situacao: o.etapa === "encerrada" ? "aguardando_conferencia" : "aguardando_valor" }).returning();
  await auditar(tx, ctx, { acao: "autonomo.acordo_adicional", entidadeTipo: "autonomo_servico", entidadeId: r.id, motivo: d.motivo, depois: { base: d.base, valor: d.valorCentavos }, sensivel: true });
  return r;
}

/** Marca o atendimento como já coberto pelo acordo original (ex.: pacote, OS de origem do retorno): não gera novo pagamento. */
export async function marcarCoberto(tx: DBOrTx, ctx: Ctx, servicoId: string, cobertoPorId: string | null, motivo: string) {
  exigir(ctx, "autonomo.valores.definir");
  if (!motivo?.trim()) throw new ErroNegocio("Informe o acordo que já cobre este atendimento.");
  const [s] = await tx.update(autonomoServico).set({ situacao: "cancelado", cobertoPorId, valorCombinadoCentavos: 0, valorDefinidoPor: ctx.usuarioId, descricao: sql`${autonomoServico.descricao} || ' (coberto pelo acordo original)'` })
    .where(and(eq(autonomoServico.id, servicoId), eq(autonomoServico.empresaId, ctx.empresaId), inArray(autonomoServico.situacao, ["aguardando_valor", "aguardando_conferencia"]))).returning();
  if (!s) throw new ErroNegocio("Serviço não pode ser marcado (já conferido, liberado ou pago).");
  await auditar(tx, ctx, { acao: "autonomo.coberto", entidadeTipo: "autonomo_servico", entidadeId: servicoId, motivo, depois: { cobertoPorId }, sensivel: true });
}
