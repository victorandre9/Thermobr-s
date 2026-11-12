import Link from "next/link";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { listarPendencias } from "@/server/services/pendencias";
import { Badge, Card, ChipLink, Filtros, PageHeader, Paginacao, Vazio } from "@/components/ui";
import { PENDENCIA_TIPOS, PRIORIDADE_PENDENCIA, rotulo } from "@/lib/dominio";
import { fmtDia, hojeSP } from "@/lib/datas";

export const metadata = { title: "Pendências" };
export default async function Pendencias({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await exigirCtx(); const sp = await searchParams; const offset = Number(sp.offset ?? 0);
  const { rows, total } = await listarPendencias(db, ctx, { tipo: sp.tipo, situacao: (sp.situacao as "abertas") ?? "abertas", semResponsavel: !!sp.semResponsavel, vencidas: !!sp.vencidas, limite: 50, offset });
  const hoje = hojeSP();
  const base = "/pendencias?" + new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "offset" && v) as [string, string][]).toString();
  return (
    <div>
      <PageHeader titulo="Pendências" subtitulo={`${total} registro(s). Ler uma notificação não resolve a pendência.`} />
      <Filtros>
        <ChipLink href="/pendencias" ativo={!sp.tipo && !sp.semResponsavel && !sp.vencidas && !sp.situacao}>Abertas</ChipLink>
        <ChipLink href="/pendencias?semResponsavel=1" ativo={!!sp.semResponsavel}>Sem responsável</ChipLink>
        <ChipLink href="/pendencias?vencidas=1" ativo={!!sp.vencidas}>Prazo vencido</ChipLink>
        {["visita_impedimento", "extra_solicitado", "material_divergencia", "ferramenta_falta", "veiculo_irregularidade", "solicitacao_retorno"].map((t) => <ChipLink key={t} href={`/pendencias?tipo=${t}`} ativo={sp.tipo === t}>{rotulo(PENDENCIA_TIPOS, t)}</ChipLink>)}
        <ChipLink href="/pendencias?situacao=encerradas" ativo={sp.situacao === "encerradas"}>Encerradas</ChipLink>
      </Filtros>
      <Card pad={false}>
        {rows.length === 0 ? <Vazio titulo="Nenhuma pendência neste filtro" /> : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>O que aconteceu</th><th>Relacionado</th><th>Responsável</th><th>Prazo</th><th>Prioridade</th><th>Próxima ação</th></tr></thead>
            <tbody>{rows.map(({ p, responsavelNome, osNumero, veiculoIdent, ferramentaNome, profissionalNome }) => (
              <tr key={p.id}><td><Link href={`/pendencias/${p.id}`} className="font-semibold text-navy hover:underline">{p.titulo}</Link><div className="text-[12px] text-muted">{rotulo(PENDENCIA_TIPOS, p.tipo)} · aberta {fmtDia(p.abertaEm.toISOString().slice(0, 10))}</div></td>
                <td className="text-[12.5px]">{[osNumero && `OS ${osNumero}`, veiculoIdent, ferramentaNome, profissionalNome].filter(Boolean).join(" · ") || "—"}</td>
                <td className="text-[12.5px]">{responsavelNome ?? <b className="text-bad">Sem responsável</b>}</td>
                <td className="text-[12.5px]">{p.prazo ? <span className={p.prazo < hoje ? "font-bold text-bad" : ""}>{fmtDia(p.prazo)}{p.prazo < hoje && " (vencido)"}</span> : "—"}</td>
                <td><Badge tom={p.prioridade === "critica" ? "critico" : p.prioridade === "alta" ? "alerta" : "neutro"}>{rotulo(PRIORIDADE_PENDENCIA, p.prioridade)}</Badge></td>
                <td className="max-w-xs text-[12.5px]">{p.aguardandoTerceiro ? `Aguardando: ${p.aguardandoTerceiro}` : p.proximaAcao ?? "—"}</td></tr>
            ))}</tbody></table></div>
        )}
        <Paginacao total={total} limite={50} offset={offset} base={base} />
      </Card>
    </div>
  );
}
