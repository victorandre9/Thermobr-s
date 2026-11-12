import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { historicoFerramenta } from "@/server/services/ferramentas";
import { listarProfissionais } from "@/server/services/usuarios";
import { ActionForm, Enviar } from "@/components/action-form";
import { Badge, Card, Dl, PageHeader } from "@/components/ui";
import { FERRAMENTA_CONDICOES, FERRAMENTA_SITUACOES, rotulo } from "@/lib/dominio";
import { fmtDataHora } from "@/lib/datas";
import { acaoMovFerramenta } from "../actions";

export const metadata = { title: "Ferramenta" };
export default async function Ferramenta({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirCtx(); const { id } = await params;
  const { ferramenta: f, movimentos } = await historicoFerramenta(db, ctx, id);
  const mov = pode(ctx, "ferramenta.movimentar"); const minha = ctx.profissional?.id === f.custodianteProfissionalId;
  const profs = (mov || minha) ? await listarProfissionais(db, ctx, { somenteAtivos: true }).catch(() => []) : [];
  const H = <><input type="hidden" name="ferramentaId" value={id} /></>;
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader titulo={`${f.codigo} — ${f.nome}`} voltar={{ href: "/ferramentas", rotulo: "Ferramentas" }} subtitulo={<span className="flex gap-2"><Badge tom="info">{rotulo(FERRAMENTA_SITUACOES, f.situacao)}</Badge><Badge tom="neutro">{rotulo(FERRAMENTA_CONDICOES, f.condicao)}</Badge></span>} />
      <Card><Dl itens={[["Tipo", f.tipo], ["Descrição", f.descricao ?? "—"], ["Recurso exclusivo na agenda", f.exclusiva ? "Sim" : "Não"], ["Custódia desde", f.custodiaDesde ? fmtDataHora(f.custodiaDesde) : "—"]]} /></Card>
      <Card titulo="Ações">
        <div className="grid gap-3 sm:grid-cols-2">
          {mov && ["disponivel", "reservada"].includes(f.situacao) && <ActionForm action={acaoMovFerramenta} className="space-y-2 rounded-2xl border border-white p-3">{H}<input type="hidden" name="op" value="entregar" /><b className="text-[13px]">Entregar a profissional</b><select name="profissionalId" className="select" required><option value="">Profissional…</option>{profs.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select><input name="observacao" placeholder="Observação" className="input" /><Enviar className="btn btn-primary btn-sm">Registrar entrega</Enviar></ActionForm>}
          {mov && f.situacao === "disponivel" && !f.custodianteProfissionalId && <ActionForm action={acaoMovFerramenta} className="space-y-2 rounded-2xl border border-white p-3">{H}<input type="hidden" name="op" value="inicial" /><b className="text-[13px]">Custódia inicial (implantação)</b><select name="profissionalId" className="select" required><option value="">Quem já está com ela…</option>{profs.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select><Enviar className="btn btn-ghost btn-sm">Registrar</Enviar></ActionForm>}
          {(minha || mov) && f.situacao === "em_custodia" && <>
            <ActionForm action={acaoMovFerramenta} className="space-y-2 rounded-2xl border border-white p-3">{H}<input type="hidden" name="op" value="devolver" /><b className="text-[13px]">Devolver</b><select name="condicao" className="select"><option value="boa">Boa</option><option value="desgastada">Desgastada</option><option value="danificada">Danificada</option></select><input name="observacao" placeholder="Observação" className="input" /><Enviar className="btn btn-ghost btn-sm">Solicitar devolução</Enviar></ActionForm>
            <ActionForm action={acaoMovFerramenta} className="space-y-2 rounded-2xl border border-white p-3">{H}<input type="hidden" name="op" value="transferir" /><b className="text-[13px]">Transferir</b><select name="profissionalId" className="select" required><option value="">Novo responsável…</option>{profs.filter((p) => p.id !== f.custodianteProfissionalId).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select><Enviar className="btn btn-ghost btn-sm">Solicitar transferência</Enviar></ActionForm>
          </>}
          {(minha || mov) && !["extraviada", "no_cliente"].includes(f.situacao) && <ActionForm action={acaoMovFerramenta} className="space-y-2 rounded-2xl border border-white p-3">{H}<input type="hidden" name="op" value="ocorrencia" /><b className="text-[13px]">Registrar ocorrência</b><select name="tipo" className="select"><option value="falta">Falta</option><option value="dano">Dano</option><option value="deixada_cliente">Deixada no cliente</option></select><input name="descricao" placeholder="O que aconteceu" className="input" required /><Enviar className="btn btn-danger btn-sm">Registrar</Enviar></ActionForm>}
          {mov && ["extraviada", "no_cliente"].includes(f.situacao) && <ActionForm action={acaoMovFerramenta} className="space-y-2 rounded-2xl border border-white p-3">{H}<input type="hidden" name="op" value="localizada" /><b className="text-[13px]">Localizada / recuperada</b><input name="observacao" placeholder="Onde/como" className="input" required /><Enviar className="btn btn-ok btn-sm">Confirmar</Enviar></ActionForm>}
        </div>
      </Card>
      <Card titulo="Histórico de responsáveis e movimentos" pad={false}>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Quando</th><th>Movimento</th><th>De → Para</th><th>Registrado / confirmado</th><th>Obs.</th></tr></thead>
          <tbody>{movimentos.map(({ m, registradoPorNome, deNome, paraNome, confirmadoPorNome }) => <tr key={m.id}><td className="text-[12.5px]">{fmtDataHora(m.registradoEm)}</td><td>{m.tipo} <Badge tom={m.status === "confirmado" ? "ok" : m.status === "pendente" ? "atencao" : "neutro"}>{m.status}</Badge></td><td className="text-[12.5px]">{deNome ?? "—"} → {paraNome ?? "—"}</td><td className="text-[12.5px]">{registradoPorNome}{confirmadoPorNome && ` / ${confirmadoPorNome} em ${fmtDataHora(m.confirmadoEm)}`}</td><td className="text-[12.5px]">{m.observacao ?? ""}</td></tr>)}</tbody></table></div>
      </Card>
    </div>
  );
}
