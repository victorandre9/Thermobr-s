"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { exigirCtx } from "@/server/auth/sessao";
import { visoesDisponiveis, type Visao } from "@/server/services/inicio";

/** Lembra a visão inicial preferida (só entre as visões que o usuário já possui). */
export async function escolherVisao(fd: FormData) {
  const ctx = await exigirCtx();
  const v = String(fd.get("visao")) as Visao;
  if (visoesDisponiveis(ctx).includes(v)) (await cookies()).set("tb_visao", v, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/");
}
