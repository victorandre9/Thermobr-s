"use server";
import { executar, req, txt } from "@/server/acao";
import * as F from "@/server/services/ferramentas";
import { custodiaInicialFerramenta } from "@/server/services/implantacao";
import type { EstadoAcao } from "@/components/action-form";

const R = ["/ferramentas", "/"];
export async function acaoFerramenta(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => { await F.salvarFerramenta(tx, ctx, txt(fd, "id"), { codigo: req(fd, "codigo", "código"), nome: req(fd, "nome", "nome"), descricao: txt(fd, "descricao"), tipo: txt(fd, "tipo") ?? "ferramenta", conjuntoId: txt(fd, "conjuntoId") }); return "Ferramenta salva."; }, R);
}
export async function acaoMovFerramenta(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("ferramentaId") ?? "");
  return executar(async (tx, ctx) => {
    const op = req(fd, "op");
    switch (op) {
      case "entregar": await F.entregarFerramenta(tx, ctx, id, { profissionalId: req(fd, "profissionalId", "profissional"), osId: txt(fd, "osId"), observacao: txt(fd, "observacao"), chave: txt(fd, "_idem") }); return "Entrega registrada. Aguarda confirmação do recebedor.";
      case "confirmar": await F.confirmarFerramenta(tx, ctx, req(fd, "movimentoId"), txt(fd, "condicao"), txt(fd, "observacao")); return "Recebimento confirmado.";
      case "recusar": await F.recusarFerramenta(tx, ctx, req(fd, "movimentoId"), req(fd, "motivo", "motivo")); return "Recebimento recusado.";
      case "devolver": await F.solicitarDevolucao(tx, ctx, id, txt(fd, "condicao") ?? "boa", txt(fd, "observacao")); return "Devolução solicitada. Aguarda conferência.";
      case "conferir": await F.conferirDevolucao(tx, ctx, req(fd, "movimentoId"), txt(fd, "condicao") ?? "boa", txt(fd, "observacao")); return "Devolução conferida.";
      case "transferir": await F.transferirFerramenta(tx, ctx, id, req(fd, "profissionalId", "novo responsável"), txt(fd, "observacao")); return "Transferência solicitada. O novo responsável precisa confirmar.";
      case "ocorrencia": await F.registrarOcorrenciaFerramenta(tx, ctx, id, req(fd, "tipo") as "falta", req(fd, "descricao", "descrição")); return "Ocorrência registrada.";
      case "localizada": await F.localizarFerramenta(tx, ctx, id, req(fd, "observacao", "observação")); return "Ferramenta localizada.";
      case "inicial": await custodiaInicialFerramenta(tx, ctx, id, req(fd, "profissionalId", "profissional")); return "Custódia inicial registrada.";
    }
    return "—";
  }, [...R, `/ferramentas/${id}`]);
}
export async function acaoChecklistFerr(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => {
    const ids = fd.getAll("fid").map(String);
    const r = await F.responderChecklistFerramentas(tx, ctx, (txt(fd, "tipo") ?? "ferramentas_saida") as "ferramentas_saida", ids.map((f) => ({ ferramentaId: f, resultado: (txt(fd, `r_${f}`) ?? "conforme") as "conforme", observacao: txt(fd, `o_${f}`) })), txt(fd, "_idem"));
    return r.reutilizado ? "Já existe conferência válida deste kit no turno (reutilizada)." : "Conferência registrada.";
  }, R);
}
