"use server";
import { executar, req, txt, lista, moeda } from "@/server/acao";
import { criarOSDoPedido, descartarPedido, resolverConferenciaPedido, reprocessarLog, testarIntegracao } from "@/server/services/pedidos";
import type { EstadoAcao } from "@/components/action-form";

export async function acaoOSDoPedido(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("pedidoId"));
  return executar(async (tx, ctx) => {
    const os = await criarOSDoPedido(tx, ctx, id, { clienteId: req(fd, "clienteId", "cliente"), localId: txt(fd, "localId"), descricao: req(fd, "descricao", "descrição"), prioridade: txt(fd, "prioridade") ?? "normal", equipamentos: lista(fd, "equipamentos"),
      itens: [{ tipo: "servico", descricao: req(fd, "itemDescricao", "serviço"), quantidade: txt(fd, "itemQtd") ?? "1", unidade: "un", precoUnitarioCentavos: moeda(fd, "itemPreco") }] });
    return { msg: `OS ${os.numero} criada a partir do pedido.`, redirecionar: `/os/${os.id}` };
  }, ["/pedidos"]);
}
export async function acaoConferenciaPedido(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("pedidoId"));
  return executar(async (tx, ctx) => { await resolverConferenciaPedido(tx, ctx, id, req(fd, "decisao", "decisão")); return "Conferência registrada."; }, [`/pedidos/${id}`]);
}
export async function acaoDescartarPedido(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("pedidoId"));
  return executar(async (tx, ctx) => { await descartarPedido(tx, ctx, id, req(fd, "motivo", "motivo")); return "Pedido descartado."; }, [`/pedidos/${id}`]);
}
export async function acaoTestarIntegracao() {
  return executar(async (tx, ctx) => { const r = await testarIntegracao(tx, ctx); return r.ok ? "Conexão validada." : `Não conectada: ${r.mensagem}`; }, ["/configuracoes/integracoes"]);
}
export async function acaoReprocessar(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => { const r = await reprocessarLog(tx, ctx, req(fd, "logId")); return `Reprocessado: ${r.resultado}.`; }, ["/configuracoes/integracoes"]);
}
