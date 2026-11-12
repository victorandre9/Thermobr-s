import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { qc } from "../db/sql";
import type { DBOrTx } from "../db";
import { materialPosicao, papel, papelPermissao, profissional, usuario, usuarioPapel, usuarioPermissao } from "../db/schema";
import { type Ctx, exigir, ehGestor } from "../auth/contexto";
import { PERMISSOES, SOMENTE_EMPRESA, type Escopo, type Permissao } from "../auth/permissoes";
import { hashSenha, validarForcaSenha } from "../auth/senha";
import { ErroAcesso, ErroNegocio } from "../erros";
import { auditar } from "./auditoria";
import { revogarTodasSessoes } from "./autenticacao";

export async function listarUsuarios(dbx: DBOrTx, ctx: Ctx) {
  exigir(ctx, "usuario.gerenciar");
  const us = await dbx.select({ id: usuario.id, nome: usuario.nome, email: usuario.email, ativo: usuario.ativo, demo: usuario.demo, ultimoLoginEm: usuario.ultimoLoginEm })
    .from(usuario).where(and(eq(usuario.empresaId, ctx.empresaId), sql`${qc(usuario.email)} not like '%@sistema.invalid'`)).orderBy(asc(usuario.nome));
  const ps = await dbx.select({ usuarioId: usuarioPapel.usuarioId, codigo: papel.codigo, nome: papel.nome }).from(usuarioPapel).innerJoin(papel, eq(papel.id, usuarioPapel.papelId)).where(eq(papel.empresaId, ctx.empresaId));
  const profs = await dbx.select().from(profissional).where(eq(profissional.empresaId, ctx.empresaId));
  return us.map((u) => ({ ...u, papeis: ps.filter((p) => p.usuarioId === u.id), profissional: profs.find((p) => p.usuarioId === u.id) ?? null }));
}

export async function listarPapeis(dbx: DBOrTx, ctx: Ctx) {
  exigir(ctx, "usuario.gerenciar");
  const ps = await dbx.select().from(papel).where(eq(papel.empresaId, ctx.empresaId)).orderBy(asc(papel.nome));
  const perms = ps.length ? await dbx.select().from(papelPermissao).where(inArray(papelPermissao.papelId, ps.map((p) => p.id))) : [];
  return ps.map((p) => ({ ...p, permissoes: perms.filter((x) => x.papelId === p.id) }));
}

export interface NovoUsuario {
  nome: string; email: string; senhaInicial: string; papeis: string[];
  profissional?: { vinculo: "autonomo" | "proprio"; funcao: string; telefone?: string | null } | null;
  profissionalExistenteId?: string | null;
}

export async function criarUsuario(tx: DBOrTx, ctx: Ctx, d: NovoUsuario) {
  exigir(ctx, "usuario.gerenciar");
  const f = validarForcaSenha(d.senhaInicial); if (f) throw new ErroNegocio(f, "senhaInicial");
  const [u] = await tx.insert(usuario).values({ empresaId: ctx.empresaId, nome: d.nome.trim(), email: d.email.trim().toLowerCase(), senhaHash: await hashSenha(d.senhaInicial), deveTrocarSenha: true }).returning();
  await definirPapeisInterno(tx, ctx, u.id, d.papeis);
  if (d.profissionalExistenteId) {
    const [p] = await tx.update(profissional).set({ usuarioId: u.id }).where(and(eq(profissional.id, d.profissionalExistenteId), eq(profissional.empresaId, ctx.empresaId))).returning();
    if (!p) throw new ErroNegocio("Profissional não encontrado.");
  } else if (d.profissional) {
    await criarProfissionalInterno(tx, ctx, { nome: d.nome, ...d.profissional, usuarioId: u.id });
  }
  await auditar(tx, ctx, { acao: "usuario.criado", entidadeTipo: "usuario", entidadeId: u.id, depois: { nome: u.nome, email: u.email, papeis: d.papeis } });
  return u;
}

async function definirPapeisInterno(tx: DBOrTx, ctx: Ctx, usuarioId: string, codigos: string[]) {
  const ps = codigos.length ? await tx.select().from(papel).where(and(eq(papel.empresaId, ctx.empresaId), inArray(papel.codigo, codigos))) : [];
  if (ps.length !== new Set(codigos).size) throw new ErroNegocio("Papel inválido.");
  await tx.delete(usuarioPapel).where(eq(usuarioPapel.usuarioId, usuarioId));
  if (ps.length) await tx.insert(usuarioPapel).values(ps.map((p) => ({ usuarioId, papelId: p.id, concedidoPor: ctx.usuarioId })));
}

/** Altera papéis de outro usuário. Ninguém altera os próprios papéis/permissões (sem autopromoção). */
export async function definirPapeis(tx: DBOrTx, ctx: Ctx, usuarioId: string, codigos: string[], motivo: string) {
  exigir(ctx, "usuario.gerenciar");
  if (usuarioId === ctx.usuarioId) throw new ErroAcesso("Você não pode alterar os próprios papéis ou permissões.");
  const [alvo] = await tx.select().from(usuario).where(and(eq(usuario.id, usuarioId), eq(usuario.empresaId, ctx.empresaId)));
  if (!alvo) throw new ErroNegocio("Usuário não encontrado.");
  const antes = await tx.select({ codigo: papel.codigo }).from(usuarioPapel).innerJoin(papel, eq(papel.id, usuarioPapel.papelId)).where(eq(usuarioPapel.usuarioId, usuarioId));
  await definirPapeisInterno(tx, ctx, usuarioId, codigos);
  await auditar(tx, ctx, { acao: "usuario.papeis_alterados", entidadeTipo: "usuario", entidadeId: usuarioId, motivo, antes: antes.map((a) => a.codigo), depois: codigos, sensivel: true });
}

export async function concederPermissao(tx: DBOrTx, ctx: Ctx, usuarioId: string, perm: Permissao, escopo: Escopo, motivo: string) {
  exigir(ctx, "usuario.gerenciar");
  if (usuarioId === ctx.usuarioId) throw new ErroAcesso("Você não pode conceder permissões a si mesmo.");
  if (!(perm in PERMISSOES)) throw new ErroNegocio("Permissão inválida.");
  if (SOMENTE_EMPRESA.includes(perm) && escopo !== "empresa") throw new ErroNegocio("Esta permissão só existe com escopo empresa.");
  const [alvo] = await tx.select().from(usuario).where(and(eq(usuario.id, usuarioId), eq(usuario.empresaId, ctx.empresaId)));
  if (!alvo) throw new ErroNegocio("Usuário não encontrado.");
  await tx.insert(usuarioPermissao).values({ usuarioId, permissao: perm, escopo, concedidoPor: ctx.usuarioId })
    .onConflictDoUpdate({ target: [usuarioPermissao.usuarioId, usuarioPermissao.permissao], set: { escopo, concedidoPor: ctx.usuarioId, concedidoEm: new Date() } });
  await auditar(tx, ctx, { acao: "usuario.permissao_concedida", entidadeTipo: "usuario", entidadeId: usuarioId, motivo, depois: { perm, escopo }, sensivel: true });
}

export async function revogarPermissao(tx: DBOrTx, ctx: Ctx, usuarioId: string, perm: string, motivo: string) {
  exigir(ctx, "usuario.gerenciar");
  if (usuarioId === ctx.usuarioId) throw new ErroAcesso("Você não pode alterar as próprias permissões.");
  await tx.delete(usuarioPermissao).where(and(eq(usuarioPermissao.usuarioId, usuarioId), eq(usuarioPermissao.permissao, perm)));
  await auditar(tx, ctx, { acao: "usuario.permissao_revogada", entidadeTipo: "usuario", entidadeId: usuarioId, motivo, antes: { perm }, sensivel: true });
}

export async function permissoesExtras(dbx: DBOrTx, ctx: Ctx, usuarioId: string) {
  exigir(ctx, "usuario.gerenciar");
  return dbx.select().from(usuarioPermissao).where(eq(usuarioPermissao.usuarioId, usuarioId));
}

/** Desativa: preserva histórico, revoga sessões. Profissional vinculado permanece no histórico. */
export async function definirAtivo(tx: DBOrTx, ctx: Ctx, usuarioId: string, ativo: boolean, motivo: string) {
  exigir(ctx, "usuario.gerenciar");
  if (usuarioId === ctx.usuarioId) throw new ErroAcesso("Você não pode desativar o próprio usuário.");
  const [u] = await tx.update(usuario).set({ ativo, desativadoEm: ativo ? null : new Date(), atualizadoEm: new Date() })
    .where(and(eq(usuario.id, usuarioId), eq(usuario.empresaId, ctx.empresaId))).returning();
  if (!u) throw new ErroNegocio("Usuário não encontrado.");
  if (!ativo) await revogarTodasSessoes(tx, usuarioId);
  await auditar(tx, ctx, { acao: ativo ? "usuario.reativado" : "usuario.desativado", entidadeTipo: "usuario", entidadeId: usuarioId, motivo, sensivel: true });
}

// ---------------------------------------------------------------------------
// Profissionais
// ---------------------------------------------------------------------------
async function criarProfissionalInterno(tx: DBOrTx, ctx: Ctx, d: { nome: string; vinculo: "autonomo" | "proprio"; funcao: string; telefone?: string | null; usuarioId?: string | null }) {
  const [p] = await tx.insert(profissional).values({ empresaId: ctx.empresaId, nome: d.nome.trim(), vinculo: d.vinculo, funcao: d.funcao, telefone: d.telefone ?? null, usuarioId: d.usuarioId ?? null }).returning();
  // posição de custódia de materiais do profissional
  await tx.insert(materialPosicao).values({ empresaId: ctx.empresaId, tipo: "profissional", nome: `Custódia — ${p.nome}`, profissionalId: p.id }).onConflictDoNothing();
  return p;
}

export async function criarProfissional(tx: DBOrTx, ctx: Ctx, d: { nome: string; vinculo: "autonomo" | "proprio"; funcao: string; telefone?: string | null }) {
  exigir(ctx, "profissional.gerenciar");
  const p = await criarProfissionalInterno(tx, ctx, d);
  await auditar(tx, ctx, { acao: "profissional.criado", entidadeTipo: "profissional", entidadeId: p.id, depois: p });
  return p;
}

export async function atualizarProfissional(tx: DBOrTx, ctx: Ctx, id: string, d: { nome?: string; vinculo?: "autonomo" | "proprio"; funcao?: string; telefone?: string | null; veiculoId?: string | null; ativo?: boolean; competencias?: string[]; regioes?: string[] }, motivo?: string) {
  exigir(ctx, "profissional.gerenciar");
  const [antes] = await tx.select().from(profissional).where(and(eq(profissional.id, id), eq(profissional.empresaId, ctx.empresaId)));
  if (!antes) throw new ErroNegocio("Profissional não encontrado.");
  if (d.vinculo && d.vinculo !== antes.vinculo && !ehGestor(ctx)) throw new ErroAcesso("Somente o gestor altera o vínculo profissional.");
  if (d.veiculoId && (d.vinculo ?? antes.vinculo) === "autonomo") throw new ErroNegocio("Técnico autônomo não recebe veículo da empresa designado.");
  if ((d.vinculo ?? antes.vinculo) === "autonomo" && antes.veiculoId) d.veiculoId = null;
  const [depois] = await tx.update(profissional).set(d).where(eq(profissional.id, id)).returning();
  await auditar(tx, ctx, { acao: "profissional.atualizado", entidadeTipo: "profissional", entidadeId: id, motivo, antes, depois });
  return depois;
}

export async function listarProfissionais(dbx: DBOrTx, ctx: Ctx, opts: { somenteAtivos?: boolean } = {}) {
  // listagem básica (nomes) é necessária para agenda e custódias; dados sensíveis não existem nesta tabela
  if (!ctx.grants.has("agenda.ver") && !ctx.grants.has("profissional.gerenciar") && !ctx.grants.has("ferramenta.ver")) throw new ErroAcesso();
  const conds = [eq(profissional.empresaId, ctx.empresaId)];
  if (opts.somenteAtivos) conds.push(eq(profissional.ativo, true));
  return dbx.select().from(profissional).where(and(...conds)).orderBy(asc(profissional.nome));
}

export async function contarGestores(dbx: DBOrTx, empresaId: string) {
  const [{ n }] = await dbx.select({ n: sql<number>`count(*)::int` }).from(usuarioPapel).innerJoin(papel, eq(papel.id, usuarioPapel.papelId)).innerJoin(usuario, eq(usuario.id, usuarioPapel.usuarioId))
    .where(and(eq(papel.empresaId, empresaId), eq(papel.codigo, "gestor"), eq(usuario.ativo, true)));
  return n;
}
