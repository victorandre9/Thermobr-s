import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { exigir, pode } from "@/server/auth/contexto";
import { listarServicosAutonomos, listarResumos, listarAdiantamentos } from "@/server/services/autonomos";
import { profissional } from "@/server/db/schema";
import { ActionForm, Enviar } from "@/components/action-form";
import { Badge, Card, Dinheiro, PageHeader, Vazio } from "@/components/ui";
import { AUTONOMO_SITUACAO, rotulo } from "@/lib/dominio";
import { fmtDia, hojeSP } from "@/lib/datas";
import { acaoAutonomoFin } from "../actions";

export const metadata = { title: "Autônomos" };
export default async function Autonomos() {
  const ctx = await exigirCtx(); exigir(ctx, "autonomo.valores.ver");
  const [servs, resumos, adts, profs] = await Promise.all([listarServicosAutonomos(db, ctx), listarResumos(db, ctx), listarAdiantamentos(db, ctx), db.select().from(profissional).where(and(eq(profissional.empresaId, ctx.empresaId), eq(profissional.vinculo, "autonomo"), eq(profissional.ativo, true)))]);
  const prep = pode(ctx, "autonomo.resumo.preparar");
  return (
    <div className="space-y-5">
      <PageHeader titulo="Técnicos autônomos" subtitulo="Valor combinado definido pelo gestor na OS · conferência → resumo semanal (previsão na sexta, configurável) → liberação → pagamento. Equipe própria não gera pagamento por OS." />
      <Card titulo="Serviços" pad={false}>
        {servs.length === 0 ? <Vazio titulo="Nenhum serviço de autônomo" /> : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Profissional</th><th>OS</th><th>Serviço / base</th><th>Valor</th><th>Situação</th><th></th></tr></thead>
          <tbody>{servs.map((r) => <tr key={r.s.id}><td>{r.profissionalNome}</td><td><Link className="text-navy underline" href={`/os/${r.s.osId}`}>#{r.osNumero}</Link><div className="text-[12px] text-muted">{r.clienteNome}</div></td><td className="text-[13px]">{r.s.descricao}<div className="text-[12px] text-muted">{r.s.base}</div></td><td><Dinheiro v={r.s.valorCombinadoCentavos} /></td><td><Badge tom={r.situacaoExibida === "pago" ? "ok" : r.situacaoExibida === "aguardando_valor" ? "atencao" : "info"}>{rotulo(AUTONOMO_SITUACAO, r.situacaoExibida)}</Badge></td>
            <td>{prep && ["aguardando_conferencia", "aguardando_valor"].includes(r.s.situacao) && r.osEtapa === "encerrada" && r.s.valorCombinadoCentavos !== null && <ActionForm action={acaoAutonomoFin}><input type="hidden" name="op" value="conferir" /><input type="hidden" name="servicoId" value={r.s.id} /><Enviar className="btn btn-ghost btn-sm">Conferir</Enviar></ActionForm>}</td></tr>)}</tbody></table></div>}
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card titulo="Resumos semanais">
          {prep && <ActionForm action={acaoAutonomoFin} className="mb-3 flex flex-wrap gap-2"><input type="hidden" name="op" value="resumo" /><select name="profissionalId" className="select !w-56" required><option value="">Autônomo…</option>{profs.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select><input type="date" name="data" defaultValue={hojeSP()} className="input !w-40" aria-label="Semana" /><Enviar className="btn btn-primary btn-sm">Preparar resumo</Enviar></ActionForm>}
          {resumos.length === 0 ? <p className="text-[13px] text-muted">Nenhum resumo.</p> : <ul className="space-y-2 text-[13px]">{resumos.map(({ r, profissionalNome, pago }) => <li key={r.id} className="rounded-2xl border border-white bg-white/50 p-2"><b>{profissionalNome}</b> · semana {fmtDia(r.semanaInicio)} · previsão {fmtDia(r.dataPrevistaPagamento)}<div>Serviços <Dinheiro v={r.totalServicosCentavos} /> − adiantamentos <Dinheiro v={r.totalAdiantamentosCentavos} /> = <b><Dinheiro v={r.liquidoCentavos} /></b> · <Badge tom={pago ? "ok" : "info"}>{pago ? "pago" : r.situacao}</Badge></div>
            <div className="mt-1 flex gap-2">{prep && r.situacao === "preparado" && <ActionForm action={acaoAutonomoFin}><input type="hidden" name="op" value="solicitar" /><input type="hidden" name="resumoId" value={r.id} /><Enviar className="btn btn-ghost btn-sm">Solicitar liberação</Enviar></ActionForm>}
              {pode(ctx, "autonomo.liberar") && ["preparado", "liberacao_solicitada"].includes(r.situacao) && <ActionForm action={acaoAutonomoFin}><input type="hidden" name="op" value="liberar" /><input type="hidden" name="resumoId" value={r.id} /><Enviar className="btn btn-ok btn-sm">Liberar pagamento</Enviar></ActionForm>}
              {r.obrigacaoId && <Link className="btn btn-ghost btn-sm" href={`/financeiro/obrigacoes/${r.obrigacaoId}`}>Conta a pagar</Link>}</div></li>)}</ul>}
        </Card>
        <Card titulo="Adiantamentos">
          {prep && pode(ctx, "financeiro.lancar") && <ActionForm action={acaoAutonomoFin} className="mb-3 grid gap-2 sm:grid-cols-4" resetar><input type="hidden" name="op" value="adiantamento" /><select name="profissionalId" className="select sm:col-span-2" required><option value="">Autônomo…</option>{profs.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select><input name="valor" placeholder="Valor" className="input" required /><input type="date" name="data" defaultValue={hojeSP()} className="input" /><input name="descricao" placeholder="Descrição" className="input sm:col-span-3" /><Enviar className="btn btn-ghost btn-sm">Registrar</Enviar></ActionForm>}
          <ul className="space-y-1 text-[13px]">{adts.map(({ a, profissionalNome }) => <li key={a.id}>{fmtDia(a.data)} · {profissionalNome} · <Dinheiro v={a.valorCentavos} /> · {a.resumoId ? <Badge tom="ok">abatido</Badge> : <Badge tom="atencao">a abater</Badge>}</li>)}</ul>
        </Card>
      </div>
    </div>
  );
}
