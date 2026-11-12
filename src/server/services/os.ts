import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { qc } from "../db/sql";
import type { DBOrTx } from "../db";
import {
  agendaReserva, cliente, clienteContato, clienteLocal, contador, contrato, equipamento, ordemServico, osEquipamento, osItem,
  pedidoExterno, profissional, usuario, visita, visitaExecucao, autonomoServico, pendencia,
} from "../db/schema";
import { type Ctx, exigir, pode } from "../auth/contexto";
import { ErroAcesso, ErroNegocio } from "../erros";
import { auditar } from "./auditoria";
import { exigirAcessoOS, osDoProfissionalSQL } from "./escopo";
import type { OsEtapa } from "@/lib/dominio";
import { parseQtdInput, valorItem } from "@/lib/quantidade";

export async function proximoNumero(tx: DBOrTx, empresaId: string, chave: string): Promise<number> {
  const r = await tx.execute<{ valor: string }>(sql`
    insert into ${contador} (empresa_id, chave, valor) values (${empresaId}, ${chave}, 1)
    on conflict (empresa_id, chave) do update set valor = ${contador}.valor + 1
    returning valor`);
  return Number(r.rows[0].valor);
}

export interface ItemOS { tipo: "servico" | "peca" | "material"; descricao: string; materialId?: string | null; quantidade: string; unidade: string; precoUnitarioCentavos?: number | null; custoUnitarioCentavos?: number | null; incluidoContrato?: boolean }
export interface NovaOS {
  origem: "avulso" | "contrato" | "retorno_garantia";
  clienteId: string; localId?: string | null; contatoId?: string | null;
  descricao: string; prioridade?: string; observacoes?: string | null;
  contratoId?: string | null; osOrigemId?: string | null; pedidoExternoId?: string | null; referenciaExterna?: string | null;
  equipamentos?: string[]; itens?: ItemOS[]; aprovada?: boolean; demo?: boolean;
}

export async function criarOS(tx: DBOrTx, ctx: Ctx, d: NovaOS) {
  exigir(ctx, "os.gerenciar");
  if (!d.descricao?.trim()) throw new ErroNegocio("Descreva a solicitação.", "descricao");
  const [cli] = await tx.select().from(cliente).where(and(eq(cliente.id, d.clienteId), eq(cliente.empresaId, ctx.empresaId)));
  if (!cli) throw new ErroNegocio("Cliente inválido.", "clienteId");
  if (d.localId) {
    const [l] = await tx.select().from(clienteLocal).where(and(eq(clienteLocal.id, d.localId), eq(clienteLocal.clienteId, d.clienteId)));
    if (!l) throw new ErroNegocio("Local não pertence ao cliente.", "localId");
  }
  if (d.contatoId) {
    const [c] = await tx.select().from(clienteContato).where(and(eq(clienteContato.id, d.contatoId), eq(clienteContato.clienteId, d.clienteId)));
    if (!c) throw new ErroNegocio("Contato não pertence ao cliente.", "contatoId");
  }
  if (d.origem === "contrato") {
    if (!d.contratoId) throw new ErroNegocio("Selecione o contrato.", "contratoId");
    const [k] = await tx.select().from(contrato).where(and(eq(contrato.id, d.contratoId), eq(contrato.clienteId, d.clienteId), eq(contrato.empresaId, ctx.empresaId)));
    if (!k) throw new ErroNegocio("Contrato não pertence ao cliente.", "contratoId");
    if (k.status !== "ativo") throw new ErroNegocio("Contrato não está ativo.", "contratoId");
  }
  if (d.origem === "retorno_garantia") {
    if (!d.osOrigemId) throw new ErroNegocio("Vincule a OS original do retorno/garantia.", "osOrigemId");
    const [o] = await tx.select().from(ordemServico).where(and(eq(ordemServico.id, d.osOrigemId), eq(ordemServico.empresaId, ctx.empresaId)));
    if (!o || o.clienteId !== d.clienteId) throw new ErroNegocio("OS de origem inválida para este cliente.", "osOrigemId");
  }
  const numero = await proximoNumero(tx, ctx.empresaId, "os");
  // Retorno/garantia e contrato não são venda nova: aprovados operacionalmente sem gerar cobrança automática.
  const aprovada = d.aprovada ?? d.origem !== "avulso";
  const [os] = await tx.insert(ordemServico).values({
    empresaId: ctx.empresaId, numero, origem: d.origem, clienteId: d.clienteId, localId: d.localId ?? null, contatoId: d.contatoId ?? null,
    descricao: d.descricao.trim(), prioridade: d.prioridade ?? "normal", observacoes: d.observacoes ?? null,
    contratoId: d.origem === "contrato" ? d.contratoId! : null, osOrigemId: d.origem === "retorno_garantia" ? d.osOrigemId! : null,
    pedidoExternoId: d.pedidoExternoId ?? null, referenciaExterna: d.referenciaExterna ?? null,
    situacaoComercial: aprovada ? "aprovada" : "rascunho", abertaPor: ctx.usuarioId, demo: d.demo ?? false,
  }).returning();
  if (d.equipamentos?.length) await vincularEquipamentos(tx, os.id, d.clienteId, d.equipamentos);
  for (const it of d.itens ?? []) await inserirItem(tx, ctx, os.id, it, "previsto");
  await auditar(tx, ctx, { acao: "os.criada", entidadeTipo: "os", entidadeId: os.id, depois: { numero, origem: d.origem, clienteId: d.clienteId } });
  return os;
}

async function vincularEquipamentos(tx: DBOrTx, osId: string, clienteId: string, ids: string[]) {
  const eqs = await tx.select({ id: equipamento.id }).from(equipamento).where(and(inArray(equipamento.id, ids), eq(equipamento.clienteId, clienteId)));
  if (eqs.length !== new Set(ids).size) throw new ErroNegocio("Equipamento não pertence ao cliente.");
  await tx.insert(osEquipamento).values(eqs.map((e) => ({ osId, equipamentoId: e.id }))).onConflictDoNothing();
}

async function inserirItem(tx: DBOrTx, ctx: Ctx, osId: string, it: ItemOS, situacao: string, visitaId?: string | null) {
  if (!it.descricao?.trim()) throw new ErroNegocio("Descrição do item obrigatória.");
  const quantidade = parseQtdInput(it.quantidade, it.unidade);
  const [r] = await tx.insert(osItem).values({
    osId, tipo: it.tipo, descricao: it.descricao.trim(), materialId: it.materialId ?? null, quantidade, unidade: it.unidade,
    precoUnitarioCentavos: pode(ctx, "os.valores.ver") ? it.precoUnitarioCentavos ?? null : null,
    custoUnitarioCentavos: pode(ctx, "os.custos.ver") ? it.custoUnitarioCentavos ?? null : null,
    incluidoContrato: it.incluidoContrato ?? false, situacao, solicitadoPor: ctx.usuarioId, visitaId: visitaId ?? null,
  }).returning();
  return r;
}

export async function adicionarItem(tx: DBOrTx, ctx: Ctx, osId: string, it: ItemOS) {
  exigir(ctx, "os.gerenciar");
  await exigirAcessoOS(tx, ctx, osId, "os.gerenciar");
  const r = await inserirItem(tx, ctx, osId, it, "previsto");
  await auditar(tx, ctx, { acao: "os.item_adicionado", entidadeTipo: "os", entidadeId: osId, depois: { id: r.id, descricao: r.descricao, quantidade: r.quantidade } });
  await tocarOS(tx, osId);
  return r;
}

/** Atualiza preço/custo de item (perfis autorizados). Preserva valor anterior na auditoria. */
export async function definirValoresItem(tx: DBOrTx, ctx: Ctx, itemId: string, v: { precoUnitarioCentavos?: number | null; custoUnitarioCentavos?: number | null }, motivo?: string) {
  const [it] = await tx.select({ i: osItem, empresaId: ordemServico.empresaId }).from(osItem).innerJoin(ordemServico, eq(ordemServico.id, osItem.osId)).where(eq(osItem.id, itemId));
  if (!it || it.empresaId !== ctx.empresaId) throw new ErroAcesso();
  const set: Partial<typeof osItem.$inferInsert> = {};
  if (v.precoUnitarioCentavos !== undefined) { exigir(ctx, "os.valores.ver"); exigir(ctx, "os.gerenciar"); set.precoUnitarioCentavos = v.precoUnitarioCentavos; }
  if (v.custoUnitarioCentavos !== undefined) { exigir(ctx, "os.custos.ver"); set.custoUnitarioCentavos = v.custoUnitarioCentavos; }
  await tx.update(osItem).set(set).where(eq(osItem.id, itemId));
  await auditar(tx, ctx, { acao: "os.item_valores", entidadeTipo: "os", entidadeId: it.i.osId, motivo, antes: { preco: it.i.precoUnitarioCentavos, custo: it.i.custoUnitarioCentavos }, depois: set, sensivel: true });
}

export async function decidirItemExtra(tx: DBOrTx, ctx: Ctx, itemId: string, aprovar: boolean, precoUnitarioCentavos: number | null, motivo?: string) {
  exigir(ctx, "os.extra.aprovar");
  const [it] = await tx.select({ i: osItem, empresaId: ordemServico.empresaId }).from(osItem).innerJoin(ordemServico, eq(ordemServico.id, osItem.osId)).where(eq(osItem.id, itemId));
  if (!it || it.empresaId !== ctx.empresaId) throw new ErroAcesso();
  if (it.i.situacao !== "extra_solicitado") throw new ErroNegocio("Item não está aguardando decisão.");
  if (aprovar && precoUnitarioCentavos === null && !it.i.incluidoContrato) throw new ErroNegocio("Informe o preço do extra aprovado (ou marque como incluso no contrato).");
  await tx.update(osItem).set({
    situacao: aprovar ? "aprovado" : "recusado", decididoPor: ctx.usuarioId, decididoEm: new Date(),
    precoUnitarioCentavos: aprovar && pode(ctx, "os.valores.ver") ? precoUnitarioCentavos : it.i.precoUnitarioCentavos,
  }).where(eq(osItem.id, itemId));
  await tx.update(pendencia).set({ situacao: "resolvida", resolvidaPor: ctx.usuarioId, resolvidaEm: new Date(), resolucao: aprovar ? "Extra aprovado" : `Extra recusado${motivo ? ": " + motivo : ""}` })
    .where(and(eq(pendencia.entidadeTipo, "os_item"), eq(pendencia.entidadeId, itemId), inArray(pendencia.situacao, ["aberta", "em_andamento"])));
  await auditar(tx, ctx, { acao: aprovar ? "os.extra_aprovado" : "os.extra_recusado", entidadeTipo: "os", entidadeId: it.i.osId, motivo, depois: { itemId, precoUnitarioCentavos } });
  await tocarOS(tx, it.i.osId);
}

export async function atualizarOS(tx: DBOrTx, ctx: Ctx, osId: string, d: Partial<Pick<NovaOS, "descricao" | "prioridade" | "observacoes" | "localId" | "contatoId" | "equipamentos">> & { responsavelResolucaoId?: string | null; proximaAcao?: string | null; proximaAcaoEm?: string | null; situacaoMaterial?: string; motivoEtapa?: string | null }) {
  exigir(ctx, "os.gerenciar");
  const [antes] = await tx.select().from(ordemServico).where(and(eq(ordemServico.id, osId), eq(ordemServico.empresaId, ctx.empresaId)));
  if (!antes) throw new ErroAcesso();
  if (["encerrada", "cancelada"].includes(antes.etapa)) throw new ErroNegocio("OS encerrada/cancelada não pode ser editada. Abra um retorno vinculado se necessário.");
  const { equipamentos, ...campos } = d;
  if (campos.responsavelResolucaoId) {
    const [u] = await tx.select().from(usuario).where(and(eq(usuario.id, campos.responsavelResolucaoId), eq(usuario.empresaId, ctx.empresaId)));
    if (!u) throw new ErroNegocio("Responsável inválido.");
  }
  const [depois] = await tx.update(ordemServico).set({ ...campos, ultimoAvancoEm: new Date() }).where(eq(ordemServico.id, osId)).returning();
  if (equipamentos) {
    await tx.delete(osEquipamento).where(eq(osEquipamento.osId, osId));
    if (equipamentos.length) await vincularEquipamentos(tx, osId, antes.clienteId, equipamentos);
  }
  await auditar(tx, ctx, { acao: "os.atualizada", entidadeTipo: "os", entidadeId: osId, antes, depois });
  await recalcularEtapa(tx, osId);
  return depois;
}

export async function aprovarComercialmente(tx: DBOrTx, ctx: Ctx, osId: string) {
  exigir(ctx, "os.gerenciar");
  const [o] = await tx.update(ordemServico).set({ situacaoComercial: "aprovada", ultimoAvancoEm: new Date() })
    .where(and(eq(ordemServico.id, osId), eq(ordemServico.empresaId, ctx.empresaId), eq(ordemServico.situacaoComercial, "rascunho"))).returning();
  if (!o) throw new ErroNegocio("OS não está em rascunho.");
  await auditar(tx, ctx, { acao: "os.aprovada", entidadeTipo: "os", entidadeId: osId });
}

export async function cancelarOS(tx: DBOrTx, ctx: Ctx, osId: string, motivo: string) {
  exigir(ctx, "os.gerenciar");
  if (!motivo?.trim()) throw new ErroNegocio("Informe o motivo do cancelamento.");
  const [o] = await tx.select().from(ordemServico).where(and(eq(ordemServico.id, osId), eq(ordemServico.empresaId, ctx.empresaId))).for("update");
  if (!o) throw new ErroAcesso();
  if (o.etapa === "cancelada") return;
  const vs = await tx.select().from(visita).where(eq(visita.osId, osId));
  if (vs.some((v) => v.situacao === "em_atendimento")) throw new ErroNegocio("Há visita em atendimento. Finalize-a antes de cancelar.");
  // visitas futuras canceladas e reservas liberadas; visitas realizadas permanecem no histórico
  for (const v of vs.filter((x) => x.situacao === "agendada" || x.situacao === "nao_agendada")) {
    await tx.update(visita).set({ situacao: "cancelada", canceladaMotivo: `OS cancelada: ${motivo}` }).where(eq(visita.id, v.id));
    await tx.update(agendaReserva).set({ ativo: false }).where(and(eq(agendaReserva.visitaId, v.id), sql`lower(${qc(agendaReserva.periodo)}) > now()`));
  }
  await tx.update(ordemServico).set({ etapa: "cancelada", etapaDesde: new Date(), situacaoComercial: "cancelada", canceladaMotivo: motivo, ultimoAvancoEm: new Date() }).where(eq(ordemServico.id, osId));
  await tx.update(autonomoServico).set({ situacao: "cancelado" }).where(and(eq(autonomoServico.osId, osId), inArray(autonomoServico.situacao, ["aguardando_valor", "aguardando_conferencia"])));
  await auditar(tx, ctx, { acao: "os.cancelada", entidadeTipo: "os", entidadeId: osId, motivo, antes: { etapa: o.etapa } });
}

/** Conferência administrativa (distinta do encerramento técnico). */
export async function conferirOS(tx: DBOrTx, ctx: Ctx, osId: string, observacao?: string, excecao?: string) {
  exigir(ctx, "os.conferir");
  const [o] = await tx.select().from(ordemServico).where(and(eq(ordemServico.id, osId), eq(ordemServico.empresaId, ctx.empresaId))).for("update");
  if (!o) throw new ErroAcesso();
  if (o.etapa !== "servico_concluido") {
    if (!excecao || !ctx.papeis.includes("gestor")) throw new ErroNegocio("Somente OS com serviço concluído podem ser conferidas. Exceções exigem o gestor e motivo.");
  }
  const vs = await tx.select().from(visita).where(eq(visita.osId, osId));
  await tx.update(visita).set({ conferidaPor: ctx.usuarioId, conferidaEm: new Date() }).where(and(eq(visita.osId, osId), eq(visita.situacao, "finalizada"), isNull(visita.conferidaEm)));
  await tx.update(ordemServico).set({ situacaoConferencia: "conferida", conferidaPor: ctx.usuarioId, conferidaEm: new Date(), etapa: "encerrada", etapaDesde: new Date(), encerradaEm: new Date(), ultimoAvancoEm: new Date(), motivoEtapa: excecao ?? null })
    .where(eq(ordemServico.id, osId));
  // serviços de autônomos com valor passam a aguardar conferência financeira
  await tx.update(autonomoServico).set({ situacao: "aguardando_conferencia" }).where(and(eq(autonomoServico.osId, osId), eq(autonomoServico.situacao, "aguardando_valor"), sql`${qc(autonomoServico.valorCombinadoCentavos)} is not null`));
  await auditar(tx, ctx, { acao: excecao ? "os.encerrada_excecao" : "os.conferida", entidadeTipo: "os", entidadeId: osId, motivo: excecao ?? observacao, antes: { etapa: o.etapa, visitas: vs.length } });
}

export async function tocarOS(tx: DBOrTx, osId: string) {
  await tx.update(ordemServico).set({ ultimoAvancoEm: new Date() }).where(eq(ordemServico.id, osId));
}

/**
 * Resumo coerente da OS a partir das dimensões separadas (visitas, material, conferência).
 * Uma visita concluída não encerra a OS se houver outras pendentes.
 */
export async function recalcularEtapa(tx: DBOrTx, osId: string): Promise<OsEtapa> {
  const [o] = await tx.select().from(ordemServico).where(eq(ordemServico.id, osId));
  if (!o) throw new ErroNegocio("OS não encontrada.");
  if (o.etapa === "cancelada" || o.etapa === "encerrada") return o.etapa as OsEtapa;
  const vs = (await tx.select().from(visita).where(eq(visita.osId, osId)).orderBy(asc(visita.sequencia))).filter((v) => v.situacao !== "cancelada");
  const mat = o.situacaoMaterial;
  let etapa: OsEtapa; let conf = o.situacaoConferencia;
  const emAtendimento = vs.some((v) => v.situacao === "em_atendimento");
  const agendadas = vs.filter((v) => v.situacao === "agendada");
  const naoAgendadas = vs.filter((v) => v.situacao === "nao_agendada");
  const finalizadas = vs.filter((v) => v.situacao === "finalizada");
  const ultima = finalizadas.sort((a, b) => (b.checkoutEm?.getTime() ?? 0) - (a.checkoutEm?.getTime() ?? 0))[0];
  if (emAtendimento) etapa = "em_atendimento";
  else if (agendadas.length) etapa = mat === "pendente" ? "aguardando_material" : "pronta_para_atendimento";
  else if (ultima && ultima.resultado !== "concluida") etapa = "pendente_retorno";
  else if (ultima && ultima.resultado === "concluida" && naoAgendadas.length === 0) { etapa = "servico_concluido"; conf = "pendente"; }
  else if (mat === "pendente") etapa = "aguardando_material";
  else if (vs.length) etapa = "em_planejamento";
  else etapa = "aberta";
  if (etapa !== "servico_concluido" && conf === "pendente") conf = "nao_aplicavel";
  if (etapa !== o.etapa || conf !== o.situacaoConferencia) {
    await tx.update(ordemServico).set({ etapa, etapaDesde: etapa !== o.etapa ? new Date() : o.etapaDesde, situacaoConferencia: conf, ultimoAvancoEm: new Date() }).where(eq(ordemServico.id, osId));
  }
  return etapa;
}

// ---------------------------------------------------------------- consultas
export interface FiltroOS { etapa?: string; origem?: string; clienteId?: string; profissionalId?: string; busca?: string; semResponsavel?: boolean; materialPendente?: boolean; conferenciaPendente?: boolean; limite?: number; offset?: number; ids?: string[] }

export function condicoesOS(ctx: Ctx, f: FiltroOS): SQL[] {
  const conds: SQL[] = [eq(ordemServico.empresaId, ctx.empresaId)];
  if (!pode(ctx, "os.ver", "empresa")) {
    if (!pode(ctx, "os.ver", "proprio") || !ctx.profissional) throw new ErroAcesso();
    conds.push(osDoProfissionalSQL(ctx.profissional.id));
  }
  if (f.etapa) conds.push(f.etapa === "abertas" ? sql`${qc(ordemServico.etapa)} not in ('encerrada','cancelada')` : eq(ordemServico.etapa, f.etapa));
  if (f.origem) conds.push(eq(ordemServico.origem, f.origem));
  if (f.clienteId) conds.push(eq(ordemServico.clienteId, f.clienteId));
  if (f.profissionalId) conds.push(osDoProfissionalSQL(f.profissionalId));
  if (f.busca) {
    const n = Number(f.busca);
    conds.push(or(ilike(ordemServico.descricao, `%${f.busca}%`), ilike(cliente.nome, `%${f.busca}%`), ilike(ordemServico.referenciaExterna, `%${f.busca}%`), ...(Number.isInteger(n) ? [eq(ordemServico.numero, n)] : []))!);
  }
  if (f.semResponsavel) conds.push(sql`${qc(ordemServico.etapa)} not in ('encerrada','cancelada') and not exists (select 1 from ${visita} v join ${agendaReserva} ar on ar.visita_id = v.id and ar.ativo where v.os_id = ${qc(ordemServico.id)} and v.situacao <> 'cancelada')`);
  if (f.materialPendente) conds.push(and(eq(ordemServico.situacaoMaterial, "pendente"), sql`${qc(ordemServico.etapa)} not in ('encerrada','cancelada')`)!);
  if (f.conferenciaPendente) conds.push(eq(ordemServico.etapa, "servico_concluido"));
  if (f.ids) conds.push(inArray(ordemServico.id, f.ids.length ? f.ids : ["00000000-0000-0000-0000-000000000000"]));
  return conds;
}

export async function listarOS(dbx: DBOrTx, ctx: Ctx, f: FiltroOS = {}) {
  const conds = condicoesOS(ctx, f);
  const rows = await dbx.select({
    id: ordemServico.id, numero: ordemServico.numero, origem: ordemServico.origem, etapa: ordemServico.etapa, etapaDesde: ordemServico.etapaDesde,
    prioridade: ordemServico.prioridade, descricao: ordemServico.descricao, situacaoMaterial: ordemServico.situacaoMaterial,
    situacaoComercial: ordemServico.situacaoComercial, motivoEtapa: ordemServico.motivoEtapa, proximaAcao: ordemServico.proximaAcao,
    ultimoAvancoEm: ordemServico.ultimoAvancoEm, referenciaExterna: ordemServico.referenciaExterna, demo: ordemServico.demo,
    clienteNome: cliente.nome, localNome: clienteLocal.nome, responsavelNome: usuario.nome,
    proximaVisita: sql<string | null>`(select min(v.inicio_previsto) from ${visita} v where v.os_id = ${qc(ordemServico.id)} and v.situacao = 'agendada')`,
    equipe: sql<string | null>`(select string_agg(distinct p.nome, ', ') from ${visita} v join ${agendaReserva} ar on ar.visita_id = v.id and ar.ativo join ${profissional} p on p.id = ar.profissional_id where v.os_id = ${qc(ordemServico.id)} and v.situacao in ('agendada','em_atendimento'))`,
    total: sql<number>`count(*) over()::int`,
  }).from(ordemServico)
    .innerJoin(cliente, eq(cliente.id, ordemServico.clienteId))
    .leftJoin(clienteLocal, eq(clienteLocal.id, ordemServico.localId))
    .leftJoin(usuario, eq(usuario.id, ordemServico.responsavelResolucaoId))
    .where(and(...conds)).orderBy(desc(ordemServico.numero)).limit(f.limite ?? 50).offset(f.offset ?? 0);
  return { rows, total: rows[0]?.total ?? 0 };
}

/** Detalhe da OS com redação de campos sensíveis conforme permissões (nada oculto é enviado ao navegador). */
export async function obterOS(dbx: DBOrTx, ctx: Ctx, osId: string) {
  await exigirAcessoOS(dbx, ctx, osId);
  const [o] = await dbx.select().from(ordemServico).where(eq(ordemServico.id, osId));
  const [cli] = await dbx.select({ id: cliente.id, nome: cliente.nome, telefone: cliente.telefone, documento: cliente.documento }).from(cliente).where(eq(cliente.id, o.clienteId));
  const [local] = o.localId ? await dbx.select().from(clienteLocal).where(eq(clienteLocal.id, o.localId)) : [null];
  const [contato] = o.contatoId ? await dbx.select().from(clienteContato).where(eq(clienteContato.id, o.contatoId)) : [null];
  const equipamentos = await dbx.select({ e: equipamento }).from(osEquipamento).innerJoin(equipamento, eq(equipamento.id, osEquipamento.equipamentoId)).where(eq(osEquipamento.osId, osId));
  const verPreco = pode(ctx, "os.valores.ver"); const verCusto = pode(ctx, "os.custos.ver");
  const itens = (await dbx.select().from(osItem).where(eq(osItem.osId, osId)).orderBy(asc(osItem.criadoEm)))
    .map((i) => ({ ...i, precoUnitarioCentavos: verPreco ? i.precoUnitarioCentavos : null, custoUnitarioCentavos: verCusto ? i.custoUnitarioCentavos : null }));
  const vs = await dbx.select().from(visita).where(eq(visita.osId, osId)).orderBy(asc(visita.sequencia));
  const participantes = vs.length ? await dbx.select({ visitaId: agendaReserva.visitaId, profissionalId: agendaReserva.profissionalId, papel: agendaReserva.papelNaVisita, nome: profissional.nome, vinculo: profissional.vinculo })
    .from(agendaReserva).innerJoin(profissional, eq(profissional.id, agendaReserva.profissionalId)).where(and(inArray(agendaReserva.visitaId, vs.map((v) => v.id)), eq(agendaReserva.ativo, true))) : [];
  const execs = vs.length ? await dbx.select().from(visitaExecucao).where(inArray(visitaExecucao.visitaId, vs.map((v) => v.id))) : [];
  const [abertaPor] = await dbx.select({ nome: usuario.nome }).from(usuario).where(eq(usuario.id, o.abertaPor));
  const [resp] = o.responsavelResolucaoId ? await dbx.select({ nome: usuario.nome }).from(usuario).where(eq(usuario.id, o.responsavelResolucaoId)) : [null];
  const [contratoRow] = o.contratoId ? await dbx.select({ id: contrato.id, numero: contrato.numero, cobertura: contrato.cobertura }).from(contrato).where(eq(contrato.id, o.contratoId)) : [null];
  const [osOrigem] = o.osOrigemId ? await dbx.select({ id: ordemServico.id, numero: ordemServico.numero }).from(ordemServico).where(eq(ordemServico.id, o.osOrigemId)) : [null];
  const retornos = await dbx.select({ id: ordemServico.id, numero: ordemServico.numero, etapa: ordemServico.etapa }).from(ordemServico).where(eq(ordemServico.osOrigemId, osId));
  const [pedido] = o.pedidoExternoId && pode(ctx, "pedido.ver") ? await dbx.select({ id: pedidoExterno.id, origem: pedidoExterno.origem, idExterno: pedidoExterno.idExterno, situacao: pedidoExterno.situacao }).from(pedidoExterno).where(eq(pedidoExterno.id, o.pedidoExternoId)) : [null];
  return {
    os: o, cliente: cli, local, contato, equipamentos: equipamentos.map((e) => e.e), itens, visitas: vs.map((v) => ({ ...v, participantes: participantes.filter((p) => p.visitaId === v.id), execucoes: execs.filter((e) => e.visitaId === v.id) })),
    abertaPorNome: abertaPor?.nome, responsavelNome: resp?.nome ?? null, contrato: contratoRow, osOrigem, retornos, pedido,
    verPreco, verCusto,
    totalPrevistoCentavos: verPreco ? itens.filter((i) => ["previsto", "aprovado"].includes(i.situacao) && !i.incluidoContrato).reduce((s, i) => s + valorItem(i.precoUnitarioCentavos, i.quantidade), 0) : null,
  };
}

export async function opcoesOS(dbx: DBOrTx, ctx: Ctx, clienteId?: string) {
  exigir(ctx, "os.ver");
  const conds = [eq(ordemServico.empresaId, ctx.empresaId), ne(ordemServico.etapa, "cancelada")];
  if (clienteId) conds.push(eq(ordemServico.clienteId, clienteId));
  return dbx.select({ id: ordemServico.id, numero: ordemServico.numero, descricao: ordemServico.descricao }).from(ordemServico).where(and(...conds)).orderBy(desc(ordemServico.numero)).limit(200);
}
