"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { autenticar, redefinirComToken, revogarSessao } from "@/server/services/autenticacao";
import { definirCookieSessao, limparCookieSessao, tokenAtual } from "@/server/auth/sessao";
import { ErroNegocio } from "@/server/erros";
import type { EstadoAcao } from "@/components/action-form";

export async function entrar(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const email = String(fd.get("email") ?? ""); const senha = String(fd.get("senha") ?? "");
  if (!email || !senha) return { ok: false, erro: "Informe e-mail e senha." };
  let destino = "/";
  try {
    const r = await autenticar(db, email, senha, (await headers()).get("user-agent"));
    await definirCookieSessao(r.token, r.expira);
    if (r.deveTrocarSenha) destino = "/conta?trocar=1";
  } catch (e) {
    if (e instanceof ErroNegocio) return { ok: false, erro: e.message };
    console.error("[login]", (e as Error).message);
    return { ok: false, erro: "Não foi possível entrar agora. Verifique a conexão e tente novamente." };
  }
  redirect(destino);
}

export async function sair() {
  const t = await tokenAtual();
  if (t) await revogarSessao(db, t);
  await limparCookieSessao();
  redirect("/login");
}

export async function redefinir(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const token = String(fd.get("token") ?? ""); const s1 = String(fd.get("senha") ?? ""); const s2 = String(fd.get("senha2") ?? "");
  if (s1 !== s2) return { ok: false, erro: "As senhas não conferem." };
  try { await redefinirComToken(db, token, s1); }
  catch (e) { return { ok: false, erro: e instanceof ErroNegocio ? e.message : "Não foi possível redefinir." }; }
  return { ok: true, msg: "Senha redefinida. Faça login.", redirecionar: "/login" };
}
