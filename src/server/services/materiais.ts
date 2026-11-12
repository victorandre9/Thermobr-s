/**
 * Materiais e peças — razão de movimentos + saldo por posição.
 * Regras centrais:
 *  - Origem é debitada ao registrar entrega/transferência (em_transito) ou ao confirmar movimento informado.
 *  - Destino só é creditado na confirmação do recebedor/conferente.
 *  - "Informado" pelo técnico não altera saldo; sobra só volta ao estoque após conferência física.
 *  - CHECK no banco impede saldo negativo ou abaixo do reservado (concorrência segura).
 *  - Confirmações usam UPDATE ... WHERE status = <esperado>: repetir não duplica efeito.
 *  - Diferenças viram divergência a investigar; nenhuma baixa automática.
 */
import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { qc } from "../db/sql";
import type { DBOrTx } from "../db";
import {
  compra, compraItem, fornecedor, material, materialContagem, materialDivergencia, materialMovimento, materialPosicao, materialReserva, materialRetalho,
  materialSaldo, ordemServico, osItem, profissional, usuario, veiculo, categoriaFinanceira,
} from "../db/schema";
import { type Ctx, exigir, pode } from "../auth/contexto";
import { ErroAcesso, ErroNegocio, traduzirErroBanco } from "../erros";
import { auditar } from "./auditoria";
import { encerrarPendenciasEntidade, garantirPendencia } from "./pendencias";
import { fromMilli, parseQtdInput, toMilli, UNIDADES } from "@/lib/quantidade";
import { exigirAcessoOS } from "./escopo";
import { criarObrigacao } from "./financeiro";

type Mov = typeof materialMovimento.$inferSelect;

// ---------------------------------------------------------------- cadastro
export async function salvarMaterial(tx: DBOrTx, ctx: Ctx, id: string | null, d: { codigo: string; nome: string; categoria?: string | null; especificacao?: string | null; unidade: string; controlaRetalho?: boolean; estoqueMinimo?: string | null; custoReferenciaCentavos?: number | null; ativo?: boolean; versao?: number }) {
  exigir(ctx, "material.gerenciar");
  if (!UNIDADES[d.unidade]) throw new ErroNegocio("Unidade inválida.", "unidade");
  if (!d.codigo.trim() || !d.nome.trim()) throw new ErroNegocio("Código e nome são obrigatórios.");
  const { versao, ...dd } = d;
  const vals = { ...dd, fracionavel: UNIDADES[d.unidade].fracionavel, estoqueMinimo: d.estoqueMinimo ? fromMilli(toMilli(d.estoqueMinimo)) : null };
  if (!pode(ctx, "material.custos.ver")) delete (vals as Partial<typeof vals>).custoReferenciaCentavos;
  if (id) {
    const [antes] = await tx.select().from(material).where(and(eq(material.id, id), eq(material.empresaId, ctx.empresaId)));
    if (!antes) throw new ErroAcesso();
    if (antes.unidade !== d.unidade) {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(materialMovimento).where(eq(materialMovimento.materialId, id));
      if (n > 0) throw new ErroNegocio("Material com movimentos não pode trocar de unidade (evita misturar metros, unidades e quilos). Cadastre outro material.");
    }
    const [r] = await tx.update(material).set({ ...vals, versao: antes.versao + 1 }).where(and(eq(material.id, id), eq(material.versao, versao ?? antes.versao))).returning();
    if (!r) throw new ErroNegocio("Este registro foi alterado por outro usuário depois que você abriu a tela. Recarregue para ver a versão atual e refaça a alteração.");
    await auditar(tx, ctx, { acao: "material.atualizado", entidadeTipo: "material", entidadeId: id, antes, depois: r });
    return r;
  }
  const [r] = await tx.insert(material).values({ ...vals, empresaId: ctx.empresaId }).returning();
  await auditar(tx, ctx, { acao: "material.criado", entidadeTipo: "material", entidadeId: r.id, depois: r });
  return r;
}

export async function garantirPosicaoVeiculo(tx: DBOrTx, ctx: Ctx, veiculoId: string) {
  const [ex] = await tx.select().from(materialPosicao).where(eq(materialPosicao.veiculoId, veiculoId));
  if (ex) return ex;
  const [v] = await tx.select().from(veiculo).where(and(eq(veiculo.id, veiculoId), eq(veiculo.empresaId, ctx.empresaId)));
  if (!v) throw new ErroAcesso();
  const [p] = await tx.insert(materialPosicao).values({ empresaId: ctx.empresaId, tipo: "veiculo", nome: `Veículo ${v.identificacao}`, veiculoId, responsavelProfissionalId: v.responsavelProfissionalId }).returning();
  return p;
}

async function posicao(tx: DBOrTx, ctx: Ctx, id: string) {
  const [p] = await tx.select().from(materialPosicao).where(and(eq(materialPosicao.id, id), eq(materialPosicao.empresaId, ctx.empresaId)));
  if (!p) throw new ErroNegocio("Posição inválida.");
  return p;
}
async function posicaoVirtual(tx: DBOrTx, empresaId: string, tipo: string) {
  const [p] = await tx.select().from(materialPosicao).where(and(eq(materialPosicao.empresaId, empresaId), eq(materialPosicao.tipo, tipo)));
  if (!p) throw new ErroNegocio(`Posição ${tipo} não configurada.`);
  return p;
}
export async function posicaoDoProfissional(tx: DBOrTx, ctx: Pick<Ctx, "empresaId">, profissionalId: string) {
  const [p] = await tx.select().from(materialPosicao).where(and(eq(materialPosicao.profissionalId, profissionalId), eq(materialPosicao.empresaId, ctx.empresaId)));
  if (p) return p;
  const [prof] = await tx.select().from(profissional).where(and(eq(profissional.id, profissionalId), eq(profissional.empresaId, ctx.empresaId)));
  if (!prof) throw new ErroNegocio("Profissional inválido.");
  const [n] = await tx.insert(materialPosicao).values({ empresaId: ctx.empresaId, tipo: "profissional", nome: `Custódia — ${prof.nome}`, profissionalId }).returning();
  return n;
}
async function obterMaterial(tx: DBOrTx, ctx: Ctx, id: string) {
  const [m] = await tx.select().from(material).where(and(eq(material.id, id), eq(material.empresaId, ctx.empresaId)));
  if (!m) throw new ErroNegocio("Material inválido.");
  return m;
}

// ---------------------------------------------------------------- saldo (primitivas)
async function debitar(tx: DBOrTx, materialId: string, posicaoId: string, q: string, liberarReserva = "0") {
  const [p] = await tx.select({ virtual: materialPosicao.virtual }).from(materialPosicao).where(eq(materialPosicao.id, posicaoId));
  if (p.virtual) return;
  try {
    const r = await tx.transaction(async (sp) => sp.update(materialSaldo).set({
      quantidade: sql`${qc(materialSaldo.quantidade)} - ${q}::numeric`,
      reservado: sql`greatest(${qc(materialSaldo.reservado)} - ${liberarReserva}::numeric, 0)`,
      atualizadoEm: new Date(),
    }).where(and(eq(materialSaldo.materialId, materialId), eq(materialSaldo.posicaoId, posicaoId))).returning());
    if (!r.length) throw new ErroNegocio("Saldo insuficiente na posição de origem.");
  } catch (e) { throw traduzirErroBanco(e); }
}
async function creditar(tx: DBOrTx, materialId: string, posicaoId: string, q: string) {
  const [p] = await tx.select({ virtual: materialPosicao.virtual }).from(materialPosicao).where(eq(materialPosicao.id, posicaoId));
  if (p.virtual) return;
  await tx.insert(materialSaldo).values({ materialId, posicaoId, quantidade: q })
    .onConflictDoUpdate({ target: [materialSaldo.materialId, materialSaldo.posicaoId], set: { quantidade: sql`${qc(materialSaldo.quantidade)} + ${q}::numeric`, atualizadoEm: new Date() } });
}

async function inserirMov(tx: DBOrTx, ctx: Ctx, d: Omit<typeof materialMovimento.$inferInsert, "empresaId" | "registradoPor">) {
  if (d.chaveIdempotencia) {
    const [ex] = await tx.select().from(materialMovimento).where(eq(materialMovimento.chaveIdempotencia, d.chaveIdempotencia));
    if (ex) return { mov: ex, repetido: true };
  }
  const [mov] = await tx.insert(materialMovimento).values({ ...d, empresaId: ctx.empresaId, registradoPor: ctx.usuarioId }).returning();
  return { mov, repetido: false };
}

function exigirCustodiante(ctx: Ctx, profissionalId: string | null) {
  if (pode(ctx, "material.movimentar")) return;
  if (!ctx.profissional || ctx.profissional.id !== profissionalId) throw new ErroAcesso();
}

// ---------------------------------------------------------------- entradas e entregas
export async function registrarEntradaAvulsa(tx: DBOrTx, ctx: Ctx, d: { materialId: string; quantidade: string; destinoPosicaoId: string; observacao?: string | null; chave?: string | null }) {
  exigir(ctx, "material.movimentar");
  const m = await obterMaterial(tx, ctx, d.materialId);
  const q = parseQtdInput(d.quantidade, m.unidade);
  const dest = await posicao(tx, ctx, d.destinoPosicaoId);
  if (dest.virtual) throw new ErroNegocio("Destino inválido.");
  const forn = await posicaoVirtual(tx, ctx.empresaId, "fornecedor");
  const { mov, repetido } = await inserirMov(tx, ctx, { materialId: m.id, tipo: "entrada_compra", status: "confirmado", origemPosicaoId: forn.id, destinoPosicaoId: dest.id, quantidade: q, unidade: m.unidade, observacao: d.observacao, confirmadoPor: ctx.usuarioId, confirmadoEm: new Date(), chaveIdempotencia: d.chave ?? null });
  if (!repetido) { await creditar(tx, m.id, dest.id, q); await auditar(tx, ctx, { acao: "material.entrada", entidadeTipo: "material", entidadeId: m.id, depois: { q, destino: dest.nome } }); }
  return mov;
}

/** Almoxarifado registra entrega física a um profissional (ou veículo). Aguarda confirmação do recebedor. */
export async function registrarEntrega(tx: DBOrTx, ctx: Ctx, d: { materialId: string; quantidade: string; origemPosicaoId: string; profissionalId: string; osId?: string | null; visitaId?: string | null; observacao?: string | null; chave?: string | null }) {
  exigir(ctx, "material.movimentar");
  const m = await obterMaterial(tx, ctx, d.materialId);
  const q = parseQtdInput(d.quantidade, m.unidade);
  const orig = await posicao(tx, ctx, d.origemPosicaoId);
  if (orig.virtual || orig.tipo === "segregado") throw new ErroNegocio("Origem inválida para entrega.");
  const dest = await posicaoDoProfissional(tx, ctx, d.profissionalId);
  const { mov, repetido } = await inserirMov(tx, ctx, { materialId: m.id, tipo: "entrega", status: "em_transito", origemPosicaoId: orig.id, destinoPosicaoId: dest.id, quantidade: q, unidade: m.unidade, osId: d.osId ?? null, visitaId: d.visitaId ?? null, observacao: d.observacao, chaveIdempotencia: d.chave ?? null });
  if (repetido) return mov;
  // consome reserva da OS, se houver
  let liberar = "0";
  if (d.osId) {
    const [res] = await tx.select().from(materialReserva).where(and(eq(materialReserva.osId, d.osId), eq(materialReserva.materialId, m.id), eq(materialReserva.posicaoId, orig.id), eq(materialReserva.situacao, "ativa"))).limit(1);
    if (res) {
      const lib = toMilli(res.quantidade) < toMilli(q) ? res.quantidade : q;
      liberar = lib;
      const restante = toMilli(res.quantidade) - toMilli(lib);
      await tx.update(materialReserva).set(restante > 0n ? { quantidade: fromMilli(restante) } : { situacao: "atendida" }).where(eq(materialReserva.id, res.id));
    }
  }
  await debitar(tx, m.id, orig.id, q, liberar);
  await auditar(tx, ctx, { acao: "material.entrega_registrada", entidadeTipo: "material_movimento", entidadeId: mov.id, depois: { material: m.nome, q, para: dest.nome, osId: d.osId } });
  return mov;
}

/** Transferência entre custódias (técnico → técnico/veículo) ou entre locais. Origem debitada; destino confirma. */
export async function solicitarTransferencia(tx: DBOrTx, ctx: Ctx, d: { materialId: string; quantidade: string; origemPosicaoId: string; destinoPosicaoId: string; osId?: string | null; observacao?: string | null; chave?: string | null }) {
  const orig = await posicao(tx, ctx, d.origemPosicaoId);
  const dest = await posicao(tx, ctx, d.destinoPosicaoId);
  if (orig.virtual || dest.virtual || orig.id === dest.id) throw new ErroNegocio("Origem/destino inválidos.");
  if (orig.tipo === "profissional") exigirCustodiante(ctx, orig.profissionalId); else exigir(ctx, "material.movimentar");
  if (!pode(ctx, "material.movimentar") && !pode(ctx, "material.informar", "proprio")) throw new ErroAcesso();
  const m = await obterMaterial(tx, ctx, d.materialId);
  const q = parseQtdInput(d.quantidade, m.unidade);
  const { mov, repetido } = await inserirMov(tx, ctx, { materialId: m.id, tipo: "transferencia", status: "em_transito", origemPosicaoId: orig.id, destinoPosicaoId: dest.id, quantidade: q, unidade: m.unidade, osId: d.osId ?? null, observacao: d.observacao, chaveIdempotencia: d.chave ?? null });
  if (repetido) return mov;
  await debitar(tx, m.id, orig.id, q);
  await auditar(tx, ctx, { acao: "material.transferencia_solicitada", entidadeTipo: "material_movimento", entidadeId: mov.id, depois: { de: orig.nome, para: dest.nome, q } });
  return mov;
}

/** Recebedor confirma (entrega/transferência). Idempotente: confirmar de novo não credita duas vezes. */
export async function confirmarRecebimento(tx: DBOrTx, ctx: Ctx, movimentoId: string) {
  const [mov] = await tx.select().from(materialMovimento).where(and(eq(materialMovimento.id, movimentoId), eq(materialMovimento.empresaId, ctx.empresaId)));
  if (!mov) throw new ErroAcesso();
  const dest = await posicao(tx, ctx, mov.destinoPosicaoId);
  await exigirRecebedor(tx, ctx, dest);
  const [up] = await tx.update(materialMovimento).set({ status: "confirmado", confirmadoPor: ctx.usuarioId, confirmadoEm: new Date() })
    .where(and(eq(materialMovimento.id, movimentoId), eq(materialMovimento.status, "em_transito"))).returning();
  if (!up) { if (mov.status === "confirmado") return { mov, repetido: true }; throw new ErroNegocio("Movimento não está aguardando confirmação."); }
  await creditar(tx, mov.materialId, dest.id, mov.quantidade);
  await auditar(tx, ctx, { acao: "material.recebimento_confirmado", entidadeTipo: "material_movimento", entidadeId: movimentoId });
  return { mov: up, repetido: false };
}

export async function recusarRecebimento(tx: DBOrTx, ctx: Ctx, movimentoId: string, motivo: string) {
  if (!motivo?.trim()) throw new ErroNegocio("Informe o motivo da recusa.");
  const [mov] = await tx.select().from(materialMovimento).where(and(eq(materialMovimento.id, movimentoId), eq(materialMovimento.empresaId, ctx.empresaId)));
  if (!mov) throw new ErroAcesso();
  await exigirRecebedor(tx, ctx, await posicao(tx, ctx, mov.destinoPosicaoId));
  const [up] = await tx.update(materialMovimento).set({ status: "recusado", confirmadoPor: ctx.usuarioId, confirmadoEm: new Date(), observacao: sql`coalesce(${qc(materialMovimento.observacao)} || ' | ', '') || ${"Recusado: " + motivo}` })
    .where(and(eq(materialMovimento.id, movimentoId), eq(materialMovimento.status, "em_transito"))).returning();
  if (!up) throw new ErroNegocio("Movimento não está aguardando confirmação.");
  await creditar(tx, mov.materialId, mov.origemPosicaoId, mov.quantidade); // retorna à origem, sem criar nem perder
  await garantirPendencia(tx, ctx, { tipo: "material_divergencia", titulo: "Entrega de material recusada pelo recebedor", descricao: motivo, osId: mov.osId, entidadeTipo: "material_movimento", entidadeId: mov.id, prioridade: "media" });
  await auditar(tx, ctx, { acao: "material.recebimento_recusado", entidadeTipo: "material_movimento", entidadeId: movimentoId, motivo });
}

async function exigirRecebedor(tx: DBOrTx, ctx: Ctx, dest: typeof materialPosicao.$inferSelect) {
  if (dest.tipo === "profissional") {
    if (ctx.profissional?.id === dest.profissionalId && pode(ctx, "material.informar", "proprio")) return;
    throw new ErroAcesso("Somente o profissional recebedor confirma o recebimento.");
  }
  if (dest.tipo === "veiculo" && ctx.profissional && dest.responsavelProfissionalId === ctx.profissional.id) return;
  exigir(ctx, "material.movimentar");
}

// ---------------------------------------------------------------- informações do técnico
/** Técnico informa consumo / devolução / perda / peça divergente. Nada muda no saldo até a conferência. */
export async function informarMovimento(tx: DBOrTx, ctx: Ctx, d: { tipo: "consumo" | "devolucao" | "perda" | "segregacao"; materialId: string; quantidade: string; osId?: string | null; visitaId?: string | null; observacao?: string | null; retalho?: boolean; profissionalId?: string; chave?: string | null }) {
  const profId = d.profissionalId ?? ctx.profissional?.id;
  if (!profId) throw new ErroAcesso();
  if (profId !== ctx.profissional?.id) exigir(ctx, "material.movimentar"); else exigir(ctx, "material.informar", "proprio");
  if (d.osId) await exigirAcessoOS(tx, ctx, d.osId);
  const m = await obterMaterial(tx, ctx, d.materialId);
  const q = parseQtdInput(d.quantidade, m.unidade);
  if ((d.tipo === "perda" || d.tipo === "segregacao") && !d.observacao?.trim()) throw new ErroNegocio("Justifique a perda/divergência.");
  const orig = await posicaoDoProfissional(tx, ctx, profId);
  const destTipo = { consumo: "consumo", devolucao: "almoxarifado", perda: "perda", segregacao: "segregado" }[d.tipo];
  const dest = await posicaoVirtualOuReal(tx, ctx.empresaId, destTipo);
  const { mov } = await inserirMov(tx, ctx, { materialId: m.id, tipo: d.tipo, status: "informado", origemPosicaoId: orig.id, destinoPosicaoId: dest.id, quantidadeInformada: q, quantidade: q, unidade: m.unidade, osId: d.osId ?? null, visitaId: d.visitaId ?? null, observacao: d.observacao, retalho: !!d.retalho && m.controlaRetalho, chaveIdempotencia: d.chave ?? null });
  await auditar(tx, ctx, { acao: `material.${d.tipo}_informado`, entidadeTipo: "material_movimento", entidadeId: mov.id, depois: { material: m.nome, q, osId: d.osId } });
  return mov;
}
async function posicaoVirtualOuReal(tx: DBOrTx, empresaId: string, tipo: string) {
  const [p] = await tx.select().from(materialPosicao).where(and(eq(materialPosicao.empresaId, empresaId), eq(materialPosicao.tipo, tipo), eq(materialPosicao.ativo, true))).orderBy(asc(materialPosicao.nome)).limit(1);
  if (!p) throw new ErroNegocio(`Posição ${tipo} não configurada.`);
  return p;
}

/**
 * Conferência de movimento informado (consumo/devolução/segregação) por autorizado — nunca o próprio técnico.
 * Devolução: quantidade conferida fisicamente; diferença abre divergência "a localizar".
 * Perda: exige divergencia.aprovar.
 */
export async function conferirMovimento(tx: DBOrTx, ctx: Ctx, movimentoId: string, quantidadeConferida: string, d: { destinoPosicaoId?: string | null; observacao?: string | null } = {}) {
  const [mov] = await tx.select().from(materialMovimento).where(and(eq(materialMovimento.id, movimentoId), eq(materialMovimento.empresaId, ctx.empresaId)));
  if (!mov) throw new ErroAcesso();
  if (mov.tipo === "perda") exigir(ctx, "divergencia.aprovar"); else exigir(ctx, "material.conferir");
  if (mov.registradoPor === ctx.usuarioId && !ctx.papeis.includes("gestor")) throw new ErroAcesso("Quem informou não pode conferir o próprio movimento.");
  const orig = await posicao(tx, ctx, mov.origemPosicaoId);
  if (orig.profissionalId && ctx.profissional?.id === orig.profissionalId) throw new ErroAcesso("O custodiante não pode conferir a própria diferença.");
  const m = await obterMaterial(tx, ctx, mov.materialId);
  const qConf = toMilli(quantidadeConferida);
  if (qConf < 0n) throw new ErroNegocio("Quantidade inválida.");
  const qInf = toMilli(mov.quantidadeInformada ?? mov.quantidade);
  if (mov.tipo !== "devolucao" && qConf > qInf) throw new ErroNegocio("Quantidade conferida maior que a informada. Registre nova informação.");
  let destinoId = mov.destinoPosicaoId;
  if (mov.tipo === "devolucao" && d.destinoPosicaoId) { const dp = await posicao(tx, ctx, d.destinoPosicaoId); if (dp.virtual) throw new ErroNegocio("Destino inválido."); destinoId = dp.id; }
  if (qConf === 0n) {
    const [up] = await tx.update(materialMovimento).set({ status: "recusado", quantidade: mov.quantidade, confirmadoPor: ctx.usuarioId, confirmadoEm: new Date(), observacao: d.observacao ?? mov.observacao })
      .where(and(eq(materialMovimento.id, movimentoId), eq(materialMovimento.status, "informado"))).returning();
    if (!up) return { mov, repetido: true };
  } else {
    const q = fromMilli(qConf);
    const [up] = await tx.update(materialMovimento).set({ status: "confirmado", quantidade: q, destinoPosicaoId: destinoId, confirmadoPor: ctx.usuarioId, confirmadoEm: new Date(), observacao: d.observacao ?? mov.observacao })
      .where(and(eq(materialMovimento.id, movimentoId), eq(materialMovimento.status, "informado"))).returning();
    if (!up) { if (mov.status === "confirmado") return { mov, repetido: true }; throw new ErroNegocio("Movimento não está aguardando conferência."); }
    await debitar(tx, mov.materialId, mov.origemPosicaoId, q);
    await creditar(tx, mov.materialId, destinoId, q);
    if (mov.tipo === "devolucao" && mov.retalho) {
      await tx.insert(materialRetalho).values({ empresaId: ctx.empresaId, materialId: m.id, posicaoId: destinoId, comprimento: q, movimentoOrigemId: mov.id });
    }
  }
  if (mov.tipo === "devolucao" && qConf < qInf) {
    const falta = fromMilli(qInf - qConf);
    const [div] = await tx.insert(materialDivergencia).values({ empresaId: ctx.empresaId, materialId: m.id, posicaoId: orig.id, profissionalId: orig.profissionalId, osId: mov.osId, tipo: "falta", quantidade: falta, descricao: `Devolução informada ${fromMilli(qInf)} ${m.unidade}, conferida ${fromMilli(qConf)} ${m.unidade}. Quantidade a localizar, manter em custódia ou justificar.`, abertaPor: ctx.usuarioId }).returning();
    await garantirPendencia(tx, ctx, { tipo: "material_divergencia", titulo: `Divergência: ${falta} ${m.unidade} de ${m.nome}`, descricao: div.descricao, osId: mov.osId, profissionalId: orig.profissionalId, entidadeTipo: "material_divergencia", entidadeId: div.id, prioridade: "media", chave: `material_divergencia:${div.id}` });
  }
  await auditar(tx, ctx, { acao: `material.${mov.tipo}_conferido`, entidadeTipo: "material_movimento", entidadeId: movimentoId, antes: { informado: mov.quantidadeInformada }, depois: { conferido: fromMilli(qConf) } });
  return { mov, repetido: false };
}

/** Peça segregada: conferência decide liberar ao estoque, devolver ao fornecedor ou registrar perda (aprovação). */
export async function liberarSegregado(tx: DBOrTx, ctx: Ctx, d: { materialId: string; quantidade: string; destino: "almoxarifado" | "fornecedor"; destinoPosicaoId?: string | null; observacao: string }) {
  exigir(ctx, "material.conferir");
  if (!d.observacao?.trim()) throw new ErroNegocio("Registre o resultado da conferência.");
  const m = await obterMaterial(tx, ctx, d.materialId);
  const q = parseQtdInput(d.quantidade, m.unidade);
  const seg = await posicaoVirtual(tx, ctx.empresaId, "segregado");
  const dest = d.destino === "fornecedor" ? await posicaoVirtual(tx, ctx.empresaId, "fornecedor") : d.destinoPosicaoId ? await posicao(tx, ctx, d.destinoPosicaoId) : await posicaoVirtualOuReal(tx, ctx.empresaId, "almoxarifado");
  const { mov } = await inserirMov(tx, ctx, { materialId: m.id, tipo: "liberacao_segregado", status: "confirmado", origemPosicaoId: seg.id, destinoPosicaoId: dest.id, quantidade: q, unidade: m.unidade, observacao: d.observacao, confirmadoPor: ctx.usuarioId, confirmadoEm: new Date() });
  await debitar(tx, m.id, seg.id, q);
  await creditar(tx, m.id, dest.id, q);
  await auditar(tx, ctx, { acao: "material.segregado_liberado", entidadeTipo: "material_movimento", entidadeId: mov.id, motivo: d.observacao });
  return mov;
}

// ---------------------------------------------------------------- reservas e previsão
export async function reservarParaOS(tx: DBOrTx, ctx: Ctx, d: { osId: string; materialId: string; quantidade: string; posicaoId: string }) {
  exigir(ctx, "material.movimentar");
  await exigirAcessoOS(tx, ctx, d.osId, "os.ver");
  const m = await obterMaterial(tx, ctx, d.materialId);
  const q = parseQtdInput(d.quantidade, m.unidade);
  const pos = await posicao(tx, ctx, d.posicaoId);
  try {
    const r = await tx.transaction(async (sp) => sp.update(materialSaldo).set({ reservado: sql`${qc(materialSaldo.reservado)} + ${q}::numeric` })
      .where(and(eq(materialSaldo.materialId, m.id), eq(materialSaldo.posicaoId, pos.id))).returning());
    if (!r.length) throw new ErroNegocio("Sem saldo disponível para reservar. Registre a necessidade de compra.");
  } catch (e) {
    const t = traduzirErroBanco(e);
    throw t instanceof ErroNegocio && t.message.startsWith("Saldo insuficiente") ? new ErroNegocio("Saldo disponível insuficiente para a reserva. Registre a necessidade de compra (OS ficará aguardando material).") : t;
  }
  const [res] = await tx.insert(materialReserva).values({ empresaId: ctx.empresaId, materialId: m.id, posicaoId: pos.id, osId: d.osId, quantidade: q, criadoPor: ctx.usuarioId }).returning();
  await auditar(tx, ctx, { acao: "material.reservado", entidadeTipo: "os", entidadeId: d.osId, depois: { material: m.nome, q } });
  return res;
}

export async function cancelarReserva(tx: DBOrTx, ctx: Ctx, reservaId: string) {
  exigir(ctx, "material.movimentar");
  const [r] = await tx.update(materialReserva).set({ situacao: "cancelada" }).where(and(eq(materialReserva.id, reservaId), eq(materialReserva.empresaId, ctx.empresaId), eq(materialReserva.situacao, "ativa"))).returning();
  if (!r) throw new ErroNegocio("Reserva não está ativa.");
  await tx.update(materialSaldo).set({ reservado: sql`greatest(${qc(materialSaldo.reservado)} - ${r.quantidade}::numeric, 0)` }).where(and(eq(materialSaldo.materialId, r.materialId), eq(materialSaldo.posicaoId, r.posicaoId)));
  await auditar(tx, ctx, { acao: "material.reserva_cancelada", entidadeTipo: "os", entidadeId: r.osId });
}

// ---------------------------------------------------------------- divergências, contagem, perdas
export async function registrarContagem(tx: DBOrTx, ctx: Ctx, d: { materialId: string; posicaoId: string; quantidadeContada: string; observacao?: string | null }) {
  exigir(ctx, "material.conferir");
  const m = await obterMaterial(tx, ctx, d.materialId);
  const pos = await posicao(tx, ctx, d.posicaoId);
  const contada = toMilli(d.quantidadeContada);
  if (contada < 0n) throw new ErroNegocio("Quantidade inválida.");
  const [s] = await tx.select().from(materialSaldo).where(and(eq(materialSaldo.materialId, m.id), eq(materialSaldo.posicaoId, pos.id)));
  const esperada = toMilli(s?.quantidade ?? "0");
  let divergenciaId: string | null = null;
  if (contada !== esperada) {
    const dif = contada > esperada ? contada - esperada : esperada - contada;
    const [div] = await tx.insert(materialDivergencia).values({ empresaId: ctx.empresaId, materialId: m.id, posicaoId: pos.id, profissionalId: pos.profissionalId, tipo: "diferenca_inventario", quantidade: fromMilli(dif), descricao: `Contagem física ${fromMilli(contada)} × saldo esperado ${fromMilli(esperada)} ${m.unidade} em ${pos.nome} (${contada > esperada ? "sobra" : "falta"}). ${d.observacao ?? ""}`, abertaPor: ctx.usuarioId }).returning();
    divergenciaId = div.id;
    await garantirPendencia(tx, ctx, { tipo: "material_divergencia", titulo: `Diferença de inventário: ${m.nome}`, descricao: div.descricao, profissionalId: pos.profissionalId, entidadeTipo: "material_divergencia", entidadeId: div.id, chave: `material_divergencia:${div.id}` });
  }
  await tx.insert(materialContagem).values({ empresaId: ctx.empresaId, materialId: m.id, posicaoId: pos.id, quantidadeEsperada: fromMilli(esperada), quantidadeContada: fromMilli(contada), divergenciaId, contadoPor: ctx.usuarioId });
  await auditar(tx, ctx, { acao: "material.contagem", entidadeTipo: "material", entidadeId: m.id, depois: { posicao: pos.nome, esperada: fromMilli(esperada), contada: fromMilli(contada) } });
  return { divergenciaId };
}

/**
 * Decide divergência (gestor/aprovador; nunca quem é o custodiante, nem quem abriu sem ser gestor).
 *  - perda_aprovada: baixa a quantidade da posição para "perdas" (evento explícito).
 *  - mantida_custodia: autoriza custódia remanescente (sem movimento).
 *  - ajuste_aprovado (inventário com sobra): crédito via "ajuste".
 *  - localizada / resolvida: encerra sem movimento (ex.: devolução registrada à parte).
 */
export async function decidirDivergencia(tx: DBOrTx, ctx: Ctx, id: string, decisao: "perda_aprovada" | "mantida_custodia" | "ajuste_aprovado" | "localizada" | "resolvida", justificativa: string) {
  exigir(ctx, "divergencia.aprovar");
  if (!justificativa?.trim()) throw new ErroNegocio("Justificativa obrigatória.");
  const [dv] = await tx.select().from(materialDivergencia).where(and(eq(materialDivergencia.id, id), eq(materialDivergencia.empresaId, ctx.empresaId))).for("update");
  if (!dv) throw new ErroAcesso();
  if (!["aberta", "em_investigacao"].includes(dv.situacao)) throw new ErroNegocio("Divergência já decidida.");
  if (dv.profissionalId && ctx.profissional?.id === dv.profissionalId) throw new ErroAcesso("Você não pode aprovar a própria divergência.");
  const auto = dv.abertaPor === ctx.usuarioId;
  if (auto && !ctx.papeis.includes("gestor")) throw new ErroAcesso("Quem abriu a divergência não pode decidi-la.");
  const m = await obterMaterial(tx, ctx, dv.materialId);
  if ((decisao === "perda_aprovada" || decisao === "ajuste_aprovado") && dv.posicaoId) {
    const virt = await posicaoVirtual(tx, ctx.empresaId, decisao === "perda_aprovada" ? "perda" : "ajuste");
    const sobra = decisao === "ajuste_aprovado";
    await inserirMov(tx, ctx, { materialId: m.id, tipo: sobra ? "ajuste" : "perda", status: "confirmado", origemPosicaoId: sobra ? virt.id : dv.posicaoId, destinoPosicaoId: sobra ? dv.posicaoId : virt.id, quantidade: dv.quantidade, unidade: m.unidade, osId: dv.osId, divergenciaId: dv.id, observacao: justificativa, confirmadoPor: ctx.usuarioId, confirmadoEm: new Date() });
    if (sobra) await creditar(tx, m.id, dv.posicaoId, dv.quantidade); else await debitar(tx, m.id, dv.posicaoId, dv.quantidade);
  }
  await tx.update(materialDivergencia).set({ situacao: decisao === "ajuste_aprovado" ? "resolvida" : decisao, justificativa, decididaPor: ctx.usuarioId, decididaEm: new Date(), autoaprovacao: auto }).where(eq(materialDivergencia.id, id));
  await encerrarPendenciasEntidade(tx, ctx, "material_divergencia", id, `${decisao}: ${justificativa}`);
  await auditar(tx, ctx, { acao: `material.divergencia_${decisao}`, entidadeTipo: "material_divergencia", entidadeId: id, motivo: justificativa, depois: { autoaprovacao: auto, quantidade: dv.quantidade }, sensivel: true });
}

// ---------------------------------------------------------------- compras
export async function registrarCompra(tx: DBOrTx, ctx: Ctx, d: { fornecedorId?: string | null; osId?: string | null; data: string; documento?: string | null; itens: Array<{ materialId: string; quantidade: string; custoUnitarioCentavos: number; destinoPosicaoId?: string | null }>; receberAgora: boolean; gerarObrigacao: boolean; vencimento?: string | null; chave?: string | null }) {
  exigir(ctx, "material.movimentar");
  if (!d.itens.length) throw new ErroNegocio("Inclua ao menos um item.");
  if (d.fornecedorId) { const [f] = await tx.select().from(fornecedor).where(and(eq(fornecedor.id, d.fornecedorId), eq(fornecedor.empresaId, ctx.empresaId))); if (!f) throw new ErroNegocio("Fornecedor inválido."); }
  const [c] = await tx.insert(compra).values({ empresaId: ctx.empresaId, fornecedorId: d.fornecedorId ?? null, osId: d.osId ?? null, data: d.data, documento: d.documento ?? null, registradaPor: ctx.usuarioId }).returning();
  const almox = await posicaoVirtualOuReal(tx, ctx.empresaId, "almoxarifado");
  let total = 0;
  for (const it of d.itens) {
    const m = await obterMaterial(tx, ctx, it.materialId);
    const q = parseQtdInput(it.quantidade, m.unidade);
    if (!Number.isInteger(it.custoUnitarioCentavos) || it.custoUnitarioCentavos < 0) throw new ErroNegocio("Custo inválido.");
    await tx.insert(compraItem).values({ compraId: c.id, materialId: m.id, quantidade: q, custoUnitarioCentavos: it.custoUnitarioCentavos, destinoPosicaoId: it.destinoPosicaoId ?? almox.id });
    total += Number((BigInt(it.custoUnitarioCentavos) * toMilli(q) + 500n) / 1000n);
  }
  if (d.receberAgora) await receberCompra(tx, ctx, c.id);
  if (d.gerarObrigacao) {
    if (!d.vencimento) throw new ErroNegocio("Informe o vencimento para gerar a conta a pagar.");
    const [cat] = await tx.select().from(categoriaFinanceira).where(and(eq(categoriaFinanceira.empresaId, ctx.empresaId), eq(categoriaFinanceira.codigo, "material")));
    const ob = await criarObrigacao(tx, ctx, { natureza: "pagar", categoriaId: cat.id, fornecedorId: d.fornecedorId ?? null, descricao: `Compra de materiais${d.documento ? " — doc. " + d.documento : ""}`, competencia: d.data.slice(0, 7) + "-01", valorBrutoCentavos: total, origemTipo: "compra", origemId: c.id, osId: d.osId ?? null, chaveUnicidade: `compra:${c.id}`, parcelas: [{ vencimento: d.vencimento, valorCentavos: total }], documento: d.documento ?? null }, { permissaoAlternativa: "material.movimentar" });
    await tx.update(compra).set({ obrigacaoId: ob.id }).where(eq(compra.id, c.id));
  }
  await auditar(tx, ctx, { acao: "compra.registrada", entidadeTipo: "compra", entidadeId: c.id, depois: { itens: d.itens.length, totalCentavos: pode(ctx, "material.custos.ver") ? total : undefined } });
  return c;
}

/** Recebimento físico da compra: entra no histórico físico (uma única vez). Não gera despesa. */
export async function receberCompra(tx: DBOrTx, ctx: Ctx, compraId: string) {
  exigir(ctx, "material.movimentar");
  const [c] = await tx.update(compra).set({ situacao: "recebida" }).where(and(eq(compra.id, compraId), eq(compra.empresaId, ctx.empresaId), eq(compra.situacao, "registrada"))).returning();
  if (!c) return; // já recebida: sem efeito duplicado
  const itens = await tx.select().from(compraItem).where(eq(compraItem.compraId, compraId));
  const forn = await posicaoVirtual(tx, ctx.empresaId, "fornecedor");
  for (const it of itens) {
    const [m] = await tx.select().from(material).where(eq(material.id, it.materialId));
    await inserirMov(tx, ctx, { materialId: it.materialId, tipo: "entrada_compra", status: "confirmado", origemPosicaoId: forn.id, destinoPosicaoId: it.destinoPosicaoId!, quantidade: it.quantidade, unidade: m.unidade, compraId, osId: c.osId, confirmadoPor: ctx.usuarioId, confirmadoEm: new Date(), chaveIdempotencia: `compra:${compraId}:${it.id}` });
    await creditar(tx, it.materialId, it.destinoPosicaoId!, it.quantidade);
  }
  await auditar(tx, ctx, { acao: "compra.recebida", entidadeTipo: "compra", entidadeId: compraId });
}

// ---------------------------------------------------------------- consultas
export async function listarMateriais(dbx: DBOrTx, ctx: Ctx) {
  exigir(ctx, "material.ver", "empresa");
  const verCusto = pode(ctx, "material.custos.ver");
  const rows = await dbx.select({
    m: material,
    estoque: sql<string>`coalesce((select sum(s.quantidade) from ${materialSaldo} s join ${materialPosicao} p on p.id = s.posicao_id where s.material_id = ${qc(material.id)} and p.tipo = 'almoxarifado'),0)`,
    reservado: sql<string>`coalesce((select sum(s.reservado) from ${materialSaldo} s where s.material_id = ${qc(material.id)}),0)`,
    custodia: sql<string>`coalesce((select sum(s.quantidade) from ${materialSaldo} s join ${materialPosicao} p on p.id = s.posicao_id where s.material_id = ${qc(material.id)} and p.tipo in ('profissional','veiculo')),0)`,
    segregado: sql<string>`coalesce((select sum(s.quantidade) from ${materialSaldo} s join ${materialPosicao} p on p.id = s.posicao_id where s.material_id = ${qc(material.id)} and p.tipo = 'segregado'),0)`,
    transito: sql<string>`coalesce((select sum(mm.quantidade) from ${materialMovimento} mm where mm.material_id = ${qc(material.id)} and mm.status = 'em_transito'),0)`,
  }).from(material).where(eq(material.empresaId, ctx.empresaId)).orderBy(asc(material.categoria), asc(material.nome));
  return rows.map((r) => ({ ...r.m, custoReferenciaCentavos: verCusto ? r.m.custoReferenciaCentavos : null, estoque: r.estoque, reservado: r.reservado, custodia: r.custodia, segregado: r.segregado, transito: r.transito }));
}

export async function listarPosicoes(dbx: DBOrTx, ctx: Ctx, incluirVirtuais = false) {
  exigir(ctx, "material.ver", "proprio");
  const conds = [eq(materialPosicao.empresaId, ctx.empresaId), eq(materialPosicao.ativo, true)];
  if (!incluirVirtuais) conds.push(eq(materialPosicao.virtual, false));
  return dbx.select().from(materialPosicao).where(and(...conds)).orderBy(asc(materialPosicao.tipo), asc(materialPosicao.nome));
}

export async function saldosPorPosicao(dbx: DBOrTx, ctx: Ctx, f: { posicaoId?: string; materialId?: string } = {}) {
  exigir(ctx, "material.ver", "empresa");
  const conds: SQL[] = [eq(material.empresaId, ctx.empresaId), sql`(${qc(materialSaldo.quantidade)} > 0 or ${qc(materialSaldo.reservado)} > 0)`];
  if (f.posicaoId) conds.push(eq(materialSaldo.posicaoId, f.posicaoId));
  if (f.materialId) conds.push(eq(materialSaldo.materialId, f.materialId));
  return dbx.select({
    materialId: material.id, materialNome: material.nome, especificacao: material.especificacao, unidade: material.unidade, posicaoId: materialPosicao.id, posicaoNome: materialPosicao.nome, posicaoTipo: materialPosicao.tipo,
    quantidade: materialSaldo.quantidade, reservado: materialSaldo.reservado, atualizadoEm: materialSaldo.atualizadoEm,
    ultimaContagem: sql<string | null>`(select c.quantidade_contada from ${materialContagem} c where c.material_id = ${qc(materialSaldo.materialId)} and c.posicao_id = ${qc(materialSaldo.posicaoId)} order by c.criado_em desc limit 1)`,
    ultimaContagemEm: sql<string | null>`(select c.criado_em from ${materialContagem} c where c.material_id = ${qc(materialSaldo.materialId)} and c.posicao_id = ${qc(materialSaldo.posicaoId)} order by c.criado_em desc limit 1)`,
  }).from(materialSaldo).innerJoin(material, eq(material.id, materialSaldo.materialId)).innerJoin(materialPosicao, eq(materialPosicao.id, materialSaldo.posicaoId))
    .where(and(...conds)).orderBy(asc(materialPosicao.nome), asc(material.nome));
}

/** Custódia do técnico logado (ou de um profissional, para autorizados). */
export async function minhaCustodia(dbx: DBOrTx, ctx: Ctx, profissionalId?: string) {
  const pid = profissionalId ?? ctx.profissional?.id;
  if (!pid) return { saldos: [], pendentes: [], informados: [] };
  if (pid !== ctx.profissional?.id) exigir(ctx, "material.ver", "empresa"); else exigir(ctx, "material.ver", "proprio");
  const pos = await posicaoDoProfissional(dbx, ctx, pid);
  const saldos = await dbx.select({ materialId: material.id, nome: material.nome, especificacao: material.especificacao, unidade: material.unidade, quantidade: materialSaldo.quantidade, atualizadoEm: materialSaldo.atualizadoEm })
    .from(materialSaldo).innerJoin(material, eq(material.id, materialSaldo.materialId)).where(and(eq(materialSaldo.posicaoId, pos.id), sql`${qc(materialSaldo.quantidade)} > 0`)).orderBy(asc(material.nome));
  const pendentes = await movimentosDetalhados(dbx, ctx, and(eq(materialMovimento.destinoPosicaoId, pos.id), eq(materialMovimento.status, "em_transito"))!);
  const informados = await movimentosDetalhados(dbx, ctx, and(eq(materialMovimento.origemPosicaoId, pos.id), inArray(materialMovimento.status, ["informado", "em_transito"]))!);
  return { posicao: pos, saldos, pendentes, informados };
}

export async function movimentosDetalhados(dbx: DBOrTx, ctx: Ctx, cond: SQL, limite = 200) {
  return dbx.select({
    mov: materialMovimento, materialNome: material.nome, especificacao: material.especificacao,
    origemNome: sql<string>`(select nome from ${materialPosicao} where id = ${qc(materialMovimento.origemPosicaoId)})`,
    destinoNome: sql<string>`(select nome from ${materialPosicao} where id = ${qc(materialMovimento.destinoPosicaoId)})`,
    registradoPorNome: usuario.nome,
    osNumero: sql<number | null>`(select numero from ${ordemServico} where id = ${qc(materialMovimento.osId)})`,
  }).from(materialMovimento).innerJoin(material, eq(material.id, materialMovimento.materialId)).innerJoin(usuario, eq(usuario.id, materialMovimento.registradoPor))
    .where(and(eq(materialMovimento.empresaId, ctx.empresaId), cond)).orderBy(desc(materialMovimento.registradoEm)).limit(limite);
}

export async function movimentosAguardandoConferencia(dbx: DBOrTx, ctx: Ctx) {
  exigir(ctx, "material.conferir");
  return movimentosDetalhados(dbx, ctx, or(eq(materialMovimento.status, "informado"), and(eq(materialMovimento.status, "em_transito"), sql`exists (select 1 from ${materialPosicao} p where p.id = ${qc(materialMovimento.destinoPosicaoId)} and p.tipo in ('almoxarifado','segregado'))`))!);
}

export async function listarDivergencias(dbx: DBOrTx, ctx: Ctx, abertas = true) {
  exigir(ctx, "material.ver", "empresa");
  return dbx.select({ d: materialDivergencia, materialNome: material.nome, unidade: material.unidade, profissionalNome: profissional.nome, osNumero: ordemServico.numero })
    .from(materialDivergencia).innerJoin(material, eq(material.id, materialDivergencia.materialId)).leftJoin(profissional, eq(profissional.id, materialDivergencia.profissionalId)).leftJoin(ordemServico, eq(ordemServico.id, materialDivergencia.osId))
    .where(and(eq(materialDivergencia.empresaId, ctx.empresaId), abertas ? inArray(materialDivergencia.situacao, ["aberta", "em_investigacao"]) : sql`true`)).orderBy(desc(materialDivergencia.abertaEm));
}

export async function listarRetalhos(dbx: DBOrTx, ctx: Ctx) {
  exigir(ctx, "material.ver", "empresa");
  return dbx.select({ r: materialRetalho, materialNome: material.nome, especificacao: material.especificacao, unidade: material.unidade, posicaoNome: materialPosicao.nome })
    .from(materialRetalho).innerJoin(material, eq(material.id, materialRetalho.materialId)).innerJoin(materialPosicao, eq(materialPosicao.id, materialRetalho.posicaoId))
    .where(and(eq(materialRetalho.empresaId, ctx.empresaId), eq(materialRetalho.situacao, "disponivel"))).orderBy(asc(material.nome), desc(materialRetalho.comprimento));
}

export interface LinhaConciliacao {
  materialId: string; nome: string; especificacao: string | null; unidade: string;
  previsto: string; reservado: string; emTransito: string; entregue: string; transfEntrada: string; transfSaida: string;
  consumoInformado: string; consumoValidado: string; devolucaoInformada: string; devolucaoConferida: string; perdasAprovadas: string; segregado: string;
  custodiaAutorizada: string; saldoCustodia: string; aLocalizar: string; conciliado: boolean;
}

/**
 * Conciliação por OS. Estados não são somados como movimentos independentes:
 * saldo em custódia da OS = entregue + transf. entrada − consumo validado − devolução conferida − perdas aprovadas − transf. saída − segregado.
 * Ex.: 10 entregue, 7 consumo validado, 3 devolução conferida → 0 (conciliado). Com 1 devolvido → 2 a localizar/manter/justificar.
 */
export async function conciliacaoOS(dbx: DBOrTx, ctx: Ctx, osId: string): Promise<LinhaConciliacao[]> {
  await exigirAcessoOS(dbx, ctx, osId, "os.ver");
  if (!pode(ctx, "material.ver", "empresa") && !pode(ctx, "material.ver", "proprio")) throw new ErroAcesso();
  const movs = await dbx.select().from(materialMovimento).where(and(eq(materialMovimento.osId, osId), eq(materialMovimento.empresaId, ctx.empresaId)));
  const posTipos = new Map((await dbx.select({ id: materialPosicao.id, tipo: materialPosicao.tipo }).from(materialPosicao).where(eq(materialPosicao.empresaId, ctx.empresaId))).map((p) => [p.id, p.tipo]));
  const previstos = await dbx.select().from(osItem).where(and(eq(osItem.osId, osId), sql`${qc(osItem.materialId)} is not null`, inArray(osItem.situacao, ["previsto", "aprovado"])));
  const reservas = await dbx.select().from(materialReserva).where(and(eq(materialReserva.osId, osId), eq(materialReserva.situacao, "ativa")));
  const divs = await dbx.select().from(materialDivergencia).where(and(eq(materialDivergencia.osId, osId), eq(materialDivergencia.situacao, "mantida_custodia")));
  const ids = [...new Set([...movs.map((m) => m.materialId), ...previstos.map((p) => p.materialId!), ...reservas.map((r) => r.materialId)])];
  if (!ids.length) return [];
  const mats = await dbx.select().from(material).where(inArray(material.id, ids));
  const custodia = (t: string | undefined) => t === "profissional" || t === "veiculo";
  return mats.map((m) => {
    const ms = movs.filter((x) => x.materialId === m.id);
    const sum = (f: (x: Mov) => boolean, campo: "quantidade" | "quantidadeInformada" = "quantidade") => ms.filter(f).reduce((s, x) => s + toMilli(x[campo] ?? x.quantidade), 0n);
    const conf = (x: Mov) => x.status === "confirmado";
    const entregue = sum((x) => x.tipo === "entrega" && conf(x));
    const emTransito = sum((x) => x.tipo === "entrega" && x.status === "em_transito");
    const transfEntrada = sum((x) => x.tipo === "transferencia" && conf(x) && custodia(posTipos.get(x.destinoPosicaoId)) && !custodia(posTipos.get(x.origemPosicaoId)));
    const transfSaida = sum((x) => x.tipo === "transferencia" && x.status !== "recusado" && x.status !== "cancelado" && custodia(posTipos.get(x.origemPosicaoId)) && !custodia(posTipos.get(x.destinoPosicaoId)));
    const consumoInformado = sum((x) => x.tipo === "consumo" && x.status !== "cancelado", "quantidadeInformada");
    const consumoValidado = sum((x) => x.tipo === "consumo" && conf(x));
    const devolucaoInformada = sum((x) => x.tipo === "devolucao" && x.status !== "cancelado", "quantidadeInformada");
    const devolucaoConferida = sum((x) => x.tipo === "devolucao" && conf(x));
    const perdas = sum((x) => x.tipo === "perda" && conf(x));
    const segregado = sum((x) => x.tipo === "segregacao" && conf(x));
    const autorizada = divs.filter((d) => d.materialId === m.id).reduce((s, d) => s + toMilli(d.quantidade), 0n);
    const saldo = entregue + transfEntrada - consumoValidado - devolucaoConferida - perdas - transfSaida - segregado;
    const aLocalizar = saldo - autorizada;
    const previsto = previstos.filter((p) => p.materialId === m.id).reduce((s, p) => s + toMilli(p.quantidade), 0n);
    const reservado = reservas.filter((r) => r.materialId === m.id).reduce((s, r) => s + toMilli(r.quantidade), 0n);
    const pendInfo = ms.some((x) => x.status === "informado" || x.status === "em_transito");
    return {
      materialId: m.id, nome: m.nome, especificacao: m.especificacao, unidade: m.unidade,
      previsto: fromMilli(previsto), reservado: fromMilli(reservado), emTransito: fromMilli(emTransito), entregue: fromMilli(entregue), transfEntrada: fromMilli(transfEntrada), transfSaida: fromMilli(transfSaida),
      consumoInformado: fromMilli(consumoInformado), consumoValidado: fromMilli(consumoValidado), devolucaoInformada: fromMilli(devolucaoInformada), devolucaoConferida: fromMilli(devolucaoConferida),
      perdasAprovadas: fromMilli(perdas), segregado: fromMilli(segregado), custodiaAutorizada: fromMilli(autorizada), saldoCustodia: fromMilli(saldo), aLocalizar: fromMilli(aLocalizar > 0n ? aLocalizar : 0n),
      conciliado: aLocalizar <= 0n && !pendInfo,
    };
  });
}

/** Autoriza custódia remanescente da OS (material segue com o técnico para uso futuro) — encerra alocação sem consumo fictício. */
export async function autorizarCustodiaRemanescente(tx: DBOrTx, ctx: Ctx, d: { osId: string; materialId: string; quantidade: string; profissionalId: string; justificativa: string }) {
  exigir(ctx, "material.conferir");
  if (!d.justificativa?.trim()) throw new ErroNegocio("Justificativa obrigatória.");
  if (ctx.profissional?.id === d.profissionalId) throw new ErroAcesso("O custodiante não autoriza a própria custódia.");
  const m = await obterMaterial(tx, ctx, d.materialId);
  const q = parseQtdInput(d.quantidade, m.unidade);
  const pos = await posicaoDoProfissional(tx, ctx, d.profissionalId);
  await tx.insert(materialDivergencia).values({ empresaId: ctx.empresaId, materialId: m.id, posicaoId: pos.id, profissionalId: d.profissionalId, osId: d.osId, tipo: "sobra", quantidade: q, descricao: "Custódia remanescente autorizada", situacao: "mantida_custodia", justificativa: d.justificativa, abertaPor: ctx.usuarioId, decididaPor: ctx.usuarioId, decididaEm: new Date() });
  await auditar(tx, ctx, { acao: "material.custodia_autorizada", entidadeTipo: "os", entidadeId: d.osId, motivo: d.justificativa, depois: { material: m.nome, q } });
}

/** Materiais sob custódia há mais tempo que o prazo (desde a última entrada confirmada na posição). */
export async function custodiasAntigas(dbx: DBOrTx, ctx: Ctx, prazoDias: number) {
  return dbx.select({ materialNome: material.nome, unidade: material.unidade, posicaoNome: materialPosicao.nome, quantidade: materialSaldo.quantidade, desde: materialSaldo.atualizadoEm })
    .from(materialSaldo).innerJoin(material, eq(material.id, materialSaldo.materialId)).innerJoin(materialPosicao, eq(materialPosicao.id, materialSaldo.posicaoId))
    .where(and(eq(material.empresaId, ctx.empresaId), eq(materialPosicao.tipo, "profissional"), sql`${qc(materialSaldo.quantidade)} > 0`, sql`${qc(materialSaldo.atualizadoEm)} < now() - make_interval(days => ${prazoDias})`));
}
