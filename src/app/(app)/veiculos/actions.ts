"use server";
import { executar, req, txt, int, moeda } from "@/server/acao";
import * as V from "@/server/services/veiculos";
import { registrarAnexo } from "@/server/services/anexos";
import { getStorage } from "@/server/storage";
import type { EstadoAcao } from "@/components/action-form";

const params = (fd: FormData) => Object.fromEntries(["oleo", "alinhamento", "rodizio"].map((t) => [t, { km: int(fd, `${t}_km`), dias: int(fd, `${t}_dias`) }]));
export async function acaoVeiculo(_: EstadoAcao, fd: FormData) {
  const id = txt(fd, "id");
  return executar(async (tx, ctx) => { await V.salvarVeiculo(tx, ctx, id, { identificacao: req(fd, "identificacao", "identificação"), placa: txt(fd, "placa"), modelo: txt(fd, "modelo"), ano: int(fd, "ano"), responsavelProfissionalId: txt(fd, "responsavelId"), parametrosManutencao: params(fd), versao: int(fd, "versao") ?? undefined }); return "Veículo salvo."; }, ["/veiculos", id ? `/veiculos/${id}` : "/veiculos"]);
}
export async function acaoVeiculoOp(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("veiculoId"));
  return executar(async (tx, ctx) => {
    const op = req(fd, "op");
    if (op === "odometro") { const corr = txt(fd, "motivo"); await V.registrarOdometro(tx, ctx, id, int(fd, "km") ?? -1, "manual", corr ? { motivo: corr } : null); return "Odômetro registrado."; }
    if (op === "manutencao") { await V.registrarManutencao(tx, ctx, { veiculoId: id, tipo: req(fd, "tipo"), data: req(fd, "data", "data"), km: int(fd, "km"), descricao: txt(fd, "descricao"), valorCentavos: moeda(fd, "valor"), vencimento: txt(fd, "vencimento") }); return "Manutenção registrada."; }
    if (op === "pneu") { await V.instalarPneu(tx, ctx, { veiculoId: id, identificacao: req(fd, "identificacao", "identificação"), marca: txt(fd, "marca"), modelo: txt(fd, "modelo"), posicao: req(fd, "posicao"), instaladoEm: req(fd, "data", "data"), kmInstalacao: int(fd, "km") }); return "Pneu instalado."; }
    if (op === "retirarPneu") { await V.retirarPneu(tx, ctx, req(fd, "pneuId"), { retiradoEm: req(fd, "data", "data"), kmRetirada: int(fd, "km"), motivo: req(fd, "motivo", "motivo") }); return "Retirada registrada."; }
    if (op === "designar") { await V.designarVeiculo(tx, ctx, req(fd, "profissionalId"), id, txt(fd, "motivo")); return "Veículo designado."; }
    return "—";
  }, [`/veiculos/${id}`, "/veiculos"]);
}
export async function acaoChecklistVeiculo(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("veiculoId"));
  return executar(async (tx, ctx) => {
    const itens = fd.getAll("itemId").map(String);
    const fotosPorItem = Object.fromEntries(itens.map((i) => [i, fd.getAll(`f_${i}`).filter((f): f is File => f instanceof File && f.size > 0)]));
    const r = await V.responderChecklistVeiculo(tx, ctx, id, (txt(fd, "tipo") ?? "veiculo_saida") as "veiculo_saida", int(fd, "km"),
      itens.map((i) => ({ itemId: i, resultado: (txt(fd, `r_${i}`) ?? "conforme") as "conforme", observacao: txt(fd, `o_${i}`), fotos: fotosPorItem[i].length })), txt(fd, "observacoes"), txt(fd, "_idem"), fd.get("forcar") === "1");
    const destino = txt(fd, "destino") === "inicio" ? "/" : `/veiculos/${id}`;
    if (r.reutilizado) return { msg: "Já existe checklist válido deste veículo hoje (reutilizado).", redirecionar: destino };
    for (const [itemId, files] of Object.entries(fotosPorItem)) {
      const riId = r.itensIds?.[itemId]; if (!riId) continue;
      for (const f of files) { const a = await registrarAnexo(tx, ctx, { entidadeTipo: "checklist_item", entidadeId: riId, categoria: "foto", nomeArquivo: f.name, mime: f.type, tamanhoBytes: f.size }); await getStorage().salvar(a.chaveStorage, Buffer.from(await f.arrayBuffer()), a.mime); }
    }
    return { msg: `Checklist registrado${r.pendencias.length ? ` com ${r.pendencias.length} irregularidade(s) enviada(s) para tratativa` : ""}. Check-in liberado.`, redirecionar: destino };
  }, [`/veiculos/${id}`, "/", "/checklist-hoje"]);
}
