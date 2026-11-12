"use server";
import { executar, lista } from "@/server/acao";
import { marcarLidas } from "@/server/services/notificacoes";
import type { EstadoAcao } from "@/components/action-form";
export async function acaoLer(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => { await marcarLidas(tx, ctx, lista(fd, "ids")); return "Marcadas como lidas (as pendências continuam abertas até serem resolvidas)."; }, ["/notificacoes", "/"]);
}
