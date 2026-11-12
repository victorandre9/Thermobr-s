import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { listarServicosAutonomos } from "@/server/services/autonomos";
import { Badge, Card, Dinheiro, PageHeader, Vazio } from "@/components/ui";
import { AUTONOMO_SITUACAO, rotulo } from "@/lib/dominio";
import { fmtDia } from "@/lib/datas";

export const metadata = { title: "Meus pagamentos" };
export default async function MeusPagamentos() {
  const ctx = await exigirCtx();
  if (ctx.profissional?.vinculo !== "autonomo") redirect("/");
  const rows = await listarServicosAutonomos(db, ctx);
  const soma = (s: string) => rows.filter((r) => r.situacaoExibida === s).reduce((t, r) => t + (r.s.valorCombinadoCentavos ?? 0), 0);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader titulo="Meus valores por serviço" subtitulo="Valores combinados com o gestor. Você consulta, sem alterar." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{(["aguardando_conferencia", "conferido", "liberado", "pago"] as const).map((s) => <div key={s} className="card p-4"><div className="text-[12.5px] text-muted">{AUTONOMO_SITUACAO[s]}</div><div className="text-[18px] font-bold text-navy"><Dinheiro v={soma(s)} /></div></div>)}</div>
      <Card pad={false}>{rows.length === 0 ? <Vazio titulo="Nenhum serviço ainda" /> : <ul className="divide-y divide-white">{rows.map((r) => <li key={r.s.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-[14px]"><span><b>OS #{r.osNumero}</b> · {r.clienteNome}<span className="block text-[12.5px] text-muted">{r.s.descricao}{r.previsao && ` · previsão ${fmtDia(r.previsao)}`}</span></span><span className="text-right">{r.s.valorCombinadoCentavos === null ? <span className="text-[12.5px] text-muted">Valor a definir</span> : <b><Dinheiro v={r.s.valorCombinadoCentavos} /></b>}<br /><Badge tom={r.situacaoExibida === "pago" ? "ok" : "info"}>{rotulo(AUTONOMO_SITUACAO, r.situacaoExibida)}</Badge></span></li>)}</ul>}</Card>
    </div>
  );
}
