import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { listarVeiculos, alertasManutencao, temAcessoChecklistVeiculo } from "@/server/services/veiculos";
import { checklistsFaltantes } from "@/server/services/dashboard";
import { listarProfissionais } from "@/server/services/usuarios";
import { ActionForm, Enviar } from "@/components/action-form";
import { Aviso, Badge, Card, PageHeader, Vazio } from "@/components/ui";
import { fmtDataHora, fmtDia } from "@/lib/datas";
import { acaoVeiculo } from "./actions";

export const metadata = { title: "Veículos" };
export default async function Veiculos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await exigirCtx(); const sp = await searchParams;
  if (!pode(ctx, "veiculo.ver", "empresa")) {
    if (!temAcessoChecklistVeiculo(ctx)) redirect("/");
    if (ctx.profissional?.veiculoId) redirect(`/veiculos/${ctx.profissional.veiculoId}`);
    return <div><PageHeader titulo="Meu veículo" /><Aviso tom="info">Você não tem veículo designado. O escritório foi/será avisado.</Aviso></div>;
  }
  const [vs, alertas, falt] = await Promise.all([listarVeiculos(db, ctx), alertasManutencao(db, ctx), checklistsFaltantes(db, ctx)]);
  const profs = pode(ctx, "veiculo.gerenciar") ? await listarProfissionais(db, ctx, { somenteAtivos: true }) : [];
  return (
    <div className="space-y-5">
      <PageHeader titulo="Veículos" subtitulo={`${vs.length} veículo(s) · checklist apenas para técnicos da equipe própria designados (autônomos não fazem checklist de veículo)`} />
      {(sp.filtro === "checklist_pendente" || falt.length > 0) && (
        <Card titulo={`Checklists faltantes hoje (${falt.length})`}>{falt.length === 0 ? <p className="text-[13px] text-muted">Nenhum.</p> : <ul className="space-y-1 text-[13.5px]">{falt.map((f) => <li key={f.profissionalId}><b>{f.nome}</b> — {f.motivo}</li>)}</ul>}</Card>
      )}
      <Card pad={false}>
        {vs.length === 0 ? <Vazio titulo="Nenhum veículo" /> : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Veículo</th><th>Designado a</th><th>KM</th><th>Checklist</th><th>Irregularidades</th><th>Manutenção</th></tr></thead>
            <tbody>{vs.map(({ v, designados, irregularidades, ultimoChecklist, checklistValido }) => {
              const al = alertas.filter((a) => a.veiculoId === v.id && (a.status === "vencido" || a.status === "proximo"));
              return <tr key={v.id}><td><Link href={`/veiculos/${v.id}`} className="font-semibold text-navy hover:underline">{v.identificacao}</Link><div className="text-[12px] text-muted">{[v.modelo, v.placa].filter(Boolean).join(" · ")}</div></td><td className="text-[13px]">{designados ?? "—"}</td>
                <td className="text-[13px]">{v.odometroKm?.toLocaleString("pt-BR") ?? "—"}<div className="text-[11.5px] text-muted">{v.odometroAtualizadoEm ? fmtDataHora(v.odometroAtualizadoEm) : "nunca atualizado"}</div></td>
                <td>{checklistValido ? <Badge tom="ok">Válido no turno</Badge> : <span className="text-[12.5px] text-muted">{ultimoChecklist ? `último ${fmtDataHora(ultimoChecklist)}` : "nenhum"}</span>}</td>
                <td>{irregularidades ? <Badge tom="critico">{irregularidades} aberta(s)</Badge> : <Badge tom="ok">0</Badge>}</td>
                <td className="text-[12.5px]">{al.length ? al.map((a) => <div key={a.tipo}><Badge tom={a.status === "vencido" ? "critico" : "atencao"}>{a.tipo}</Badge> {a.motivo}</div>) : "—"}</td></tr>;
            })}</tbody></table></div>
        )}
      </Card>
      {(
        <Card titulo="Previsão de manutenção (data ou KM — o primeiro limite atingido)">
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Veículo</th><th>Item</th><th>Situação</th><th>Próximo KM</th><th>Próxima data</th><th>Limitação dos dados</th></tr></thead>
            <tbody>{alertas.map((a) => <tr key={a.veiculoId + a.tipo}><td>{a.veiculo}</td><td>{a.tipo}</td><td><Badge tom={a.status === "vencido" ? "critico" : a.status === "proximo" ? "atencao" : a.status === "ok" ? "ok" : "neutro"}>{a.status === "sem_base" ? "Sem base" : a.status}</Badge> <span className="text-[12px] text-muted">{a.motivo}</span></td><td>{a.proximoKm?.toLocaleString("pt-BR") ?? "—"}</td><td>{a.proximaData ? fmtDia(a.proximaData) : "—"}</td><td className="text-[12px] text-warn">{a.limitacao ?? ""}</td></tr>)}</tbody></table></div>
        </Card>
      )}
      {pode(ctx, "veiculo.gerenciar") && (
        <Card titulo="Cadastrar veículo">
          <ActionForm action={acaoVeiculo} className="grid gap-2 sm:grid-cols-4" resetar>
            <input name="identificacao" placeholder="Identificação (ex.: Fiorino 1)" className="input" required /><input name="placa" placeholder="Placa" className="input" /><input name="modelo" placeholder="Modelo" className="input" /><input name="ano" placeholder="Ano" className="input" />
            <select name="responsavelId" className="select" aria-label="Responsável"><option value="">Responsável…</option>{profs.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
            {["oleo", "alinhamento", "rodizio"].map((t) => <div key={t} className="grid grid-cols-2 gap-1"><input name={`${t}_km`} placeholder={`${t}: a cada km`} className="input" /><input name={`${t}_dias`} placeholder="ou dias" className="input" /></div>)}
            <Enviar className="btn btn-primary sm:col-span-4">Cadastrar</Enviar>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
