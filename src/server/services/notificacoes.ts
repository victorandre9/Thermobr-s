import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { qc } from "../db/sql";
import type { DBOrTx } from "../db";
import { notificacao, papel, papelPermissao, usuario, usuarioPapel, usuarioPermissao } from "../db/schema";
import type { Ctx } from "../auth/contexto";

export interface NovaNotificacao { tipo: string; chave: string; titulo: string; mensagem?: string | null; link?: string | null; prioridade?: string; vencimento?: string | null }

/** Cria ou agrupa (incrementa ocorrências) notificação aberta para o usuário e a mesma chave. */
export async function notificar(tx: DBOrTx, empresaId: string, usuarioId: string, n: NovaNotificacao) {
  await tx.execute(sql`
    insert into ${notificacao} (empresa_id, usuario_id, tipo, chave_agrupamento, titulo, mensagem, link, prioridade, vencimento)
    values (${empresaId}, ${usuarioId}, ${n.tipo}, ${n.chave}, ${n.titulo}, ${n.mensagem ?? null}, ${n.link ?? null}, ${n.prioridade ?? "media"}, ${n.vencimento ?? null})
    on conflict (usuario_id, chave_agrupamento) where encerrada_em is null
    do update set ocorrencias = ${notificacao}.ocorrencias + 1, lida_em = null, atualizado_em = now(), titulo = excluded.titulo, mensagem = excluded.mensagem`);
}

/** Usuários ativos da empresa que têm a permissão (via papel ativo ou concessão) com escopo empresa. */
export async function usuariosComPermissao(dbx: DBOrTx, empresaId: string, perm: string): Promise<string[]> {
  const r = await dbx.execute<{ id: string }>(sql`
    select u.id from ${usuario} u where u.empresa_id = ${empresaId} and u.ativo and (
      exists (select 1 from ${usuarioPapel} up join ${papel} p on p.id = up.papel_id and p.ativo join ${papelPermissao} pp on pp.papel_id = p.id
              where up.usuario_id = u.id and pp.permissao = ${perm} and pp.escopo = 'empresa')
      or exists (select 1 from ${usuarioPermissao} x where x.usuario_id = u.id and x.permissao = ${perm} and x.escopo = 'empresa'))`);
  return r.rows.map((x) => x.id);
}

/** Notifica responsável (se houver) ou todos com a permissão. Notificações seguem a permissão do registro de origem. */
export async function notificarPorPermissao(tx: DBOrTx, empresaId: string, perm: string, n: NovaNotificacao, responsavelId?: string | null) {
  const alvos = responsavelId ? [responsavelId] : await usuariosComPermissao(tx, empresaId, perm);
  for (const u of alvos) await notificar(tx, empresaId, u, n);
}

/** Registro de origem resolvido: encerra as notificações do problema. */
export async function encerrarNotificacoes(tx: DBOrTx, empresaId: string, chave: string) {
  await tx.update(notificacao).set({ encerradaEm: new Date() }).where(and(eq(notificacao.empresaId, empresaId), eq(notificacao.chaveAgrupamento, chave), isNull(notificacao.encerradaEm)));
}

export async function minhasNotificacoes(dbx: DBOrTx, ctx: Ctx, incluirEncerradas = false) {
  const conds = [eq(notificacao.usuarioId, ctx.usuarioId)];
  if (!incluirEncerradas) conds.push(isNull(notificacao.encerradaEm));
  return dbx.select().from(notificacao).where(and(...conds)).orderBy(sql`${qc(notificacao.lidaEm)} is not null`, desc(notificacao.atualizadoEm)).limit(100);
}

export async function contarNaoLidas(dbx: DBOrTx, ctx: Ctx) {
  const [{ n }] = await dbx.select({ n: sql<number>`count(*)::int` }).from(notificacao).where(and(eq(notificacao.usuarioId, ctx.usuarioId), isNull(notificacao.encerradaEm), isNull(notificacao.lidaEm)));
  return n;
}

/** Marcar como lida NÃO resolve a pendência de origem. */
export async function marcarLidas(tx: DBOrTx, ctx: Ctx, ids: string[]) {
  if (!ids.length) return;
  await tx.update(notificacao).set({ lidaEm: new Date() }).where(and(eq(notificacao.usuarioId, ctx.usuarioId), inArray(notificacao.id, ids)));
}
