"use server";
import { executar, txt, req } from "@/server/acao";
import { checkin, checkout, registrarParticipacao, salvarExecucao, solicitarExtra, solicitarMaterial } from "@/server/services/execucao";
import { solicitarRemarcacao } from "@/server/services/agenda";
import { informarMovimento } from "@/server/services/materiais";
import type { EstadoAcao } from "@/components/action-form";

const rv = (id: string) => [`/visitas/${id}`, "/"];
export async function acaoCheckin(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("visitaId"));
  return executar(async (tx, ctx) => { const r = await checkin(tx, ctx, id); return r.repetido ? "Check-in já registrado." : `Check-in registrado.${r.avisos.length ? " Atenção: " + r.avisos.join(" ") : ""}`; }, rv(id));
}
export async function acaoParticipacao(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("visitaId"));
  return executar(async (tx, ctx) => { const t = req(fd, "tipo") as "chegada"; await registrarParticipacao(tx, ctx, id, t, txt(fd, "observacao")); return t === "chegada" ? "Chegada registrada." : "Saída registrada."; }, rv(id));
}
export async function acaoExecucao(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("visitaId"));
  return executar(async (tx, ctx) => { await salvarExecucao(tx, ctx, id, { equipamentoId: txt(fd, "equipamentoId"), diagnostico: txt(fd, "diagnostico"), servicoRealizado: txt(fd, "servicoRealizado"), testeFuncionamento: (txt(fd, "teste") ?? "nao_testado") as "ok", resultado: txt(fd, "resultado") as "concluido" | null, observacoes: txt(fd, "observacoes") }); return "Ficha salva."; }, rv(id));
}
export async function acaoCheckout(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("visitaId"));
  return executar(async (tx, ctx) => { const r = await checkout(tx, ctx, id, { resultado: req(fd, "resultado", "resultado") as "concluida", motivo: txt(fd, "motivo"), comentario: txt(fd, "comentario"), pendenciaDescricao: txt(fd, "pendencia"), proximaAcao: txt(fd, "proximaAcao"), destinoMateriais: txt(fd, "destinoMateriais") }); return r.repetido ? "Atendimento já encerrado." : "Atendimento encerrado."; }, rv(id));
}
export async function acaoSolicitacao(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("visitaId"));
  return executar(async (tx, ctx) => {
    const tipo = req(fd, "tipo");
    if (tipo === "extra") { await solicitarExtra(tx, ctx, id, { tipo: (txt(fd, "itemTipo") ?? "servico") as "servico", descricao: req(fd, "descricao", "descrição"), quantidade: txt(fd, "quantidade") ?? "1", unidade: txt(fd, "unidade") ?? "un", justificativa: txt(fd, "justificativa") }); return "Extra enviado ao escritório para aprovação."; }
    if (tipo === "material") { await solicitarMaterial(tx, ctx, id, req(fd, "descricao", "descrição")); return "Necessidade de material registrada."; }
    await solicitarRemarcacao(tx, ctx, id, tipo === "retorno" ? "solicitacao_retorno" : "solicitacao_remarcacao", req(fd, "descricao", "descrição")); return "Solicitação enviada. O escritório decide a nova data.";
  }, rv(id));
}
export async function acaoInformarMaterial(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("visitaId"));
  return executar(async (tx, ctx) => { await informarMovimento(tx, ctx, { tipo: req(fd, "tipo") as "consumo", materialId: req(fd, "materialId", "material"), quantidade: req(fd, "quantidade", "quantidade"), osId: txt(fd, "osId"), visitaId: id, observacao: txt(fd, "observacao"), retalho: fd.get("retalho") === "on", chave: txt(fd, "_idem") }); return "Informado. Aguarda conferência do escritório."; }, rv(id));
}
