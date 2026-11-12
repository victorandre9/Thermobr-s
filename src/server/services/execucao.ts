/** Atendimento pelo técnico: check-in/out, ficha por equipamento, resultado, solicitações. */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { qc } from "../db/sql";
import type { DBOrTx } from "../db";
import {
  agendaReserva, anexo, checklistResposta, cliente, clienteContato, clienteLocal, equipamento, ordemServico, osEquipamento, osItem, pendencia,
  profissional, visita, visitaExecucao,
} from "../db/schema";
import type { Ctx } from "../auth/contexto";
import { ErroNegocio } from "../erros";
import { auditar } from "./auditoria";
import { exigirAcessoVisita } from "./escopo";
import { recalcularEtapa, tocarOS } from "./os";
import { garantirPendencia } from "./pendencias";
import { obterConfig } from "./config";
import { MOTIVOS_RESULTADO } from "@/lib/dominio";
import { parseQtdInput } from "@/lib/quantidade";

/** Dados da visita para o técnico: só o necessário ao atendimento, sem preços nem financeiro. */
export async function obterVisitaTecnico(dbx: DBOrTx, ctx: Ctx, visitaId: string) {
  await exigirAcessoVisita(dbx, ctx, visitaId, "visita.executar");
  const [v] = await dbx.select().from(visita).where(eq(visita.id, visitaId));
  const [o] = await dbx.select({ id: ordemServico.id, numero: ordemServico.numero, descricao: ordemServico.descricao, prioridade: ordemServico.prioridade, observacoes: ordemServico.observacoes, clienteId: ordemServico.clienteId, localId: ordemServico.localId, contatoId: ordemServico.contatoId, etapa: ordemServico.etapa, origem: ordemServico.origem })
    .from(ordemServico).where(eq(ordemServico.id, v.osId));
  const [cli] = await dbx.select({ nome: cliente.nome, telefone: cliente.telefone }).from(cliente).where(eq(cliente.id, o.clienteId));
  const [local] = o.localId ? await dbx.select().from(clienteLocal).where(eq(clienteLocal.id, o.localId)) : [null];
  const [contato] = o.contatoId ? await dbx.select({ nome: clienteContato.nome, telefone: clienteContato.telefone }).from(clienteContato).where(eq(clienteContato.id, o.contatoId)) : [null];
  const equipamentos = (await dbx.select({ e: equipamento }).from(osEquipamento).innerJoin(equipamento, eq(equipamento.id, osEquipamento.equipamentoId)).where(eq(osEquipamento.osId, o.id))).map((x) => x.e);
  const itens = await dbx.select({ id: osItem.id, tipo: osItem.tipo, descricao: osItem.descricao, quantidade: osItem.quantidade, unidade: osItem.unidade, situacao: osItem.situacao })
    .from(osItem).where(and(eq(osItem.osId, o.id), inArray(osItem.situacao, ["previsto", "aprovado", "extra_solicitado"])));
  const execucoes = await dbx.select().from(visitaExecucao).where(eq(visitaExecucao.visitaId, visitaId));
  const equipe = await dbx.select({ id: profissional.id, nome: profissional.nome, papel: agendaReserva.papelNaVisita }).from(agendaReserva).innerJoin(profissional, eq(profissional.id, agendaReserva.profissionalId))
    .where(and(eq(agendaReserva.visitaId, visitaId), eq(agendaReserva.ativo, true)));
  const fotos = await dbx.select({ id: anexo.id, entidadeTipo: anexo.entidadeTipo, entidadeId: anexo.entidadeId, nomeArquivo: anexo.nomeArquivo, mime: anexo.mime })
    .from(anexo).where(and(eq(anexo.empresaId, ctx.empresaId), sql`(${qc(anexo.entidadeTipo)} = 'visita' and ${qc(anexo.entidadeId)} = ${visitaId}) or (${qc(anexo.entidadeTipo)} = 'visita_execucao' and ${qc(anexo.entidadeId)} in (select id from ${visitaExecucao} where visita_id = ${visitaId}))`));
  const historico = await dbx.select({ id: visita.id, sequencia: visita.sequencia, situacao: visita.situacao, resultado: visita.resultado, motivo: visita.motivoResultado, pendencia: visita.pendenciaDescricao, checkoutEm: visita.checkoutEm })
    .from(visita).where(and(eq(visita.osId, o.id), sql`${qc(visita.id)} <> ${visitaId}`)).orderBy(asc(visita.sequencia));
  return { visita: v, os: o, cliente: cli, local, contato, equipamentos, itens, execucoes, equipe, fotos, historico };
}

export async function checkin(tx: DBOrTx, ctx: Ctx, visitaId: string) {
  await exigirAcessoVisita(tx, ctx, visitaId, "visita.executar");
  const avisos: string[] = [];
  const prof = ctx.profissional;
  // Técnico da equipe própria: checklist do veículo designado (nunca para autônomo).
  if (prof?.vinculo === "proprio") {
    const cfg = await obterConfig(tx, ctx.empresaId);
    if (!prof.veiculoId) {
      await garantirPendencia(tx, ctx, { tipo: "veiculo_sem_designacao", titulo: `${prof.nome} sem veículo designado`, descricao: "Técnico da equipe própria iniciou atendimento sem veículo atribuído. Defina a designação.", profissionalId: prof.id, prioridade: "media", chave: `veiculo_sem_designacao:${prof.id}` });
      avisos.push("Você não tem veículo designado. O escritório foi avisado.");
    } else {
      const [valido] = await tx.select({ id: checklistResposta.id }).from(checklistResposta)
        .where(and(eq(checklistResposta.veiculoId, prof.veiculoId), eq(checklistResposta.tipo, "veiculo_saida"), sql`${qc(checklistResposta.validoAte)} > now()`)).limit(1);
      if (!valido && cfg.veiculos.checklistSaidaObrigatorio) avisos.push("Checklist de saída do veículo pendente para este turno.");
      if (cfg.veiculos.bloquearComIrregularidadeCritica) {
        const [crit] = await tx.select({ id: pendencia.id, titulo: pendencia.titulo }).from(pendencia)
          .where(and(eq(pendencia.veiculoId, prof.veiculoId), eq(pendencia.tipo, "veiculo_irregularidade"), eq(pendencia.prioridade, "critica"), inArray(pendencia.situacao, ["aberta", "em_andamento"]), sql`${qc(pendencia.liberacaoExcepcional)} is null`)).limit(1);
        if (crit) throw new ErroNegocio(`Veículo com irregularidade crítica sem liberação: "${crit.titulo}". Fale com o gestor para liberação excepcional ou troca de veículo.`);
      }
    }
  }
  const [v] = await tx.update(visita).set({ situacao: "em_atendimento", checkinEm: sql`now()`, checkinPor: ctx.usuarioId, veiculoId: prof?.vinculo === "proprio" ? prof.veiculoId : null })
    .where(and(eq(visita.id, visitaId), eq(visita.situacao, "agendada"))).returning();
  if (!v) {
    const [atual] = await tx.select().from(visita).where(eq(visita.id, visitaId));
    if (atual.situacao === "em_atendimento") return { visita: atual, avisos, repetido: true }; // toque repetido: sem duplicar
    throw new ErroNegocio(`Check-in indisponível: visita ${atual.situacao === "nao_agendada" ? "ainda não agendada" : atual.situacao}.`);
  }
  await auditar(tx, ctx, { acao: "visita.checkin", entidadeTipo: "visita", entidadeId: visitaId, depois: { em: v.checkinEm, osId: v.osId } });
  await recalcularEtapa(tx, v.osId);
  return { visita: v, avisos, repetido: false };
}

export interface DadosExecucao { equipamentoId: string | null; diagnostico?: string | null; servicoRealizado?: string | null; testeFuncionamento: "ok" | "falhou" | "nao_testado"; resultado?: "concluido" | "parcial" | "nao_realizado" | null; observacoes?: string | null }

export async function salvarExecucao(tx: DBOrTx, ctx: Ctx, visitaId: string, d: DadosExecucao) {
  await exigirAcessoVisita(tx, ctx, visitaId, "visita.executar");
  const [v] = await tx.select().from(visita).where(eq(visita.id, visitaId));
  if (v.situacao !== "em_atendimento") throw new ErroNegocio("A ficha só pode ser preenchida durante o atendimento (após check-in).");
  if (d.equipamentoId) {
    const [e] = await tx.select().from(osEquipamento).where(and(eq(osEquipamento.osId, v.osId), eq(osEquipamento.equipamentoId, d.equipamentoId)));
    if (!e) throw new ErroNegocio("Equipamento não pertence a esta OS.");
  }
  const vals = { visitaId, equipamentoId: d.equipamentoId, diagnostico: d.diagnostico ?? null, servicoRealizado: d.servicoRealizado ?? null, testeFuncionamento: d.testeFuncionamento, resultado: d.resultado ?? null, observacoes: d.observacoes ?? null, atualizadoPor: ctx.usuarioId, atualizadoEm: new Date() };
  const [ex] = await tx.select().from(visitaExecucao).where(and(eq(visitaExecucao.visitaId, visitaId), d.equipamentoId ? eq(visitaExecucao.equipamentoId, d.equipamentoId) : sql`${qc(visitaExecucao.equipamentoId)} is null`));
  const [r] = ex ? await tx.update(visitaExecucao).set(vals).where(eq(visitaExecucao.id, ex.id)).returning() : await tx.insert(visitaExecucao).values(vals).returning();
  await auditar(tx, ctx, { acao: "visita.execucao_salva", entidadeTipo: "visita", entidadeId: visitaId, antes: ex ?? null, depois: r });
  return r;
}

export interface DadosCheckout {
  resultado: "concluida" | "parcial" | "nao_realizada";
  motivo?: string | null; comentario?: string | null; pendenciaDescricao?: string | null; proximaAcao?: string | null; destinoMateriais?: string | null;
}

export async function checkout(tx: DBOrTx, ctx: Ctx, visitaId: string, d: DadosCheckout) {
  await exigirAcessoVisita(tx, ctx, visitaId, "visita.executar");
  const [v0] = await tx.select().from(visita).where(eq(visita.id, visitaId)).for("update");
  if (v0.situacao === "finalizada") return { visita: v0, repetido: true };
  if (v0.situacao !== "em_atendimento") throw new ErroNegocio("Faça o check-in antes de finalizar.");
  const execs = await tx.select().from(visitaExecucao).where(eq(visitaExecucao.visitaId, visitaId));
  const eqs = await tx.select().from(osEquipamento).where(eq(osEquipamento.osId, v0.osId));
  if (d.resultado === "concluida") {
    if (!execs.some((e) => e.servicoRealizado?.trim())) throw new ErroNegocio("Registre o serviço realizado na ficha antes de concluir.");
    const semFicha = eqs.filter((e) => !execs.some((x) => x.equipamentoId === e.equipamentoId));
    if (semFicha.length) throw new ErroNegocio(`Preencha a ficha de todos os equipamentos da OS (${semFicha.length} sem registro) ou finalize como parcial.`);
    if (execs.some((e) => e.testeFuncionamento !== "ok" && e.resultado !== "nao_realizado")) throw new ErroNegocio("Para concluir, o teste de funcionamento deve estar OK nos equipamentos atendidos. Caso contrário, finalize como parcial.");
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(anexo).where(sql`${qc(anexo.empresaId)} = ${ctx.empresaId} and ((${qc(anexo.entidadeTipo)} = 'visita' and ${qc(anexo.entidadeId)} = ${visitaId}) or (${qc(anexo.entidadeTipo)} = 'visita_execucao' and ${qc(anexo.entidadeId)} in (select id from ${visitaExecucao} where visita_id = ${visitaId})))`);
    if (n === 0) throw new ErroNegocio("Anexe ao menos uma foto do serviço concluído.");
  } else {
    if (!d.motivo || !(d.motivo in MOTIVOS_RESULTADO)) throw new ErroNegocio("Selecione o motivo padronizado.");
    if (!d.pendenciaDescricao?.trim()) throw new ErroNegocio("Descreva o que ficou pendente (e o que foi realizado).");
    if (!d.proximaAcao?.trim()) throw new ErroNegocio("Informe a próxima ação sugerida.");
    if (d.motivo === "outro" && !d.comentario?.trim()) throw new ErroNegocio("Comente o motivo.");
  }
  const [v] = await tx.update(visita).set({
    situacao: "finalizada", resultado: d.resultado, motivoResultado: d.resultado === "concluida" ? null : d.motivo, comentarioResultado: d.comentario ?? null,
    pendenciaDescricao: d.pendenciaDescricao ?? null, proximaAcao: d.proximaAcao ?? null, destinoMateriais: d.destinoMateriais ?? null,
    checkoutEm: sql`now()`, checkoutPor: ctx.usuarioId,
  }).where(and(eq(visita.id, visitaId), eq(visita.situacao, "em_atendimento"))).returning();
  if (!v) { const [a] = await tx.select().from(visita).where(eq(visita.id, visitaId)); return { visita: a, repetido: true }; }
  if (d.resultado !== "concluida") {
    await garantirPendencia(tx, ctx, {
      tipo: "visita_impedimento", titulo: `Visita ${d.resultado === "parcial" ? "parcial" : "não realizada"}: ${MOTIVOS_RESULTADO[d.motivo as keyof typeof MOTIVOS_RESULTADO]}`,
      descricao: `${d.pendenciaDescricao}\nPróxima ação: ${d.proximaAcao}${d.destinoMateriais ? `\nMateriais: ${d.destinoMateriais}` : ""}${d.comentario ? `\nComentário: ${d.comentario}` : ""}`,
      osId: v.osId, visitaId, profissionalId: ctx.profissional?.id ?? null, prioridade: "alta", chave: `visita_impedimento:${visitaId}`,
    });
    if (d.motivo === "falta_material" || d.motivo === "peca_divergente") await tx.update(ordemServico).set({ situacaoMaterial: "pendente" }).where(eq(ordemServico.id, v.osId));
  }
  await auditar(tx, ctx, { acao: "visita.checkout", entidadeTipo: "visita", entidadeId: visitaId, depois: { resultado: d.resultado, motivo: d.motivo, em: v.checkoutEm } });
  await recalcularEtapa(tx, v.osId);
  return { visita: v, repetido: false };
}

/** Técnico solicita extra (peça/serviço): vai ao escritório para aprovação; sem preço, sem cobrança definitiva. */
export async function solicitarExtra(tx: DBOrTx, ctx: Ctx, visitaId: string, d: { tipo: "servico" | "peca" | "material"; descricao: string; quantidade: string; unidade: string; justificativa?: string | null }) {
  await exigirAcessoVisita(tx, ctx, visitaId, "visita.executar");
  const [v] = await tx.select().from(visita).where(eq(visita.id, visitaId));
  if (!d.descricao?.trim()) throw new ErroNegocio("Descreva o extra.");
  const [it] = await tx.insert(osItem).values({ osId: v.osId, tipo: d.tipo, descricao: d.descricao.trim(), quantidade: parseQtdInput(d.quantidade, d.unidade), unidade: d.unidade, situacao: "extra_solicitado", solicitadoPor: ctx.usuarioId, visitaId }).returning();
  await garantirPendencia(tx, ctx, { tipo: "extra_solicitado", titulo: `Extra solicitado: ${d.descricao}`, descricao: d.justificativa, osId: v.osId, visitaId, entidadeTipo: "os_item", entidadeId: it.id, prioridade: "alta" });
  await auditar(tx, ctx, { acao: "visita.extra_solicitado", entidadeTipo: "visita", entidadeId: visitaId, depois: { itemId: it.id, descricao: it.descricao } });
  await tocarOS(tx, v.osId);
  return it;
}

export async function solicitarMaterial(tx: DBOrTx, ctx: Ctx, visitaId: string, descricao: string) {
  await exigirAcessoVisita(tx, ctx, visitaId, "visita.executar");
  const [v] = await tx.select().from(visita).where(eq(visita.id, visitaId));
  if (!descricao?.trim()) throw new ErroNegocio("Descreva o material necessário.");
  return garantirPendencia(tx, ctx, { tipo: "material_necessario", titulo: "Técnico informa necessidade de material", descricao, osId: v.osId, visitaId, profissionalId: ctx.profissional?.id ?? null, prioridade: "alta" });
}

/** Visitas atrasadas (agendadas, horário já passou, sem check-in). */
export function condVisitaAtrasada() {
  return sql`${qc(visita.situacao)} = 'agendada' and ${qc(visita.inicioPrevisto)} < now()`;
}

