/**
 * Veículos: cadastro único, odômetro, checklist (somente elegíveis), irregularidades, manutenções, pneus e alertas.
 * Técnico AUTÔNOMO nunca executa checklist de veículo (bloqueado aqui, independentemente de permissões).
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { qc } from "../db/sql";
import type { DBOrTx } from "../db";
import { categoriaFinanceira, checklistModelo, checklistModeloItem, checklistResposta, checklistRespostaItem, pendencia, pneu, profissional, usuario, veiculo, veiculoManutencao, veiculoOdometro } from "../db/schema";
import { type Ctx, exigir, pode } from "../auth/contexto";
import { ErroAcesso, ErroNegocio } from "../erros";
import { auditar } from "./auditoria";
import { garantirPendencia } from "./pendencias";
import { obterConfig } from "./config";
import { criarObrigacao } from "./financeiro";
import { diffDias, hojeSP, somarDias, intervaloDiaSP } from "@/lib/datas";

const CRIT_PRIORIDADE: Record<string, string> = { baixa: "baixa", media: "media", alta: "alta", critica: "critica" };

/**
 * Elegibilidade ao checklist: gestor/administrativo autorizado (empresa) OU técnico da equipe própria.
 * O técnico próprio escolhe a placa do dia no checklist (vira o veículo designado). Autônomo: nunca.
 */
export function podeChecklistVeiculo(ctx: Ctx, _veiculoId: string): boolean {
  if (ctx.profissional?.vinculo === "autonomo" && !pode(ctx, "veiculo.checklist", "empresa")) return false;
  if (pode(ctx, "veiculo.checklist", "empresa")) return true;
  return pode(ctx, "veiculo.checklist", "proprio") && ctx.profissional?.vinculo === "proprio";
}

/** Checklist de saída feito HOJE (data de São Paulo) pelo técnico próprio, ainda válido. Libera o check-in. */
export async function checklistDoDia(dbx: DBOrTx, ctx: Pick<Ctx, "profissional">) {
  const prof = ctx.profissional;
  if (!prof || prof.vinculo !== "proprio") return null;
  const [ini] = intervaloDiaSP(hojeSP());
  const [r] = await dbx.select({ r: checklistResposta, identificacao: veiculo.identificacao, placa: veiculo.placa }).from(checklistResposta).innerJoin(veiculo, eq(veiculo.id, checklistResposta.veiculoId))
    .where(and(eq(checklistResposta.profissionalId, prof.id), eq(checklistResposta.tipo, "veiculo_saida"), sql`${qc(checklistResposta.realizadoEm)} >= ${ini.toISOString()}`, sql`${qc(checklistResposta.validoAte)} > now()`))
    .orderBy(desc(checklistResposta.realizadoEm)).limit(1);
  return r ?? null;
}

/** Veículos ativos para o técnico escolher a placa do dia. */
export async function veiculosParaChecklist(dbx: DBOrTx, ctx: Ctx) {
  if (!temAcessoChecklistVeiculo(ctx)) throw new ErroAcesso("Técnico autônomo não possui checklist de veículo.");
  return dbx.select({ id: veiculo.id, identificacao: veiculo.identificacao, placa: veiculo.placa, modelo: veiculo.modelo, odometroKm: veiculo.odometroKm }).from(veiculo)
    .where(and(eq(veiculo.empresaId, ctx.empresaId), eq(veiculo.ativo, true))).orderBy(asc(veiculo.identificacao));
}
/** Menu/endpoint de checklist de veículo existe para o usuário? (autônomo: não). */
export function temAcessoChecklistVeiculo(ctx: Ctx): boolean {
  if (pode(ctx, "veiculo.checklist", "empresa")) return true;
  return pode(ctx, "veiculo.checklist", "proprio") && ctx.profissional?.vinculo === "proprio";
}
function exigirVeiculoVisivel(ctx: Ctx, veiculoId: string) {
  if (pode(ctx, "veiculo.ver", "empresa")) return;
  if (pode(ctx, "veiculo.ver", "proprio") && ctx.profissional?.vinculo === "proprio" && ctx.profissional.veiculoId === veiculoId) return;
  throw new ErroAcesso();
}

export async function salvarVeiculo(tx: DBOrTx, ctx: Ctx, id: string | null, d: { identificacao: string; placa?: string | null; modelo?: string | null; ano?: number | null; responsavelProfissionalId?: string | null; parametrosManutencao: Record<string, { km?: number | null; dias?: number | null }>; ativo?: boolean; versao?: number }) {
  exigir(ctx, "veiculo.gerenciar");
  if (!d.identificacao.trim()) throw new ErroNegocio("Identificação obrigatória.");
  if (d.responsavelProfissionalId) {
    const [p] = await tx.select().from(profissional).where(and(eq(profissional.id, d.responsavelProfissionalId), eq(profissional.empresaId, ctx.empresaId)));
    if (!p) throw new ErroNegocio("Responsável inválido.");
  }
  if (id) {
    const [antes] = await tx.select().from(veiculo).where(and(eq(veiculo.id, id), eq(veiculo.empresaId, ctx.empresaId)));
    if (!antes) throw new ErroAcesso();
    const { versao, ...dados } = d;
    const [r] = await tx.update(veiculo).set({ ...dados, versao: antes.versao + 1 }).where(and(eq(veiculo.id, id), eq(veiculo.versao, versao ?? antes.versao))).returning();
    if (!r) throw new ErroNegocio("Este registro foi alterado por outro usuário depois que você abriu a tela. Recarregue para ver a versão atual e refaça a alteração.");
    await auditar(tx, ctx, { acao: "veiculo.atualizado", entidadeTipo: "veiculo", entidadeId: id, antes, depois: r });
    return r;
  }
  const { versao: _v, ...novo } = d; void _v;
  const [r] = await tx.insert(veiculo).values({ ...novo, empresaId: ctx.empresaId }).returning();
  await auditar(tx, ctx, { acao: "veiculo.criado", entidadeTipo: "veiculo", entidadeId: r.id, depois: r });
  return r;
}

/** Designa veículo a técnico da equipe própria (resolve pendência de "sem veículo"). */
export async function designarVeiculo(tx: DBOrTx, ctx: Ctx, profissionalId: string, veiculoId: string | null, motivo?: string | null) {
  exigir(ctx, "veiculo.gerenciar");
  const [p] = await tx.select().from(profissional).where(and(eq(profissional.id, profissionalId), eq(profissional.empresaId, ctx.empresaId)));
  if (!p) throw new ErroAcesso();
  if (veiculoId && p.vinculo !== "proprio") throw new ErroNegocio("Somente técnicos da equipe própria recebem veículo designado.");
  if (veiculoId) { const [v] = await tx.select().from(veiculo).where(and(eq(veiculo.id, veiculoId), eq(veiculo.empresaId, ctx.empresaId))); if (!v) throw new ErroNegocio("Veículo inválido."); }
  await tx.update(profissional).set({ veiculoId }).where(eq(profissional.id, profissionalId));
  if (veiculoId) {
    await tx.update(pendencia).set({ situacao: "resolvida", resolucao: "Veículo designado", resolvidaPor: ctx.usuarioId, resolvidaEm: new Date() })
      .where(and(eq(pendencia.empresaId, ctx.empresaId), eq(pendencia.chave, `veiculo_sem_designacao:${profissionalId}`), inArray(pendencia.situacao, ["aberta", "em_andamento"])));
  }
  await auditar(tx, ctx, { acao: "veiculo.designado", entidadeTipo: "profissional", entidadeId: profissionalId, motivo, antes: { veiculoId: p.veiculoId }, depois: { veiculoId } });
}

/** Odômetro: redução só como correção autorizada e com motivo. */
export async function registrarOdometro(tx: DBOrTx, ctx: Ctx, veiculoId: string, km: number, fonte: string, correcao?: { motivo: string } | null) {
  const [v] = await tx.select().from(veiculo).where(and(eq(veiculo.id, veiculoId), eq(veiculo.empresaId, ctx.empresaId))).for("update");
  if (!v) throw new ErroAcesso();
  if (!Number.isInteger(km) || km < 0) throw new ErroNegocio("Quilometragem inválida.");
  if (v.odometroKm !== null && km < v.odometroKm) {
    if (!correcao) throw new ErroNegocio(`KM informado (${km}) menor que o atual (${v.odometroKm}). Redução exige correção autorizada pelo gestor, com motivo.`);
    exigir(ctx, "veiculo.odometro.corrigir");
    if (!correcao.motivo?.trim()) throw new ErroNegocio("Motivo da correção obrigatório.");
  }
  await tx.insert(veiculoOdometro).values({ veiculoId, km, fonte: correcao ? "correcao" : fonte, correcao: !!correcao, motivo: correcao?.motivo ?? null, autorizadoPor: correcao ? ctx.usuarioId : null, registradoPor: ctx.usuarioId });
  if (v.odometroKm === null || km >= v.odometroKm || correcao) await tx.update(veiculo).set({ odometroKm: km, odometroAtualizadoEm: new Date() }).where(eq(veiculo.id, veiculoId));
  if (correcao) await auditar(tx, ctx, { acao: "veiculo.odometro_corrigido", entidadeTipo: "veiculo", entidadeId: veiculoId, motivo: correcao.motivo, antes: { km: v.odometroKm }, depois: { km }, sensivel: true });
}

// ---------------------------------------------------------------- checklist
export async function modeloChecklist(dbx: DBOrTx, ctx: Ctx, tipo: "veiculo_saida" | "veiculo_retorno") {
  const [m] = await dbx.select().from(checklistModelo).where(and(eq(checklistModelo.empresaId, ctx.empresaId), eq(checklistModelo.tipo, tipo), eq(checklistModelo.ativo, true)));
  if (!m) throw new ErroNegocio("Modelo de checklist não configurado.");
  const itens = await dbx.select().from(checklistModeloItem).where(and(eq(checklistModeloItem.modeloId, m.id), eq(checklistModeloItem.ativo, true))).orderBy(asc(checklistModeloItem.ordem));
  return { modelo: m, itens };
}

/**
 * Checklist válido para reutilização: mesmo veículo, mesmo tipo, dentro da validade E mesmo responsável.
 * Troca de responsável (ou de veículo) exige nova conferência.
 */
export async function checklistValido(dbx: DBOrTx, veiculoId: string, tipo: string, responsavel?: { profissionalId?: string | null; usuarioId?: string | null }) {
  const conds = [eq(checklistResposta.veiculoId, veiculoId), eq(checklistResposta.tipo, tipo), sql`${qc(checklistResposta.validoAte)} > now()`];
  if (responsavel?.profissionalId) conds.push(eq(checklistResposta.profissionalId, responsavel.profissionalId));
  else if (responsavel?.usuarioId) conds.push(eq(checklistResposta.usuarioId, responsavel.usuarioId));
  const [r] = await dbx.select({ r: checklistResposta, nome: usuario.nome }).from(checklistResposta).innerJoin(usuario, eq(usuario.id, checklistResposta.usuarioId))
    .where(and(...conds)).orderBy(desc(checklistResposta.realizadoEm)).limit(1);
  return r ?? null;
}

/** Nova versão do modelo de checklist: a versão anterior é desativada e preservada (respostas antigas não mudam). */
export async function salvarModeloChecklist(tx: DBOrTx, ctx: Ctx, tipo: "veiculo_saida" | "veiculo_retorno" | "ferramentas_saida" | "ferramentas_retorno", d: { nome: string; validadeHoras: number; itens: Array<{ descricao: string; criticidade: string; exigeFotoIrregular: boolean }> }) {
  exigir(ctx, "checklist.gerenciar");
  if (!d.nome.trim()) throw new ErroNegocio("Nome obrigatório.");
  if (d.validadeHoras < 1 || d.validadeHoras > 72) throw new ErroNegocio("Validade entre 1 e 72 horas.");
  if (tipo.startsWith("veiculo") && !d.itens.length) throw new ErroNegocio("Inclua ao menos um item.");
  const [atual] = await tx.select().from(checklistModelo).where(and(eq(checklistModelo.empresaId, ctx.empresaId), eq(checklistModelo.tipo, tipo), eq(checklistModelo.ativo, true))).for("update");
  if (atual) await tx.update(checklistModelo).set({ ativo: false }).where(eq(checklistModelo.id, atual.id));
  const [m] = await tx.insert(checklistModelo).values({ empresaId: ctx.empresaId, tipo, nome: d.nome.trim(), validadeHoras: d.validadeHoras, versao: (atual?.versao ?? 0) + 1 }).returning();
  if (d.itens.length) await tx.insert(checklistModeloItem).values(d.itens.map((i, ordem) => ({ modeloId: m.id, ordem, descricao: i.descricao.trim(), criticidade: i.criticidade, exigeFotoIrregular: i.exigeFotoIrregular })));
  await auditar(tx, ctx, { acao: "checklist.modelo_versionado", entidadeTipo: "checklist_modelo", entidadeId: m.id, antes: atual ? { versao: atual.versao } : null, depois: { versao: m.versao, itens: d.itens.length } });
  return m;
}

export interface RespostaChecklistVeiculo { itemId: string; resultado: "conforme" | "irregular" | "nao_aplica"; observacao?: string | null; fotos?: number }

/** Responde checklist. Se já existe checklist válido do mesmo veículo/turno, reutiliza (não obriga refazer a cada cliente). */
export async function responderChecklistVeiculo(tx: DBOrTx, ctx: Ctx, veiculoId: string, tipo: "veiculo_saida" | "veiculo_retorno", km: number | null, respostas: RespostaChecklistVeiculo[], observacoes?: string | null, chave?: string | null, forcarNovo = false) {
  if (!podeChecklistVeiculo(ctx, veiculoId)) throw new ErroAcesso(ctx.profissional?.vinculo === "autonomo" ? "Técnico autônomo não possui checklist de veículo." : "Você não está designado a este veículo.");
  const [v] = await tx.select().from(veiculo).where(and(eq(veiculo.id, veiculoId), eq(veiculo.empresaId, ctx.empresaId)));
  if (!v) throw new ErroAcesso();
  if (!v.ativo) throw new ErroNegocio("Veículo inativo. Escolha outra placa.");
  if (!forcarNovo) { const val = await checklistValido(tx, veiculoId, tipo, { profissionalId: ctx.profissional?.id ?? null, usuarioId: ctx.usuarioId }); if (val) return { resposta: val.r, reutilizado: true, pendencias: [] as string[] }; }
  if (chave) { const [ex] = await tx.select().from(checklistResposta).where(eq(checklistResposta.chaveIdempotencia, chave)); if (ex) return { resposta: ex, reutilizado: true, pendencias: [] }; }
  const { modelo, itens } = await modeloChecklist(tx, ctx, tipo);
  const falt = itens.filter((i) => !respostas.some((r) => r.itemId === i.id));
  if (falt.length) throw new ErroNegocio(`Responda todos os itens (${falt.map((i) => i.descricao).join("; ")}).`);
  for (const r of respostas) {
    const it = itens.find((i) => i.id === r.itemId);
    if (!it) throw new ErroNegocio("Item inválido.");
    if (r.resultado === "irregular") {
      if (!r.observacao?.trim()) throw new ErroNegocio(`Descreva a irregularidade em "${it.descricao}".`);
      if (it.exigeFotoIrregular && !(r.fotos && r.fotos > 0)) throw new ErroNegocio(`Foto obrigatória para irregularidade em "${it.descricao}".`);
    }
  }
  if (km !== null) await registrarOdometro(tx, ctx, veiculoId, km, "checklist");
  const [resp] = await tx.insert(checklistResposta).values({ empresaId: ctx.empresaId, modeloId: modelo.id, tipo, veiculoId, profissionalId: ctx.profissional?.id ?? null, usuarioId: ctx.usuarioId, km, modeloVersao: modelo.versao, validoAte: sql`least(now() + make_interval(hours => ${modelo.validadeHoras}), ${intervaloDiaSP(hojeSP())[1].toISOString()}::timestamptz)` as unknown as Date, observacoes: observacoes ?? null, chaveIdempotencia: chave ?? null }).returning();
  const pendencias: string[] = [];
  const itensIds: Record<string, string> = {};
  for (const r of respostas) {
    const it = itens.find((i) => i.id === r.itemId)!;
    let pendenciaId: string | null = null;
    if (r.resultado === "irregular") {
      const p = await garantirPendencia(tx, ctx, { tipo: "veiculo_irregularidade", titulo: `${v.identificacao}: ${it.descricao}`, descricao: r.observacao, veiculoId, prioridade: CRIT_PRIORIDADE[it.criticidade] ?? "media", entidadeTipo: "veiculo", entidadeId: veiculoId, prazo: somarDias(hojeSP(), it.criticidade === "critica" ? 0 : it.criticidade === "alta" ? 2 : 7), chave: `veiculo_irreg:${veiculoId}:${it.id}` });
      pendenciaId = p.id; pendencias.push(p.id);
    }
    const [ri] = await tx.insert(checklistRespostaItem).values({ respostaId: resp.id, itemId: it.id, descricao: it.descricao, criticidade: it.criticidade, exigeFotoIrregular: it.exigeFotoIrregular, resultado: r.resultado, observacao: r.observacao ?? null, pendenciaId }).returning();
    itensIds[it.id] = ri.id;
  }
  // Técnico próprio: a placa escolhida no checklist de saída passa a ser o veículo do dia.
  const prof = ctx.profissional;
  if (tipo === "veiculo_saida" && prof?.vinculo === "proprio" && prof.veiculoId !== veiculoId) {
    await tx.update(profissional).set({ veiculoId }).where(eq(profissional.id, prof.id));
    await auditar(tx, ctx, { acao: "veiculo.designacao_por_checklist", entidadeTipo: "profissional", entidadeId: prof.id, antes: { veiculoId: prof.veiculoId }, depois: { veiculoId } });
    prof.veiculoId = veiculoId;
  }
  await auditar(tx, ctx, { acao: `checklist.${tipo}`, entidadeTipo: "veiculo", entidadeId: veiculoId, depois: { respostaId: resp.id, km, irregulares: pendencias.length } });
  return { resposta: resp, reutilizado: false, pendencias, itensIds };
}

// ---------------------------------------------------------------- manutenções e pneus
export async function registrarManutencao(tx: DBOrTx, ctx: Ctx, d: { veiculoId: string; tipo: string; data: string; km?: number | null; descricao?: string | null; fornecedorId?: string | null; valorCentavos?: number | null; vencimento?: string | null }) {
  exigir(ctx, "veiculo.gerenciar");
  const [v] = await tx.select().from(veiculo).where(and(eq(veiculo.id, d.veiculoId), eq(veiculo.empresaId, ctx.empresaId)));
  if (!v) throw new ErroAcesso();
  let obrigacaoId: string | null = null;
  const [m] = await tx.insert(veiculoManutencao).values({ veiculoId: d.veiculoId, tipo: d.tipo, data: d.data, km: d.km ?? null, descricao: d.descricao ?? null, fornecedorId: d.fornecedorId ?? null, registradoPor: ctx.usuarioId }).returning();
  if (d.km && (v.odometroKm === null || d.km >= v.odometroKm)) await registrarOdometro(tx, ctx, d.veiculoId, d.km, "manutencao");
  if (d.valorCentavos) {
    if (!d.vencimento) throw new ErroNegocio("Informe o vencimento para gerar a conta a pagar.");
    const [cat] = await tx.select().from(categoriaFinanceira).where(and(eq(categoriaFinanceira.empresaId, ctx.empresaId), eq(categoriaFinanceira.codigo, "veiculo")));
    const ob = await criarObrigacao(tx, ctx, { natureza: "pagar", categoriaId: cat.id, fornecedorId: d.fornecedorId ?? null, veiculoId: d.veiculoId, descricao: `${v.identificacao}: ${d.tipo}${d.descricao ? " — " + d.descricao : ""}`, competencia: d.data.slice(0, 7) + "-01", valorBrutoCentavos: d.valorCentavos, origemTipo: "manutencao", origemId: m.id, chaveUnicidade: `manutencao:${m.id}`, parcelas: [{ vencimento: d.vencimento, valorCentavos: d.valorCentavos }] }, { permissaoAlternativa: "veiculo.gerenciar" });
    obrigacaoId = ob.id;
    await tx.update(veiculoManutencao).set({ obrigacaoId }).where(eq(veiculoManutencao.id, m.id));
  }
  await auditar(tx, ctx, { acao: "veiculo.manutencao", entidadeTipo: "veiculo", entidadeId: d.veiculoId, depois: { tipo: d.tipo, data: d.data, km: d.km } });
  return m;
}

export async function instalarPneu(tx: DBOrTx, ctx: Ctx, d: { veiculoId: string; identificacao: string; marca?: string | null; modelo?: string | null; posicao: string; instaladoEm: string; kmInstalacao?: number | null }) {
  exigir(ctx, "veiculo.gerenciar");
  const [v] = await tx.select().from(veiculo).where(and(eq(veiculo.id, d.veiculoId), eq(veiculo.empresaId, ctx.empresaId)));
  if (!v) throw new ErroAcesso();
  const [ocupado] = await tx.select().from(pneu).where(and(eq(pneu.veiculoId, d.veiculoId), eq(pneu.posicao, d.posicao), eq(pneu.situacao, "instalado")));
  if (ocupado) throw new ErroNegocio(`Posição ${d.posicao} ocupada pelo pneu ${ocupado.identificacao}. Registre a retirada antes.`);
  const [ex] = await tx.select().from(pneu).where(and(eq(pneu.empresaId, ctx.empresaId), eq(pneu.identificacao, d.identificacao)));
  let r;
  if (ex) {
    if (ex.situacao === "instalado") throw new ErroNegocio("Pneu já instalado em outro veículo/posição.");
    [r] = await tx.update(pneu).set({ veiculoId: d.veiculoId, posicao: d.posicao, instaladoEm: d.instaladoEm, kmInstalacao: d.kmInstalacao ?? null, retiradoEm: null, kmRetirada: null, motivoRetirada: null, situacao: "instalado" }).where(eq(pneu.id, ex.id)).returning();
  } else [r] = await tx.insert(pneu).values({ ...d, empresaId: ctx.empresaId, situacao: "instalado" }).returning();
  await auditar(tx, ctx, { acao: "veiculo.pneu_instalado", entidadeTipo: "veiculo", entidadeId: d.veiculoId, depois: d });
  return r;
}

export async function retirarPneu(tx: DBOrTx, ctx: Ctx, pneuId: string, d: { retiradoEm: string; kmRetirada?: number | null; motivo: string }) {
  exigir(ctx, "veiculo.gerenciar");
  if (!d.motivo?.trim()) throw new ErroNegocio("Motivo da retirada obrigatório.");
  const [p] = await tx.select().from(pneu).where(and(eq(pneu.id, pneuId), eq(pneu.empresaId, ctx.empresaId)));
  if (!p || p.situacao !== "instalado") throw new ErroNegocio("Pneu não está instalado.");
  if (d.kmRetirada !== null && d.kmRetirada !== undefined && p.kmInstalacao !== null && d.kmRetirada < p.kmInstalacao) throw new ErroNegocio("KM de retirada menor que o de instalação.");
  await tx.update(pneu).set({ retiradoEm: d.retiradoEm, kmRetirada: d.kmRetirada ?? null, motivoRetirada: d.motivo, situacao: "retirado" }).where(eq(pneu.id, pneuId));
  await auditar(tx, ctx, { acao: "veiculo.pneu_retirado", entidadeTipo: "veiculo", entidadeId: p.veiculoId, depois: d });
}

/** Duração efetiva do pneu (dias e km) — somente quando há dados. */
export function duracaoPneu(p: typeof pneu.$inferSelect, odometroAtual: number | null) {
  const fimData = p.retiradoEm ?? hojeSP();
  const dias = p.instaladoEm ? diffDias(p.instaladoEm, fimData) : null;
  const kmFim = p.kmRetirada ?? (p.situacao === "instalado" ? odometroAtual : null);
  const km = p.kmInstalacao !== null && kmFim !== null ? kmFim - p.kmInstalacao : null;
  return { dias, km, emUso: p.situacao === "instalado" };
}

// ---------------------------------------------------------------- alertas
export interface AlertaManutencao { veiculoId: string; veiculo: string; tipo: string; status: "vencido" | "proximo" | "ok" | "sem_base"; motivo: string; proximoKm: number | null; proximaData: string | null; limitacao: string | null }

const TIPOS_PARAM = { oleo: "Troca de óleo", alinhamento: "Alinhamento/balanceamento", rodizio: "Rodízio de pneus" } as const;

/** Data OU quilometragem — prevalece o primeiro limite atingido. Sem dados, não inventa previsão. */
export async function alertasManutencao(dbx: DBOrTx, ctx: Ctx, veiculoIds?: string[]) {
  const cfg = await obterConfig(dbx, ctx.empresaId);
  const conds = [eq(veiculo.empresaId, ctx.empresaId), eq(veiculo.ativo, true)];
  if (veiculoIds) conds.push(inArray(veiculo.id, veiculoIds.length ? veiculoIds : ["00000000-0000-0000-0000-000000000000"]));
  const vs = await dbx.select().from(veiculo).where(and(...conds));
  const hoje = hojeSP();
  const out: AlertaManutencao[] = [];
  for (const v of vs) {
    const kmDesatualizado = !v.odometroAtualizadoEm || Date.now() - v.odometroAtualizadoEm.getTime() > 15 * 86400000;
    for (const [tipo, nome] of Object.entries(TIPOS_PARAM)) {
      const par = v.parametrosManutencao?.[tipo];
      if (!par || (!par.km && !par.dias)) { out.push({ veiculoId: v.id, veiculo: v.identificacao, tipo: nome, status: "sem_base", motivo: "Parâmetro de manutenção não definido para este veículo.", proximoKm: null, proximaData: null, limitacao: null }); continue; }
      const [ult] = await dbx.select().from(veiculoManutencao).where(and(eq(veiculoManutencao.veiculoId, v.id), eq(veiculoManutencao.tipo, tipo))).orderBy(desc(veiculoManutencao.data)).limit(1);
      if (!ult) { out.push({ veiculoId: v.id, veiculo: v.identificacao, tipo: nome, status: "sem_base", motivo: "Sem registro da última manutenção deste tipo: previsão indisponível.", proximoKm: null, proximaData: null, limitacao: null }); continue; }
      const proximoKm = par.km && ult.km !== null ? ult.km + par.km : null;
      const proximaData = par.dias ? somarDias(ult.data, par.dias) : null;
      let status: AlertaManutencao["status"] = "ok"; const motivos: string[] = [];
      if (proximaData && hoje >= proximaData) { status = "vencido"; motivos.push(`data limite ${proximaData.split("-").reverse().join("/")}`); }
      if (proximoKm !== null && v.odometroKm !== null && v.odometroKm >= proximoKm) { status = "vencido"; motivos.push(`KM ${v.odometroKm} ≥ ${proximoKm}`); }
      if (status === "ok") {
        if (proximaData && diffDias(hoje, proximaData) <= cfg.veiculos.alertaAntecedenciaDias) { status = "proximo"; motivos.push(`faltam ${diffDias(hoje, proximaData)} dias`); }
        if (proximoKm !== null && v.odometroKm !== null && proximoKm - v.odometroKm <= cfg.veiculos.alertaAntecedenciaKm) { status = "proximo"; motivos.push(`faltam ${proximoKm - v.odometroKm} km`); }
      }
      let limitacao: string | null = null;
      if (par.km && ult.km === null) limitacao = "Última manutenção sem KM registrado: só a data é considerada.";
      else if (par.km && v.odometroKm === null) limitacao = "Odômetro nunca informado: previsão por KM indisponível.";
      else if (par.km && kmDesatualizado) limitacao = `KM atualizado em ${v.odometroAtualizadoEm ? v.odometroAtualizadoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}: previsão por KM pode estar defasada.`;
      out.push({ veiculoId: v.id, veiculo: v.identificacao, tipo: nome, status, motivo: motivos.join("; ") || "Dentro do prazo", proximoKm, proximaData, limitacao });
    }
  }
  return out;
}

// ---------------------------------------------------------------- consultas
export async function listarVeiculos(dbx: DBOrTx, ctx: Ctx) {
  exigir(ctx, "veiculo.ver", "proprio");
  const conds = [eq(veiculo.empresaId, ctx.empresaId)];
  if (!pode(ctx, "veiculo.ver", "empresa")) {
    if (ctx.profissional?.vinculo !== "proprio" || !ctx.profissional.veiculoId) return [];
    conds.push(eq(veiculo.id, ctx.profissional.veiculoId));
  }
  return dbx.select({ v: veiculo, responsavelNome: profissional.nome,
    irregularidades: sql<number>`(select count(*)::int from ${pendencia} p where p.veiculo_id = ${qc(veiculo.id)} and p.tipo = 'veiculo_irregularidade' and p.situacao in ('aberta','em_andamento'))`,
    designados: sql<string | null>`(select string_agg(p.nome, ', ') from ${profissional} p where p.veiculo_id = ${qc(veiculo.id)} and p.ativo)`,
    ultimoChecklist: sql<string | null>`(select max(criado_em) from ${checklistResposta} c where c.veiculo_id = ${qc(veiculo.id)})`,
    checklistValido: sql<boolean>`exists (select 1 from ${checklistResposta} c where c.veiculo_id = ${qc(veiculo.id)} and c.tipo = 'veiculo_saida' and c.valido_ate > now())`,
  }).from(veiculo).leftJoin(profissional, eq(profissional.id, veiculo.responsavelProfissionalId)).where(and(...conds)).orderBy(asc(veiculo.identificacao));
}

export async function obterVeiculo(dbx: DBOrTx, ctx: Ctx, id: string) {
  exigirVeiculoVisivel(ctx, id);
  const [v] = await dbx.select().from(veiculo).where(and(eq(veiculo.id, id), eq(veiculo.empresaId, ctx.empresaId)));
  if (!v) throw new ErroAcesso();
  const [odos, mans, pneus, checklists, pend, designados] = await Promise.all([
    dbx.select({ o: veiculoOdometro, nome: usuario.nome }).from(veiculoOdometro).innerJoin(usuario, eq(usuario.id, veiculoOdometro.registradoPor)).where(eq(veiculoOdometro.veiculoId, id)).orderBy(desc(veiculoOdometro.em)).limit(30),
    dbx.select().from(veiculoManutencao).where(eq(veiculoManutencao.veiculoId, id)).orderBy(desc(veiculoManutencao.data)),
    dbx.select().from(pneu).where(eq(pneu.veiculoId, id)).orderBy(asc(pneu.situacao), asc(pneu.posicao)),
    dbx.select({ r: checklistResposta, nome: usuario.nome, irregulares: sql<number>`(select count(*)::int from ${checklistRespostaItem} i where i.resposta_id = ${qc(checklistResposta.id)} and i.resultado = 'irregular')` })
      .from(checklistResposta).innerJoin(usuario, eq(usuario.id, checklistResposta.usuarioId)).where(eq(checklistResposta.veiculoId, id)).orderBy(desc(checklistResposta.realizadoEm)).limit(30),
    dbx.select({ p: pendencia, responsavelNome: usuario.nome }).from(pendencia).leftJoin(usuario, eq(usuario.id, pendencia.responsavelId)).where(and(eq(pendencia.veiculoId, id))).orderBy(desc(pendencia.abertaEm)).limit(50),
    dbx.select({ id: profissional.id, nome: profissional.nome }).from(profissional).where(eq(profissional.veiculoId, id)),
  ]);
  const alertas = await alertasManutencao(dbx, ctx, [id]);
  return { veiculo: v, odometros: odos, manutencoes: mans, pneus: pneus.map((p) => ({ ...p, duracao: duracaoPneu(p, v.odometroKm) })), checklists, pendencias: pend, designados, alertas, podeChecklist: podeChecklistVeiculo(ctx, id) };
}

export async function itensChecklistResposta(dbx: DBOrTx, ctx: Ctx, respostaId: string) {
  const [r] = await dbx.select().from(checklistResposta).where(and(eq(checklistResposta.id, respostaId), eq(checklistResposta.empresaId, ctx.empresaId)));
  if (!r) throw new ErroAcesso();
  if (r.veiculoId) exigirVeiculoVisivel(ctx, r.veiculoId); else if (r.profissionalId !== ctx.profissional?.id) exigir(ctx, "ferramenta.ver");
  return dbx.select().from(checklistRespostaItem).where(eq(checklistRespostaItem.respostaId, respostaId));
}
