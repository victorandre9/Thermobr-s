"use server";
import { executar, req, txt, int, moedaReq } from "@/server/acao";
import { lancarDespesaTecnico, type TipoDespesa } from "@/server/services/despesas";
import { registrarAnexo } from "@/server/services/anexos";
import { getStorage } from "@/server/storage";
import { ErroNegocio } from "@/server/erros";
import type { EstadoAcao } from "@/components/action-form";

export async function acaoLancarDespesa(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => {
    const tipo = (txt(fd, "tipo") ?? "reembolso") as TipoDespesa;
    const fotos = fd.getAll("comprovante").filter((f): f is File => f instanceof File && f.size > 0);
    if (tipo === "reembolso" && fotos.length === 0) throw new ErroNegocio("Reembolso exige foto do comprovante (nota ou recibo).");
    const ob = await lancarDespesaTecnico(tx, ctx, { tipo, descricao: req(fd, "descricao", "descrição"), valorCentavos: moedaReq(fd, "valor", "valor"), data: req(fd, "data", "data"), osNumero: int(fd, "os"), chave: txt(fd, "_idem") });
    for (const f of fotos) {
      const a = await registrarAnexo(tx, ctx, { entidadeTipo: "obrigacao", entidadeId: ob.id, categoria: "comprovante", nomeArquivo: f.name, mime: f.type, tamanhoBytes: f.size });
      await getStorage().salvar(a.chaveStorage, Buffer.from(await f.arrayBuffer()), a.mime);
    }
    return "Despesa enviada para aprovação do gestor.";
  }, ["/minhas-despesas", "/financeiro/aprovacoes", "/"]);
}
