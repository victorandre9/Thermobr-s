/**
 * Entrada em operação: data de corte, saldos iniciais (financeiro.ts), contas antigas (legado), estoque inicial conferido
 * e custódia inicial de ferramentas/materiais. Tudo idempotente por chave.
 *  - Obrigações legado não aparecem como vendas novas do período.
 *  - Recebimentos anteriores à data de corte já estão no saldo inicial: baixas com data < data de corte são rejeitadas.
 */
import { and, eq } from "drizzle-orm";
import type { DBOrTx } from "../db";
import { empresa, ferramenta, ferramentaMovimento, material, materialMovimento, materialPosicao, materialSaldo, profissional } from "../db/schema";
import { type Ctx, exigir } from "../auth/contexto";
import { ErroNegocio, ErroAcesso } from "../erros";
import { auditar } from "./auditoria";
import { obterConfig } from "./config";
import { criarObrigacao, type NovaObrigacao } from "./financeiro";
import { parseQtdInput } from "@/lib/quantidade";
import { sql } from "drizzle-orm";

export async function definirDataCorte(tx: DBOrTx, ctx: Ctx, data: string) {
  exigir(ctx, "configuracao.gerenciar"); exigir(ctx, "financeiro.saldo_inicial");
  const cfg = await obterConfig(tx, ctx.empresaId);
  await tx.update(empresa).set({ config: sql`jsonb_set(coalesce(${empresa.config}, '{}'::jsonb), '{implantacao}', ${JSON.stringify({ ...cfg.implantacao, dataCorte: data })}::jsonb)` }).where(eq(empresa.id, ctx.empresaId));
  await auditar(tx, ctx, { acao: "implantacao.data_corte", entidadeTipo: "empresa", entidadeId: ctx.empresaId, antes: cfg.implantacao, depois: { dataCorte: data }, sensivel: true });
}

export async function statusImplantacao(dbx: DBOrTx, ctx: Ctx) {
  const cfg = await obterConfig(dbx, ctx.empresaId);
  return { dataCorte: cfg.implantacao.dataCorte, politicaDefinida: cfg.financeiro.politicaDelegacaoDefinida };
}

/** Conta antiga a pagar/receber (anterior à data de corte). Chave legado:<identificador> evita duplicar ao reimportar. */
export async function lancarObrigacaoLegado(tx: DBOrTx, ctx: Ctx, d: Omit<NovaObrigacao, "origemTipo" | "legado" | "chaveUnicidade" | "origemAprovada"> & { identificador: string }) {
  exigir(ctx, "financeiro.lancar");
  const cfg = await obterConfig(tx, ctx.empresaId);
  if (!cfg.implantacao.dataCorte) throw new ErroNegocio("Defina antes a data de corte da implantação.");
  if (!d.identificador.trim()) throw new ErroNegocio("Informe um identificador único (ex.: nº do documento antigo).");
  const { identificador, ...rest } = d;
  return criarObrigacao(tx, ctx, { ...rest, origemTipo: "legado", legado: true, chaveUnicidade: `legado:${d.natureza}:${identificador.trim()}`, descricao: `[Anterior à implantação] ${d.descricao}` });
}

/** Estoque inicial conferido por posição: uma vez por material+posição. Ajustes posteriores só por divergência aprovada. */
export async function registrarEstoqueInicial(tx: DBOrTx, ctx: Ctx, d: { materialId: string; posicaoId: string; quantidade: string }) {
  exigir(ctx, "material.movimentar"); exigir(ctx, "material.conferir");
  const [m] = await tx.select().from(material).where(and(eq(material.id, d.materialId), eq(material.empresaId, ctx.empresaId)));
  if (!m) throw new ErroAcesso();
  const [pos] = await tx.select().from(materialPosicao).where(and(eq(materialPosicao.id, d.posicaoId), eq(materialPosicao.empresaId, ctx.empresaId), eq(materialPosicao.virtual, false)));
  if (!pos) throw new ErroNegocio("Posição inválida.");
  const q = parseQtdInput(d.quantidade, m.unidade);
  const [ajuste] = await tx.select().from(materialPosicao).where(and(eq(materialPosicao.empresaId, ctx.empresaId), eq(materialPosicao.tipo, "ajuste")));
  const chave = `estoque_inicial:${m.id}:${pos.id}`;
  const [ex] = await tx.select().from(materialMovimento).where(eq(materialMovimento.chaveIdempotencia, chave));
  if (ex) throw new ErroNegocio("Estoque inicial deste material nesta posição já foi registrado. Diferenças posteriores: contagem física e divergência.");
  await tx.insert(materialMovimento).values({ empresaId: ctx.empresaId, materialId: m.id, tipo: "ajuste", status: "confirmado", origemPosicaoId: ajuste.id, destinoPosicaoId: pos.id, quantidade: q, unidade: m.unidade, observacao: "Estoque inicial conferido (implantação)", registradoPor: ctx.usuarioId, confirmadoPor: ctx.usuarioId, confirmadoEm: new Date(), chaveIdempotencia: chave });
  await tx.insert(materialSaldo).values({ materialId: m.id, posicaoId: pos.id, quantidade: q }).onConflictDoUpdate({ target: [materialSaldo.materialId, materialSaldo.posicaoId], set: { quantidade: sql`${materialSaldo.quantidade} + ${q}::numeric` } });
  await auditar(tx, ctx, { acao: "implantacao.estoque_inicial", entidadeTipo: "material", entidadeId: m.id, depois: { posicao: pos.nome, q } });
}

/** Ferramenta já com um profissional na entrada em operação: registra custódia inicial (sem entrega fictícia). */
export async function custodiaInicialFerramenta(tx: DBOrTx, ctx: Ctx, ferramentaId: string, profissionalId: string) {
  exigir(ctx, "ferramenta.movimentar");
  const [f] = await tx.select().from(ferramenta).where(and(eq(ferramenta.id, ferramentaId), eq(ferramenta.empresaId, ctx.empresaId)));
  const [p] = await tx.select().from(profissional).where(and(eq(profissional.id, profissionalId), eq(profissional.empresaId, ctx.empresaId)));
  if (!f || !p) throw new ErroAcesso();
  if (f.situacao !== "disponivel" || f.custodianteProfissionalId) throw new ErroNegocio("Ferramenta já possui movimentação/custódia registrada.");
  await tx.insert(ferramentaMovimento).values({ empresaId: ctx.empresaId, ferramentaId, tipo: "ajuste", status: "confirmado", paraProfissionalId: p.id, observacao: "Custódia inicial (implantação)", registradoPor: ctx.usuarioId, confirmadoPor: ctx.usuarioId, confirmadoEm: new Date() });
  await tx.update(ferramenta).set({ situacao: "em_custodia", custodianteProfissionalId: p.id, custodiaDesde: new Date(), versao: f.versao + 1 }).where(eq(ferramenta.id, ferramentaId));
  await auditar(tx, ctx, { acao: "implantacao.custodia_ferramenta", entidadeTipo: "ferramenta", entidadeId: ferramentaId, depois: { profissional: p.nome } });
}
