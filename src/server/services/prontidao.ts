/**
 * Conferência de prontidão da visita (antes da saída). Reutiliza registros existentes; não cria novas exigências.
 * Cada item: ok | impeditivo | alerta | nao_aplica. Impeditivos podem ser liberados com autorização e justificativa (visita_liberacao).
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DBOrTx } from "../db";
import { qc } from "../db/sql";
import { agendaReserva, checklistResposta, cliente, clienteContato, clienteLocal, ferramenta, ferramentaMovimento, materialMovimento, ordemServico, osEquipamento, osItem, pendencia, profissional, usuario, visita, visitaLiberacao } from "../db/schema";
import { type Ctx, exigir } from "../auth/contexto";
import { ErroNegocio } from "../erros";
import { auditar } from "./auditoria";
import { exigirAcessoVisita } from "./escopo";
import { obterConfig } from "./config";
import { checklistFerramentasValido } from "./ferramentas";

export type StatusItem = "ok" | "impeditivo" | "alerta" | "nao_aplica";
export interface ItemProntidao { codigo: string; rotulo: string; status: StatusItem; detalhe: string; responsavel: string; proximaAcao: string | null; liberacao?: { justificativa: string; por: string; em: Date } }

export async function prontidaoVisita(dbx: DBOrTx, ctx: Ctx, visitaId: string) {
  await exigirAcessoVisita(dbx, ctx, visitaId, "os.ver");
  const cfg = await obterConfig(dbx, ctx.empresaId);
  const [v] = await dbx.select().from(visita).where(eq(visita.id, visitaId));
  const [o] = await dbx.select().from(ordemServico).where(eq(ordemServico.id, v.osId));
  const [cli] = await dbx.select().from(cliente).where(eq(cliente.id, o.clienteId));
  const [local] = o.localId ? await dbx.select().from(clienteLocal).where(eq(clienteLocal.id, o.localId)) : [null];
  const [contato] = o.contatoId ? await dbx.select().from(clienteContato).where(eq(clienteContato.id, o.contatoId)) : [null];
  const eqs = await dbx.select().from(osEquipamento).where(eq(osEquipamento.osId, o.id));
  const equipe = await dbx.select({ id: profissional.id, nome: profissional.nome, vinculo: profissional.vinculo, veiculoId: profissional.veiculoId, papel: agendaReserva.papelNaVisita })
    .from(agendaReserva).innerJoin(profissional, eq(profissional.id, agendaReserva.profissionalId)).where(and(eq(agendaReserva.visitaId, visitaId), eq(agendaReserva.ativo, true)));
  const libs = await dbx.select({ l: visitaLiberacao, nome: usuario.nome }).from(visitaLiberacao).innerJoin(usuario, eq(usuario.id, visitaLiberacao.autorizadoPor)).where(eq(visitaLiberacao.visitaId, visitaId));
  const itens: ItemProntidao[] = [];
  const add = (i: ItemProntidao) => {
    const lib = libs.find((x) => x.l.item === i.codigo);
    if (lib && i.status === "impeditivo") { i.status = "alerta"; i.liberacao = { justificativa: lib.l.justificativa, por: lib.nome, em: lib.l.em }; i.detalhe += " — LIBERADO com exceção autorizada."; }
    itens.push(i);
  };
  const escritorio = "Escritório (agenda)";

  add({ codigo: "agendamento", rotulo: "Data e horário", status: v.situacao === "agendada" || v.situacao === "em_atendimento" ? "ok" : "impeditivo", detalhe: v.inicioPrevisto ? "Visita agendada." : "Visita sem data/horário.", responsavel: escritorio, proximaAcao: v.inicioPrevisto ? null : "Agendar a visita" });
  const endereco = local ? [local.logradouro, local.numero, local.bairro, local.cidade].filter(Boolean).join(", ") : "";
  add({ codigo: "endereco", rotulo: "Cliente e endereço", status: endereco ? "ok" : "impeditivo", detalhe: endereco ? `${cli.nome} — ${endereco}` : `${cli.nome}: local/endereço não informado.`, responsavel: escritorio, proximaAcao: endereco ? null : "Cadastrar local com endereço na OS" });
  const tel = contato?.telefone ?? cli.telefone;
  add({ codigo: "contato", rotulo: "Contato no local", status: tel ? "ok" : "alerta", detalhe: tel ? `${contato?.nome ?? cli.nome}: ${tel}` : "Sem telefone de contato.", responsavel: escritorio, proximaAcao: tel ? null : "Registrar contato do responsável no local" });
  add({ codigo: "servico", rotulo: "Serviço e equipamentos", status: eqs.length ? "ok" : "alerta", detalhe: `${o.descricao.slice(0, 120)} · ${eqs.length} equipamento(s).`, responsavel: escritorio, proximaAcao: eqs.length ? null : "Vincular equipamentos à OS" });
  add({ codigo: "equipe", rotulo: "Equipe", status: !equipe.length ? "impeditivo" : equipe.length < o.qtdProfissionais ? "alerta" : "ok",
    detalhe: equipe.length ? `${equipe.map((e) => e.nome + (e.papel === "responsavel" ? " (responsável)" : "")).join(", ")}${equipe.length < o.qtdProfissionais ? ` — necessários ${o.qtdProfissionais}` : ""}` : "Sem equipe definida.", responsavel: escritorio, proximaAcao: equipe.length >= o.qtdProfissionais ? null : "Completar a equipe" });

  // materiais
  const previstos = await dbx.select().from(osItem).where(and(eq(osItem.osId, o.id), sql`${qc(osItem.materialId)} is not null`, inArray(osItem.situacao, ["previsto", "aprovado"])));
  const movs = await dbx.select().from(materialMovimento).where(and(eq(materialMovimento.osId, o.id), eq(materialMovimento.tipo, "entrega")));
  let matStatus: StatusItem = "ok"; let matDet = "Sem materiais previstos."; let matAcao: string | null = null;
  if (o.situacaoMaterial === "pendente") { matStatus = "impeditivo"; matDet = "OS marcada como aguardando material."; matAcao = "Providenciar compra/separação e atualizar a situação de material"; }
  else if (previstos.length) {
    const transito = movs.filter((m) => m.status === "em_transito").length; const conf = movs.filter((m) => m.status === "confirmado").length;
    if (!movs.length) { matStatus = "alerta"; matDet = `${previstos.length} material(is) previsto(s); separação/entrega não registrada.`; matAcao = "Registrar a entrega dos materiais"; }
    else if (transito) { matStatus = "alerta"; matDet = `${conf} entrega(s) confirmada(s), ${transito} aguardando confirmação do técnico.`; matAcao = "Técnico confirmar recebimento"; }
    else matDet = `${conf} entrega(s) confirmada(s) para a OS.`;
  }
  add({ codigo: "materiais", rotulo: "Materiais", status: matStatus, detalhe: matDet, responsavel: "Almoxarifado / escritório", proximaAcao: matAcao });

  // ferramentas
  const reservadas = await dbx.select().from(ferramenta).where(and(eq(ferramenta.osReservaId, o.id)));
  const pendFerr = await dbx.select({ id: ferramentaMovimento.id }).from(ferramentaMovimento).where(and(eq(ferramentaMovimento.osId, o.id), eq(ferramentaMovimento.status, "pendente")));
  const semChecklist: string[] = [];
  for (const m of equipe) {
    const [{ n }] = await dbx.select({ n: sql<number>`count(*)::int` }).from(ferramenta).where(and(eq(ferramenta.custodianteProfissionalId, m.id), eq(ferramenta.situacao, "em_custodia")));
    if (n > 0 && !(await checklistFerramentasValido(dbx, ctx, m.id, "ferramentas_saida"))) semChecklist.push(m.nome);
  }
  const fStatus: StatusItem = reservadas.length || pendFerr.length || semChecklist.length ? "alerta" : "ok";
  add({ codigo: "ferramentas", rotulo: "Ferramentas", status: fStatus,
    detalhe: [reservadas.length ? `${reservadas.length} reservada(s) ainda não entregue(s)` : null, pendFerr.length ? `${pendFerr.length} entrega(s) aguardando confirmação` : null, semChecklist.length ? `Conferência de saída pendente: ${semChecklist.join(", ")}` : null].filter(Boolean).join("; ") || "Sem pendências de ferramentas.",
    responsavel: "Almoxarifado / técnico", proximaAcao: fStatus === "ok" ? null : "Entregar/confirmar ferramentas e conferir o kit" });

  // pendências impeditivas da OS
  const pend = await dbx.select().from(pendencia).where(and(eq(pendencia.osId, o.id), inArray(pendencia.situacao, ["aberta", "em_andamento"])));
  const crit = pend.filter((p) => p.prioridade === "critica");
  add({ codigo: "pendencias", rotulo: "Pendências da OS", status: crit.length ? "impeditivo" : pend.length ? "alerta" : "ok", detalhe: pend.length ? pend.map((p) => p.titulo).join("; ") : "Nenhuma pendência aberta.", responsavel: "Responsável de cada pendência", proximaAcao: pend.length ? "Resolver ou liberar as pendências" : null });

  // veículo — somente técnicos da equipe própria (autônomo: não se aplica)
  for (const m of equipe) {
    if (m.vinculo === "autonomo") { itens.push({ codigo: `veiculo:${m.id}`, rotulo: `Veículo — ${m.nome}`, status: "nao_aplica", detalhe: "Técnico autônomo: sem checklist de veículo.", responsavel: "—", proximaAcao: null }); continue; }
    if (!m.veiculoId) { add({ codigo: `veiculo:${m.id}`, rotulo: `Veículo — ${m.nome}`, status: "alerta", detalhe: "Técnico próprio sem veículo designado.", responsavel: escritorio, proximaAcao: "Designar veículo ou confirmar deslocamento" }); continue; }
    const [val] = await dbx.select({ id: checklistResposta.id }).from(checklistResposta).where(and(eq(checklistResposta.veiculoId, m.veiculoId), eq(checklistResposta.profissionalId, m.id), eq(checklistResposta.tipo, "veiculo_saida"), sql`${qc(checklistResposta.validoAte)} > now()`)).limit(1);
    const [critV] = await dbx.select({ titulo: pendencia.titulo }).from(pendencia).where(and(eq(pendencia.veiculoId, m.veiculoId), eq(pendencia.tipo, "veiculo_irregularidade"), eq(pendencia.prioridade, "critica"), inArray(pendencia.situacao, ["aberta", "em_andamento"]), sql`${qc(pendencia.liberacaoExcepcional)} is null`)).limit(1);
    if (critV && cfg.veiculos.bloquearComIrregularidadeCritica) add({ codigo: `veiculo:${m.id}`, rotulo: `Veículo — ${m.nome}`, status: "impeditivo", detalhe: `Irregularidade crítica: ${critV.titulo}.`, responsavel: "Gestor", proximaAcao: "Corrigir, trocar de veículo ou liberação excepcional do gestor" });
    else add({ codigo: `veiculo:${m.id}`, rotulo: `Veículo — ${m.nome}`, status: val ? "ok" : cfg.veiculos.checklistSaidaObrigatorio ? "impeditivo" : "alerta", detalhe: val ? "Checklist de saída válido para o turno (reutilizado)." : "Checklist de saída do turno não realizado.", responsavel: m.nome, proximaAcao: val ? null : "Realizar checklist de saída" });
  }
  const impeditivos = itens.filter((i) => i.status === "impeditivo");
  return { pronta: impeditivos.length === 0, situacao: impeditivos.length ? "Com pendências" : "Pronta para atendimento", itens, impeditivos: impeditivos.length, alertas: itens.filter((i) => i.status === "alerta").length };
}

/** Exceção: libera um item impeditivo com justificativa (escritório com conferência ou gestor). Fica auditado. */
export async function liberarItemProntidao(tx: DBOrTx, ctx: Ctx, visitaId: string, item: string, justificativa: string) {
  exigir(ctx, "os.conferir");
  if (!justificativa?.trim()) throw new ErroNegocio("Justificativa obrigatória para a exceção.");
  if (item.startsWith("veiculo:") && !ctx.papeis.includes("gestor")) throw new ErroNegocio("Liberação de veículo é exclusiva do gestor (via pendência do veículo).");
  exigir(ctx, "agenda.gerenciar");
  await exigirAcessoVisita(tx, ctx, visitaId, "os.ver");
  await tx.insert(visitaLiberacao).values({ visitaId, item, justificativa, autorizadoPor: ctx.usuarioId }).onConflictDoUpdate({ target: [visitaLiberacao.visitaId, visitaLiberacao.item], set: { justificativa, autorizadoPor: ctx.usuarioId, em: new Date() } });
  await auditar(tx, ctx, { acao: "visita.prontidao_excecao", entidadeTipo: "visita", entidadeId: visitaId, motivo: justificativa, depois: { item } });
}
