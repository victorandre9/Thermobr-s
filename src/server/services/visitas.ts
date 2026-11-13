/** Lista de visitas com filtros (mesmas condições usadas pelos balões do dashboard). */
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import type { DBOrTx } from "../db";
import { qc } from "../db/sql";
import { agendaReserva, cliente, clienteLocal, ordemServico, profissional, visita } from "../db/schema";
import { type Ctx, pode } from "../auth/contexto";
import { ErroAcesso } from "../erros";
import { visitaDoProfissionalSQL } from "./escopo";
import { hojeSP, intervaloDiaSP } from "@/lib/datas";

export interface FiltroVisita { filtro?: "hoje" | "atrasadas" | "em_atendimento" | "nao_concluidas" | "conflitos" | "finalizadas" | "concluidas_hoje" | "problemas_hoje" | "todas"; de?: string; ate?: string; profissionalId?: string; osId?: string; regiao?: string; limite?: number; offset?: number }

export function condicoesVisita(ctx: Ctx, f: FiltroVisita): SQL[] {
  const c: SQL[] = [eq(visita.empresaId, ctx.empresaId)];
  if (!pode(ctx, "agenda.ver", "empresa")) {
    if (!pode(ctx, "agenda.ver", "proprio") || !ctx.profissional) throw new ErroAcesso();
    c.push(visitaDoProfissionalSQL(ctx.profissional.id));
  }
  if (f.regiao) c.push(sql`exists (select 1 from ordem_servico os2 join cliente_local cl2 on cl2.id = os2.local_id where os2.id = ${qc(visita.osId)} and (lower(cl2.bairro) = lower(${f.regiao}) or lower(cl2.cidade) = lower(${f.regiao})))`);
  const [ini, fim] = intervaloDiaSP(hojeSP());
  switch (f.filtro) {
    case "hoje": c.push(sql`${visita.situacao} <> 'cancelada' and ${visita.inicioPrevisto} >= ${ini.toISOString()} and ${visita.inicioPrevisto} < ${fim.toISOString()}`); break;
    case "atrasadas": c.push(sql`${visita.situacao} = 'agendada' and ${visita.inicioPrevisto} < now()`); break;
    case "em_atendimento": c.push(eq(visita.situacao, "em_atendimento")); break;
    // concluídas hoje: check-out hoje (SP) com resultado concluída
    case "concluidas_hoje": c.push(sql`${visita.situacao} = 'finalizada' and ${visita.resultado} = 'concluida' and ${visita.checkoutEm} >= ${ini.toISOString()} and ${visita.checkoutEm} < ${fim.toISOString()}`); break;
    // problemas hoje: não iniciadas após o horário (qualquer dia) ou finalizadas hoje como parcial/não realizada
    case "problemas_hoje": c.push(sql`((${visita.situacao} = 'agendada' and ${visita.inicioPrevisto} < now()) or (${visita.situacao} = 'finalizada' and ${visita.resultado} in ('parcial','nao_realizada') and ${visita.checkoutEm} >= ${ini.toISOString()} and ${visita.checkoutEm} < ${fim.toISOString()}))`); break;
    case "nao_concluidas": c.push(sql`${visita.situacao} = 'finalizada' and ${visita.resultado} in ('parcial','nao_realizada')`); break;
    case "finalizadas": c.push(eq(visita.situacao, "finalizada")); break;
    case "conflitos": c.push(sql`${visita.situacao} = 'agendada' and (not exists (select 1 from ${agendaReserva} ar where ar.visita_id = ${qc(visita.id)} and ar.ativo) or exists (select 1 from ${agendaReserva} ar join ${profissional} p on p.id = ar.profissional_id where ar.visita_id = ${qc(visita.id)} and ar.ativo and not p.ativo))`); break;
  }
  if (f.de) { const [d] = intervaloDiaSP(f.de); c.push(sql`coalesce(${visita.checkoutEm}, ${visita.inicioPrevisto}) >= ${d.toISOString()}`); }
  if (f.ate) { const [, d] = intervaloDiaSP(f.ate); c.push(sql`coalesce(${visita.checkoutEm}, ${visita.inicioPrevisto}) < ${d.toISOString()}`); }
  if (f.profissionalId) c.push(visitaDoProfissionalSQL(f.profissionalId));
  if (f.osId) c.push(eq(visita.osId, f.osId));
  return c;
}

export async function listarVisitas(dbx: DBOrTx, ctx: Ctx, f: FiltroVisita = {}) {
  const rows = await dbx.select({
    id: visita.id, sequencia: visita.sequencia, situacao: visita.situacao, resultado: visita.resultado, motivo: visita.motivoResultado, inicio: visita.inicioPrevisto, fim: visita.fimPrevisto,
    checkinEm: visita.checkinEm, checkoutEm: visita.checkoutEm, pendenciaDescricao: visita.pendenciaDescricao, proximaAcao: visita.proximaAcao,
    osId: ordemServico.id, osNumero: ordemServico.numero, descricao: ordemServico.descricao, clienteNome: cliente.nome, localNome: clienteLocal.nome, bairro: clienteLocal.bairro,
    equipe: sql<string | null>`(select string_agg(p.nome, ', ' order by ar.papel_na_visita desc) from ${agendaReserva} ar join ${profissional} p on p.id = ar.profissional_id where ar.visita_id = ${qc(visita.id)} and ar.ativo)`,
    total: sql<number>`count(*) over()::int`,
  }).from(visita).innerJoin(ordemServico, eq(ordemServico.id, visita.osId)).innerJoin(cliente, eq(cliente.id, ordemServico.clienteId)).leftJoin(clienteLocal, eq(clienteLocal.id, ordemServico.localId))
    .where(and(...condicoesVisita(ctx, f))).orderBy(f.filtro === "nao_concluidas" || f.filtro === "finalizadas" ? desc(visita.checkoutEm) : asc(visita.inicioPrevisto)).limit(f.limite ?? 100).offset(f.offset ?? 0);
  return { rows, total: rows[0]?.total ?? 0 };
}

/** Regiões para filtro: as cadastradas nos técnicos + bairros dos locais de clientes (sem geolocalização). */
export async function regioesConhecidas(dbx: DBOrTx, ctx: Ctx): Promise<string[]> {
  const r = await dbx.execute(sql`select distinct initcap(trim(x)) as r from (
      select jsonb_array_elements_text(coalesce(regioes, '[]'::jsonb)) as x from profissional where empresa_id = ${ctx.empresaId}
      union all select bairro from cliente_local cl join cliente c on c.id = cl.cliente_id where c.empresa_id = ${ctx.empresaId} and bairro is not null
    ) t where trim(x) <> '' order by 1`);
  return (r as unknown as { rows: Array<{ r: string }> }).rows.map((x) => x.r);
}
