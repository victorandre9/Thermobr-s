"use server";
import { executar, req, txt, int, moeda, moedaReq, bool } from "@/server/acao";
import * as F from "@/server/services/financeiro";
import * as AU from "@/server/services/autonomos";
import { lancarObrigacaoLegado } from "@/server/services/implantacao";
import { registrarAnexo } from "@/server/services/anexos";
import { getStorage } from "@/server/storage";
import { dividirParcelas } from "@/lib/money";
import { somarMeses } from "@/lib/datas";
import type { EstadoAcao } from "@/components/action-form";

const R = ["/financeiro/receber", "/financeiro/pagar", "/financeiro/aprovacoes", "/financeiro/caixa", "/"];
export async function acaoNovaObrigacao(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => {
    const total = moedaReq(fd, "valor", "valor"); const desc = moeda(fd, "desconto") ?? 0; const n = int(fd, "parcelas") ?? 1; const venc = req(fd, "vencimento", "vencimento");
    const base = { natureza: req(fd, "natureza") as "pagar", categoriaId: req(fd, "categoriaId", "categoria"), clienteId: txt(fd, "clienteId"), fornecedorId: txt(fd, "fornecedorId"), profissionalId: txt(fd, "profissionalId"), beneficiarioNome: txt(fd, "beneficiario"), descricao: req(fd, "descricao", "descrição"), competencia: txt(fd, "competencia") ? txt(fd, "competencia") + "-01" : null, valorBrutoCentavos: total, descontoCentavos: desc, documento: txt(fd, "documento"), contaPrevistaId: txt(fd, "contaId"), parcelas: dividirParcelas(total - desc, n).map((v, i) => ({ vencimento: somarMeses(venc, i), valorCentavos: v })) };
    const ob = bool(fd, "legado") ? await lancarObrigacaoLegado(tx, ctx, { ...base, identificador: req(fd, "identificador", "identificador do documento antigo") }) : await F.criarObrigacao(tx, ctx, { ...base, origemTipo: "manual", chaveUnicidade: txt(fd, "_idem") ? `manual:${txt(fd, "_idem")}` : null });
    return { msg: "Lançamento registrado.", redirecionar: `/financeiro/obrigacoes/${ob.id}` };
  }, R);
}
export async function acaoObrigacao(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("obrigacaoId"));
  return executar(async (tx, ctx) => {
    const op = req(fd, "op");
    if (op === "aprovar" || op === "rejeitar") { const r = await F.decidirObrigacao(tx, ctx, id, op === "aprovar", txt(fd, "motivo")); return r.situacao === "aguardando_aprovacao" ? "Aprovação registrada. Falta o segundo aprovador (dupla aprovação)." : op === "aprovar" ? `Aprovado${r.autoaprovacao ? " (autoaprovação registrada)" : ""}.` : "Rejeitado."; }
    if (op === "cancelar") { await F.cancelarObrigacao(tx, ctx, id, req(fd, "motivo", "motivo")); return "Cancelado (histórico preservado)."; }
    if (op === "nf") { await F.anexarNotaFiscalRef(tx, ctx, id, req(fd, "ref", "referência")); return "Referência da nota registrada (nota emitida não significa recebimento)."; }
    if (op === "dataEsperada") { await F.definirDataEsperada(tx, ctx, req(fd, "parcelaId"), txt(fd, "data"), txt(fd, "motivo")); return "Data esperada atualizada."; }
    return "—";
  }, [...R, `/financeiro/obrigacoes/${id}`]);
}
export async function acaoBaixa(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("obrigacaoId"));
  return executar(async (tx, ctx) => {
    const arqs = fd.getAll("comprovante").filter((f): f is File => f instanceof File && f.size > 0);
    const excecao = bool(fd, "excecao") ? { justificativa: req(fd, "justificativa", "justificativa da exceção"), comprovanteAnexado: arqs.length > 0 } : null;
    const r = await F.registrarBaixa(tx, ctx, { parcelaId: req(fd, "parcelaId"), contaId: req(fd, "contaId", "conta"), valorCentavos: moedaReq(fd, "valor", "valor"), dataPagamento: req(fd, "data", "data"), forma: txt(fd, "forma"), motivo: txt(fd, "obs"), chave: txt(fd, "_idem"), excecao });
    if (!r.repetido) for (const f of arqs) { const a = await registrarAnexo(tx, ctx, { entidadeTipo: "baixa", entidadeId: r.baixa.id, categoria: "comprovante", nomeArquivo: f.name, mime: f.type, tamanhoBytes: f.size }); await getStorage().salvar(a.chaveStorage, Buffer.from(await f.arrayBuffer()), a.mime); }
    return r.repetido ? "Já registrado." : r.baixa.excecaoSemAprovacao ? "Pagamento registrado como EXCEÇÃO (entrou no caixa realizado); o gestor foi alertado para revisar." : r.baixa.status === "confirmada" ? "Registrado e confirmado." : "Registrado; aguarda conferência.";
  }, [...R, `/financeiro/obrigacoes/${id}`]);
}
export async function acaoDecidirBaixa(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => {
    const op = req(fd, "op");
    if (op === "estornar") { await F.estornarBaixa(tx, ctx, req(fd, "baixaId"), req(fd, "motivo", "motivo")); return "Estorno registrado (baixa original preservada)."; }
    if (op === "transf") { await F.decidirTransferencia(tx, ctx, req(fd, "transferenciaId"), fd.get("decisao") === "confirmar", txt(fd, "motivo") ?? undefined); return "Transferência decidida."; }
    await F.decidirBaixa(tx, ctx, req(fd, "baixaId"), op === "confirmar", txt(fd, "motivo")); return op === "confirmar" ? "Baixa confirmada." : "Baixa rejeitada.";
  }, [...R, `/financeiro/obrigacoes/${txt(fd, "obrigacaoId") ?? ""}`]);
}
export async function acaoConta(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => {
    const op = req(fd, "op");
    if (op === "nova") { await F.salvarConta(tx, ctx, null, { nome: req(fd, "nome", "nome"), tipo: txt(fd, "tipo") ?? "banco", ativo: true }); return "Conta criada (defina o saldo inicial)."; }
    if (op === "saldo") { await F.definirSaldoInicial(tx, ctx, req(fd, "contaId"), moedaReq(fd, "valor", "saldo"), req(fd, "data", "data"), txt(fd, "motivo") ?? ""); return "Saldo inicial registrado."; }
    if (op === "transf") { await F.registrarTransferencia(tx, ctx, { origemContaId: req(fd, "origem"), destinoContaId: req(fd, "destino"), valorCentavos: moedaReq(fd, "valor", "valor"), data: req(fd, "data"), descricao: txt(fd, "descricao"), chave: txt(fd, "_idem") }); return "Transferência registrada (não é receita nem despesa)."; }
    if (op === "mensalidades") { const r = await F.gerarMensalidades(tx, ctx, req(fd, "competencia") + "-01"); return `Mensalidades: ${r.geradas} gerada(s), ${r.existentes} já existiam${r.semValor.length ? `, sem valor: ${r.semValor.join(", ")}` : ""}.`; }
    return "—";
  }, R);
}
export async function acaoCobranca(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => { await F.registrarContatoCobranca(tx, ctx, { clienteId: req(fd, "clienteId"), obrigacaoId: txt(fd, "obrigacaoId"), canal: req(fd, "canal"), resumo: req(fd, "resumo", "resumo"), proximaAcao: txt(fd, "proximaAcao"), proximaAcaoEm: txt(fd, "proximaAcaoEm") }); return "Contato registrado."; }, ["/financeiro/cobranca", "/"]);
}
export async function acaoAutonomoFin(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => {
    const op = req(fd, "op");
    if (op === "conferir") { await AU.conferirServicoAutonomo(tx, ctx, req(fd, "servicoId")); return "Serviço conferido."; }
    if (op === "resumo") { const r = await AU.prepararResumoSemanal(tx, ctx, req(fd, "profissionalId", "profissional"), req(fd, "data", "semana")); return `Resumo preparado: líquido ${(r.liquidoCentavos / 100).toFixed(2).replace(".", ",")}.`; }
    if (op === "solicitar") { await AU.solicitarLiberacao(tx, ctx, req(fd, "resumoId")); return "Liberação solicitada ao gestor."; }
    if (op === "liberar") { await AU.liberarResumo(tx, ctx, req(fd, "resumoId")); return "Liberado: conta a pagar gerada."; }
    if (op === "adiantamento") { await AU.registrarAdiantamento(tx, ctx, { profissionalId: req(fd, "profissionalId"), valorCentavos: moedaReq(fd, "valor", "valor"), data: req(fd, "data"), descricao: txt(fd, "descricao") }); return "Adiantamento registrado (será abatido uma única vez)."; }
    return "—";
  }, ["/financeiro/autonomos", "/"]);
}
