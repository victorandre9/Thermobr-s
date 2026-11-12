"use server";
import { executar, req, txt, int, moeda, lista, bool } from "@/server/acao";
import { salvarCliente, salvarContato, salvarLocal, salvarEquipamento, salvarContrato } from "@/server/services/cadastros";
import type { EstadoAcao } from "@/components/action-form";

export async function acaoCliente(_: EstadoAcao, fd: FormData) {
  const id = txt(fd, "id");
  return executar(async (tx, ctx) => {
    const c = await salvarCliente(tx, ctx, id, { tipo: txt(fd, "tipo") ?? "PJ", nome: req(fd, "nome", "nome"), documento: txt(fd, "documento"), email: txt(fd, "email"), telefone: txt(fd, "telefone"), observacoes: txt(fd, "observacoes"), versao: int(fd, "versao") ?? undefined });
    return id ? "Cliente atualizado." : { msg: "Cliente cadastrado.", redirecionar: `/clientes/${c.id}` };
  }, ["/clientes", id ? `/clientes/${id}` : "/clientes"]);
}
export async function acaoContato(_: EstadoAcao, fd: FormData) {
  const cid = String(fd.get("clienteId"));
  return executar(async (tx, ctx) => { await salvarContato(tx, ctx, cid, null, { nome: req(fd, "nome", "nome"), telefone: txt(fd, "telefone"), email: txt(fd, "email"), cargo: txt(fd, "cargo"), principal: bool(fd, "principal") }); return "Contato incluído."; }, [`/clientes/${cid}`]);
}
export async function acaoLocal(_: EstadoAcao, fd: FormData) {
  const cid = String(fd.get("clienteId"));
  return executar(async (tx, ctx) => { await salvarLocal(tx, ctx, cid, null, { nome: req(fd, "nome", "nome"), logradouro: txt(fd, "logradouro"), numero: txt(fd, "numero"), complemento: txt(fd, "complemento"), bairro: txt(fd, "bairro"), cidade: txt(fd, "cidade"), uf: txt(fd, "uf"), cep: txt(fd, "cep"), instrucoesAcesso: txt(fd, "instrucoesAcesso") }); return "Local incluído."; }, [`/clientes/${cid}`]);
}
export async function acaoEquipamento(_: EstadoAcao, fd: FormData) {
  const cid = String(fd.get("clienteId"));
  return executar(async (tx, ctx) => { await salvarEquipamento(tx, ctx, cid, null, { tipo: req(fd, "tipo", "tipo"), localId: txt(fd, "localId"), marca: txt(fd, "marca"), modelo: txt(fd, "modelo"), capacidadeBtu: int(fd, "capacidadeBtu"), numeroSerie: txt(fd, "numeroSerie"), identificacao: txt(fd, "identificacao") }); return "Equipamento incluído."; }, [`/clientes/${cid}`]);
}
export async function acaoContrato(_: EstadoAcao, fd: FormData) {
  const id = txt(fd, "id");
  return executar(async (tx, ctx) => {
    await salvarContrato(tx, ctx, id, { clienteId: req(fd, "clienteId", "cliente"), numero: req(fd, "numero", "número"), descricao: txt(fd, "descricao"), cobertura: txt(fd, "cobertura"), valorMensalCentavos: moeda(fd, "valor"), inicio: req(fd, "inicio", "início"), fim: txt(fd, "fim"), diaVencimento: int(fd, "diaVencimento") ?? 10, visitasIncluidasMes: int(fd, "visitas"), status: txt(fd, "status") ?? "ativo", locais: lista(fd, "locais"), versao: int(fd, "versao") ?? undefined });
    return "Contrato salvo.";
  }, ["/contratos"]);
}
