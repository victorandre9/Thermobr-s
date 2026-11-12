"use server";
import { executar, req, txt } from "@/server/acao";
import { atribuirPendencia, resolverPendencia } from "@/server/services/pendencias";
import type { EstadoAcao } from "@/components/action-form";

export async function acaoAtribuir(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("id"));
  return executar(async (tx, ctx) => { await atribuirPendencia(tx, ctx, id, { responsavelId: txt(fd, "responsavelId"), prazo: txt(fd, "prazo"), prioridade: txt(fd, "prioridade") ?? undefined, proximaAcao: txt(fd, "proximaAcao"), aguardandoTerceiro: txt(fd, "aguardandoTerceiro"), liberacaoExcepcional: txt(fd, "liberacao") }); return "Pendência atualizada."; }, [`/pendencias/${id}`, "/pendencias", "/"]);
}
export async function acaoResolver(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("id"));
  return executar(async (tx, ctx) => { await resolverPendencia(tx, ctx, id, req(fd, "resolucao", "resolução"), fd.get("cancelar") ? "cancelada" : "resolvida"); return "Pendência encerrada."; }, [`/pendencias/${id}`, "/pendencias", "/"]);
}
