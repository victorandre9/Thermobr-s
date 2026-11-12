import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "../db";
import { carregarCtx, type Ctx } from "./contexto";
import { validarSessao } from "../services/autenticacao";

export const COOKIE = "tb_sessao";

export async function definirCookieSessao(token: string, expira: Date) {
  const c = await cookies();
  c.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expira });
}
export async function limparCookieSessao() {
  (await cookies()).delete(COOKIE);
}
export async function tokenAtual() {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

/** Contexto do usuário logado (memoizado por requisição). */
export const obterCtx = cache(async (): Promise<Ctx | null> => {
  const token = await tokenAtual();
  if (!token) return null;
  const s = await validarSessao(db, token);
  if (!s) return null;
  return carregarCtx(db, s.usuarioId);
});

export async function exigirCtx(): Promise<Ctx> {
  const ctx = await obterCtx();
  if (!ctx) redirect("/login");
  return ctx;
}

/** Proteção CSRF para route handlers que mudam estado (server actions já verificam Origin). */
export async function verificarOrigem() {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (origin && host && new URL(origin).host !== host) throw new Error("Origem inválida");
}
