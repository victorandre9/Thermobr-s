import Link from "next/link";
import { db } from "@/server/db";
import type { Ctx } from "@/server/auth/contexto";
import { pode } from "@/server/auth/contexto";
import { baloesGestor, graficosGestor } from "@/server/services/dashboard";
import { centralPendencias, type GrupoCentral } from "@/server/services/pendencias";
import { statusImplantacao } from "@/server/services/implantacao";
import { BalaoCard } from "@/components/balao";
import { Barras } from "@/components/barras";
import { Aviso, Badge, Card, PageHeader } from "@/components/ui";
import { hojeSP, primeiroDiaMes, fmtDia } from "@/lib/datas";
import { formatBRL } from "@/lib/money";
import { OS_ETAPAS, VISITA_RESULTADOS, MOTIVOS_RESULTADO, PENDENCIA_TIPOS, PRIORIDADE_PENDENCIA, rotulo } from "@/lib/dominio";

const GRUPOS: Array<[GrupoCentral, string]> = [["criticas_vencidas", "Críticas ou vencidas"], ["hoje", "Hoje"], ["semana", "Esta semana"], ["aguardando_terceiro", "Aguardando terceiro"], ["sem_prazo", "Sem prazo definido"]];

export async function HomeGestao({ ctx, de, ate }: { ctx: Ctx; de?: string; ate?: string }) {
  const periodo = { de: de ?? primeiroDiaMes(hojeSP()), ate: ate ?? hojeSP() };
  const [baloes, graf, central, impl] = await Promise.all([
    baloesGestor(db, ctx, periodo), graficosGestor(db, ctx, periodo),
    pode(ctx, "pendencia.ver", "empresa") ? centralPendencias(db, ctx) : Promise.resolve(null),
    statusImplantacao(db, ctx),
  ]);
  const grupos = (["operacional", "recursos", "financeiro"] as const).map((g) => ({ g, itens: baloes.filter((b) => b.grupo === g) })).filter((x) => x.itens.length);
  const nomes = { operacional: "Operação", recursos: "Recursos (veículos, ferramentas, materiais)", financeiro: "Financeiro" };
  type G = { osPorEtapa?: Array<{ etapa: string; n: number }>; visitasResultado?: Array<{ resultado: string | null; n: number }>; motivos?: Array<{ motivo: string | null; n: number }>; duracao?: { n: number; media: number | null; mediana: number | null }; fluxoSemanal?: Array<{ semana: string; natureza: string; total: string }>; vencimentos?: Array<{ natureza: string; faixa: string; total: string }> };
  const gg = graf as G;
  const FAIXAS: Record<string, string> = { "0_vencido": "Vencido", "1_7d": "Até 7 dias", "2_30d": "8 a 30 dias", "3_90d": "31 a 90 dias", "4_mais": "Mais de 90 dias" };
  return (
    <div>
      <PageHeader titulo="Painel" subtitulo={<>Período: {fmtDia(periodo.de)} a {fmtDia(periodo.ate)} · cada cartão abre a lista com o mesmo filtro</>}
        acoes={<form className="flex flex-row flex-wrap items-center gap-2" action="/"><input type="date" name="de" defaultValue={periodo.de} className="input !w-auto" aria-label="De" /><input type="date" name="ate" defaultValue={periodo.ate} className="input !w-auto" aria-label="Até" /><button className="btn btn-ghost">Aplicar</button></form>} />
      {pode(ctx, "financeiro.fluxo.ver") && (!impl.dataCorte || !impl.politicaDefinida) && (
        <div className="mb-5"><Aviso tom="atencao" titulo="Configuração inicial pendente">
          {!impl.dataCorte && <>Data de corte e saldos iniciais não definidos: a visão financeira está incompleta. </>}
          {!impl.politicaDefinida && <>Política de delegação financeira ao operador ainda não definida pelos donos. </>}
          <Link href="/configuracoes/implantacao" className="font-semibold underline">Configurar</Link>
        </Aviso></div>
      )}
      {central && (
        <Card titulo="Central de pendências" acoes={<Link href="/pendencias" className="btn btn-ghost btn-sm">Ver todas</Link>} className="mb-6" pad={false}>
          <div className="grid divide-y divide-line md:grid-cols-2 md:divide-y-0 xl:grid-cols-5 xl:divide-x">
            {GRUPOS.map(([k, rot]) => (
              <div key={k} className="p-4">
                <div className="mb-2 flex items-center justify-between"><span className="text-[13px] font-semibold text-navy">{rot}</span><Badge tom={k === "criticas_vencidas" && central[k].length ? "critico" : central[k].length ? "atencao" : "ok"}>{central[k].length}</Badge></div>
                {central[k].length === 0 ? <p className="text-[12.5px] text-muted">Nada aqui.</p> : (
                  <ul className="space-y-2.5">
                    {central[k].slice(0, 5).map(({ p, osNumero, veiculoIdent, ferramentaNome, responsavelNome }) => (
                      <li key={p.id} className="text-[12.5px]">
                        <Link href={`/pendencias/${p.id}`} className="font-semibold text-navy hover:underline">{p.titulo}</Link>
                        <div className="text-muted">{rotulo(PENDENCIA_TIPOS, p.tipo)}{osNumero ? ` · OS ${osNumero}` : ""}{veiculoIdent ? ` · ${veiculoIdent}` : ""}{ferramentaNome ? ` · ${ferramentaNome}` : ""}</div>
                        <div className="text-muted">Resp.: <span className={responsavelNome ? "text-text-2" : "font-semibold text-bad"}>{responsavelNome ?? "sem responsável"}</span> · Prazo: {p.prazo ? fmtDia(p.prazo) : "—"} · {rotulo(PRIORIDADE_PENDENCIA, p.prioridade)}</div>
                        {(p.proximaAcao || p.aguardandoTerceiro) && <div className="text-text-2">→ {p.aguardandoTerceiro ? `Aguardando: ${p.aguardandoTerceiro}` : p.proximaAcao}</div>}
                      </li>
                    ))}
                    {central[k].length > 5 && <li><Link href="/pendencias" className="text-[12.5px] font-semibold text-ice-strong">+{central[k].length - 5} pendência(s)</Link></li>}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
      {grupos.map(({ g, itens }) => (
        <section key={g} className="mb-6">
          <h2 className="mb-3 text-[15px] font-semibold text-navy">{nomes[g]}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{itens.map((b) => <BalaoCard key={b.id} b={b} />)}</div>
        </section>
      ))}
      <div className="grid gap-4 lg:grid-cols-2">
        {gg.osPorEtapa && <Card titulo="OS abertas por situação"><Barras dados={gg.osPorEtapa.map((x) => ({ rotulo: rotulo(OS_ETAPAS, x.etapa), valor: x.n, tom: "navy" }))} vazio="Nenhuma OS aberta." /></Card>}
        {gg.visitasResultado && <Card titulo="Visitas finalizadas no período, por resultado"><Barras dados={gg.visitasResultado.map((x) => ({ rotulo: rotulo(VISITA_RESULTADOS, x.resultado), valor: x.n, tom: x.resultado === "concluida" ? "ok" : x.resultado === "parcial" ? "warn" : "bad" }))} /></Card>}
        {gg.motivos && <Card titulo="Motivos de retorno / não realização"><Barras dados={gg.motivos.map((x) => ({ rotulo: rotulo(MOTIVOS_RESULTADO, x.motivo), valor: x.n, tom: "warn" }))} /></Card>}
        {gg.duracao && <Card titulo="Duração dos atendimentos (check-in → check-out)">
          {gg.duracao.n ? <div className="text-[13.5px]"><p><span className="num text-2xl font-bold text-navy">{gg.duracao.mediana} min</span> mediana · média {gg.duracao.media} min · amostra de {gg.duracao.n} visita(s)</p><p className="mt-2 text-[12px] text-muted">Duração da visita não equivale a jornada trabalhada nem produtividade individual; não há comparação entre técnicos.</p></div> : <p className="py-6 text-center text-[13px] text-muted">Sem visitas finalizadas no período.</p>}
        </Card>}
        {gg.fluxoSemanal && <Card titulo="Fluxo realizado por semana (baixas confirmadas)"><Barras dados={gg.fluxoSemanal.map((x) => ({ rotulo: `${x.natureza === "receber" ? "Entradas" : "Saídas"} · sem. ${fmtDia(x.semana)}`, valor: Number(x.total), tom: x.natureza === "receber" ? "ok" : "bad" }))} formato={formatBRL} vazio="Sem baixas confirmadas no período." /></Card>}
        {gg.vencimentos && <Card titulo="Contas em aberto por vencimento"><Barras dados={gg.vencimentos.map((x) => ({ rotulo: `${x.natureza === "receber" ? "A receber" : "A pagar"} · ${FAIXAS[x.faixa]}`, valor: Number(x.total), tom: x.natureza === "receber" ? "ice" : "warn" }))} formato={formatBRL} vazio="Nenhuma conta em aberto." /></Card>}
      </div>
    </div>
  );
}
