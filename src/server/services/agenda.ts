import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { qc } from "../db/sql";
import type { DBOrTx } from "../db";
import { recursoReserva, veiculo, ferramenta, agendaReserva, agendaVaga, cliente, clienteLocal, ordemServico, pendencia, profissional, visita, visitaReagendamento, autonomoServico } from "../db/schema";
import { type Ctx, exigir, pode } from "../auth/contexto";
import { ErroAcesso, ErroNegocio, traduzirErroBanco } from "../erros";
import { auditar } from "./auditoria";
import { recalcularEtapa } from "./os";
import { visitaDoProfissionalSQL } from "./escopo";
import { garantirPendencia } from "./pendencias";

const rng = (ini: Date, fim: Date) => `[${ini.toISOString()},${fim.toISOString()})`;

export interface EquipeVisita { profissionalIds: string[]; responsavelId?: string | null; /** Recursos exclusivos reservados junto (veículo e/ou ferramentas exclusivas). */ veiculoId?: string | null; ferramentaIds?: string[] }

/** Cria nova visita na OS (opcionalmente já agendada com equipe). */
export async function criarVisita(tx: DBOrTx, ctx: Ctx, osId: string, d: { tipo?: string; instrucoes?: string | null; inicio?: Date | null; fim?: Date | null; equipe?: EquipeVisita; veiculoId?: string | null }) {
  exigir(ctx, "agenda.gerenciar");
  const [o] = await tx.select().from(ordemServico).where(and(eq(ordemServico.id, osId), eq(ordemServico.empresaId, ctx.empresaId))).for("update");
  if (!o) throw new ErroAcesso();
  if (["encerrada", "cancelada"].includes(o.etapa)) throw new ErroNegocio("OS encerrada/cancelada. Para garantia posterior, crie uma OS de retorno vinculada.");
  const [{ seq }] = await tx.select({ seq: sql<number>`coalesce(max(${qc(visita.sequencia)}),0)::int + 1` }).from(visita).where(eq(visita.osId, osId));
  const [v] = await tx.insert(visita).values({ empresaId: ctx.empresaId, osId, sequencia: seq, tipo: d.tipo ?? (seq > 1 ? "continuacao" : o.origem === "contrato" ? "contrato" : "atendimento"), instrucoes: d.instrucoes ?? null, veiculoId: d.veiculoId ?? null, criadoPor: ctx.usuarioId }).returning();
  await auditar(tx, ctx, { acao: "visita.criada", entidadeTipo: "visita", entidadeId: v.id, depois: { osId, sequencia: seq } });
  if (d.inicio && d.fim && d.equipe?.profissionalIds.length) await agendarVisita(tx, ctx, v.id, d.inicio, d.fim, d.equipe, null);
  else await recalcularEtapa(tx, osId);
  return v;
}

/**
 * Agenda ou reagenda uma visita reservando TODOS os profissionais em uma única transação.
 * A restrição EXCLUDE no banco impede sobreposição mesmo com requisições concorrentes.
 */
export async function agendarVisita(tx: DBOrTx, ctx: Ctx, visitaId: string, inicio: Date, fim: Date, equipe: EquipeVisita, motivo: string | null) {
  exigir(ctx, "agenda.gerenciar");
  if (!(fim > inicio)) throw new ErroNegocio("O fim deve ser posterior ao início.");
  if (!equipe.profissionalIds.length) throw new ErroNegocio("Selecione ao menos um profissional.");
  const ids = [...new Set(equipe.profissionalIds)];
  const [v] = await tx.select().from(visita).where(and(eq(visita.id, visitaId), eq(visita.empresaId, ctx.empresaId))).for("update");
  if (!v) throw new ErroAcesso();
  if (v.situacao === "em_atendimento" || v.situacao === "finalizada" || v.situacao === "cancelada") throw new ErroNegocio("Visita iniciada, finalizada ou cancelada não pode ser reagendada. Crie uma nova visita de continuação.");
  const profs = await tx.select().from(profissional).where(and(inArray(profissional.id, ids), eq(profissional.empresaId, ctx.empresaId), eq(profissional.ativo, true)));
  if (profs.length !== ids.length) throw new ErroNegocio("Profissional inválido ou inativo.");
  const reagendamento = v.situacao === "agendada";
  if (reagendamento && !motivo?.trim()) throw new ErroNegocio("Informe o motivo do reagendamento.");
  const antesEquipe = (await tx.select({ p: agendaReserva.profissionalId }).from(agendaReserva).where(and(eq(agendaReserva.visitaId, visitaId), eq(agendaReserva.ativo, true)))).map((r) => r.p);
  try {
    await tx.transaction(async (sp) => {
      await sp.update(agendaReserva).set({ ativo: false }).where(and(eq(agendaReserva.visitaId, visitaId), eq(agendaReserva.ativo, true)));
      const responsavel = equipe.responsavelId && ids.includes(equipe.responsavelId) ? equipe.responsavelId : ids[0];
      await sp.insert(agendaReserva).values(ids.map((pid) => ({
        empresaId: ctx.empresaId, profissionalId: pid, visitaId, tipo: "visita", papelNaVisita: pid === responsavel ? "responsavel" : "auxiliar", periodo: rng(inicio, fim), criadoPor: ctx.usuarioId,
      })));
      // recursos exclusivos: mesma transação; EXCLUDE impede conflito de veículo/ferramenta exclusiva
      await sp.update(recursoReserva).set({ ativo: false }).where(and(eq(recursoReserva.visitaId, visitaId), eq(recursoReserva.ativo, true)));
      const recursos: Array<typeof recursoReserva.$inferInsert> = [];
      if (equipe.veiculoId) recursos.push({ empresaId: ctx.empresaId, visitaId, veiculoId: equipe.veiculoId, periodo: rng(inicio, fim), criadoPor: ctx.usuarioId });
      for (const fid of equipe.ferramentaIds ?? []) recursos.push({ empresaId: ctx.empresaId, visitaId, ferramentaId: fid, periodo: rng(inicio, fim), criadoPor: ctx.usuarioId });
      if (recursos.length) {
        if (equipe.veiculoId) { const [vv] = await sp.select({ id: veiculo.id }).from(veiculo).where(and(eq(veiculo.id, equipe.veiculoId), eq(veiculo.empresaId, ctx.empresaId), eq(veiculo.ativo, true))); if (!vv) throw new ErroNegocio("Veículo inválido."); }
        if (equipe.ferramentaIds?.length) { const fs = await sp.select({ id: ferramenta.id }).from(ferramenta).where(and(inArray(ferramenta.id, equipe.ferramentaIds), eq(ferramenta.empresaId, ctx.empresaId), eq(ferramenta.exclusiva, true))); if (fs.length !== new Set(equipe.ferramentaIds).size) throw new ErroNegocio("Ferramenta exclusiva inválida."); }
        await sp.insert(recursoReserva).values(recursos);
      }
    });
  } catch (e) {
    throw traduzirErroBanco(e);
  }
  await tx.update(visita).set({ inicioPrevisto: inicio, fimPrevisto: fim, situacao: "agendada", veiculoId: equipe.veiculoId ?? v.veiculoId }).where(eq(visita.id, visitaId));
  if (reagendamento || v.inicioPrevisto) {
    await tx.insert(visitaReagendamento).values({ visitaId, deInicio: v.inicioPrevisto, deFim: v.fimPrevisto, paraInicio: inicio, paraFim: fim, equipeAntes: antesEquipe, equipeDepois: ids, motivo: motivo ?? "Agendamento", por: ctx.usuarioId });
  }
  // autônomos participantes passam a ter linha de serviço (valor definido pelo gestor, nunca automático)
  // Retorno/garantia: linha "adicional_retorno" aguardando decisão do gestor (pagar adicional ou marcar como coberto) — nunca presume gratuidade nem gera receita.
  const [osRow] = await tx.select({ origem: ordemServico.origem }).from(ordemServico).where(eq(ordemServico.id, v.osId));
  for (const p of profs.filter((x) => x.vinculo === "autonomo")) {
    const retorno = osRow.origem === "retorno_garantia";
    await tx.insert(autonomoServico).values({ empresaId: ctx.empresaId, osId: v.osId, profissionalId: p.id, descricao: retorno ? "Retorno/garantia — definir adicional ou cobertura" : "Participação na OS", base: retorno ? "adicional_retorno" : "servico", chave: "principal" }).onConflictDoNothing();
  }
  // solicitações de remarcação/retorno ligadas à visita ficam atendidas
  await tx.update(pendencia).set({ situacao: "resolvida", resolvidaPor: ctx.usuarioId, resolvidaEm: new Date(), resolucao: "Visita agendada pelo escritório" })
    .where(and(eq(pendencia.osId, v.osId), inArray(pendencia.tipo, ["solicitacao_remarcacao", "solicitacao_retorno"]), inArray(pendencia.situacao, ["aberta", "em_andamento"])));
  await auditar(tx, ctx, { acao: reagendamento ? "visita.reagendada" : "visita.agendada", entidadeTipo: "visita", entidadeId: visitaId, motivo, antes: { inicio: v.inicioPrevisto, fim: v.fimPrevisto, equipe: antesEquipe }, depois: { inicio, fim, equipe: ids } });
  await recalcularEtapa(tx, v.osId);
}

export async function cancelarVisita(tx: DBOrTx, ctx: Ctx, visitaId: string, motivo: string) {
  exigir(ctx, "agenda.gerenciar");
  if (!motivo?.trim()) throw new ErroNegocio("Informe o motivo.");
  const [v] = await tx.select().from(visita).where(and(eq(visita.id, visitaId), eq(visita.empresaId, ctx.empresaId))).for("update");
  if (!v) throw new ErroAcesso();
  if (v.situacao === "em_atendimento" || v.situacao === "finalizada") throw new ErroNegocio("Visita iniciada ou finalizada não pode ser cancelada; registre o resultado.");
  await tx.update(visita).set({ situacao: "cancelada", canceladaMotivo: motivo }).where(eq(visita.id, visitaId));
  await tx.update(agendaReserva).set({ ativo: false }).where(eq(agendaReserva.visitaId, visitaId));
  await tx.update(recursoReserva).set({ ativo: false }).where(eq(recursoReserva.visitaId, visitaId));
  await auditar(tx, ctx, { acao: "visita.cancelada", entidadeTipo: "visita", entidadeId: visitaId, motivo });
  await recalcularEtapa(tx, v.osId);
}

export async function registrarIndisponibilidade(tx: DBOrTx, ctx: Ctx, profissionalId: string, inicio: Date, fim: Date, motivo: string) {
  exigir(ctx, "agenda.gerenciar");
  if (!(fim > inicio)) throw new ErroNegocio("Período inválido.");
  const [p] = await tx.select().from(profissional).where(and(eq(profissional.id, profissionalId), eq(profissional.empresaId, ctx.empresaId)));
  if (!p) throw new ErroAcesso();
  let r;
  try {
    r = await tx.transaction(async (sp) => (await sp.insert(agendaReserva).values({ empresaId: ctx.empresaId, profissionalId, tipo: "indisponibilidade", periodo: rng(inicio, fim), motivo, criadoPor: ctx.usuarioId }).returning())[0]);
  } catch (e) { throw traduzirErroBanco(e); }
  await auditar(tx, ctx, { acao: "agenda.indisponibilidade", entidadeTipo: "profissional", entidadeId: profissionalId, motivo, depois: { inicio, fim } });
  return r;
}

export async function removerIndisponibilidade(tx: DBOrTx, ctx: Ctx, reservaId: string) {
  exigir(ctx, "agenda.gerenciar");
  const [r] = await tx.update(agendaReserva).set({ ativo: false }).where(and(eq(agendaReserva.id, reservaId), eq(agendaReserva.empresaId, ctx.empresaId), eq(agendaReserva.tipo, "indisponibilidade"))).returning();
  if (!r) throw new ErroAcesso();
  await auditar(tx, ctx, { acao: "agenda.indisponibilidade_removida", entidadeTipo: "profissional", entidadeId: r.profissionalId });
}

// ---------------------------------------------------------------- consultas
export async function agendaPeriodo(dbx: DBOrTx, ctx: Ctx, inicio: Date, fim: Date, f: { profissionalId?: string; situacao?: string } = {}) {
  exigir(ctx, "agenda.ver", "proprio");
  const conds = [eq(agendaReserva.empresaId, ctx.empresaId), eq(agendaReserva.ativo, true), sql`${qc(agendaReserva.periodo)} && tstzrange(${inicio.toISOString()}, ${fim.toISOString()})`];
  const proprio = !pode(ctx, "agenda.ver", "empresa");
  if (proprio) {
    if (!ctx.profissional) throw new ErroAcesso();
    conds.push(eq(agendaReserva.profissionalId, ctx.profissional.id));
  } else if (f.profissionalId) conds.push(eq(agendaReserva.profissionalId, f.profissionalId));
  const rows = await dbx.select({
    reservaId: agendaReserva.id, tipo: agendaReserva.tipo, profissionalId: agendaReserva.profissionalId, profissionalNome: profissional.nome, vinculo: profissional.vinculo,
    papel: agendaReserva.papelNaVisita, motivo: agendaReserva.motivo,
    inicio: sql<string>`lower(${qc(agendaReserva.periodo)})`, fim: sql<string>`upper(${qc(agendaReserva.periodo)})`,
    visitaId: visita.id, visitaSituacao: visita.situacao, visitaResultado: visita.resultado, sequencia: visita.sequencia,
    osId: ordemServico.id, osNumero: ordemServico.numero, osDescricao: ordemServico.descricao, prioridade: ordemServico.prioridade,
    clienteNome: cliente.nome, localNome: clienteLocal.nome, bairro: clienteLocal.bairro,
  }).from(agendaReserva)
    .innerJoin(profissional, eq(profissional.id, agendaReserva.profissionalId))
    .leftJoin(visita, eq(visita.id, agendaReserva.visitaId))
    .leftJoin(ordemServico, eq(ordemServico.id, visita.osId))
    .leftJoin(cliente, eq(cliente.id, ordemServico.clienteId))
    .leftJoin(clienteLocal, eq(clienteLocal.id, ordemServico.localId))
    .where(and(...conds)).orderBy(sql`lower(${qc(agendaReserva.periodo)})`, asc(profissional.nome));
  return rows.filter((r) => !f.situacao || r.visitaSituacao === f.situacao);
}

export async function listarVagas(dbx: DBOrTx, ctx: Ctx) {
  exigir(ctx, "agenda.ver", "proprio");
  return dbx.select().from(agendaVaga).where(and(eq(agendaVaga.empresaId, ctx.empresaId), eq(agendaVaga.ativo, true))).orderBy(asc(agendaVaga.ordem), asc(agendaVaga.horaInicio));
}

export async function salvarVaga(tx: DBOrTx, ctx: Ctx, id: string | null, d: { nome: string; horaInicio: string; horaFim: string; diasSemana: number[]; ordem: number; ativo: boolean }) {
  exigir(ctx, "configuracao.gerenciar");
  if (d.horaFim <= d.horaInicio) throw new ErroNegocio("Horário final deve ser após o inicial.");
  if (id) { await tx.update(agendaVaga).set(d).where(and(eq(agendaVaga.id, id), eq(agendaVaga.empresaId, ctx.empresaId))); }
  else await tx.insert(agendaVaga).values({ ...d, empresaId: ctx.empresaId });
  await auditar(tx, ctx, { acao: "config.vaga_salva", entidadeTipo: "agenda_vaga", entidadeId: id, depois: d });
}

/** Visitas não agendadas (fila de programação) e conflitos. */
export async function visitasSemAgenda(dbx: DBOrTx, ctx: Ctx) {
  exigir(ctx, "agenda.gerenciar");
  return dbx.select({ id: visita.id, osId: ordemServico.id, osNumero: ordemServico.numero, sequencia: visita.sequencia, tipo: visita.tipo, clienteNome: cliente.nome, descricao: ordemServico.descricao, prioridade: ordemServico.prioridade })
    .from(visita).innerJoin(ordemServico, eq(ordemServico.id, visita.osId)).innerJoin(cliente, eq(cliente.id, ordemServico.clienteId))
    .where(and(eq(visita.empresaId, ctx.empresaId), eq(visita.situacao, "nao_agendada"))).orderBy(asc(ordemServico.numero));
}

/** Visitas do técnico logado num intervalo (tela "Minhas visitas"). */
export async function minhasVisitas(dbx: DBOrTx, ctx: Ctx, inicio: Date, fim: Date) {
  exigir(ctx, "visita.executar", "proprio");
  if (!ctx.profissional) return [];
  return dbx.select({
    id: visita.id, situacao: visita.situacao, resultado: visita.resultado, inicio: visita.inicioPrevisto, fim: visita.fimPrevisto, sequencia: visita.sequencia, tipo: visita.tipo,
    osId: ordemServico.id, osNumero: ordemServico.numero, descricao: ordemServico.descricao, prioridade: ordemServico.prioridade,
    clienteNome: cliente.nome, localNome: clienteLocal.nome, logradouro: clienteLocal.logradouro, numero: clienteLocal.numero, bairro: clienteLocal.bairro, cidade: clienteLocal.cidade,
  }).from(visita).innerJoin(ordemServico, eq(ordemServico.id, visita.osId)).innerJoin(cliente, eq(cliente.id, ordemServico.clienteId)).leftJoin(clienteLocal, eq(clienteLocal.id, ordemServico.localId))
    .where(and(eq(visita.empresaId, ctx.empresaId), visitaDoProfissionalSQL(ctx.profissional.id), gte(visita.inicioPrevisto, inicio), lt(visita.inicioPrevisto, fim), sql`${qc(visita.situacao)} <> 'cancelada'`))
    .orderBy(asc(visita.inicioPrevisto));
}

/** Visitas do técnico em atendimento (independente da data) — para retomar. */
export async function minhasVisitasEmAndamento(dbx: DBOrTx, ctx: Ctx) {
  if (!ctx.profissional) return [];
  return dbx.select({ id: visita.id, osNumero: ordemServico.numero, clienteNome: cliente.nome, checkinEm: visita.checkinEm })
    .from(visita).innerJoin(ordemServico, eq(ordemServico.id, visita.osId)).innerJoin(cliente, eq(cliente.id, ordemServico.clienteId))
    .where(and(eq(visita.empresaId, ctx.empresaId), visitaDoProfissionalSQL(ctx.profissional.id), eq(visita.situacao, "em_atendimento")));
}

/** Técnico solicita remarcação/retorno: decisão de agenda fica com o escritório. */
export async function solicitarRemarcacao(tx: DBOrTx, ctx: Ctx, visitaId: string, tipo: "solicitacao_remarcacao" | "solicitacao_retorno", descricao: string) {
  exigir(ctx, "visita.executar", "proprio");
  if (!ctx.profissional) throw new ErroAcesso();
  const [v] = await tx.select().from(visita).where(and(eq(visita.id, visitaId), eq(visita.empresaId, ctx.empresaId), visitaDoProfissionalSQL(ctx.profissional.id)));
  if (!v) throw new ErroAcesso();
  if (!descricao?.trim()) throw new ErroNegocio("Descreva a solicitação.");
  return garantirPendencia(tx, ctx, { tipo, titulo: tipo === "solicitacao_retorno" ? "Técnico solicita retorno" : "Técnico solicita remarcação", descricao, osId: v.osId, visitaId, prioridade: "alta", chave: `${tipo}:${visitaId}` });
}
