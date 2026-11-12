"use server";
import { executar, txt, req, int, moeda, lista, bool } from "@/server/acao";
import { criarOS, adicionarItem, atualizarOS, aprovarComercialmente, cancelarOS, conferirOS, decidirItemExtra, definirValoresItem, type ItemOS } from "@/server/services/os";
import { agendarVisita, cancelarVisita, criarVisita } from "@/server/services/agenda";
import { gerarRecebivelOS } from "@/server/services/financeiro";
import { emitirRelatorio, registrarCiencia } from "@/server/services/relatorio-atendimento";
import { liberarItemProntidao } from "@/server/services/prontidao";
import { reservarParaOS, autorizarCustodiaRemanescente } from "@/server/services/materiais";
import { definirValorAutonomo, adicionarAcordoAutonomo, marcarCoberto } from "@/server/services/autonomos";
import { ErroNegocio } from "@/server/erros";
import { instanteSP, somarMeses } from "@/lib/datas";
import { dividirParcelas } from "@/lib/money";
import type { EstadoAcao } from "@/components/action-form";

const itemDe = (fd: FormData, p = ""): ItemOS | null => {
  const descricao = txt(fd, p + "descricao"); if (!descricao) return null;
  return { tipo: (txt(fd, p + "tipo") ?? "servico") as ItemOS["tipo"], descricao, materialId: txt(fd, p + "materialId"), quantidade: txt(fd, p + "quantidade") ?? "1", unidade: txt(fd, p + "unidade") ?? "un", precoUnitarioCentavos: moeda(fd, p + "preco", "preço"), custoUnitarioCentavos: moeda(fd, p + "custo", "custo"), incluidoContrato: bool(fd, p + "incluido") };
};

export async function acaoCriarOS(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => {
    const itens = [0, 1, 2, 3, 4].map((i) => itemDe(fd, `item${i}_`)).filter((x): x is ItemOS => !!x);
    const os = await criarOS(tx, ctx, { origem: req(fd, "origem", "origem") as "avulso", clienteId: req(fd, "clienteId", "cliente"), localId: txt(fd, "localId"), contatoId: txt(fd, "contatoId"), descricao: req(fd, "descricao", "descrição"), prioridade: txt(fd, "prioridade") ?? "normal", observacoes: txt(fd, "observacoes"), contratoId: txt(fd, "contratoId"), osOrigemId: txt(fd, "osOrigemId"), equipamentos: lista(fd, "equipamentos"), itens, aprovada: bool(fd, "aprovada") || undefined });
    const comp = txt(fd, "competencias"); const qtd = int(fd, "qtdProfissionais");
    if (comp || qtd) await atualizarOS(tx, ctx, os.id, { competenciasExigidas: comp ? comp.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) : [], qtdProfissionais: qtd ?? 1 });
    return { msg: `OS ${os.numero} criada.`, redirecionar: `/os/${os.id}` };
  }, ["/os"]);
}

export async function acaoAtualizarOS(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("osId"));
  return executar(async (tx, ctx) => {
    const comp = txt(fd, "competencias");
    await atualizarOS(tx, ctx, id, { descricao: txt(fd, "descricao") ?? undefined, prioridade: txt(fd, "prioridade") ?? undefined, observacoes: txt(fd, "observacoes"), situacaoMaterial: txt(fd, "situacaoMaterial") ?? undefined,
      responsavelResolucaoId: txt(fd, "responsavelResolucaoId"), proximaAcao: txt(fd, "proximaAcao"), proximaAcaoEm: txt(fd, "proximaAcaoEm"), motivoEtapa: txt(fd, "motivoEtapa"),
      competenciasExigidas: comp !== null ? comp.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) : [], qtdProfissionais: int(fd, "qtdProfissionais") ?? 1, versao: int(fd, "versao") ?? undefined });
    return "OS atualizada.";
  }, [`/os/${id}`]);
}

export async function acaoItem(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("osId"));
  return executar(async (tx, ctx) => { const it = itemDe(fd); if (!it) throw new ErroNegocio("Descreva o item."); await adicionarItem(tx, ctx, id, it); return "Item incluído."; }, [`/os/${id}`]);
}
export async function acaoValoresItem(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("osId"));
  return executar(async (tx, ctx) => { await definirValoresItem(tx, ctx, req(fd, "itemId"), { ...(fd.has("preco") ? { precoUnitarioCentavos: moeda(fd, "preco") } : {}), ...(fd.has("custo") ? { custoUnitarioCentavos: moeda(fd, "custo") } : {}) }, txt(fd, "motivo") ?? undefined); return "Valores atualizados."; }, [`/os/${id}`]);
}
export async function acaoExtra(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("osId"));
  return executar(async (tx, ctx) => { const aprovar = fd.get("decisao") === "aprovar"; await decidirItemExtra(tx, ctx, req(fd, "itemId"), aprovar, moeda(fd, "preco"), txt(fd, "motivo") ?? undefined); return aprovar ? "Extra aprovado." : "Extra recusado."; }, [`/os/${id}`]);
}
export async function acaoAprovarOS(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("osId"));
  return executar(async (tx, ctx) => { await aprovarComercialmente(tx, ctx, id); return "OS aprovada."; }, [`/os/${id}`]);
}
export async function acaoCancelarOS(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("osId"));
  return executar(async (tx, ctx) => { await cancelarOS(tx, ctx, id, req(fd, "motivo", "motivo")); return "OS cancelada."; }, [`/os/${id}`]);
}
export async function acaoConferirOS(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("osId"));
  return executar(async (tx, ctx) => { await conferirOS(tx, ctx, id, txt(fd, "observacao") ?? undefined, txt(fd, "excecao") ?? undefined); return "OS conferida e encerrada."; }, [`/os/${id}`]);
}
export async function acaoNovaVisita(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("osId"));
  return executar(async (tx, ctx) => {
    const dia = txt(fd, "dia"); const hi = txt(fd, "horaInicio"); const hf = txt(fd, "horaFim"); const equipe = lista(fd, "profissionais");
    const agendar = dia && hi && hf && equipe.length;
    await criarVisita(tx, ctx, id, { instrucoes: txt(fd, "instrucoes"), ...(agendar ? { inicio: instanteSP(dia!, hi!), fim: instanteSP(dia!, hf!), equipe: { profissionalIds: equipe, responsavelId: txt(fd, "responsavelId"), veiculoId: txt(fd, "veiculoId"), ferramentaIds: lista(fd, "ferramentas") } } : {}) });
    return agendar ? "Visita criada e agendada." : "Visita criada (sem agendamento).";
  }, [`/os/${id}`, "/agenda"]);
}
export async function acaoAgendar(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("osId"));
  return executar(async (tx, ctx) => {
    await agendarVisita(tx, ctx, req(fd, "visitaId"), instanteSP(req(fd, "dia", "dia"), req(fd, "horaInicio", "início")), instanteSP(req(fd, "dia"), req(fd, "horaFim", "fim")),
      { profissionalIds: lista(fd, "profissionais"), responsavelId: txt(fd, "responsavelId"), veiculoId: txt(fd, "veiculoId"), ferramentaIds: lista(fd, "ferramentas") }, txt(fd, "motivo"));
    return "Agenda atualizada.";
  }, [`/os/${id}`, "/agenda"]);
}
export async function acaoCancelarVisita(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("osId"));
  return executar(async (tx, ctx) => { await cancelarVisita(tx, ctx, req(fd, "visitaId"), req(fd, "motivo", "motivo")); return "Visita cancelada."; }, [`/os/${id}`]);
}
export async function acaoLiberarProntidao(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("osId"));
  return executar(async (tx, ctx) => { await liberarItemProntidao(tx, ctx, req(fd, "visitaId"), req(fd, "item"), req(fd, "justificativa", "justificativa")); return "Exceção registrada."; }, [`/os/${id}`]);
}
export async function acaoCobranca(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("osId"));
  return executar(async (tx, ctx) => {
    const total = moeda(fd, "total", "total") ?? 0; const n = int(fd, "parcelas") ?? 1; const venc = req(fd, "vencimento", "1º vencimento");
    const desconto = moeda(fd, "desconto") ?? 0;
    const valores = dividirParcelas(total - desconto, n);
    const ob = await gerarRecebivelOS(tx, ctx, id, { parcelas: valores.map((v, i) => ({ vencimento: somarMeses(venc, i), valorCentavos: v })), descontoCentavos: desconto, itemExtraId: txt(fd, "itemExtraId") });
    return { msg: "Conta a receber gerada.", redirecionar: `/financeiro/obrigacoes/${ob.id}` };
  }, [`/os/${id}`]);
}
export async function acaoReservarMaterial(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("osId"));
  return executar(async (tx, ctx) => { await reservarParaOS(tx, ctx, { osId: id, materialId: req(fd, "materialId"), quantidade: req(fd, "quantidade"), posicaoId: req(fd, "posicaoId") }); return "Material reservado."; }, [`/os/${id}`]);
}
export async function acaoCustodiaRemanescente(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("osId"));
  return executar(async (tx, ctx) => { await autorizarCustodiaRemanescente(tx, ctx, { osId: id, materialId: req(fd, "materialId"), quantidade: req(fd, "quantidade"), profissionalId: req(fd, "profissionalId", "custodiante"), justificativa: req(fd, "justificativa", "justificativa") }); return "Custódia remanescente autorizada."; }, [`/os/${id}`]);
}
export async function acaoAutonomo(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("osId"));
  return executar(async (tx, ctx) => {
    const op = fd.get("op");
    if (op === "coberto") { await marcarCoberto(tx, ctx, req(fd, "servicoId"), txt(fd, "cobertoPorId"), req(fd, "motivo", "motivo")); return "Marcado como coberto pelo acordo original."; }
    if (op === "adicional") { await adicionarAcordoAutonomo(tx, ctx, { osId: id, profissionalId: req(fd, "profissionalId"), base: req(fd, "base") as "visita", visitaId: txt(fd, "visitaId"), descricao: req(fd, "descricao", "descrição"), valorCentavos: moeda(fd, "valor", "valor") ?? 0, motivo: req(fd, "motivo", "justificativa") }); return "Acordo adicional registrado."; }
    await definirValorAutonomo(tx, ctx, req(fd, "servicoId"), moeda(fd, "valor", "valor") ?? 0, txt(fd, "descricao"), txt(fd, "motivo")); return "Valor combinado definido.";
  }, [`/os/${id}`]);
}
export async function acaoEmitirRelatorio(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("osId"));
  return executar(async (tx, ctx) => { const r = await emitirRelatorio(tx, ctx, { osId: id, visitaId: txt(fd, "visitaId"), anexosIds: lista(fd, "anexos") }); return `Relatório versão ${r.versao} emitido.`; }, [`/os/${id}`]);
}
export async function acaoCiencia(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("osId"));
  return executar(async (tx, ctx) => { await registrarCiencia(tx, ctx, req(fd, "relatorioId"), { situacao: req(fd, "situacao") as "registrada", nome: txt(fd, "nome"), observacao: txt(fd, "observacao") }); return "Ciência registrada."; }, [`/os/${id}`]);
}
