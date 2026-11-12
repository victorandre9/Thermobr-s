import Link from "next/link";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { listarFerramentas, movimentosFerramentaPendentes, kitEsperado, checklistFerramentasValido } from "@/server/services/ferramentas";
import { ferramentasProblema } from "@/server/services/dashboard";
import { listarProfissionais } from "@/server/services/usuarios";
import { ActionForm, Enviar } from "@/components/action-form";
import { Badge, Card, ChipLink, Filtros, PageHeader, Vazio } from "@/components/ui";
import { FERRAMENTA_CONDICOES, FERRAMENTA_SITUACOES, rotulo } from "@/lib/dominio";
import { fmtDataHora } from "@/lib/datas";
import { acaoChecklistFerr, acaoFerramenta, acaoMovFerramenta } from "./actions";

export const metadata = { title: "Ferramentas" };
export default async function Ferramentas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await exigirCtx(); const sp = await searchParams;
  const empresa = pode(ctx, "ferramenta.ver", "empresa");
  const [todas, pend] = await Promise.all([listarFerramentas(db, ctx, { situacao: sp.situacao }), movimentosFerramentaPendentes(db, ctx)]);
  const probIds = sp.filtro === "problemas" && empresa ? new Set((await ferramentasProblema(db, ctx)).map((x) => x.id)) : null;
  const rows = probIds ? todas.filter((r) => probIds.has(r.f.id)) : todas;
  const profs = empresa ? await listarProfissionais(db, ctx, { somenteAtivos: true }) : [];
  const meuKit = ctx.profissional ? await kitEsperado(db, ctx, ctx.profissional.id) : null;
  const kitValido = ctx.profissional ? await checklistFerramentasValido(db, ctx, ctx.profissional.id, "ferramentas_saida") : null;
  const conjuntos = todas.filter((r) => r.f.tipo === "conjunto");
  return (
    <div className="space-y-5">
      <PageHeader titulo={empresa ? "Ferramentas" : "Minhas ferramentas"} subtitulo="Custódia com responsável identificável. Toda entrega e transferência é confirmada por quem recebe." />
      {pend.length > 0 && (
        <Card titulo={`Aguardando confirmação (${pend.length})`}>
          <ul className="space-y-3">{pend.map(({ m, nome, codigo, deNome, paraNome }) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 text-[13.5px]">
              <span className="flex-1"><b>{codigo} — {nome}</b> · {m.tipo === "devolucao" ? `devolução de ${deNome}` : `${m.tipo} para ${paraNome}`} · {fmtDataHora(m.registradoEm)}</span>
              {m.tipo !== "devolucao" && ctx.profissional?.id === m.paraProfissionalId && <>
                <ActionForm action={acaoMovFerramenta} className="flex gap-1"><input type="hidden" name="op" value="confirmar" /><input type="hidden" name="movimentoId" value={m.id} /><select name="condicao" className="select !w-36" aria-label="Condição"><option value="boa">Em boa condição</option><option value="danificada">Danificada</option></select><Enviar className="btn btn-ok btn-sm">Confirmar recebimento</Enviar></ActionForm>
                <ActionForm action={acaoMovFerramenta} className="flex gap-1"><input type="hidden" name="op" value="recusar" /><input type="hidden" name="movimentoId" value={m.id} /><input name="motivo" placeholder="Motivo" className="input !w-32" required /><Enviar className="btn btn-danger btn-sm">Recusar</Enviar></ActionForm></>}
              {m.tipo === "devolucao" && pode(ctx, "ferramenta.movimentar") && <ActionForm action={acaoMovFerramenta} className="flex gap-1"><input type="hidden" name="op" value="conferir" /><input type="hidden" name="movimentoId" value={m.id} /><select name="condicao" className="select !w-36" aria-label="Condição"><option value="boa">Boa</option><option value="desgastada">Desgastada</option><option value="danificada">Danificada</option></select><Enviar className="btn btn-ok btn-sm">Conferir devolução</Enviar></ActionForm>}
            </li>
          ))}</ul>
        </Card>
      )}
      {ctx.profissional && meuKit && meuKit.itens.length > 0 && (
        <Card titulo={`Conferência do meu kit (saída) — ${kitValido ? "válida neste turno" : "pendente"}`}>
          {kitValido ? <p className="text-[13px] text-muted">Conferência feita em {fmtDataHora(kitValido.realizadoEm)}, válida até {fmtDataHora(kitValido.validoAte)} para este mesmo kit. Mudança de composição exige nova conferência.</p> : (
            <ActionForm action={acaoChecklistFerr} className="space-y-2"><input type="hidden" name="tipo" value="ferramentas_saida" />
              {meuKit.itens.map((f) => (<div key={f.id} className="grid gap-2 sm:grid-cols-[1fr_160px_1fr]"><input type="hidden" name="fid" value={f.id} /><span className="text-[13.5px]"><b>{f.codigo}</b> {f.nome}{f.conjuntoId && <span className="text-muted"> (componente)</span>}</span>
                <select name={`r_${f.id}`} className="select" aria-label="Resultado"><option value="conforme">Conforme</option><option value="irregular">Falta/dano</option><option value="nao_aplica">Não se aplica</option></select><input name={`o_${f.id}`} placeholder="Observação (obrigatória se irregular)" className="input" /></div>))}
              <p className="hint">Conjuntos listam também seus componentes: conferir a maleta não comprova o conteúdo.</p>
              <Enviar className="btn btn-primary">Registrar conferência</Enviar>
            </ActionForm>
          )}
        </Card>
      )}
      {empresa && <Filtros><ChipLink href="/ferramentas" ativo={!sp.filtro && !sp.situacao}>Todas</ChipLink><ChipLink href="/ferramentas?filtro=problemas" ativo={sp.filtro === "problemas"}>Não devolvidas / extraviadas / danificadas</ChipLink>{["disponivel", "em_custodia", "extraviada", "no_cliente"].map((s) => <ChipLink key={s} href={`/ferramentas?situacao=${s}`} ativo={sp.situacao === s}>{rotulo(FERRAMENTA_SITUACOES, s)}</ChipLink>)}</Filtros>}
      <Card pad={false}>
        {rows.length === 0 ? <Vazio titulo="Nenhuma ferramenta" /> : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Código</th><th>Ferramenta</th><th>Situação</th><th>Condição</th><th>Responsável</th><th>Desde</th></tr></thead>
            <tbody>{rows.map(({ f, custodianteNome }) => <tr key={f.id}><td className="font-semibold"><Link className="text-navy hover:underline" href={`/ferramentas/${f.id}`}>{f.codigo}</Link></td><td>{f.nome}{f.tipo === "conjunto" && <Badge tom="info" icone={false}>conjunto</Badge>}{f.exclusiva && <Badge tom="navy" icone={false}>exclusiva</Badge>}</td>
              <td><Badge tom={["extraviada", "no_cliente"].includes(f.situacao) ? "critico" : f.situacao === "disponivel" ? "ok" : "info"}>{rotulo(FERRAMENTA_SITUACOES, f.situacao)}</Badge></td><td>{rotulo(FERRAMENTA_CONDICOES, f.condicao)}</td><td>{custodianteNome ?? "Almoxarifado"}</td><td className="text-[12.5px]">{f.custodiaDesde ? fmtDataHora(f.custodiaDesde) : "—"}</td></tr>)}</tbody></table></div>
        )}
      </Card>
      {pode(ctx, "ferramenta.gerenciar") && (
        <Card titulo="Cadastrar ferramenta ou conjunto">
          <ActionForm action={acaoFerramenta} className="grid gap-2 sm:grid-cols-5" resetar>
            <input name="codigo" placeholder="Código/etiqueta" className="input" required /><input name="nome" placeholder="Nome" className="input" required /><select name="tipo" className="select" aria-label="Tipo"><option value="ferramenta">Ferramenta</option><option value="conjunto">Conjunto/kit</option></select>
            <select name="conjuntoId" className="select" aria-label="Pertence ao conjunto"><option value="">(não é componente)</option>{conjuntos.map((c) => <option key={c.f.id} value={c.f.id}>{c.f.codigo} {c.f.nome}</option>)}</select><Enviar className="btn btn-primary">Cadastrar</Enviar>
          </ActionForm>
          <p className="hint mt-2">Entregas e movimentações na página de cada ferramenta. Profissionais: {profs.length}.</p>
        </Card>
      )}
    </div>
  );
}
