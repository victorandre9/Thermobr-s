import Link from "next/link";
import { CalendarPlus, CalendarDays, Inbox, PackageCheck } from "lucide-react";
import { db } from "@/server/db";
import type { Ctx } from "@/server/auth/contexto";
import { pode } from "@/server/auth/contexto";
import { listarVisitas } from "@/server/services/visitas";
import { resumoOperacional, oQueResolver } from "@/server/services/inicio";
import { ordemServico } from "@/server/db/schema";
import { inArray } from "drizzle-orm";
import { Badge, Card } from "@/components/ui";
import { SituacaoVisita } from "@/components/status";
import { AcoesRapidas, GradeKpi, Secao } from "./blocos";
import { Cabecalho, SeletorVisao, type SP } from "./comum";
import { fmtDia, fmtHora, hojeSP, NOMES_DIA, diaSemana } from "@/lib/datas";
import { MOTIVOS_RESULTADO, rotulo } from "@/lib/dominio";

export async function HomeAdministrativo({ ctx }: { ctx: Ctx; sp: SP }) {
  const [agenda, resumo, resolver] = await Promise.all([listarVisitas(db, ctx, { filtro: "hoje", limite: 100 }), resumoOperacional(db, ctx), oQueResolver(db, ctx)]);
  const oss = agenda.rows.length ? await db.select({ id: ordemServico.id, etapa: ordemServico.etapa, material: ordemServico.situacaoMaterial }).from(ordemServico).where(inArray(ordemServico.id, agenda.rows.map((v) => v.osId))) : [];
  const gerir = pode(ctx, "agenda.gerenciar"); const conferir = pode(ctx, "os.conferir");
  const dia = hojeSP();
  const agora = Date.now();
  return (
    <div className="space-y-6">
      <Cabecalho titulo="Operação de hoje" sub={`${NOMES_DIA[diaSemana(dia)]}, ${fmtDia(dia)} · ${agenda.total} atendimento(s) na agenda`} direita={<SeletorVisao ctx={ctx} atual="administrativo" />} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Secao titulo="Agenda do dia" acao={<Link href="/agenda?modo=dia" className="btn btn-ghost btn-sm">Agenda completa</Link>}>
          <Card pad={false}>
            {agenda.rows.length === 0 ? <p className="px-4 py-3 text-[13px] text-muted">Nenhuma visita agendada para hoje.</p> : (
              <ul>{agenda.rows.map((v) => {
                const o = oss.find((x) => x.id === v.osId);
                const atrasada = v.situacao === "agendada" && v.inicio && new Date(v.inicio).getTime() < agora;
                const imped = !v.equipe ? "Sem equipe" : o?.material === "pendente" ? "Material pendente" : atrasada ? "Não iniciada após o horário" : v.motivo ? rotulo(MOTIVOS_RESULTADO, v.motivo) : null;
                return (
                  <li key={v.id} className="linha-acao !items-start">
                    <div className="w-14 shrink-0 pt-0.5 text-center"><div className="num text-[15px] font-bold text-navy">{fmtHora(v.inicio)}</div><div className="text-[11px] text-muted">{fmtHora(v.fim)}</div></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5"><b className="text-[13.5px] text-navy">{v.clienteNome}</b><SituacaoVisita s={v.situacao} r={v.resultado} />{imped && <Badge tom="critico">{imped}</Badge>}</div>
                      <div className="truncate text-[12.5px] text-text-2">OS {v.osNumero} · {v.descricao}</div>
                      <div className="text-[12px] text-muted">{v.localNome ?? ""}{v.bairro ? ` · ${v.bairro}` : ""} · {v.equipe ?? "sem equipe"}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Link href={`/visitas/${v.id}`} className="btn btn-ghost btn-sm">Abrir</Link>
                        {gerir && v.situacao === "agendada" && <Link href={`/os/${v.osId}/programar?visitaId=${v.id}`} className="btn btn-ghost btn-sm">{v.equipe ? "Reagendar" : "Atribuir equipe"}</Link>}
                        {conferir && o?.etapa === "servico_concluido" && <Link href={`/os/${v.osId}`} className="btn btn-ok btn-sm">Conferir conclusão</Link>}
                      </div>
                    </div>
                  </li>
                );
              })}</ul>
            )}
          </Card>
        </Secao>

        <div className="space-y-6">
          <Secao titulo="Resumo"><GradeKpi itens={resumo} colunasDesktop={2} /></Secao>
          <Secao titulo="Ações rápidas">
            <AcoesRapidas itens={[
              ...(gerir ? [{ href: "/agenda", rotulo: "Programar visita", icone: CalendarPlus }] : []),
              { href: "/agenda", rotulo: "Consultar agenda", icone: CalendarDays },
              ...(pode(ctx, "pedido.ver") ? [{ href: "/pedidos", rotulo: "Pedidos", icone: Inbox }] : []),
              ...(pode(ctx, "material.conferir") || pode(ctx, "ferramenta.movimentar") ? [{ href: "/materiais/conferencia", rotulo: "Conferir materiais e ferramentas", icone: PackageCheck }] : []),
            ]} />
          </Secao>
        </div>
      </div>

      <Secao titulo="O que precisa ser resolvido" sub="Problemas priorizados e a próxima ação" acao={<Link href="/pendencias" className="btn btn-ghost btn-sm">Central de pendências</Link>}>
        <Card pad={false}>
          {resolver.itens.length === 0 ? <p className="px-4 py-3 text-[13px] text-muted">Nada pendente de organização agora.</p> : (
            <ul>{resolver.itens.map((i) => (
              <li key={i.id} className="linha-acao">
                <Badge tom={i.gravidade === "alta" ? "critico" : i.gravidade === "media" ? "atencao" : "neutro"}>{i.gravidade === "alta" ? "Alta" : i.gravidade === "media" ? "Média" : "Baixa"}</Badge>
                <div className="min-w-0 flex-1"><b className="text-[13.5px] text-navy">{i.problema}</b><div className="truncate text-[12px] text-muted">{i.detalhe}</div><div className="text-[12px] text-ice-strong sm:hidden">→ {i.proximaAcao}</div></div>
                <Link href={i.href} className="btn btn-ghost btn-sm shrink-0" title={i.proximaAcao}><span className="sm:hidden">Resolver</span><span className="hidden sm:inline">{i.proximaAcao}</span></Link>
              </li>
            ))}</ul>
          )}
          {resolver.total > resolver.itens.length && <p className="px-4 py-2 text-[12.5px] text-muted">Mostrando {resolver.itens.length} de {resolver.total}. <Link href="/os" className="font-semibold text-ice-strong">Ver ordens de serviço</Link></p>}
        </Card>
      </Secao>
    </div>
  );
}
