/**
 * Indicadores por técnico e custos operacionais, calculados a partir dos registros (sem estimativas).
 * Produtividade: agenda (reservas ativas), execução (situação/resultado) e tempo em campo (participação individual).
 * Custos: contas a pagar ligadas a técnico, OS ou categoria (respeita categorias restritas).
 */
import { sql } from "drizzle-orm";
import type { DBOrTx } from "../db";
import { type Ctx, exigir, pode } from "../auth/contexto";
import { intervaloDiaSP } from "@/lib/datas";

export interface LinhaProdutividade {
  profissionalId: string; nome: string; vinculo: string;
  agendadas: number; finalizadas: number; concluidas: number; parciais: number; naoRealizadas: number; naoIniciadas: number; emAberto: number;
  cumprimento: number | null; minutosCampo: number; mediaMinutos: number | null;
}

export async function produtividadeTecnicos(dbx: DBOrTx, ctx: Ctx, de: string, ate: string): Promise<LinhaProdutividade[]> {
  exigir(ctx, "agenda.ver", "empresa");
  const ini = intervaloDiaSP(de)[0].toISOString(), fim = intervaloDiaSP(ate)[1].toISOString();
  const r = await dbx.execute(sql`
    with vis as (
      select distinct ar.profissional_id, v.id, v.situacao, v.resultado, v.inicio_previsto
      from agenda_reserva ar join visita v on v.id = ar.visita_id
      where ar.empresa_id = ${ctx.empresaId} and ar.tipo = 'visita' and ar.ativo and v.situacao <> 'cancelada'
        and v.inicio_previsto >= ${ini} and v.inicio_previsto < ${fim}
    ), campo as (
      select vp.profissional_id, sum(extract(epoch from (vp.saida_em - vp.chegada_em)) / 60)::int as minutos, count(*)::int as n
      from visita_participacao vp join visita v on v.id = vp.visita_id
      where v.empresa_id = ${ctx.empresaId} and vp.chegada_em is not null and vp.saida_em is not null and vp.saida_em > vp.chegada_em
        and vp.chegada_em >= ${ini} and vp.chegada_em < ${fim}
      group by 1
    )
    select p.id, p.nome, p.vinculo,
      count(vis.id)::int as agendadas,
      count(vis.id) filter (where vis.situacao = 'finalizada')::int as finalizadas,
      count(vis.id) filter (where vis.situacao = 'finalizada' and vis.resultado = 'concluida')::int as concluidas,
      count(vis.id) filter (where vis.situacao = 'finalizada' and vis.resultado = 'parcial')::int as parciais,
      count(vis.id) filter (where vis.situacao = 'finalizada' and vis.resultado = 'nao_realizada')::int as nao_realizadas,
      count(vis.id) filter (where vis.situacao = 'agendada' and vis.inicio_previsto < now())::int as nao_iniciadas,
      count(vis.id) filter (where vis.situacao in ('agendada','em_atendimento') and vis.inicio_previsto >= now())::int as em_aberto,
      count(vis.id) filter (where vis.inicio_previsto < now())::int as vencidas,
      coalesce(max(campo.minutos), 0)::int as minutos, coalesce(max(campo.n), 0)::int as n_campo
    from profissional p
    left join vis on vis.profissional_id = p.id
    left join campo on campo.profissional_id = p.id
    where p.empresa_id = ${ctx.empresaId} and p.ativo and p.funcao in ('tecnico','ajudante')
    group by p.id, p.nome, p.vinculo
    order by count(vis.id) filter (where vis.situacao = 'finalizada' and vis.resultado = 'concluida') desc, p.nome`);
  const rows = (r as unknown as { rows: Array<Record<string, unknown>> }).rows;
  return rows.map((x) => {
    const vencidas = Number(x.vencidas), concl = Number(x.concluidas), min = Number(x.minutos), n = Number(x.n_campo);
    return {
      profissionalId: String(x.id), nome: String(x.nome), vinculo: String(x.vinculo),
      agendadas: Number(x.agendadas), finalizadas: Number(x.finalizadas), concluidas: concl, parciais: Number(x.parciais), naoRealizadas: Number(x.nao_realizadas),
      naoIniciadas: Number(x.nao_iniciadas), emAberto: Number(x.em_aberto),
      cumprimento: vencidas ? Math.round((concl / vencidas) * 100) : null, minutosCampo: min, mediaMinutos: n ? Math.round(min / n) : null,
    };
  });
}

export interface LinhaCusto { chave: string; rotulo: string; detalhe: string; valorCentavos: number; lancamentos: number; href: string | null }

/** Custos (contas a pagar) do período por técnico, por OS e por categoria. Valor = parcelas com vencimento no período. */
export async function custosOperacionais(dbx: DBOrTx, ctx: Ctx, de: string, ate: string, agrupar: "tecnico" | "os" | "categoria") {
  exigir(ctx, "financeiro.ver");
  const restr = pode(ctx, "financeiro.restrito.ver") ? sql`true` : sql`c.restrita = false`;
  const base = sql`from obrigacao o join parcela pa on pa.obrigacao_id = o.id join categoria_financeira c on c.id = o.categoria_id
    where o.empresa_id = ${ctx.empresaId} and o.natureza = 'pagar' and o.situacao_aprovacao not in ('cancelada','rejeitada') and not pa.cancelada
      and pa.vencimento >= ${de} and pa.vencimento <= ${ate} and ${restr}`;
  const sel = agrupar === "tecnico"
    ? sql`select o.profissional_id::text as chave, max(p.nome) as rotulo, string_agg(distinct c.nome, ', ') as detalhe, sum(pa.valor_centavos)::bigint as valor, count(distinct o.id)::int as n
        from obrigacao o join parcela pa on pa.obrigacao_id = o.id join categoria_financeira c on c.id = o.categoria_id join profissional p on p.id = o.profissional_id
        where o.empresa_id = ${ctx.empresaId} and o.natureza = 'pagar' and o.situacao_aprovacao not in ('cancelada','rejeitada') and not pa.cancelada
          and pa.vencimento >= ${de} and pa.vencimento <= ${ate} and ${restr}
        group by o.profissional_id order by valor desc`
    : agrupar === "os"
    ? sql`select o.os_id::text as chave, 'OS ' || max(os.numero) || ' — ' || max(cl.nome) as rotulo, string_agg(distinct c.nome, ', ') as detalhe, sum(pa.valor_centavos)::bigint as valor, count(distinct o.id)::int as n
        from obrigacao o join parcela pa on pa.obrigacao_id = o.id join categoria_financeira c on c.id = o.categoria_id join ordem_servico os on os.id = o.os_id join cliente cl on cl.id = os.cliente_id
        where o.empresa_id = ${ctx.empresaId} and o.natureza = 'pagar' and o.situacao_aprovacao not in ('cancelada','rejeitada') and not pa.cancelada
          and pa.vencimento >= ${de} and pa.vencimento <= ${ate} and ${restr}
        group by o.os_id order by valor desc`
    : sql`select c.id::text as chave, max(c.nome) as rotulo, '' as detalhe, sum(pa.valor_centavos)::bigint as valor, count(distinct o.id)::int as n ${base} group by c.id order by valor desc`;
  const r = await dbx.execute(sel);
  const rows = (r as unknown as { rows: Array<Record<string, unknown>> }).rows;
  const linhas: LinhaCusto[] = rows.map((x) => ({
    chave: String(x.chave), rotulo: String(x.rotulo), detalhe: String(x.detalhe ?? ""), valorCentavos: Number(x.valor), lancamentos: Number(x.n),
    href: agrupar === "os" ? `/os/${x.chave}` : null,
  }));
  return { linhas, total: linhas.reduce((s, l) => s + l.valorCentavos, 0) };
}
