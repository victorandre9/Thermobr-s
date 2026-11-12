/** Ferramentas: custódia com pessoa responsável identificável, movimentos com confirmação, checklist de saída/retorno reutilizável. */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { qc } from "../db/sql";
import type { DBOrTx } from "../db";
import { checklistModelo, checklistResposta, checklistRespostaItem, ferramenta, ferramentaMovimento, ordemServico, profissional, usuario, veiculo } from "../db/schema";
import { type Ctx, exigir, pode } from "../auth/contexto";
import { ErroAcesso, ErroNegocio, traduzirErroBanco } from "../erros";
import { auditar } from "./auditoria";
import { encerrarPendenciasEntidade, garantirPendencia } from "./pendencias";

type Ferr = typeof ferramenta.$inferSelect;

async function obter(tx: DBOrTx, ctx: Ctx, id: string, lock = false) {
  const q = tx.select().from(ferramenta).where(and(eq(ferramenta.id, id), eq(ferramenta.empresaId, ctx.empresaId)));
  const [f] = lock ? await q.for("update") : await q;
  if (!f) throw new ErroAcesso();
  return f;
}
function ehCustodiante(ctx: Ctx, f: Ferr) { return !!ctx.profissional && f.custodianteProfissionalId === ctx.profissional.id; }

export async function salvarFerramenta(tx: DBOrTx, ctx: Ctx, id: string | null, d: { codigo: string; nome: string; descricao?: string | null; tipo: string; conjuntoId?: string | null; condicao?: string }) {
  exigir(ctx, "ferramenta.gerenciar");
  if (!d.codigo.trim() || !d.nome.trim()) throw new ErroNegocio("Código e nome obrigatórios.");
  if (id) { const antes = await obter(tx, ctx, id); const [r] = await tx.update(ferramenta).set(d).where(eq(ferramenta.id, id)).returning(); await auditar(tx, ctx, { acao: "ferramenta.atualizada", entidadeTipo: "ferramenta", entidadeId: id, antes, depois: r }); return r; }
  try {
    const [r] = await tx.transaction(async (sp) => sp.insert(ferramenta).values({ ...d, empresaId: ctx.empresaId }).returning());
    await auditar(tx, ctx, { acao: "ferramenta.criada", entidadeTipo: "ferramenta", entidadeId: r.id, depois: r });
    return r;
  } catch (e) { throw traduzirErroBanco(e); }
}

async function mov(tx: DBOrTx, ctx: Ctx, d: Omit<typeof ferramentaMovimento.$inferInsert, "empresaId" | "registradoPor">) {
  try {
    const [m] = await tx.transaction(async (sp) => sp.insert(ferramentaMovimento).values({ ...d, empresaId: ctx.empresaId, registradoPor: ctx.usuarioId }).returning());
    return m;
  } catch (e) { throw traduzirErroBanco(e); }
}

export async function reservarFerramenta(tx: DBOrTx, ctx: Ctx, id: string, osId: string) {
  exigir(ctx, "ferramenta.movimentar");
  const f = await obter(tx, ctx, id, true);
  if (f.situacao !== "disponivel") throw new ErroNegocio("Ferramenta não está disponível.");
  const [o] = await tx.select().from(ordemServico).where(and(eq(ordemServico.id, osId), eq(ordemServico.empresaId, ctx.empresaId)));
  if (!o) throw new ErroNegocio("OS inválida.");
  await mov(tx, ctx, { ferramentaId: id, tipo: "reserva", status: "confirmado", osId, confirmadoPor: ctx.usuarioId, confirmadoEm: new Date() });
  await tx.update(ferramenta).set({ situacao: "reservada", osReservaId: osId, versao: f.versao + 1 }).where(eq(ferramenta.id, id));
  await auditar(tx, ctx, { acao: "ferramenta.reservada", entidadeTipo: "ferramenta", entidadeId: id, depois: { osId } });
}

/** Entrega (separação + entrega física). Fica pendente até o recebedor confirmar. */
export async function entregarFerramenta(tx: DBOrTx, ctx: Ctx, id: string, d: { profissionalId: string; veiculoId?: string | null; osId?: string | null; visitaId?: string | null; observacao?: string | null; chave?: string | null }) {
  exigir(ctx, "ferramenta.movimentar");
  const f = await obter(tx, ctx, id, true);
  if (!["disponivel", "reservada"].includes(f.situacao)) throw new ErroNegocio("Ferramenta não está disponível para entrega (verifique custódia atual).");
  const [p] = await tx.select().from(profissional).where(and(eq(profissional.id, d.profissionalId), eq(profissional.empresaId, ctx.empresaId), eq(profissional.ativo, true)));
  if (!p) throw new ErroNegocio("Profissional inválido.");
  if (d.chave) { const [ex] = await tx.select().from(ferramentaMovimento).where(eq(ferramentaMovimento.chaveIdempotencia, d.chave)); if (ex) return ex; }
  const m = await mov(tx, ctx, { ferramentaId: id, tipo: "entrega", status: "pendente", paraProfissionalId: p.id, veiculoId: d.veiculoId ?? null, osId: d.osId ?? f.osReservaId, visitaId: d.visitaId ?? null, condicao: f.condicao, observacao: d.observacao, chaveIdempotencia: d.chave ?? null });
  await tx.update(ferramenta).set({ situacao: "aguardando_confirmacao", versao: f.versao + 1 }).where(eq(ferramenta.id, id));
  await auditar(tx, ctx, { acao: "ferramenta.entregue", entidadeTipo: "ferramenta", entidadeId: id, depois: { para: p.nome } });
  return m;
}

/** Recebedor confirma entrega ou transferência. Idempotente. */
export async function confirmarFerramenta(tx: DBOrTx, ctx: Ctx, movimentoId: string, condicao?: string | null, observacao?: string | null) {
  const [m] = await tx.select().from(ferramentaMovimento).where(and(eq(ferramentaMovimento.id, movimentoId), eq(ferramentaMovimento.empresaId, ctx.empresaId)));
  if (!m) throw new ErroAcesso();
  if (!["entrega", "transferencia"].includes(m.tipo)) throw new ErroNegocio("Movimento não requer confirmação do recebedor.");
  const recebedor = ctx.profissional?.id === m.paraProfissionalId && pode(ctx, "ferramenta.confirmar", "proprio");
  if (!recebedor) throw new ErroAcesso("Somente o novo responsável confirma o recebimento.");
  const [up] = await tx.update(ferramentaMovimento).set({ status: "confirmado", confirmadoPor: ctx.usuarioId, confirmadoEm: new Date(), condicao: condicao ?? m.condicao, observacao: observacao ?? m.observacao })
    .where(and(eq(ferramentaMovimento.id, movimentoId), eq(ferramentaMovimento.status, "pendente"))).returning();
  if (!up) { if (m.status === "confirmado") return { repetido: true }; throw new ErroNegocio("Movimento não está pendente."); }
  const f = await obter(tx, ctx, m.ferramentaId, true);
  await tx.update(ferramenta).set({ situacao: "em_custodia", custodianteProfissionalId: m.paraProfissionalId, custodianteVeiculoId: m.veiculoId, custodiaDesde: new Date(), osReservaId: null, condicao: condicao ?? f.condicao, versao: f.versao + 1 }).where(eq(ferramenta.id, f.id));
  if (condicao === "danificada" && f.condicao !== "danificada") await garantirPendencia(tx, ctx, { tipo: "ferramenta_dano", titulo: `Ferramenta recebida danificada: ${f.nome}`, descricao: observacao, ferramentaId: f.id, profissionalId: ctx.profissional!.id, prioridade: "media", chave: `ferramenta_dano:${f.id}` });
  await auditar(tx, ctx, { acao: `ferramenta.${m.tipo}_confirmada`, entidadeTipo: "ferramenta", entidadeId: f.id, depois: { custodiante: m.paraProfissionalId } });
  return { repetido: false };
}

export async function recusarFerramenta(tx: DBOrTx, ctx: Ctx, movimentoId: string, motivo: string) {
  if (!motivo?.trim()) throw new ErroNegocio("Informe o motivo.");
  const [m] = await tx.select().from(ferramentaMovimento).where(and(eq(ferramentaMovimento.id, movimentoId), eq(ferramentaMovimento.empresaId, ctx.empresaId)));
  if (!m || ctx.profissional?.id !== m.paraProfissionalId) throw new ErroAcesso();
  const [up] = await tx.update(ferramentaMovimento).set({ status: "recusado", confirmadoPor: ctx.usuarioId, confirmadoEm: new Date(), observacao: motivo }).where(and(eq(ferramentaMovimento.id, movimentoId), eq(ferramentaMovimento.status, "pendente"))).returning();
  if (!up) throw new ErroNegocio("Movimento não está pendente.");
  const f = await obter(tx, ctx, m.ferramentaId, true);
  await tx.update(ferramenta).set({ situacao: m.tipo === "transferencia" ? "em_custodia" : "disponivel", versao: f.versao + 1 }).where(eq(ferramenta.id, f.id));
  await auditar(tx, ctx, { acao: "ferramenta.recebimento_recusado", entidadeTipo: "ferramenta", entidadeId: f.id, motivo });
}

export async function solicitarDevolucao(tx: DBOrTx, ctx: Ctx, id: string, condicao: string, observacao?: string | null) {
  const f = await obter(tx, ctx, id, true);
  if (!ehCustodiante(ctx, f) && !pode(ctx, "ferramenta.movimentar")) throw new ErroAcesso();
  if (f.situacao !== "em_custodia") throw new ErroNegocio("Ferramenta não está em custódia.");
  await mov(tx, ctx, { ferramentaId: id, tipo: "devolucao", status: "pendente", deProfissionalId: f.custodianteProfissionalId, condicao, observacao });
  await tx.update(ferramenta).set({ situacao: "devolucao_pendente", versao: f.versao + 1 }).where(eq(ferramenta.id, id));
  await auditar(tx, ctx, { acao: "ferramenta.devolucao_solicitada", entidadeTipo: "ferramenta", entidadeId: id, depois: { condicao } });
}

/** Conferência física da devolução por autorizado (não o próprio custodiante). */
export async function conferirDevolucao(tx: DBOrTx, ctx: Ctx, movimentoId: string, condicaoConferida: string, observacao?: string | null) {
  exigir(ctx, "ferramenta.movimentar");
  const [m] = await tx.select().from(ferramentaMovimento).where(and(eq(ferramentaMovimento.id, movimentoId), eq(ferramentaMovimento.empresaId, ctx.empresaId)));
  if (!m || m.tipo !== "devolucao") throw new ErroAcesso();
  if (ctx.profissional?.id === m.deProfissionalId) throw new ErroAcesso("O custodiante não confere a própria devolução.");
  const [up] = await tx.update(ferramentaMovimento).set({ status: "confirmado", confirmadoPor: ctx.usuarioId, confirmadoEm: new Date(), condicao: condicaoConferida, observacao: observacao ?? m.observacao })
    .where(and(eq(ferramentaMovimento.id, movimentoId), eq(ferramentaMovimento.status, "pendente"))).returning();
  if (!up) { if (m.status === "confirmado") return; throw new ErroNegocio("Devolução não está pendente."); }
  const f = await obter(tx, ctx, m.ferramentaId, true);
  await tx.update(ferramenta).set({ situacao: condicaoConferida === "danificada" || condicaoConferida === "em_manutencao" ? "disponivel" : "disponivel", condicao: condicaoConferida, custodianteProfissionalId: null, custodianteVeiculoId: null, custodiaDesde: null, versao: f.versao + 1 }).where(eq(ferramenta.id, f.id));
  if (condicaoConferida === "danificada" && f.condicao !== "danificada") await garantirPendencia(tx, ctx, { tipo: "ferramenta_dano", titulo: `Ferramenta devolvida danificada: ${f.nome}`, descricao: observacao, ferramentaId: f.id, profissionalId: m.deProfissionalId, prioridade: "media", chave: `ferramenta_dano:${f.id}` });
  await encerrarPendenciasEntidade(tx, ctx, "ferramenta", f.id, "Devolução conferida");
  await auditar(tx, ctx, { acao: "ferramenta.devolucao_conferida", entidadeTipo: "ferramenta", entidadeId: f.id, depois: { condicao: condicaoConferida } });
}

/** Transferência para outro profissional: novo responsável confirma; histórico preservado. */
export async function transferirFerramenta(tx: DBOrTx, ctx: Ctx, id: string, paraProfissionalId: string, observacao?: string | null) {
  const f = await obter(tx, ctx, id, true);
  if (!ehCustodiante(ctx, f) && !pode(ctx, "ferramenta.movimentar")) throw new ErroAcesso();
  if (f.situacao !== "em_custodia") throw new ErroNegocio("Ferramenta não está em custódia.");
  if (paraProfissionalId === f.custodianteProfissionalId) throw new ErroNegocio("Destino igual ao custodiante atual.");
  const [p] = await tx.select().from(profissional).where(and(eq(profissional.id, paraProfissionalId), eq(profissional.empresaId, ctx.empresaId), eq(profissional.ativo, true)));
  if (!p) throw new ErroNegocio("Profissional inválido.");
  await mov(tx, ctx, { ferramentaId: id, tipo: "transferencia", status: "pendente", deProfissionalId: f.custodianteProfissionalId, paraProfissionalId: p.id, condicao: f.condicao, observacao });
  await auditar(tx, ctx, { acao: "ferramenta.transferencia_solicitada", entidadeTipo: "ferramenta", entidadeId: id, depois: { para: p.nome } });
}

/** Falta, dano ou ferramenta deixada no cliente: gera pendência com responsável pela solução. */
export async function registrarOcorrenciaFerramenta(tx: DBOrTx, ctx: Ctx, id: string, tipo: "falta" | "dano" | "deixada_cliente", descricao: string, osId?: string | null) {
  const f = await obter(tx, ctx, id, true);
  if (!ehCustodiante(ctx, f) && !pode(ctx, "ferramenta.movimentar")) throw new ErroAcesso();
  if (!descricao?.trim()) throw new ErroNegocio("Descreva a ocorrência.");
  await mov(tx, ctx, { ferramentaId: id, tipo, status: "confirmado", deProfissionalId: f.custodianteProfissionalId, osId: osId ?? null, observacao: descricao, confirmadoPor: ctx.usuarioId, confirmadoEm: new Date() });
  const situacao = tipo === "falta" ? "extraviada" : tipo === "deixada_cliente" ? "no_cliente" : f.situacao;
  await tx.update(ferramenta).set({ situacao, condicao: tipo === "dano" ? "danificada" : f.condicao, versao: f.versao + 1 }).where(eq(ferramenta.id, id));
  const pt = tipo === "falta" ? "ferramenta_falta" : tipo === "dano" ? "ferramenta_dano" : "ferramenta_no_cliente";
  await garantirPendencia(tx, ctx, { tipo: pt, titulo: `${tipo === "falta" ? "Falta" : tipo === "dano" ? "Dano" : "Deixada no cliente"}: ${f.nome} (${f.codigo})`, descricao, ferramentaId: id, profissionalId: f.custodianteProfissionalId, osId: osId ?? null, entidadeTipo: "ferramenta", entidadeId: id, prioridade: tipo === "deixada_cliente" ? "alta" : "media", chave: `${pt}:${id}` });
  await auditar(tx, ctx, { acao: `ferramenta.${tipo}`, entidadeTipo: "ferramenta", entidadeId: id, motivo: descricao });
}

/** Ferramenta localizada/recuperada — validação por autorizado (não o custodiante que registrou a falta). */
export async function localizarFerramenta(tx: DBOrTx, ctx: Ctx, id: string, observacao: string) {
  exigir(ctx, "ferramenta.movimentar");
  const f = await obter(tx, ctx, id, true);
  if (!["extraviada", "no_cliente"].includes(f.situacao)) throw new ErroNegocio("Ferramenta não está extraviada/no cliente.");
  if (ctx.profissional?.id === f.custodianteProfissionalId) throw new ErroAcesso("O custodiante não encerra a própria falta.");
  await mov(tx, ctx, { ferramentaId: id, tipo: "localizada", status: "confirmado", deProfissionalId: f.custodianteProfissionalId, observacao, confirmadoPor: ctx.usuarioId, confirmadoEm: new Date() });
  await tx.update(ferramenta).set({ situacao: f.custodianteProfissionalId ? "em_custodia" : "disponivel", versao: f.versao + 1 }).where(eq(ferramenta.id, id));
  await encerrarPendenciasEntidade(tx, ctx, "ferramenta", id, `Localizada: ${observacao}`);
  await auditar(tx, ctx, { acao: "ferramenta.localizada", entidadeTipo: "ferramenta", entidadeId: id, motivo: observacao });
}

// ---------------------------------------------------------------- checklist de ferramentas (saída/retorno)
export async function checklistFerramentasValido(dbx: DBOrTx, ctx: Ctx, profissionalId: string, tipo: "ferramentas_saida" | "ferramentas_retorno") {
  const [r] = await dbx.select().from(checklistResposta).where(and(eq(checklistResposta.empresaId, ctx.empresaId), eq(checklistResposta.profissionalId, profissionalId), eq(checklistResposta.tipo, tipo), sql`${qc(checklistResposta.validoAte)} > now()`)).orderBy(desc(checklistResposta.realizadoEm)).limit(1);
  return r ?? null;
}

/** Checklist com itens esperados = ferramentas sob custódia do profissional. Reutilizável no turno (validade do modelo). */
export async function responderChecklistFerramentas(tx: DBOrTx, ctx: Ctx, tipo: "ferramentas_saida" | "ferramentas_retorno", respostas: Array<{ ferramentaId: string; resultado: "conforme" | "irregular" | "nao_aplica"; observacao?: string | null }>, chave?: string | null) {
  if (!ctx.profissional) throw new ErroAcesso();
  exigir(ctx, "ferramenta.confirmar", "proprio");
  const prof = ctx.profissional;
  const valido = await checklistFerramentasValido(tx, ctx, prof.id, tipo);
  if (valido) return { resposta: valido, reutilizado: true };
  const [modelo] = await tx.select().from(checklistModelo).where(and(eq(checklistModelo.empresaId, ctx.empresaId), eq(checklistModelo.tipo, tipo), eq(checklistModelo.ativo, true)));
  if (!modelo) throw new ErroNegocio("Modelo de checklist não configurado.");
  const minhas = await tx.select().from(ferramenta).where(and(eq(ferramenta.empresaId, ctx.empresaId), eq(ferramenta.custodianteProfissionalId, prof.id), inArray(ferramenta.situacao, ["em_custodia", "devolucao_pendente"])));
  const faltandoResposta = minhas.filter((f) => !respostas.some((r) => r.ferramentaId === f.id));
  if (faltandoResposta.length) throw new ErroNegocio(`Responda todos os itens (${faltandoResposta.length} sem resposta).`);
  if (respostas.some((r) => !minhas.some((f) => f.id === r.ferramentaId))) throw new ErroAcesso("Você só confere ferramentas sob sua responsabilidade.");
  for (const r of respostas) if (r.resultado === "irregular" && !r.observacao?.trim()) throw new ErroNegocio("Descreva cada irregularidade.");
  const [resp] = await tx.insert(checklistResposta).values({ empresaId: ctx.empresaId, modeloId: modelo.id, tipo, profissionalId: prof.id, usuarioId: ctx.usuarioId, validoAte: sql`now() + make_interval(hours => ${modelo.validadeHoras})` as unknown as Date, chaveIdempotencia: chave ?? null }).returning();
  for (const r of respostas) {
    const f = minhas.find((x) => x.id === r.ferramentaId)!;
    let pendenciaId: string | null = null;
    if (r.resultado === "irregular") {
      const p = await garantirPendencia(tx, ctx, { tipo: "ferramenta_falta", titulo: `Checklist: irregularidade em ${f.nome} (${f.codigo})`, descricao: r.observacao, ferramentaId: f.id, profissionalId: prof.id, entidadeTipo: "ferramenta", entidadeId: f.id, prioridade: "media", chave: `ferramenta_checklist:${f.id}` });
      pendenciaId = p.id;
    }
    await tx.insert(checklistRespostaItem).values({ respostaId: resp.id, ferramentaId: f.id, descricao: `${f.codigo} — ${f.nome}`, resultado: r.resultado, observacao: r.observacao ?? null, pendenciaId });
  }
  await auditar(tx, ctx, { acao: `checklist.${tipo}`, entidadeTipo: "checklist_resposta", entidadeId: resp.id, depois: { itens: respostas.length, irregulares: respostas.filter((r) => r.resultado === "irregular").length } });
  return { resposta: resp, reutilizado: false };
}

// ---------------------------------------------------------------- consultas
export async function listarFerramentas(dbx: DBOrTx, ctx: Ctx, f: { situacao?: string; profissionalId?: string } = {}) {
  exigir(ctx, "ferramenta.ver", "proprio");
  const conds = [eq(ferramenta.empresaId, ctx.empresaId), eq(ferramenta.ativo, true)];
  if (!pode(ctx, "ferramenta.ver", "empresa")) {
    if (!ctx.profissional) throw new ErroAcesso();
    conds.push(sql`(${qc(ferramenta.custodianteProfissionalId)} = ${ctx.profissional.id} or exists (select 1 from ${ferramentaMovimento} m where m.ferramenta_id = ${qc(ferramenta.id)} and m.status = 'pendente' and m.para_profissional_id = ${ctx.profissional.id}))`);
  } else if (f.profissionalId) conds.push(eq(ferramenta.custodianteProfissionalId, f.profissionalId));
  if (f.situacao) conds.push(eq(ferramenta.situacao, f.situacao));
  return dbx.select({ f: ferramenta, custodianteNome: profissional.nome, veiculoIdent: veiculo.identificacao,
    pendente: sql<{ id: string; tipo: string; para: string | null } | null>`(select json_build_object('id', m.id, 'tipo', m.tipo, 'para', m.para_profissional_id) from ${ferramentaMovimento} m where m.ferramenta_id = ${qc(ferramenta.id)} and m.status = 'pendente' limit 1)`,
  }).from(ferramenta).leftJoin(profissional, eq(profissional.id, ferramenta.custodianteProfissionalId)).leftJoin(veiculo, eq(veiculo.id, ferramenta.custodianteVeiculoId))
    .where(and(...conds)).orderBy(asc(ferramenta.codigo));
}

export async function historicoFerramenta(dbx: DBOrTx, ctx: Ctx, id: string) {
  exigir(ctx, "ferramenta.ver", "proprio");
  const f = await obter(dbx, ctx, id);
  if (!pode(ctx, "ferramenta.ver", "empresa") && !ehCustodiante(ctx, f)) throw new ErroAcesso();
  const movs = await dbx.select({ m: ferramentaMovimento, registradoPorNome: usuario.nome,
    deNome: sql<string | null>`(select nome from ${profissional} where id = ${qc(ferramentaMovimento.deProfissionalId)})`,
    paraNome: sql<string | null>`(select nome from ${profissional} where id = ${qc(ferramentaMovimento.paraProfissionalId)})`,
    confirmadoPorNome: sql<string | null>`(select nome from ${usuario} where id = ${qc(ferramentaMovimento.confirmadoPor)})`,
  }).from(ferramentaMovimento).innerJoin(usuario, eq(usuario.id, ferramentaMovimento.registradoPor)).where(eq(ferramentaMovimento.ferramentaId, id)).orderBy(desc(ferramentaMovimento.registradoEm));
  return { ferramenta: f, movimentos: movs };
}

export async function movimentosFerramentaPendentes(dbx: DBOrTx, ctx: Ctx) {
  const conds = [eq(ferramentaMovimento.empresaId, ctx.empresaId), eq(ferramentaMovimento.status, "pendente")];
  if (!pode(ctx, "ferramenta.ver", "empresa")) {
    if (!ctx.profissional) return [];
    conds.push(eq(ferramentaMovimento.paraProfissionalId, ctx.profissional.id));
  }
  return dbx.select({ m: ferramentaMovimento, nome: ferramenta.nome, codigo: ferramenta.codigo,
    deNome: sql<string | null>`(select nome from ${profissional} where id = ${qc(ferramentaMovimento.deProfissionalId)})`,
    paraNome: sql<string | null>`(select nome from ${profissional} where id = ${qc(ferramentaMovimento.paraProfissionalId)})`,
  }).from(ferramentaMovimento).innerJoin(ferramenta, eq(ferramenta.id, ferramentaMovimento.ferramentaId)).where(and(...conds)).orderBy(asc(ferramentaMovimento.registradoEm));
}

