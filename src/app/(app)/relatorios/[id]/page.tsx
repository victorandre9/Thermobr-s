import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { gerarRelatorio, type Filtros as F } from "@/server/services/relatorios";
import { listarProfissionais } from "@/server/services/usuarios";
import { Aviso, Card, PageHeader, Paginacao, Vazio } from "@/components/ui";
import { OS_ETAPAS, OS_ORIGENS } from "@/lib/dominio";
import { formatBRL } from "@/lib/money";
import { formatQtd } from "@/lib/quantidade";
import { fmtDataHora, fmtDia } from "@/lib/datas";

export const metadata = { title: "Relatório" };
export default async function Relatorio({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await exigirCtx(); const { id } = await params; const sp = await searchParams;
  const f: F = { de: sp.de, ate: sp.ate, etapa: sp.etapa, origem: sp.origem, profissionalId: sp.profissionalId, situacao: sp.situacao, acao: sp.acao, clienteId: sp.clienteId, limite: 50, offset: Number(sp.offset ?? 0) };
  const { def, resultado: r } = await gerarRelatorio(db, ctx, id, f);
  const profs = def.filtros.includes("profissionalId") ? await listarProfissionais(db, ctx).catch(() => []) : [];
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "offset" && v) as [string, string][]).toString();
  const fmt = (v: unknown, t?: string) => v === null || v === undefined || v === "" ? "—" : t === "moeda" ? formatBRL(Number(v)) : t === "datahora" ? fmtDataHora(v as Date) : t === "data" ? fmtDia(String(v)) : t === "qtd" ? formatQtd(String(v)) : String(v);
  return (
    <div className="space-y-4">
      <PageHeader titulo={def.titulo} voltar={{ href: "/relatorios", rotulo: "Relatórios" }} subtitulo={def.descricao} acoes={pode(ctx, "relatorio.exportar") && <a className="btn btn-ghost" href={`/api/relatorios/${id}/csv?${qs}`}>Exportar CSV</a>} />
      <Card>
        <form className="flex flex-wrap items-end gap-2" action={`/relatorios/${id}`}>
          {def.filtros.includes("de") && <label className="text-[12px]">De<input type="date" name="de" defaultValue={sp.de} className="input" /></label>}
          {def.filtros.includes("ate") && <label className="text-[12px]">Até<input type="date" name="ate" defaultValue={sp.ate} className="input" /></label>}
          {def.filtros.includes("etapa") && <select name="etapa" defaultValue={sp.etapa ?? ""} className="select !w-52" aria-label="Situação"><option value="">Todas as situações</option>{Object.entries(OS_ETAPAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
          {def.filtros.includes("origem") && <select name="origem" defaultValue={sp.origem ?? ""} className="select !w-52" aria-label="Origem"><option value="">Todas as origens</option>{Object.entries(OS_ORIGENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
          {def.filtros.includes("profissionalId") && <select name="profissionalId" defaultValue={sp.profissionalId ?? ""} className="select !w-52" aria-label="Profissional"><option value="">Todos os profissionais</option>{profs.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>}
          {def.filtros.includes("situacao") && id === "custos" ? <select name="situacao" defaultValue={sp.situacao ?? "tecnico"} className="select !w-52" aria-label="Agrupar por"><option value="tecnico">Por técnico</option><option value="os">Por OS (serviço)</option><option value="categoria">Por categoria</option></select>
            : def.filtros.includes("situacao") && <input name="situacao" defaultValue={sp.situacao} placeholder={id === "acompanhamento" ? "6 ou 12 (meses)" : "situação"} className="input !w-40" />}
          {def.filtros.includes("acao") && <input name="acao" defaultValue={sp.acao} placeholder="ação (ex.: financeiro.)" className="input !w-48" />}
          <button className="btn btn-primary">Aplicar</button>
        </form>
      </Card>
      {r.avisos.map((a) => <Aviso key={a} tom="info">{a}</Aviso>)}
      <Card pad={false}>
        {r.linhas.length === 0 ? <Vazio titulo="Sem registros para os filtros">A ausência de registros não significa resultado zero: verifique o período e os lançamentos.</Vazio> : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr>{r.colunas.map((c) => <th key={c.chave}>{c.rotulo}</th>)}</tr></thead>
            <tbody>{r.linhas.map((l, i) => <tr key={i}>{r.colunas.map((c) => <td key={c.chave} className={c.tipo === "moeda" || c.tipo === "numero" || c.tipo === "qtd" ? "num whitespace-nowrap" : "text-[13px]"}>{fmt(l[c.chave], c.tipo)}</td>)}</tr>)}</tbody></table></div>
        )}
        <Paginacao total={r.total} limite={50} offset={f.offset ?? 0} base={`/relatorios/${id}?${qs}`} />
      </Card>
    </div>
  );
}
