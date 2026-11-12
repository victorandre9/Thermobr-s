import Link from "next/link";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { listarVisitas, type FiltroVisita } from "@/server/services/visitas";
import { Card, ChipLink, Filtros, PageHeader, Paginacao, Vazio } from "@/components/ui";
import { SituacaoVisita } from "@/components/status";
import { fmtDataHora, fmtHora } from "@/lib/datas";
import { MOTIVOS_RESULTADO, rotulo } from "@/lib/dominio";

export const metadata = { title: "Visitas" };
const F: Array<[string, string]> = [["hoje", "Hoje"], ["atrasadas", "Não iniciadas após o horário"], ["em_atendimento", "Em atendimento"], ["nao_concluidas", "Parciais / não realizadas"], ["conflitos", "Equipe inválida"], ["finalizadas", "Finalizadas"], ["todas", "Todas"]];

export default async function Visitas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await exigirCtx(); const sp = await searchParams;
  const filtro = (sp.filtro ?? "hoje") as FiltroVisita["filtro"]; const offset = Number(sp.offset ?? 0);
  const { rows, total } = await listarVisitas(db, ctx, { filtro, de: sp.de, ate: sp.ate, limite: 50, offset });
  return (
    <div>
      <PageHeader titulo="Visitas" subtitulo={`${total} visita(s)${sp.de ? ` · ${sp.de} a ${sp.ate}` : ""}`} />
      <Filtros>{F.map(([k, r]) => <ChipLink key={k} href={`/visitas?filtro=${k}`} ativo={filtro === k}>{r}</ChipLink>)}</Filtros>
      <Card pad={false}>
        {rows.length === 0 ? <Vazio titulo="Nenhuma visita neste filtro" /> : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Quando</th><th>OS / cliente</th><th>Equipe</th><th>Situação</th><th>Realizado</th><th>Pendência</th></tr></thead>
            <tbody>{rows.map((v) => (
              <tr key={v.id}>
                <td className="whitespace-nowrap">{v.inicio ? `${fmtDataHora(v.inicio)}–${fmtHora(v.fim)}` : "Sem data"}</td>
                <td><Link href={`/visitas/${v.id}`} className="font-semibold text-navy hover:underline">OS #{v.osNumero} · visita {v.sequencia}</Link><div className="text-[12.5px] text-muted">{v.clienteNome} · {v.bairro ?? v.localNome ?? ""}</div></td>
                <td className="text-[13px]">{v.equipe ?? <b className="text-warn">Sem equipe</b>}</td>
                <td><SituacaoVisita s={v.situacao} r={v.resultado} />{v.motivo && <div className="text-[12px] text-muted">{rotulo(MOTIVOS_RESULTADO, v.motivo)}</div>}</td>
                <td className="text-[12.5px]">{v.checkinEm ? `${fmtHora(v.checkinEm)}–${v.checkoutEm ? fmtHora(v.checkoutEm) : "…"}` : "—"}</td>
                <td className="max-w-xs text-[12.5px]">{v.pendenciaDescricao ? `${v.pendenciaDescricao} → ${v.proximaAcao}` : "—"}</td>
              </tr>
            ))}</tbody></table></div>
        )}
        <Paginacao total={total} limite={50} offset={offset} base={`/visitas?filtro=${filtro}${sp.de ? `&de=${sp.de}&ate=${sp.ate}` : ""}`} />
      </Card>
    </div>
  );
}
