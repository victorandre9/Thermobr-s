/**
 * Rotinas recorrentes executadas no servidor (Vercel Cron → /api/cron/[rotina]); não dependem de navegador aberto.
 * Cada execução é registrada (rotina_execucao) com chave por período: repetir não duplica efeitos.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DBOrTx, DB } from "../db";
import { empresa, obrigacao, parcela, rotinaExecucao, usuario, categoriaFinanceira } from "../db/schema";
import type { Ctx } from "../auth/contexto";
import type { Escopo } from "../auth/permissoes";
import { gerarMensalidades, saldoParcelaSQL } from "./financeiro";
import { notificarPorPermissao } from "./notificacoes";
import { fonteTreeunfe } from "./pedidos";
import { hojeSP, primeiroDiaMes } from "@/lib/datas";

export const ROTINAS = {
  mensalidades: "Gerar mensalidades de contratos (competência atual)",
  lembretes: "Notificar vencimentos do dia e atrasos",
  pedidos: "Sincronizar pedidos Treeunfe (consulta periódica — não é tempo real)",
} as const;
export type NomeRotina = keyof typeof ROTINAS;

const EMAIL_SISTEMA = (empresaId: string) => `rotina+${empresaId}@sistema.invalid`;

/** Usuário técnico "Rotina automática": sem senha (não faz login), usado apenas como autor das rotinas. */
export async function usuarioSistema(tx: DBOrTx, empresaId: string) {
  const [u] = await tx.select().from(usuario).where(eq(usuario.email, EMAIL_SISTEMA(empresaId)));
  if (u) return u;
  const [n] = await tx.insert(usuario).values({ empresaId, nome: "Rotina automática (sistema)", email: EMAIL_SISTEMA(empresaId), senhaHash: null, ativo: true }).returning();
  return n;
}

function ctxSistema(usuarioId: string, empresaId: string): Ctx {
  const g = new Map<string, Escopo>([["financeiro.lancar", "empresa"], ["contrato.valores.ver", "empresa"], ["financeiro.ver", "empresa"]]);
  return { usuarioId, empresaId, nome: "Rotina automática", email: "", papeis: ["sistema"], grants: g, profissional: null };
}

export async function executarRotina(db: DB, nome: NomeRotina, empresaId: string, disparadoPor = "agendador") {
  const hoje = hojeSP();
  const chave = `${empresaId}:${nome === "mensalidades" ? hoje.slice(0, 7) : hoje}`;
  // registra/obtém execução; se já houve sucesso nesta chave, não executa de novo
  const [ex] = await db.select().from(rotinaExecucao).where(and(eq(rotinaExecucao.rotina, nome), eq(rotinaExecucao.chave, chave)));
  if (ex?.status === "sucesso" || ex?.status === "ignorado") return { status: "ja_executada", execucao: ex };
  let execId: string;
  if (ex) { await db.update(rotinaExecucao).set({ status: "executando", tentativa: ex.tentativa + 1, iniciadoEm: new Date(), disparadoPor, mensagem: null }).where(eq(rotinaExecucao.id, ex.id)); execId = ex.id; }
  else {
    const [n] = await db.insert(rotinaExecucao).values({ empresaId, rotina: nome, chave, status: "executando", disparadoPor }).onConflictDoNothing().returning();
    if (!n) return { status: "concorrente" };
    execId = n.id;
  }
  try {
    const resultado = await db.transaction(async (tx) => {
      const u = await usuarioSistema(tx, empresaId);
      const ctx = ctxSistema(u.id, empresaId);
      if (nome === "mensalidades") return { status: "sucesso", dados: await gerarMensalidades(tx, ctx, primeiroDiaMes(hoje)) };
      if (nome === "lembretes") {
        const [r] = await tx.select({ hoje: sql<number>`count(*) filter (where ${parcela.vencimento} = ${hoje})::int`, vencidas: sql<number>`count(*) filter (where ${parcela.vencimento} < ${hoje})::int` })
          .from(parcela).innerJoin(obrigacao, eq(obrigacao.id, parcela.obrigacaoId)).innerJoin(categoriaFinanceira, eq(categoriaFinanceira.id, obrigacao.categoriaId))
          .where(and(eq(obrigacao.empresaId, empresaId), eq(obrigacao.natureza, "pagar"), eq(parcela.cancelada, false), inArray(obrigacao.situacaoAprovacao, ["aprovada"]), sql`${saldoParcelaSQL} > 0`, eq(categoriaFinanceira.restrita, false)));
        if (r.hoje || r.vencidas) await notificarPorPermissao(tx, empresaId, "financeiro.ver", { tipo: "vencimentos", chave: `vencimentos:${hoje}`, titulo: `Contas a pagar: ${r.hoje} vencendo hoje, ${r.vencidas} vencida(s)`, link: "/financeiro/pagar?situacao=vencidas", prioridade: r.vencidas ? "alta" : "media", vencimento: hoje });
        return { status: "sucesso", dados: r };
      }
      if (nome === "pedidos") {
        if (!fonteTreeunfe.configurada() || !fonteTreeunfe.buscarAtualizados) return { status: "ignorado", dados: { motivo: "Integração Treeunfe aguardando validação: nenhuma consulta realizada." } };
        return { status: "ignorado", dados: { motivo: "Consulta não implementada sem documentação validada." } };
      }
      throw new Error("Rotina desconhecida");
    });
    await db.update(rotinaExecucao).set({ status: resultado.status, finalizadoEm: new Date(), resultado: resultado.dados, mensagem: resultado.status === "ignorado" ? (resultado.dados as { motivo: string }).motivo : "Concluída" }).where(eq(rotinaExecucao.id, execId));
    return { status: resultado.status, resultado: resultado.dados };
  } catch (e) {
    await db.update(rotinaExecucao).set({ status: "erro", finalizadoEm: new Date(), mensagem: (e as Error).message.slice(0, 500) }).where(eq(rotinaExecucao.id, execId));
    return { status: "erro", mensagem: (e as Error).message };
  }
}

export async function executarParaTodas(db: DB, nome: NomeRotina, disparadoPor = "agendador") {
  const es = await db.select({ id: empresa.id }).from(empresa);
  const out = [];
  for (const e of es) out.push({ empresaId: e.id, ...(await executarRotina(db, nome, e.id, disparadoPor)) });
  return out;
}
