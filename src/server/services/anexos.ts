/** Anexos: metadados no banco, arquivo em armazenamento privado. Acesso herda a permissão do registro de origem. */
import { randomUUID } from "node:crypto";
import { qc } from "../db/sql";
import { and, eq, sql } from "drizzle-orm";
import type { DBOrTx } from "../db";
import { anexo, baixa, checklistResposta, checklistRespostaItem, obrigacao, pendencia, visitaExecucao, ferramenta, veiculo } from "../db/schema";
import { type Ctx, exigir, pode } from "../auth/contexto";
import { ErroAcesso, ErroNegocio } from "../erros";
import { auditar } from "./auditoria";
import { exigirAcessoOS, exigirAcessoVisita } from "./escopo";
import { podeChecklistVeiculo } from "./veiculos";

export const TIPOS_PERMITIDOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf" };
export const TAMANHO_MAX = 10 * 1024 * 1024;

export type EntidadeAnexo = "visita" | "visita_execucao" | "checklist_item" | "pendencia" | "baixa" | "obrigacao" | "ferramenta" | "veiculo" | "os";

/** Verifica acesso à entidade de origem para enviar (escrever=true) ou baixar. */
export async function exigirAcessoEntidade(dbx: DBOrTx, ctx: Ctx, tipo: string, id: string, escrever: boolean) {
  switch (tipo) {
    case "visita": return exigirAcessoVisita(dbx, ctx, id, escrever ? "visita.executar" : "os.ver");
    case "visita_execucao": {
      const [e] = await dbx.select({ v: visitaExecucao.visitaId }).from(visitaExecucao).where(eq(visitaExecucao.id, id));
      if (!e) throw new ErroAcesso();
      return exigirAcessoVisita(dbx, ctx, e.v, escrever ? "visita.executar" : "os.ver");
    }
    case "os": return exigirAcessoOS(dbx, ctx, id, escrever ? "os.gerenciar" : "os.ver");
    case "checklist_item": {
      const [r] = await dbx.select({ veiculoId: checklistResposta.veiculoId, profissionalId: checklistResposta.profissionalId, empresaId: checklistResposta.empresaId }).from(checklistRespostaItem).innerJoin(checklistResposta, eq(checklistResposta.id, checklistRespostaItem.respostaId)).where(eq(checklistRespostaItem.id, id));
      if (!r || r.empresaId !== ctx.empresaId) throw new ErroAcesso();
      if (r.veiculoId) { if (podeChecklistVeiculo(ctx, r.veiculoId) || pode(ctx, "veiculo.ver", "empresa")) return; throw new ErroAcesso(); }
      if (r.profissionalId === ctx.profissional?.id || pode(ctx, "ferramenta.ver", "empresa")) return;
      throw new ErroAcesso();
    }
    case "pendencia": {
      const [p] = await dbx.select().from(pendencia).where(and(eq(pendencia.id, id), eq(pendencia.empresaId, ctx.empresaId)));
      if (!p) throw new ErroAcesso();
      if (pode(ctx, "pendencia.ver", "empresa")) return;
      if (ctx.profissional && (p.profissionalId === ctx.profissional.id || p.abertaPor === ctx.usuarioId)) return;
      throw new ErroAcesso();
    }
    case "baixa": case "obrigacao": {
      // Técnico próprio: só o comprovante da própria despesa (diária/reembolso) lançada por ele.
      if (tipo === "obrigacao" && ctx.profissional?.vinculo === "proprio" && !pode(ctx, "financeiro.ver")) {
        const [o] = await dbx.select({ e: obrigacao.empresaId, prof: obrigacao.profissionalId, origem: obrigacao.origemTipo }).from(obrigacao).where(eq(obrigacao.id, id));
        if (o && o.e === ctx.empresaId && o.prof === ctx.profissional.id && o.origem === "despesa_tecnico") return;
        throw new ErroAcesso();
      }
      exigir(ctx, escrever ? "financeiro.baixa.registrar" : "financeiro.ver");
      const q = tipo === "baixa"
        ? dbx.select({ e: baixa.empresaId, restrita: sql<boolean>`(select c.restrita from categoria_financeira c join obrigacao o on o.categoria_id = c.id join parcela p on p.obrigacao_id = o.id where p.id = ${qc(baixa.parcelaId)})` }).from(baixa).where(eq(baixa.id, id))
        : dbx.select({ e: obrigacao.empresaId, restrita: sql<boolean>`(select c.restrita from categoria_financeira c where c.id = ${qc(obrigacao.categoriaId)})` }).from(obrigacao).where(eq(obrigacao.id, id));
      const [r] = await q;
      if (!r || r.e !== ctx.empresaId) throw new ErroAcesso();
      if (r.restrita && !pode(ctx, "financeiro.restrito.ver")) throw new ErroAcesso();
      return;
    }
    case "ferramenta": {
      const [f] = await dbx.select().from(ferramenta).where(and(eq(ferramenta.id, id), eq(ferramenta.empresaId, ctx.empresaId)));
      if (!f) throw new ErroAcesso();
      if (pode(ctx, "ferramenta.ver", "empresa") || f.custodianteProfissionalId === ctx.profissional?.id) return;
      throw new ErroAcesso();
    }
    case "veiculo": {
      const [v] = await dbx.select().from(veiculo).where(and(eq(veiculo.id, id), eq(veiculo.empresaId, ctx.empresaId)));
      if (!v) throw new ErroAcesso();
      if (pode(ctx, "veiculo.ver", "empresa") || podeChecklistVeiculo(ctx, id)) return;
      throw new ErroAcesso();
    }
    default: throw new ErroAcesso();
  }
}

export function validarArquivo(nome: string, mime: string, tamanho: number) {
  if (!TIPOS_PERMITIDOS[mime]) throw new ErroNegocio(`Tipo de arquivo não permitido (${mime || "desconhecido"}). Use JPG, PNG, WEBP, HEIC ou PDF.`);
  if (tamanho <= 0) throw new ErroNegocio("Arquivo vazio.");
  if (tamanho > TAMANHO_MAX) throw new ErroNegocio("Arquivo maior que 10 MB.");
  if (nome.length > 200) throw new ErroNegocio("Nome de arquivo muito longo.");
}

/** Registra metadados; o chamador grava o conteúdo no storage com a chave retornada. */
export async function registrarAnexo(tx: DBOrTx, ctx: Ctx, d: { entidadeTipo: EntidadeAnexo; entidadeId: string; categoria: string; nomeArquivo: string; mime: string; tamanhoBytes: number }) {
  validarArquivo(d.nomeArquivo, d.mime, d.tamanhoBytes);
  await exigirAcessoEntidade(tx, ctx, d.entidadeTipo, d.entidadeId, true);
  const chave = `${ctx.empresaId}/${d.entidadeTipo}/${d.entidadeId}/${randomUUID()}.${TIPOS_PERMITIDOS[d.mime]}`;
  const [a] = await tx.insert(anexo).values({ ...d, nomeArquivo: d.nomeArquivo.replace(/[^\w.\- ()À-ú]/g, "_"), empresaId: ctx.empresaId, chaveStorage: chave, enviadoPor: ctx.usuarioId }).returning();
  await auditar(tx, ctx, { acao: "anexo.enviado", entidadeTipo: d.entidadeTipo, entidadeId: d.entidadeId, depois: { anexoId: a.id, nome: a.nomeArquivo, mime: a.mime } });
  return a;
}

export async function obterAnexoAutorizado(dbx: DBOrTx, ctx: Ctx, id: string) {
  const [a] = await dbx.select().from(anexo).where(and(eq(anexo.id, id), eq(anexo.empresaId, ctx.empresaId)));
  if (!a) throw new ErroAcesso();
  await exigirAcessoEntidade(dbx, ctx, a.entidadeTipo, a.entidadeId, false);
  return a;
}

export async function listarAnexos(dbx: DBOrTx, ctx: Ctx, entidadeTipo: string, entidadeId: string) {
  await exigirAcessoEntidade(dbx, ctx, entidadeTipo, entidadeId, false);
  return dbx.select({ id: anexo.id, nomeArquivo: anexo.nomeArquivo, mime: anexo.mime, categoria: anexo.categoria, enviadoEm: anexo.enviadoEm }).from(anexo)
    .where(and(eq(anexo.empresaId, ctx.empresaId), eq(anexo.entidadeTipo, entidadeTipo), eq(anexo.entidadeId, entidadeId)));
}

