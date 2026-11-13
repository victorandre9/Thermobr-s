/**
 * Despesas do técnico da equipe própria (diárias e reembolsos): o técnico lança pelo celular com comprovante,
 * o gestor aprova em Aprovações e o financeiro paga em Contas a pagar. Autônomo não usa (fatura pelo próprio acordo).
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DBOrTx } from "../db";
import { qc } from "../db/sql";
import { baixa, categoriaFinanceira, obrigacao, ordemServico, parcela } from "../db/schema";
import type { Ctx } from "../auth/contexto";
import { ErroAcesso, ErroNegocio } from "../erros";
import { criarObrigacao } from "./financeiro";
import { hojeSP } from "@/lib/datas";

export const TIPOS_DESPESA = { diaria: { codigo: "diarias", rotulo: "Diária" }, reembolso: { codigo: "reembolso_tecnico", rotulo: "Reembolso de gasto" } } as const;
export type TipoDespesa = keyof typeof TIPOS_DESPESA;

export function podeLancarDespesa(ctx: Ctx) { return ctx.profissional?.vinculo === "proprio"; }

export async function lancarDespesaTecnico(tx: DBOrTx, ctx: Ctx, d: { tipo: TipoDespesa; descricao: string; valorCentavos: number; data: string; osNumero?: number | null; chave?: string | null }) {
  if (!podeLancarDespesa(ctx)) throw new ErroAcesso("Despesas e diárias são lançadas pela equipe própria.");
  const t = TIPOS_DESPESA[d.tipo]; if (!t) throw new ErroNegocio("Tipo de despesa inválido.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data) || d.data > hojeSP()) throw new ErroNegocio("Data do gasto inválida (não pode ser futura).");
  const [cat] = await tx.select().from(categoriaFinanceira).where(and(eq(categoriaFinanceira.empresaId, ctx.empresaId), eq(categoriaFinanceira.codigo, t.codigo)));
  if (!cat) throw new ErroNegocio("Categoria de despesa não configurada. Avise o escritório.");
  let osId: string | null = null;
  if (d.osNumero) {
    const [o] = await tx.select({ id: ordemServico.id }).from(ordemServico).where(and(eq(ordemServico.empresaId, ctx.empresaId), eq(ordemServico.numero, d.osNumero)));
    if (!o) throw new ErroNegocio(`OS ${d.osNumero} não encontrada.`);
    osId = o.id;
  }
  if (d.chave) { const [ex] = await tx.select().from(obrigacao).where(and(eq(obrigacao.empresaId, ctx.empresaId), eq(obrigacao.chaveUnicidade, `despesa:${d.chave}`))); if (ex) return ex; }
  const prof = ctx.profissional!;
  return criarObrigacao(tx, ctx, {
    natureza: "pagar", categoriaId: cat.id, descricao: `${t.rotulo}: ${d.descricao.trim()}`, profissionalId: prof.id, beneficiarioNome: prof.nome,
    valorBrutoCentavos: d.valorCentavos, origemTipo: "despesa_tecnico", osId, chaveUnicidade: d.chave ? `despesa:${d.chave}` : null, competencia: d.data.slice(0, 7) + "-01",
    parcelas: [{ vencimento: hojeSP() < d.data ? d.data : hojeSP(), valorCentavos: d.valorCentavos }],
  }, { solicitacaoTecnico: true });
}

/** Despesas lançadas pelo próprio técnico, com situação (aguardando aprovação, aprovada, paga, recusada). */
export async function minhasDespesas(dbx: DBOrTx, ctx: Ctx) {
  if (!podeLancarDespesa(ctx)) throw new ErroAcesso();
  const rows = await dbx.select({
    id: obrigacao.id, descricao: obrigacao.descricao, valor: obrigacao.valorBrutoCentavos, situacaoAprovacao: obrigacao.situacaoAprovacao, criadoEm: obrigacao.criadoEm, competencia: obrigacao.competencia,
    osNumero: ordemServico.numero,
    pago: sql<number>`coalesce((select sum(b.valor_centavos) from ${baixa} b join ${parcela} pa on pa.id = b.parcela_id where pa.obrigacao_id = ${qc(obrigacao.id)} and b.status = 'confirmada'), 0)::bigint`.mapWith(Number),
  }).from(obrigacao).leftJoin(ordemServico, eq(ordemServico.id, obrigacao.osId)).innerJoin(categoriaFinanceira, eq(categoriaFinanceira.id, obrigacao.categoriaId))
    .where(and(eq(obrigacao.empresaId, ctx.empresaId), eq(obrigacao.profissionalId, ctx.profissional!.id), inArray(categoriaFinanceira.codigo, ["diarias", "reembolso_tecnico"])))
    .orderBy(desc(obrigacao.criadoEm)).limit(100);
  return rows.map((r) => ({ ...r, situacao: r.situacaoAprovacao === "rejeitada" ? "Recusada" : r.situacaoAprovacao === "cancelada" ? "Cancelada" : r.pago >= r.valor ? "Paga" : r.situacaoAprovacao === "aprovada" ? "Aprovada — aguardando pagamento" : "Aguardando aprovação do gestor" }));
}
