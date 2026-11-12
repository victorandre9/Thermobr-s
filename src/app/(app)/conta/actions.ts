"use server";
import { executar, req } from "@/server/acao";
import { trocarSenha } from "@/server/services/autenticacao";
import { ErroNegocio } from "@/server/erros";
import type { EstadoAcao } from "@/components/action-form";
export async function acaoTrocarSenha(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => { if (fd.get("nova") !== fd.get("nova2")) throw new ErroNegocio("As senhas não conferem."); await trocarSenha(tx, ctx.usuarioId, req(fd, "atual", "senha atual"), req(fd, "nova", "nova senha")); return "Senha alterada."; });
}
