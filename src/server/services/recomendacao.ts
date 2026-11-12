/**
 * Recomendação de técnicos (determinística, sem IA). Etapas:
 *  1) Requisitos obrigatórios: ativo, competências exigidas cadastradas, sem conflito de agenda/indisponibilidade no intervalo.
 *  2) Ordenação dos elegíveis: continuidade (já atendeu o equipamento/cliente), região cadastrada coincide, carga do dia.
 * Nunca inventa competência, distância, localização ou deslocamento. Dados faltantes são exibidos como limitação.
 * Não agenda: o escritório confirma a escolha (agendarVisita).
 */
import { and, eq, sql } from "drizzle-orm";
import type { DBOrTx } from "../db";
import { qc } from "../db/sql";
import { agendaReserva, clienteLocal, ferramenta, ordemServico, osEquipamento, profissional, recursoReserva, visita, veiculo } from "../db/schema";
import { type Ctx, exigir } from "../auth/contexto";
import { ErroAcesso } from "../erros";
import { diaSP, intervaloDiaSP } from "@/lib/datas";

export interface Candidato {
  profissionalId: string; nome: string; vinculo: string; elegivel: boolean;
  impedimentos: string[]; motivos: string[]; limitacoes: string[]; pontuacao: number;
}

export async function recomendarTecnicos(dbx: DBOrTx, ctx: Ctx, osId: string, inicio: Date, fim: Date, recursos: { veiculoId?: string | null; ferramentaIds?: string[]; visitaId?: string | null } = {}) {
  exigir(ctx, "agenda.gerenciar");
  const [o] = await dbx.select().from(ordemServico).where(and(eq(ordemServico.id, osId), eq(ordemServico.empresaId, ctx.empresaId)));
  if (!o) throw new ErroAcesso();
  const [local] = o.localId ? await dbx.select().from(clienteLocal).where(eq(clienteLocal.id, o.localId)) : [null];
  const exigidas = o.competenciasExigidas ?? [];
  const avisosGerais: string[] = [];
  if (!exigidas.length) avisosGerais.push("A OS não tem competências exigidas cadastradas: a adequação técnica não foi verificada.");
  const regiaoLocal = [local?.bairro, local?.cidade].filter(Boolean).map((x) => x!.trim().toLowerCase());
  if (!regiaoLocal.length) avisosGerais.push("Local sem bairro/cidade: região não considerada.");

  const profs = await dbx.select().from(profissional).where(and(eq(profissional.empresaId, ctx.empresaId), eq(profissional.ativo, true), sql`${qc(profissional.funcao)} in ('tecnico','ajudante')`));
  const periodo = `[${inicio.toISOString()},${fim.toISOString()})`;
  const ocupados = await dbx.select({ p: agendaReserva.profissionalId, tipo: agendaReserva.tipo, visitaId: agendaReserva.visitaId }).from(agendaReserva)
    .where(and(eq(agendaReserva.empresaId, ctx.empresaId), eq(agendaReserva.ativo, true), sql`${qc(agendaReserva.periodo)} && ${periodo}::tstzrange`));
  const [di, df] = intervaloDiaSP(diaSP(inicio));
  const cargaDia = await dbx.select({ p: agendaReserva.profissionalId, n: sql<number>`count(*)::int` }).from(agendaReserva)
    .where(and(eq(agendaReserva.empresaId, ctx.empresaId), eq(agendaReserva.ativo, true), eq(agendaReserva.tipo, "visita"), sql`${qc(agendaReserva.periodo)} && tstzrange(${di.toISOString()}, ${df.toISOString()})`)).groupBy(agendaReserva.profissionalId);
  // continuidade: quem já participou de visitas finalizadas nos mesmos equipamentos ou no mesmo cliente
  const hist = await dbx.execute<{ profissional_id: string; mesmo_equip: boolean; n: number }>(sql`
    select ar.profissional_id, bool_or(exists (select 1 from ${osEquipamento} oe1 join ${osEquipamento} oe2 on oe2.equipamento_id = oe1.equipamento_id where oe1.os_id = o2.id and oe2.os_id = ${osId})) as mesmo_equip, count(*)::int as n
    from ${visita} v join ${ordemServico} o2 on o2.id = v.os_id join ${agendaReserva} ar on ar.visita_id = v.id and ar.ativo
    where o2.cliente_id = ${o.clienteId} and v.situacao = 'finalizada' and o2.empresa_id = ${ctx.empresaId}
    group by ar.profissional_id`);
  // recursos exclusivos pedidos
  const conflitosRecurso: string[] = [];
  if (recursos.veiculoId) {
    const [c] = await dbx.select({ n: sql<number>`count(*)::int` }).from(recursoReserva).where(and(eq(recursoReserva.veiculoId, recursos.veiculoId), eq(recursoReserva.ativo, true), sql`${qc(recursoReserva.visitaId)} is distinct from ${recursos.visitaId ?? null}`, sql`${qc(recursoReserva.periodo)} && ${periodo}::tstzrange`));
    const [v] = await dbx.select({ ident: veiculo.identificacao }).from(veiculo).where(eq(veiculo.id, recursos.veiculoId));
    if (c.n) conflitosRecurso.push(`Veículo ${v?.ident ?? ""} já reservado neste intervalo.`);
  }
  for (const fid of recursos.ferramentaIds ?? []) {
    const [c] = await dbx.select({ n: sql<number>`count(*)::int` }).from(recursoReserva).where(and(eq(recursoReserva.ferramentaId, fid), eq(recursoReserva.ativo, true), sql`${qc(recursoReserva.visitaId)} is distinct from ${recursos.visitaId ?? null}`, sql`${qc(recursoReserva.periodo)} && ${periodo}::tstzrange`));
    const [f] = await dbx.select({ nome: ferramenta.nome }).from(ferramenta).where(eq(ferramenta.id, fid));
    if (c.n) conflitosRecurso.push(`Ferramenta exclusiva ${f?.nome ?? ""} já reservada neste intervalo.`);
  }

  const candidatos: Candidato[] = profs.map((p) => {
    const impedimentos: string[] = []; const motivos: string[] = []; const limitacoes: string[] = [];
    const ocOutras = ocupados.filter((x) => x.p === p.id && !(recursos.visitaId && x.visitaId === recursos.visitaId));
    if (ocOutras.some((x) => x.tipo === "indisponibilidade")) impedimentos.push("Indisponível no período (ausência registrada).");
    if (ocOutras.some((x) => x.tipo === "visita")) impedimentos.push("Já reservado em outra visita no intervalo.");
    const comp = p.competencias ?? [];
    const faltam = exigidas.filter((c) => !comp.includes(c));
    if (exigidas.length && faltam.length) impedimentos.push(`Sem competência cadastrada: ${faltam.join(", ")}.`);
    if (exigidas.length && !faltam.length) motivos.push(`Possui as competências exigidas (${exigidas.join(", ")}).`);
    if (!comp.length) limitacoes.push("Competências não cadastradas para o profissional.");
    let pont = 0;
    const h = hist.rows.find((r) => r.profissional_id === p.id);
    if (h?.mesmo_equip) { pont += 30; motivos.push("Já atendeu equipamento desta OS."); }
    else if (h) { pont += 15; motivos.push(`Já atendeu este cliente (${h.n} visita(s)).`); }
    const regs = (p.regioes ?? []).map((r) => r.trim().toLowerCase());
    if (!regs.length) limitacoes.push("Região de atendimento não cadastrada.");
    else if (regiaoLocal.length && regs.some((r) => regiaoLocal.includes(r))) { pont += 10; motivos.push("Região cadastrada coincide com o local."); }
    const carga = cargaDia.find((c) => c.p === p.id)?.n ?? 0;
    pont -= carga * 3;
    motivos.push(carga ? `${carga} visita(s) já no dia.` : "Sem outras visitas no dia.");
    return { profissionalId: p.id, nome: p.nome, vinculo: p.vinculo, elegivel: impedimentos.length === 0, impedimentos, motivos, limitacoes, pontuacao: pont };
  });
  candidatos.sort((a, b) => Number(b.elegivel) - Number(a.elegivel) || b.pontuacao - a.pontuacao || a.nome.localeCompare(b.nome));
  const elegiveis = candidatos.filter((c) => c.elegivel).length;
  if (elegiveis < o.qtdProfissionais) avisosGerais.push(`Necessários ${o.qtdProfissionais} profissional(is); elegíveis: ${elegiveis}.`);
  return { candidatos, qtdNecessaria: o.qtdProfissionais, competenciasExigidas: exigidas, conflitosRecurso, avisos: avisosGerais,
    observacao: "Indicação baseada apenas em dados cadastrados. Não considera distância, localização atual ou deslocamento. A escolha final é do escritório." };
}
