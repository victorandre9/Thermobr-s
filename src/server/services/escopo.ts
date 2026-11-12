/** Regras de escopo "próprio": técnico só alcança registros ligados às visitas em que participa. */
import { and, eq, exists, sql, type SQL } from "drizzle-orm";
import type { DBOrTx } from "../db";
import { agendaReserva, ordemServico, visita } from "../db/schema";
import { type Ctx, pode } from "../auth/contexto";
import type { Permissao } from "../auth/permissoes";
import { ErroAcesso } from "../erros";

/** Condição SQL: a visita (coluna visita.id) tem o profissional como participante ativo. */
export function visitaDoProfissionalSQL(profissionalId: string, visitaIdCol: SQL | typeof visita.id = visita.id): SQL {
  return sql`exists (select 1 from ${agendaReserva} ar where ar.visita_id = ${visitaIdCol} and ar.profissional_id = ${profissionalId} and ar.ativo)`;
}
/** Condição SQL: a OS (coluna) tem visita com o profissional. */
export function osDoProfissionalSQL(profissionalId: string, osIdCol: SQL | typeof ordemServico.id = ordemServico.id): SQL {
  return sql`exists (select 1 from ${visita} v join ${agendaReserva} ar on ar.visita_id = v.id and ar.ativo where v.os_id = ${osIdCol} and ar.profissional_id = ${profissionalId})`;
}
/** Condição SQL: cliente atendido em alguma visita do profissional (acesso limitado ao necessário). */
export function clienteDoProfissionalSQL(profissionalId: string, clienteIdCol: SQL): SQL {
  return sql`exists (select 1 from ${ordemServico} o join ${visita} v on v.os_id = o.id join ${agendaReserva} ar on ar.visita_id = v.id and ar.ativo where o.cliente_id = ${clienteIdCol} and ar.profissional_id = ${profissionalId})`;
}

export async function participaDaVisita(dbx: DBOrTx, profissionalId: string, visitaId: string) {
  const r = await dbx.select({ x: sql`1` }).from(agendaReserva).where(and(eq(agendaReserva.visitaId, visitaId), eq(agendaReserva.profissionalId, profissionalId), eq(agendaReserva.ativo, true))).limit(1);
  return r.length > 0;
}
export async function participaDaOS(dbx: DBOrTx, profissionalId: string, osId: string) {
  const r = await dbx.select({ x: sql`1` }).from(visita).where(and(eq(visita.osId, osId), visitaDoProfissionalSQL(profissionalId))).limit(1);
  return r.length > 0;
}

/** Garante acesso à OS conforme escopo da permissão. */
export async function exigirAcessoOS(dbx: DBOrTx, ctx: Ctx, osId: string, perm: Permissao = "os.ver") {
  if (pode(ctx, perm, "empresa")) {
    const [o] = await dbx.select({ id: ordemServico.id }).from(ordemServico).where(and(eq(ordemServico.id, osId), eq(ordemServico.empresaId, ctx.empresaId)));
    if (!o) throw new ErroAcesso();
    return;
  }
  if (pode(ctx, perm, "proprio") && ctx.profissional && (await participaDaOS(dbx, ctx.profissional.id, osId))) return;
  throw new ErroAcesso();
}

export async function exigirAcessoVisita(dbx: DBOrTx, ctx: Ctx, visitaId: string, perm: Permissao) {
  if (pode(ctx, perm, "empresa")) {
    const [v] = await dbx.select({ id: visita.id }).from(visita).where(and(eq(visita.id, visitaId), eq(visita.empresaId, ctx.empresaId)));
    if (!v) throw new ErroAcesso();
    return;
  }
  if (pode(ctx, perm, "proprio") && ctx.profissional && (await participaDaVisita(dbx, ctx.profissional.id, visitaId))) return;
  throw new ErroAcesso();
}

export { exists };
