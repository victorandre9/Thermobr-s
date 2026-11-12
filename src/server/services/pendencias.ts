import { and, asc, desc, eq, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import { qc } from "../db/sql";
import type { DBOrTx } from "../db";
import { ordemServico, pendencia, usuario, veiculo, ferramenta, profissional } from "../db/schema";
import { type Ctx, exigir, pode } from "../auth/contexto";
import { ErroAcesso, ErroNegocio } from "../erros";
import { auditar } from "./auditoria";
import { notificarPorPermissao, encerrarNotificacoes } from "./notificacoes";
import { hojeSP } from "@/lib/datas";

export interface NovaPendencia {
  tipo: string; titulo: string; descricao?: string | null; prioridade?: string;
  entidadeTipo?: string | null; entidadeId?: string | null; osId?: string | null; visitaId?: string | null; veiculoId?: string | null; ferramentaId?: string | null; profissionalId?: string | null;
  responsavelId?: string | null; prazo?: string | null; chave?: string | null;
}

/** Abre pendência; com chave, não duplica pendência aberta do mesmo problema (agrupa). */
export async function garantirPendencia(tx: DBOrTx, ctx: Pick<Ctx, "usuarioId" | "empresaId">, d: NovaPendencia) {
  if (d.chave) {
    const [ex] = await tx.select().from(pendencia).where(and(eq(pendencia.empresaId, ctx.empresaId), eq(pendencia.chave, d.chave), inArray(pendencia.situacao, ["aberta", "em_andamento"])));
    if (ex) return ex;
  }
  const [p] = await tx.insert(pendencia).values({ ...d, empresaId: ctx.empresaId, prioridade: d.prioridade ?? "media", abertaPor: ctx.usuarioId }).returning();
  await auditar(tx, ctx, { acao: "pendencia.aberta", entidadeTipo: "pendencia", entidadeId: p.id, depois: { tipo: p.tipo, titulo: p.titulo } });
  const permissao = p.tipo.startsWith("veiculo") ? "veiculo.irregularidade.tratar" : p.tipo.startsWith("ferramenta") ? "ferramenta.movimentar" : p.tipo.startsWith("material") ? "material.conferir" : "agenda.gerenciar";
  await notificarPorPermissao(tx, ctx.empresaId, permissao, { tipo: p.tipo, chave: `pendencia:${p.id}`, titulo: p.titulo, mensagem: p.descricao, link: `/pendencias/${p.id}`, prioridade: p.prioridade, vencimento: p.prazo }, p.responsavelId);
  return p;
}

export async function resolverPendencia(tx: DBOrTx, ctx: Ctx, id: string, resolucao: string, situacao: "resolvida" | "cancelada" = "resolvida") {
  exigir(ctx, "pendencia.resolver");
  if (!resolucao?.trim()) throw new ErroNegocio("Descreva a resolução.");
  const [p] = await tx.select().from(pendencia).where(and(eq(pendencia.id, id), eq(pendencia.empresaId, ctx.empresaId))).for("update");
  if (!p) throw new ErroAcesso();
  if (!["aberta", "em_andamento"].includes(p.situacao)) throw new ErroNegocio("Pendência já encerrada.");
  // divergência de material e falta de ferramenta: quem abriu como responsável não aprova a própria (exceto gestor, registrado)
  if (["material_divergencia", "ferramenta_falta"].includes(p.tipo) && p.abertaPor === ctx.usuarioId && !ctx.papeis.includes("gestor")) throw new ErroAcesso("Você não pode encerrar a pendência que abriu. Solicite validação de outro responsável.");
  await tx.update(pendencia).set({ situacao, resolucao, resolvidaPor: ctx.usuarioId, resolvidaEm: new Date() }).where(eq(pendencia.id, id));
  await encerrarNotificacoes(tx, ctx.empresaId, `pendencia:${id}`);
  await auditar(tx, ctx, { acao: `pendencia.${situacao}`, entidadeTipo: "pendencia", entidadeId: id, motivo: resolucao });
}

export async function atribuirPendencia(tx: DBOrTx, ctx: Ctx, id: string, d: { responsavelId: string | null; prazo: string | null; prioridade?: string; liberacaoExcepcional?: string | null }) {
  exigir(ctx, "pendencia.resolver");
  const [p] = await tx.select().from(pendencia).where(and(eq(pendencia.id, id), eq(pendencia.empresaId, ctx.empresaId)));
  if (!p) throw new ErroAcesso();
  if (d.liberacaoExcepcional && !ctx.papeis.includes("gestor")) throw new ErroAcesso("Liberação excepcional é exclusiva do gestor.");
  await tx.update(pendencia).set({ responsavelId: d.responsavelId, prazo: d.prazo, prioridade: d.prioridade ?? p.prioridade, situacao: "em_andamento", liberacaoExcepcional: d.liberacaoExcepcional ?? p.liberacaoExcepcional }).where(eq(pendencia.id, id));
  await auditar(tx, ctx, { acao: d.liberacaoExcepcional ? "pendencia.liberacao_excepcional" : "pendencia.atribuida", entidadeTipo: "pendencia", entidadeId: id, motivo: d.liberacaoExcepcional, antes: p, depois: d });
}

export interface FiltroPendencia { tipo?: string; tipos?: string[]; situacao?: "abertas" | "encerradas" | "todas"; semResponsavel?: boolean; vencidas?: boolean; osId?: string; veiculoId?: string; limite?: number; offset?: number }

export function condicoesPendencia(ctx: Ctx, f: FiltroPendencia): SQL[] {
  exigir(ctx, "pendencia.ver", "proprio");
  const c: SQL[] = [eq(pendencia.empresaId, ctx.empresaId)];
  if (!pode(ctx, "pendencia.ver", "empresa")) {
    if (!ctx.profissional) throw new ErroAcesso();
    c.push(sql`(${qc(pendencia.profissionalId)} = ${ctx.profissional.id} or ${qc(pendencia.abertaPor)} = ${ctx.usuarioId})`);
  }
  if (f.tipo) c.push(eq(pendencia.tipo, f.tipo));
  if (f.tipos?.length) c.push(inArray(pendencia.tipo, f.tipos));
  if ((f.situacao ?? "abertas") === "abertas") c.push(inArray(pendencia.situacao, ["aberta", "em_andamento"]));
  else if (f.situacao === "encerradas") c.push(inArray(pendencia.situacao, ["resolvida", "cancelada"]));
  if (f.semResponsavel) c.push(isNull(pendencia.responsavelId));
  if (f.vencidas) c.push(lt(pendencia.prazo, hojeSP()));
  if (f.osId) c.push(eq(pendencia.osId, f.osId));
  if (f.veiculoId) c.push(eq(pendencia.veiculoId, f.veiculoId));
  return c;
}

export async function listarPendencias(dbx: DBOrTx, ctx: Ctx, f: FiltroPendencia = {}) {
  const rows = await dbx.select({
    p: pendencia, responsavelNome: usuario.nome, osNumero: ordemServico.numero, veiculoIdent: veiculo.identificacao, ferramentaNome: ferramenta.nome, profissionalNome: profissional.nome,
    total: sql<number>`count(*) over()::int`,
  }).from(pendencia)
    .leftJoin(usuario, eq(usuario.id, pendencia.responsavelId))
    .leftJoin(ordemServico, eq(ordemServico.id, pendencia.osId))
    .leftJoin(veiculo, eq(veiculo.id, pendencia.veiculoId))
    .leftJoin(ferramenta, eq(ferramenta.id, pendencia.ferramentaId))
    .leftJoin(profissional, eq(profissional.id, pendencia.profissionalId))
    .where(and(...condicoesPendencia(ctx, f)))
    .orderBy(sql`case ${qc(pendencia.prioridade)} when 'critica' then 0 when 'alta' then 1 when 'media' then 2 else 3 end`, asc(pendencia.prazo), desc(pendencia.abertaEm))
    .limit(f.limite ?? 100).offset(f.offset ?? 0);
  return { rows, total: rows[0]?.total ?? 0 };
}

export async function obterPendencia(dbx: DBOrTx, ctx: Ctx, id: string) {
  const [r] = await dbx.select({ p: pendencia, responsavelNome: usuario.nome }).from(pendencia).leftJoin(usuario, eq(usuario.id, pendencia.responsavelId))
    .where(and(eq(pendencia.id, id), ...condicoesPendencia(ctx, { situacao: "todas" })));
  if (!r) throw new ErroAcesso();
  return r;
}

/** Encerra pendências abertas ligadas a uma entidade (quando o registro de origem é resolvido). */
export async function encerrarPendenciasEntidade(tx: DBOrTx, ctx: Pick<Ctx, "usuarioId" | "empresaId">, entidadeTipo: string, entidadeId: string, resolucao: string) {
  const ps = await tx.update(pendencia).set({ situacao: "resolvida", resolucao, resolvidaPor: ctx.usuarioId, resolvidaEm: new Date() })
    .where(and(eq(pendencia.empresaId, ctx.empresaId), eq(pendencia.entidadeTipo, entidadeTipo), eq(pendencia.entidadeId, entidadeId), inArray(pendencia.situacao, ["aberta", "em_andamento"]))).returning({ id: pendencia.id });
  for (const p of ps) await encerrarNotificacoes(tx, ctx.empresaId, `pendencia:${p.id}`);
}
