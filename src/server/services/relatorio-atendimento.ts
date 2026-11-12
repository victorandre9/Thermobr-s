/**
 * Relatório de atendimento (visita ou OS) para envio manual ao cliente.
 * O conteúdo é montado por LISTA EXPLÍCITA de campos permitidos (CAMPOS_EXTERNOS): nunca inclui remuneração de autônomos,
 * custos, preços, observações internas ou dados financeiros. Cada emissão gera nova versão com snapshot imutável.
 * "Ciência" registra nome/data/observação de quem acompanhou — não é assinatura digital certificada nem aprovação do cliente.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { DBOrTx } from "../db";
import { anexo, agendaReserva, cliente, clienteLocal, empresa, equipamento, ordemServico, osEquipamento, profissional, relatorioAtendimento, usuario, visita, visitaExecucao, visitaParticipacao } from "../db/schema";
import { type Ctx, exigir } from "../auth/contexto";
import { ErroAcesso, ErroNegocio } from "../erros";
import { auditar } from "./auditoria";
import { exigirAcessoOS } from "./escopo";
import { MOTIVOS_RESULTADO, TESTE_FUNCIONAMENTO, VISITA_RESULTADOS, rotulo } from "@/lib/dominio";

/** Campos permitidos no documento externo (referência de auditoria). */
export const CAMPOS_EXTERNOS = ["empresa.nome", "os.numero", "visita.sequencia", "cliente.nome", "local.endereco", "equipamentos[tipo,marca,modelo,identificacao,numeroSerie]",
  "visitas[data,inicio,fim,profissionais.nome,resultado,motivo,pendencia,proximaAcao]", "execucoes[equipamento,diagnostico,servicoRealizado,teste,resultado]", "evidencias(fotos selecionadas)"] as const;

export interface ConteudoExterno {
  empresa: string; osNumero: number; escopo: "visita" | "os"; visitaSequencia: number | null; cliente: string; local: string | null;
  equipamentos: Array<{ id: string; descricao: string; numeroSerie: string | null }>;
  visitas: Array<{ sequencia: number; inicio: string | null; fim: string | null; profissionais: string[]; resultado: string; motivo: string | null; pendencia: string | null; proximaAcao: string | null;
    execucoes: Array<{ equipamento: string; diagnostico: string | null; servicoRealizado: string | null; teste: string; resultado: string | null }> }>;
}

async function montarConteudo(dbx: DBOrTx, ctx: Ctx, osId: string, visitaId: string | null): Promise<ConteudoExterno> {
  const [o] = await dbx.select().from(ordemServico).where(eq(ordemServico.id, osId));
  const [emp] = await dbx.select({ nome: empresa.nome }).from(empresa).where(eq(empresa.id, ctx.empresaId));
  const [cli] = await dbx.select({ nome: cliente.nome }).from(cliente).where(eq(cliente.id, o.clienteId));
  const [loc] = o.localId ? await dbx.select().from(clienteLocal).where(eq(clienteLocal.id, o.localId)) : [null];
  const eqs = (await dbx.select({ e: equipamento }).from(osEquipamento).innerJoin(equipamento, eq(equipamento.id, osEquipamento.equipamentoId)).where(eq(osEquipamento.osId, osId))).map((x) => x.e);
  const descEq = (e: typeof eqs[number]) => [e.identificacao, e.tipo, e.marca, e.modelo].filter(Boolean).join(" · ");
  const vs = await dbx.select().from(visita).where(and(eq(visita.osId, osId), visitaId ? eq(visita.id, visitaId) : eq(visita.situacao, "finalizada"))).orderBy(asc(visita.sequencia));
  if (visitaId && (!vs.length || vs[0].situacao !== "finalizada")) throw new ErroNegocio("O relatório da visita só pode ser emitido após o encerramento do atendimento.");
  if (!vs.length) throw new ErroNegocio("A OS ainda não tem visitas finalizadas.");
  const visitas = [];
  for (const v of vs) {
    const part = await dbx.select({ nome: profissional.nome }).from(visitaParticipacao).innerJoin(profissional, eq(profissional.id, visitaParticipacao.profissionalId)).where(eq(visitaParticipacao.visitaId, v.id));
    const equipe = part.length ? part : await dbx.select({ nome: profissional.nome }).from(agendaReserva).innerJoin(profissional, eq(profissional.id, agendaReserva.profissionalId)).where(and(eq(agendaReserva.visitaId, v.id), eq(agendaReserva.ativo, true)));
    const ex = await dbx.select().from(visitaExecucao).where(eq(visitaExecucao.visitaId, v.id));
    visitas.push({ sequencia: v.sequencia, inicio: v.checkinEm?.toISOString() ?? null, fim: v.checkoutEm?.toISOString() ?? null, profissionais: [...new Set(equipe.map((e) => e.nome))],
      resultado: rotulo(VISITA_RESULTADOS, v.resultado), motivo: v.motivoResultado ? rotulo(MOTIVOS_RESULTADO, v.motivoResultado) : null, pendencia: v.pendenciaDescricao, proximaAcao: v.proximaAcao,
      execucoes: ex.map((x) => { const e = eqs.find((q) => q.id === x.equipamentoId); return { equipamento: e ? descEq(e) : "Geral", diagnostico: x.diagnostico, servicoRealizado: x.servicoRealizado, teste: rotulo(TESTE_FUNCIONAMENTO, x.testeFuncionamento), resultado: x.resultado }; }) });
  }
  return { empresa: emp.nome, osNumero: o.numero, escopo: visitaId ? "visita" : "os", visitaSequencia: visitaId ? vs[0].sequencia : null, cliente: cli.nome,
    local: loc ? [loc.nome, [loc.logradouro, loc.numero].filter(Boolean).join(", "), loc.bairro, loc.cidade && `${loc.cidade}${loc.uf ? "/" + loc.uf : ""}`].filter(Boolean).join(" — ") : null,
    equipamentos: eqs.map((e) => ({ id: e.id, descricao: descEq(e), numeroSerie: e.numeroSerie })), visitas };
}

/** Fotos elegíveis como evidência (somente imagens da visita/execuções). */
export async function evidenciasDisponiveis(dbx: DBOrTx, ctx: Ctx, osId: string, visitaId: string | null) {
  await exigirAcessoOS(dbx, ctx, osId);
  const vids = visitaId ? [visitaId] : (await dbx.select({ id: visita.id }).from(visita).where(eq(visita.osId, osId))).map((v) => v.id);
  if (!vids.length) return [];
  return dbx.select({ id: anexo.id, nomeArquivo: anexo.nomeArquivo, entidadeTipo: anexo.entidadeTipo }).from(anexo)
    .where(and(eq(anexo.empresaId, ctx.empresaId), sql`${anexo.mime} like 'image/%'`, sql`((${anexo.entidadeTipo} = 'visita' and ${anexo.entidadeId} in ${vids}) or (${anexo.entidadeTipo} = 'visita_execucao' and ${anexo.entidadeId} in (select id from visita_execucao where visita_id in ${vids})))`));
}

export async function emitirRelatorio(tx: DBOrTx, ctx: Ctx, d: { osId: string; visitaId?: string | null; anexosIds: string[] }) {
  exigir(ctx, "os.conferir");
  await exigirAcessoOS(tx, ctx, d.osId);
  if (d.visitaId) { const [v] = await tx.select().from(visita).where(and(eq(visita.id, d.visitaId), eq(visita.osId, d.osId))); if (!v) throw new ErroAcesso(); }
  const conteudo = await montarConteudo(tx, ctx, d.osId, d.visitaId ?? null);
  const permitidos = new Set((await evidenciasDisponiveis(tx, ctx, d.osId, d.visitaId ?? null)).map((a) => a.id));
  if (d.anexosIds.some((a) => !permitidos.has(a))) throw new ErroNegocio("Evidência inválida para este relatório.");
  const escopo = d.visitaId ? "visita" : "os";
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"relatorio:" + d.osId}))`);
  const [{ v }] = await tx.select({ v: sql<number>`coalesce(max(${relatorioAtendimento.versao}),0)::int + 1` }).from(relatorioAtendimento)
    .where(and(eq(relatorioAtendimento.osId, d.osId), eq(relatorioAtendimento.escopo, escopo), d.visitaId ? eq(relatorioAtendimento.visitaId, d.visitaId) : sql`${relatorioAtendimento.visitaId} is null`));
  const [r] = await tx.insert(relatorioAtendimento).values({ empresaId: ctx.empresaId, escopo, osId: d.osId, visitaId: d.visitaId ?? null, versao: v, conteudo: conteudo as unknown as Record<string, unknown>, anexosIds: d.anexosIds, emitidoPor: ctx.usuarioId }).returning();
  await auditar(tx, ctx, { acao: "relatorio_atendimento.emitido", entidadeTipo: "os", entidadeId: d.osId, depois: { relatorioId: r.id, escopo, versao: v } });
  return r;
}

export async function registrarCiencia(tx: DBOrTx, ctx: Ctx, relatorioId: string, d: { situacao: "registrada" | "ausente" | "recusada"; nome?: string | null; observacao?: string | null }) {
  const [r] = await tx.select().from(relatorioAtendimento).where(and(eq(relatorioAtendimento.id, relatorioId), eq(relatorioAtendimento.empresaId, ctx.empresaId)));
  if (!r) throw new ErroAcesso();
  await exigirAcessoOS(tx, ctx, r.osId);
  if (!ctx.grants.has("os.conferir") && !ctx.grants.has("visita.executar")) throw new ErroAcesso();
  if (d.situacao === "registrada" && !d.nome?.trim()) throw new ErroNegocio("Informe o nome de quem tomou ciência.");
  if (d.situacao !== "registrada" && !d.observacao?.trim()) throw new ErroNegocio("Descreva a ausência/recusa.");
  if (r.cienciaSituacao !== "pendente") throw new ErroNegocio("Ciência já registrada para esta versão. Emita nova versão se necessário.");
  await tx.update(relatorioAtendimento).set({ cienciaSituacao: d.situacao, cienciaNome: d.nome ?? null, cienciaObservacao: d.observacao ?? null, cienciaEm: new Date(), cienciaRegistradaPor: ctx.usuarioId }).where(eq(relatorioAtendimento.id, relatorioId));
  await auditar(tx, ctx, { acao: `relatorio_atendimento.ciencia_${d.situacao}`, entidadeTipo: "os", entidadeId: r.osId, depois: { relatorioId, nome: d.nome } });
}

export async function listarRelatoriosOS(dbx: DBOrTx, ctx: Ctx, osId: string) {
  await exigirAcessoOS(dbx, ctx, osId);
  return dbx.select({ r: relatorioAtendimento, emitidoPorNome: usuario.nome }).from(relatorioAtendimento).innerJoin(usuario, eq(usuario.id, relatorioAtendimento.emitidoPor))
    .where(eq(relatorioAtendimento.osId, osId)).orderBy(desc(relatorioAtendimento.emitidoEm));
}

export async function obterRelatorio(dbx: DBOrTx, ctx: Ctx, id: string) {
  const [r] = await dbx.select({ r: relatorioAtendimento, emitidoPorNome: usuario.nome }).from(relatorioAtendimento).innerJoin(usuario, eq(usuario.id, relatorioAtendimento.emitidoPor))
    .where(and(eq(relatorioAtendimento.id, id), eq(relatorioAtendimento.empresaId, ctx.empresaId)));
  if (!r) throw new ErroAcesso();
  await exigirAcessoOS(dbx, ctx, r.r.osId);
  const fotos = r.r.anexosIds.length ? await dbx.select().from(anexo).where(and(inArray(anexo.id, r.r.anexosIds), eq(anexo.empresaId, ctx.empresaId))) : [];
  return { ...r, fotos };
}
