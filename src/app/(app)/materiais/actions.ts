"use server";
import { executar, req, txt, moeda, moedaReq, bool, int } from "@/server/acao";
import * as M from "@/server/services/materiais";
import { registrarEstoqueInicial } from "@/server/services/implantacao";
import { ErroNegocio } from "@/server/erros";
import type { EstadoAcao } from "@/components/action-form";

const R = ["/materiais", "/materiais/conferencia", "/materiais/divergencias", "/materiais/custodias", "/materiais/minha-custodia", "/"];
export async function acaoMaterial(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => { await M.salvarMaterial(tx, ctx, txt(fd, "id"), { codigo: req(fd, "codigo", "código"), nome: req(fd, "nome", "nome"), categoria: txt(fd, "categoria"), especificacao: txt(fd, "especificacao"), unidade: req(fd, "unidade", "unidade"), controlaRetalho: bool(fd, "retalho"), estoqueMinimo: txt(fd, "minimo"), custoReferenciaCentavos: moeda(fd, "custo"), versao: int(fd, "versao") ?? undefined }); return "Material salvo."; }, R);
}
export async function acaoMovMaterial(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => {
    const op = req(fd, "op"); const chave = txt(fd, "_idem");
    switch (op) {
      case "entrada": await M.registrarEntradaAvulsa(tx, ctx, { materialId: req(fd, "materialId", "material"), quantidade: req(fd, "quantidade", "quantidade"), destinoPosicaoId: req(fd, "posicaoId"), observacao: txt(fd, "observacao"), chave }); return "Entrada registrada.";
      case "inicial": await registrarEstoqueInicial(tx, ctx, { materialId: req(fd, "materialId", "material"), posicaoId: req(fd, "posicaoId"), quantidade: req(fd, "quantidade", "quantidade") }); return "Estoque inicial conferido registrado.";
      case "entrega": await M.registrarEntrega(tx, ctx, { materialId: req(fd, "materialId", "material"), quantidade: req(fd, "quantidade", "quantidade"), origemPosicaoId: req(fd, "posicaoId"), profissionalId: req(fd, "profissionalId", "profissional"), osId: txt(fd, "osId"), observacao: txt(fd, "observacao"), chave }); return "Entrega registrada. Aguarda confirmação do técnico.";
      case "confirmar": { const r = await M.confirmarRecebimento(tx, ctx, req(fd, "movimentoId")); return r.repetido ? "Já confirmado." : "Recebimento confirmado."; }
      case "recusar": await M.recusarRecebimento(tx, ctx, req(fd, "movimentoId"), req(fd, "motivo", "motivo")); return "Recusado; quantidade devolvida à origem.";
      case "conferir": { const r = await M.conferirMovimento(tx, ctx, req(fd, "movimentoId"), req(fd, "quantidade", "quantidade conferida"), { destinoPosicaoId: txt(fd, "posicaoId"), observacao: txt(fd, "observacao") }); return r.repetido ? "Já conferido." : "Conferência registrada."; }
      case "transferir": await M.solicitarTransferencia(tx, ctx, { materialId: req(fd, "materialId", "material"), quantidade: req(fd, "quantidade", "quantidade"), origemPosicaoId: req(fd, "origemId"), destinoPosicaoId: req(fd, "destinoId", "destino"), osId: txt(fd, "osId"), observacao: txt(fd, "observacao"), chave }); return "Transferência registrada. O destino confirma o recebimento.";
      case "contagem": { const r = await M.registrarContagem(tx, ctx, { materialId: req(fd, "materialId"), posicaoId: req(fd, "posicaoId"), quantidadeContada: req(fd, "quantidade", "quantidade contada"), observacao: txt(fd, "observacao") }); return r.divergenciaId ? "Contagem registrada com diferença: divergência aberta para investigação." : "Contagem confere com o saldo esperado."; }
      case "divergencia": await M.decidirDivergencia(tx, ctx, req(fd, "divergenciaId"), req(fd, "decisao") as "perda_aprovada", req(fd, "justificativa", "justificativa")); return "Decisão registrada.";
      case "segregado": await M.liberarSegregado(tx, ctx, { materialId: req(fd, "materialId"), quantidade: req(fd, "quantidade"), destino: req(fd, "destino") as "almoxarifado", observacao: req(fd, "observacao", "resultado da conferência") }); return "Segregado liberado.";
      case "informar": await M.informarMovimento(tx, ctx, { tipo: req(fd, "tipo") as "consumo", materialId: req(fd, "materialId", "material"), quantidade: req(fd, "quantidade", "quantidade"), osId: txt(fd, "osId"), observacao: txt(fd, "observacao"), retalho: bool(fd, "retalho"), chave }); return "Informado; aguarda conferência.";
    }
    throw new ErroNegocio("Operação inválida.");
  }, R);
}
export async function acaoCompra(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => {
    const itens = [0, 1, 2, 3].map((i) => ({ materialId: txt(fd, `m${i}`), quantidade: txt(fd, `q${i}`), custo: moeda(fd, `c${i}`, "custo") })).filter((x) => x.materialId && x.quantidade).map((x) => ({ materialId: x.materialId!, quantidade: x.quantidade!, custoUnitarioCentavos: x.custo ?? 0 }));
    await M.registrarCompra(tx, ctx, { fornecedorId: txt(fd, "fornecedorId"), osId: txt(fd, "osId"), data: req(fd, "data", "data"), documento: txt(fd, "documento"), itens, receberAgora: bool(fd, "receber"), gerarObrigacao: bool(fd, "obrigacao"), vencimento: txt(fd, "vencimento"), chave: txt(fd, "_idem") });
    void moedaReq;
    return "Compra registrada (uma única despesa vinculada; o recebimento físico não gera nova despesa).";
  }, [...R, "/materiais/compras"]);
}
