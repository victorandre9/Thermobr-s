import { and, eq } from "drizzle-orm";
import type { DBOrTx } from "../db";
import { papel, papelPermissao, profissional, usuario, usuarioPapel, usuarioPermissao } from "../db/schema";
import { ErroAcesso } from "../erros";
import type { Escopo, Permissao } from "./permissoes";

export interface Ctx {
  usuarioId: string;
  empresaId: string;
  nome: string;
  email: string;
  papeis: string[];
  grants: Map<string, Escopo>;
  profissional: { id: string; vinculo: "autonomo" | "proprio"; veiculoId: string | null; nome: string } | null;
}

export async function carregarCtx(dbx: DBOrTx, usuarioId: string): Promise<Ctx | null> {
  const [u] = await dbx.select().from(usuario).where(eq(usuario.id, usuarioId));
  if (!u || !u.ativo) return null;
  if (u.demo && process.env.APP_ENV === "production") return null; // contas demo nunca ativas em produção
  const rows = await dbx
    .select({ codigo: papel.codigo, permissao: papelPermissao.permissao, escopo: papelPermissao.escopo })
    .from(usuarioPapel)
    .innerJoin(papel, and(eq(papel.id, usuarioPapel.papelId), eq(papel.ativo, true)))
    .leftJoin(papelPermissao, eq(papelPermissao.papelId, papel.id))
    .where(eq(usuarioPapel.usuarioId, usuarioId));
  const extras = await dbx.select().from(usuarioPermissao).where(eq(usuarioPermissao.usuarioId, usuarioId));
  const grants = new Map<string, Escopo>();
  const add = (p: string | null, e: string | null) => {
    if (!p || !e) return;
    if (grants.get(p) === "empresa") return;
    grants.set(p, e as Escopo);
  };
  const papeis = new Set<string>();
  for (const r of rows) { papeis.add(r.codigo); add(r.permissao, r.escopo); }
  for (const x of extras) add(x.permissao, x.escopo);
  const [prof] = await dbx.select().from(profissional).where(and(eq(profissional.usuarioId, usuarioId), eq(profissional.ativo, true)));
  return {
    usuarioId: u.id, empresaId: u.empresaId, nome: u.nome, email: u.email, papeis: [...papeis], grants,
    profissional: prof ? { id: prof.id, vinculo: prof.vinculo as "autonomo" | "proprio", veiculoId: prof.veiculoId, nome: prof.nome } : null,
  };
}

/** true se tem a permissão no escopo pedido (empresa atende proprio). */
export function pode(ctx: Ctx, perm: Permissao, escopo: Escopo = "empresa"): boolean {
  const g = ctx.grants.get(perm);
  if (!g) return false;
  return escopo === "proprio" ? true : g === "empresa";
}
export function escopoDe(ctx: Ctx, perm: Permissao): Escopo | null {
  return ctx.grants.get(perm) ?? null;
}
export function exigir(ctx: Ctx, perm: Permissao, escopo: Escopo = "empresa"): void {
  if (!pode(ctx, perm, escopo)) throw new ErroAcesso();
}
export function ehGestor(ctx: Ctx): boolean {
  return ctx.papeis.includes("gestor");
}
export function ehAutonomo(ctx: Ctx): boolean {
  return ctx.profissional?.vinculo === "autonomo";
}
/** Exige vínculo com profissional (técnico). */
export function exigirProfissional(ctx: Ctx) {
  if (!ctx.profissional) throw new ErroAcesso("Seu usuário não está vinculado a um profissional.");
  return ctx.profissional;
}
