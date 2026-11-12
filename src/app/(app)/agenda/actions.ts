"use server";
import { executar, req } from "@/server/acao";
import { registrarIndisponibilidade, removerIndisponibilidade } from "@/server/services/agenda";
import { instanteSP } from "@/lib/datas";
import type { EstadoAcao } from "@/components/action-form";

export async function acaoIndisponibilidade(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => {
    await registrarIndisponibilidade(tx, ctx, req(fd, "profissionalId", "profissional"), instanteSP(req(fd, "diaInicio", "início"), req(fd, "horaInicio")), instanteSP(req(fd, "diaFim", "fim"), req(fd, "horaFim")), req(fd, "motivo", "motivo"));
    return "Indisponibilidade registrada.";
  }, ["/agenda"]);
}
export async function acaoRemoverIndisp(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => { await removerIndisponibilidade(tx, ctx, req(fd, "reservaId")); return "Removida."; }, ["/agenda"]);
}
