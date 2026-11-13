import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { listarOS } from "@/server/services/os";
import { Card, ChipLink, Filtros, PageHeader, Paginacao, Vazio, Badge } from "@/components/ui";
import { EtapaOS, Prioridade } from "@/components/status";
import { OS_ETAPAS, OS_ORIGENS, SITUACAO_MATERIAL, rotulo } from "@/lib/dominio";
import { fmtDataHora } from "@/lib/datas";

export const metadata = { title: "Ordens de serviço" };

export default async function ListaOS({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await exigirCtx();
  const sp = await searchParams;
  const offset = Number(sp.offset ?? 0);
  if (!(pode(ctx, "agenda.ver", "empresa") || pode(ctx, "os.gerenciar"))) return <ListaOSFinanceiro sp={sp} offset={offset} />;
  const f = { etapa: sp.etapa ?? (sp.semResponsavel || sp.materialPendente || sp.conferenciaPendente ? undefined : "abertas"), origem: sp.origem, busca: sp.busca, semResponsavel: !!sp.semResponsavel, materialPendente: !!sp.materialPendente, conferenciaPendente: !!sp.conferenciaPendente, limite: 50, offset };
  const { rows, total } = await listarOS(db, ctx, f);
  const base = "/os?" + new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "offset" && v) as [string, string][]).toString();
  const filtroAtivo = sp.semResponsavel ? "Sem equipe agendada" : sp.materialPendente ? "Aguardando material" : sp.conferenciaPendente ? "Conferência pendente" : null;
  const agora = Date.now();
  return (
    <div>
      <PageHeader titulo="Ordens de serviço" subtitulo={`${total} OS${filtroAtivo ? ` · filtro: ${filtroAtivo}` : ""}`} acoes={pode(ctx, "os.gerenciar") && <Link href="/os/nova" className="btn btn-primary"><Plus size={16} />Nova OS</Link>} />
      <Filtros>
        <ChipLink href="/os" ativo={!sp.etapa && !filtroAtivo}>Abertas</ChipLink>
        {(["em_planejamento", "aguardando_material", "pronta_para_atendimento", "em_atendimento", "pendente_retorno", "servico_concluido", "encerrada", "cancelada"] as const).map((e) => <ChipLink key={e} href={`/os?etapa=${e}`} ativo={sp.etapa === e}>{OS_ETAPAS[e]}</ChipLink>)}
        <ChipLink href="/os?semResponsavel=1" ativo={!!sp.semResponsavel}>Sem equipe</ChipLink>
        <form action="/os" className="ml-auto flex gap-2"><input name="busca" defaultValue={sp.busca} placeholder="Nº, cliente ou descrição" className="input w-56" aria-label="Buscar" /><button className="btn btn-ghost">Buscar</button></form>
      </Filtros>
      <Card pad={false}>
        {rows.length === 0 ? <Vazio titulo="Nenhuma OS encontrada">Ajuste os filtros ou crie uma nova OS.</Vazio> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>OS</th><th>Cliente / local</th><th>Situação</th><th>Equipe / data</th><th>Material</th><th>Último avanço · tempo na situação</th><th>Próxima ação / responsável</th></tr></thead>
            <tbody>{rows.map((o) => {
              const dias = Math.floor((agora - new Date(o.etapaDesde).getTime()) / 86400000);
              return (
                <tr key={o.id}>
                  <td><Link href={`/os/${o.id}`} className="font-bold text-navy hover:underline">#{o.numero}</Link><div className="text-[12px] text-muted">{rotulo(OS_ORIGENS, o.origem)}</div>{o.demo && <Badge tom="neutro" icone={false}>demo</Badge>}</td>
                  <td><div className="font-medium">{o.clienteNome}</div><div className="text-[12px] text-muted">{o.localNome ?? "—"}</div><div className="max-w-xs truncate text-[12px] text-text-2">{o.descricao}</div></td>
                  <td className="space-y-1"><EtapaOS e={o.etapa} /><div><Prioridade p={o.prioridade} /></div>{o.motivoEtapa && <div className="text-[12px] text-muted">{o.motivoEtapa}</div>}</td>
                  <td><div className="text-[13px]">{o.equipe ?? <span className="font-semibold text-warn">Sem equipe</span>}</div><div className="text-[12px] text-muted">{o.proximaVisita ? fmtDataHora(o.proximaVisita) : "Sem data"}</div></td>
                  <td className="text-[12.5px]">{rotulo(SITUACAO_MATERIAL, o.situacaoMaterial)}</td>
                  <td className="text-[12.5px]">{fmtDataHora(o.ultimoAvancoEm)}<div className="text-muted">{dias} dia(s) na situação</div></td>
                  <td className="text-[12.5px]">{o.proximaAcao ?? "—"}<div className="text-muted">{o.responsavelNome ?? "Sem responsável"}</div></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        <Paginacao total={total} limite={50} offset={offset} base={base} />
      </Card>
    </div>
  );
}

/** Visão do financeiro: só o que interessa para cobrar (sem equipe, material ou agenda). */
async function ListaOSFinanceiro({ sp, offset }: { sp: Record<string, string | undefined>; offset: number }) {
  const ctx = await exigirCtx();
  const cobranca = sp.situacao === "cobradas" ? "gerada" : "pendente";
  const { rows, total } = await listarOS(db, ctx, { cobranca, busca: sp.busca, limite: 50, offset });
  const base = "/os?" + new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "offset" && v) as [string, string][]).toString();
  return (
    <div>
      <PageHeader titulo="OS para cobrar" subtitulo={`${total} OS concluída(s) ${cobranca === "pendente" ? "sem cobrança gerada" : "com cobrança gerada"} · OS de contrato entram na mensalidade`} />
      <Filtros>
        <ChipLink href="/os?situacao=para_cobrar" ativo={cobranca === "pendente"}>Sem cobrança</ChipLink>
        <ChipLink href="/os?situacao=cobradas" ativo={cobranca === "gerada"}>Cobrança gerada</ChipLink>
        <form action="/os" className="ml-auto flex gap-2"><input type="hidden" name="situacao" value={sp.situacao ?? "para_cobrar"} /><input name="busca" defaultValue={sp.busca} placeholder="Nº, cliente ou descrição" className="input w-56" aria-label="Buscar" /><button className="btn btn-ghost">Buscar</button></form>
      </Filtros>
      <Card pad={false}>
        {rows.length === 0 ? <Vazio titulo={cobranca === "pendente" ? "Nenhuma OS aguardando cobrança" : "Nenhuma OS com cobrança"}>{cobranca === "pendente" ? "Todas as OS concluídas já têm cobrança gerada." : "Ajuste a busca."}</Vazio> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>OS</th><th>Cliente</th><th>Situação</th><th>Desde</th><th></th></tr></thead>
            <tbody>{rows.map((o) => (
              <tr key={o.id}>
                <td><Link href={`/os/${o.id}`} className="font-bold text-navy hover:underline">#{o.numero}</Link><div className="text-[12px] text-muted">{rotulo(OS_ORIGENS, o.origem)}</div></td>
                <td><div className="font-medium">{o.clienteNome}</div><div className="max-w-xs truncate text-[12px] text-text-2">{o.descricao}</div></td>
                <td><EtapaOS e={o.etapa} /></td>
                <td className="text-[12.5px]">{fmtDataHora(o.etapaDesde)}</td>
                <td><Link href={`/os/${o.id}#cobranca`} className="btn btn-ghost btn-sm">{o.temCobranca ? "Ver cobrança" : "Gerar cobrança"}</Link></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <Paginacao total={total} limite={50} offset={offset} base={base} />
      </Card>
    </div>
  );
}
