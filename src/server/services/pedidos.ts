/**
 * Entrada de pedidos externos — adaptador desacoplado.
 * A API de PEDIDOS da Treeunfe NÃO está confirmada. Este módulo:
 *  - define o formato normalizado (PedidoNormalizado) que qualquer fonte deve produzir;
 *  - ingere de forma idempotente (mesmo id externo + mesmo conteúdo = nada novo; conteúdo alterado = nova versão + conferência);
 *  - nunca cria OS ou cobrança automaticamente: a OS é montada pelo escritório na fila "Pedidos para programar";
 *  - alteração/cancelamento de pedido já com OS não sobrescreve serviços/parcelas/baixas: gera conferência.
 * Dados de demonstração usam origem "demo" e só podem ser gerados fora de produção.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DBOrTx } from "../db";
import { cliente, integracao, ordemServico, pedidoExterno, pedidoExternoVersao, sincronizacaoLog } from "../db/schema";
import { type Ctx, exigir } from "../auth/contexto";
import { ErroAcesso, ErroNegocio } from "../erros";
import { auditar } from "./auditoria";
import { criarOS, type NovaOS } from "./os";
import { notificarPorPermissao } from "./notificacoes";

export interface PedidoNormalizado {
  idExterno: string;
  versao?: string | null;
  atualizadoEm?: string | null;
  cancelado?: boolean;
  cliente: { nome: string; documento?: string | null; telefone?: string | null; email?: string | null };
  endereco?: string | null;
  itens: Array<{ descricao: string; quantidade: number | string; unidade?: string; valorUnitario?: number | null }>;
  valorTotal?: number | null; // centavos, quando disponível
  condicoesPagamento?: string | null;
  observacoes?: string | null;
}

/** Contrato de uma fonte de pedidos (implementação real só após documentação oficial validada). */
export interface FontePedidos {
  provedor: string;
  configurada(): boolean;
  testarConexao(): Promise<{ ok: boolean; mensagem: string }>;
  buscarAtualizados?(desde: Date | null): Promise<PedidoNormalizado[]>;
  validarWebhook?(headers: Headers, corpo: string): boolean;
  normalizar?(payload: unknown): PedidoNormalizado;
}

/** Treeunfe: sem documentação de API de pedidos validada — não implementa chamadas. */
export const fonteTreeunfe: FontePedidos = {
  provedor: "treeunfe",
  configurada: () => Boolean(process.env.TREEUNFE_API_BASE_URL && process.env.TREEUNFE_API_TOKEN),
  async testarConexao() {
    if (!this.configurada()) return { ok: false, mensagem: "Credenciais não configuradas (TREEUNFE_API_BASE_URL / TREEUNFE_API_TOKEN)." };
    return { ok: false, mensagem: "Endpoint de pedidos não validado na documentação oficial vigente. Conexão não implementada para evitar integração presumida." };
  },
};

export function hashPedido(p: PedidoNormalizado): string {
  const ordenar = (v: unknown): unknown => Array.isArray(v) ? v.map(ordenar) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, ordenar(x)])) : v;
  return createHash("sha256").update(JSON.stringify(ordenar(p))).digest("hex");
}

export interface ResultadoIngestao { pedidoId: string; resultado: "novo" | "duplicado" | "nova_versao" | "conferencia"; }

/** Ingestão idempotente. Executar duas vezes o mesmo pedido não cria nada novo. */
export async function ingerirPedido(tx: DBOrTx, empresaId: string, origem: "treeunfe" | "demo", p: PedidoNormalizado, tipoLog = "webhook"): Promise<ResultadoIngestao> {
  if (origem === "demo" && process.env.APP_ENV === "production") throw new ErroNegocio("Pedidos de demonstração não são permitidos em produção.");
  if (!p.idExterno) throw new ErroNegocio("Pedido sem identificador externo.");
  const hash = hashPedido(p);
  const dados = p as unknown as Record<string, unknown>;
  // trava por pedido para concorrência (dois webhooks simultâneos)
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${empresaId}:${origem}:${p.idExterno}`}))`);
  const [ex] = await tx.select().from(pedidoExterno).where(and(eq(pedidoExterno.empresaId, empresaId), eq(pedidoExterno.origem, origem), eq(pedidoExterno.idExterno, p.idExterno)));
  const log = (status: string, mensagem: string) => tx.insert(sincronizacaoLog).values({ empresaId, provedor: origem, tipo: tipoLog, status, idExterno: p.idExterno, mensagem, payload: dados });
  if (!ex) {
    const [cli] = p.cliente.documento ? await tx.select({ id: cliente.id }).from(cliente).where(and(eq(cliente.empresaId, empresaId), eq(cliente.documento, p.cliente.documento))) : [];
    const [novo] = await tx.insert(pedidoExterno).values({
      empresaId, origem, idExterno: p.idExterno, versaoExterna: p.versao ?? null, atualizadoExternoEm: p.atualizadoEm ? new Date(p.atualizadoEm) : null,
      dadosOriginais: dados, hashConteudo: hash, clienteId: cli?.id ?? null, situacao: p.cancelado ? "cancelado" : "para_programar",
    }).returning();
    await tx.insert(pedidoExternoVersao).values({ pedidoId: novo.id, hashConteudo: hash, versaoExterna: p.versao ?? null, dados });
    await log("sucesso", "Pedido recebido");
    await notificarPorPermissao(tx, empresaId, "pedido.programar", { tipo: "pedido_novo", chave: "pedidos_para_programar", titulo: "Pedidos aguardando programação", link: "/pedidos?situacao=para_programar" });
    return { pedidoId: novo.id, resultado: "novo" };
  }
  if (ex.hashConteudo === hash) { await log("ignorado_duplicado", "Conteúdo idêntico já processado"); return { pedidoId: ex.id, resultado: "duplicado" }; }
  await tx.insert(pedidoExternoVersao).values({ pedidoId: ex.id, hashConteudo: hash, versaoExterna: p.versao ?? null, dados }).onConflictDoNothing();
  if (ex.osId || ex.situacao === "os_criada" || ex.situacao === "conferencia") {
    // Já virou OS: não sobrescreve. Dados originais permanecem os da versão usada; nova versão fica para conferência.
    await tx.update(pedidoExterno).set({ situacao: "conferencia", motivoConferencia: p.cancelado ? "Pedido cancelado na origem após criação da OS" : "Pedido alterado na origem após criação da OS", versaoExterna: p.versao ?? ex.versaoExterna, atualizadoEm: new Date() }).where(eq(pedidoExterno.id, ex.id));
    await log("sucesso", "Alteração recebida para pedido com OS — enviado para conferência");
    await notificarPorPermissao(tx, empresaId, "pedido.programar", { tipo: "pedido_conferencia", chave: `pedido_conferencia:${ex.id}`, titulo: `Pedido ${p.idExterno} alterado após criação da OS`, link: `/pedidos/${ex.id}`, prioridade: "alta" });
    return { pedidoId: ex.id, resultado: "conferencia" };
  }
  await tx.update(pedidoExterno).set({ dadosOriginais: dados, hashConteudo: hash, versaoExterna: p.versao ?? null, atualizadoExternoEm: p.atualizadoEm ? new Date(p.atualizadoEm) : null, situacao: p.cancelado ? "cancelado" : ex.situacao, atualizadoEm: new Date() }).where(eq(pedidoExterno.id, ex.id));
  await log("sucesso", "Nova versão do pedido (ainda sem OS)");
  return { pedidoId: ex.id, resultado: "nova_versao" };
}

export async function listarPedidos(dbx: DBOrTx, ctx: Ctx, f: { situacao?: string } = {}) {
  exigir(ctx, "pedido.ver");
  const conds = [eq(pedidoExterno.empresaId, ctx.empresaId)];
  if (f.situacao) conds.push(eq(pedidoExterno.situacao, f.situacao));
  return dbx.select({ p: pedidoExterno, osNumero: ordemServico.numero, clienteNome: cliente.nome }).from(pedidoExterno)
    .leftJoin(ordemServico, eq(ordemServico.id, pedidoExterno.osId)).leftJoin(cliente, eq(cliente.id, pedidoExterno.clienteId))
    .where(and(...conds)).orderBy(desc(pedidoExterno.recebidoEm)).limit(200);
}

export async function obterPedido(dbx: DBOrTx, ctx: Ctx, id: string) {
  exigir(ctx, "pedido.ver");
  const [p] = await dbx.select().from(pedidoExterno).where(and(eq(pedidoExterno.id, id), eq(pedidoExterno.empresaId, ctx.empresaId)));
  if (!p) throw new ErroAcesso();
  const versoes = await dbx.select().from(pedidoExternoVersao).where(eq(pedidoExternoVersao.pedidoId, id)).orderBy(desc(pedidoExternoVersao.recebidoEm));
  const logs = await dbx.select().from(sincronizacaoLog).where(and(eq(sincronizacaoLog.empresaId, ctx.empresaId), eq(sincronizacaoLog.idExterno, p.idExterno))).orderBy(desc(sincronizacaoLog.em)).limit(50);
  const [os] = p.osId ? await dbx.select({ id: ordemServico.id, numero: ordemServico.numero, etapa: ordemServico.etapa }).from(ordemServico).where(eq(ordemServico.id, p.osId)) : [null];
  return { pedido: p, versoes, logs, os };
}

/** Monta a OS a partir do pedido. A OS referencia o pedido (UNIQUE) — impossível gerar duas OS do mesmo pedido. */
export async function criarOSDoPedido(tx: DBOrTx, ctx: Ctx, pedidoId: string, d: Omit<NovaOS, "pedidoExternoId" | "origem" | "referenciaExterna">) {
  exigir(ctx, "pedido.programar");
  const [p] = await tx.select().from(pedidoExterno).where(and(eq(pedidoExterno.id, pedidoId), eq(pedidoExterno.empresaId, ctx.empresaId))).for("update");
  if (!p) throw new ErroAcesso();
  if (p.osId) throw new ErroNegocio("Este pedido já possui OS.");
  if (p.situacao !== "para_programar") throw new ErroNegocio("Pedido não está disponível para programação.");
  const os = await criarOS(tx, ctx, { ...d, origem: "avulso", pedidoExternoId: p.id, referenciaExterna: `${p.origem}:${p.idExterno}`, demo: p.origem === "demo", aprovada: true });
  await tx.update(pedidoExterno).set({ osId: os.id, situacao: "os_criada", clienteId: d.clienteId, atualizadoEm: new Date() }).where(eq(pedidoExterno.id, p.id));
  await auditar(tx, ctx, { acao: "pedido.os_criada", entidadeTipo: "pedido_externo", entidadeId: p.id, depois: { osId: os.id, numero: os.numero } });
  return os;
}

export async function resolverConferenciaPedido(tx: DBOrTx, ctx: Ctx, pedidoId: string, decisao: string) {
  exigir(ctx, "pedido.programar");
  if (!decisao?.trim()) throw new ErroNegocio("Descreva a decisão tomada (ex.: OS ajustada manualmente, sem impacto, cancelamento tratado).");
  const [p] = await tx.select().from(pedidoExterno).where(and(eq(pedidoExterno.id, pedidoId), eq(pedidoExterno.empresaId, ctx.empresaId)));
  if (!p || p.situacao !== "conferencia") throw new ErroNegocio("Pedido não está em conferência.");
  await tx.update(pedidoExterno).set({ situacao: "os_criada", motivoConferencia: null, atualizadoEm: new Date() }).where(eq(pedidoExterno.id, pedidoId));
  await auditar(tx, ctx, { acao: "pedido.conferencia_resolvida", entidadeTipo: "pedido_externo", entidadeId: pedidoId, motivo: decisao });
}

export async function descartarPedido(tx: DBOrTx, ctx: Ctx, pedidoId: string, motivo: string) {
  exigir(ctx, "pedido.programar");
  if (!motivo?.trim()) throw new ErroNegocio("Informe o motivo.");
  const [p] = await tx.update(pedidoExterno).set({ situacao: "descartado", motivoConferencia: motivo, atualizadoEm: new Date() })
    .where(and(eq(pedidoExterno.id, pedidoId), eq(pedidoExterno.empresaId, ctx.empresaId), inArray(pedidoExterno.situacao, ["para_programar", "cancelado"]))).returning();
  if (!p) throw new ErroNegocio("Pedido não pode ser descartado nesta situação.");
  await auditar(tx, ctx, { acao: "pedido.descartado", entidadeTipo: "pedido_externo", entidadeId: pedidoId, motivo });
}

export async function obterIntegracao(dbx: DBOrTx, ctx: Ctx) {
  exigir(ctx, "pedido.ver");
  const [i] = await dbx.select().from(integracao).where(and(eq(integracao.empresaId, ctx.empresaId), eq(integracao.provedor, "treeunfe")));
  const logs = await dbx.select().from(sincronizacaoLog).where(eq(sincronizacaoLog.empresaId, ctx.empresaId)).orderBy(desc(sincronizacaoLog.em)).limit(30);
  return { integracao: i, credenciaisPresentes: fonteTreeunfe.configurada(), logs };
}

/** Teste de comunicação. Só marca "conectada" se o teste real passar — hoje não passa por falta de documentação validada. */
export async function testarIntegracao(tx: DBOrTx, ctx: Ctx) {
  exigir(ctx, "integracao.gerenciar");
  const r = await fonteTreeunfe.testarConexao();
  await tx.update(integracao).set({ status: r.ok ? "conectada" : "aguardando_validacao", ultimoTesteEm: new Date(), ultimoTesteResultado: r.mensagem, atualizadoEm: new Date() })
    .where(and(eq(integracao.empresaId, ctx.empresaId), eq(integracao.provedor, "treeunfe")));
  await tx.insert(sincronizacaoLog).values({ empresaId: ctx.empresaId, provedor: "treeunfe", tipo: "teste", status: r.ok ? "sucesso" : "erro", mensagem: r.mensagem });
  await auditar(tx, ctx, { acao: "integracao.teste", entidadeTipo: "integracao", entidadeId: "treeunfe", depois: r });
  return r;
}

/** Reprocessa um log com erro (payload preservado), de forma idempotente. */
export async function reprocessarLog(tx: DBOrTx, ctx: Ctx, logId: string) {
  exigir(ctx, "integracao.gerenciar");
  const [l] = await tx.select().from(sincronizacaoLog).where(and(eq(sincronizacaoLog.id, logId), eq(sincronizacaoLog.empresaId, ctx.empresaId)));
  if (!l || !l.payload) throw new ErroNegocio("Registro sem payload para reprocessar.");
  const r = await ingerirPedido(tx, ctx.empresaId, l.provedor as "treeunfe" | "demo", l.payload as PedidoNormalizado, "reprocessamento");
  await tx.update(sincronizacaoLog).set({ reprocessadoPor: ctx.usuarioId }).where(eq(sincronizacaoLog.id, logId));
  return r;
}
