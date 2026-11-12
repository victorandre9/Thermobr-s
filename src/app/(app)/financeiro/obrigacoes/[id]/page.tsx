import Link from "next/link";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { obterObrigacao, listarContas } from "@/server/services/financeiro";
import { listarAnexos } from "@/server/services/anexos";
import { ActionForm, Enviar } from "@/components/action-form";
import { Aviso, Badge, Card, Dinheiro, Dl, PageHeader } from "@/components/ui";
import { ListaAnexos } from "@/components/anexos";
import { BAIXA_STATUS, OBRIGACAO_APROVACAO, rotulo } from "@/lib/dominio";
import { fmtDataHora, fmtDia, fmtCompetencia, hojeSP } from "@/lib/datas";
import { centavosParaInput } from "@/lib/money";
import { acaoBaixa, acaoDecidirBaixa, acaoObrigacao, acaoCobranca } from "../../actions";

export const metadata = { title: "Lançamento" };
export default async function Obrigacao({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirCtx(); const { id } = await params;
  const d = await obterObrigacao(db, ctx, id); const ob = d.ob;
  const contas = await listarContas(db, ctx);
  const comprovantes = await Promise.all(d.baixas.map(async (b) => ({ id: b.b.id, a: await listarAnexos(db, ctx, "baixa", b.b.id) })));
  const H = <input type="hidden" name="obrigacaoId" value={id} />;
  const pagar = ob.natureza === "pagar";
  const liquido = ob.valorBrutoCentavos - ob.descontoCentavos;
  return (
    <div className="space-y-5">
      <PageHeader titulo={ob.descricao} voltar={{ href: `/financeiro/${ob.natureza}`, rotulo: pagar ? "Contas a pagar" : "Contas a receber" }} subtitulo={<span className="flex flex-wrap gap-2"><Badge tom={ob.situacaoAprovacao === "aprovada" ? "ok" : ob.situacaoAprovacao === "aguardando_aprovacao" ? "atencao" : "neutro"}>{rotulo(OBRIGACAO_APROVACAO, ob.situacaoAprovacao)}</Badge>{ob.legado && <Badge tom="neutro">anterior à implantação</Badge>}{d.cat.restrita && <Badge tom="navy" icone={false}>categoria restrita</Badge>}</span>} />
      {d.baixas.some((b) => b.b.excecaoSemAprovacao) && ob.situacaoAprovacao === "aguardando_aprovacao" && <Aviso tom="critico" titulo="Exceção: pagamento realizado sem aprovação prévia">O valor já saiu do caixa e está no realizado. Revise e aprove ou rejeite (com motivo); o registro do pagamento permanece.</Aviso>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card titulo="Obrigação (origem e valores)">
          <Dl itens={[["Natureza", pagar ? "A pagar" : "A receber"], ["Categoria", d.cat.nome], [pagar ? "Beneficiário" : "Cliente", d.clienteNome ?? d.fornecedorNome ?? d.profissionalNome ?? ob.beneficiarioNome ?? "—"],
            ["Origem", <span key="o">{ob.origemTipo}{ob.osId && <> · <Link className="text-ice-strong underline" href={`/os/${ob.osId}`}>OS</Link></>}</span>], ["Chave de unicidade", ob.chaveUnicidade ?? "—"], ["Competência", fmtCompetencia(ob.competencia)],
            ["Valor bruto", <Dinheiro key="b" v={ob.valorBrutoCentavos} />], ["Desconto autorizado", <Dinheiro key="d" v={ob.descontoCentavos} />], ["Valor líquido", <b key="l"><Dinheiro v={liquido} /></b>], ["Documento / NF", `${ob.documento ?? "—"} / ${ob.notaFiscalRef ?? "—"}`], ["Criado por", `${d.criadoPorNome} em ${fmtDataHora(ob.criadoEm)}`]]} />
          {ob.canceladaMotivo && <p className="mt-3 text-[13px] text-bad">Cancelada: {ob.canceladaMotivo}</p>}
        </Card>
        <Card titulo="Autorização">
          {d.aprovacoes.length === 0 ? <p className="text-[13px] text-muted">{ob.origemTipo === "os" || ob.origemTipo === "contrato" || ob.origemTipo === "autonomo" ? "Origem já aprovada (OS/contrato/resumo liberado)." : "Sem decisões registradas."}</p> : <ul className="space-y-1 text-[13px]">{d.aprovacoes.map(({ a, nome }) => <li key={a.id}>{fmtDataHora(a.em)} · <b>{nome}</b> · {a.decisao}{a.autoaprovacao && " · autoaprovação"}{a.motivo && ` — ${a.motivo}`}</li>)}</ul>}
          {ob.situacaoAprovacao === "aguardando_aprovacao" && pode(ctx, "financeiro.aprovar") && (
            <ActionForm action={acaoObrigacao} className="mt-3 flex flex-wrap gap-2">{H}<input name="motivo" placeholder="Motivo (obrigatório para rejeitar)" className="input" /><Enviar className="btn btn-ok btn-sm" name="op" value="aprovar">Aprovar</Enviar><Enviar className="btn btn-danger btn-sm" name="op" value="rejeitar">Rejeitar</Enviar></ActionForm>
          )}
          {ob.situacaoAprovacao !== "cancelada" && (ob.situacaoAprovacao !== "aprovada" ? pode(ctx, "financeiro.lancar") : pode(ctx, "financeiro.estornar")) && (
            <details className="mt-3"><summary className="cursor-pointer text-[13px] text-muted">Cancelar obrigação</summary><ActionForm action={acaoObrigacao} className="mt-2 flex gap-2" confirmar="Cancelar esta obrigação?">{H}<input type="hidden" name="op" value="cancelar" /><input name="motivo" placeholder="Motivo" className="input" required /><Enviar className="btn btn-danger btn-sm">Cancelar</Enviar></ActionForm></details>
          )}
          {pode(ctx, "financeiro.lancar") && !pagar && <ActionForm action={acaoObrigacao} className="mt-3 flex gap-2">{H}<input type="hidden" name="op" value="nf" /><input name="ref" placeholder="Nº da nota emitida no sistema fiscal" defaultValue={ob.notaFiscalRef ?? ""} className="input" /><Enviar className="btn btn-ghost btn-sm">Salvar NF</Enviar></ActionForm>}
        </Card>
      </div>
      <Card titulo="Parcelas e baixas (fatos registrados)">
        <div className="space-y-4">{d.parcelas.map((p) => (
          <div key={p.id} className="rounded-2xl border border-white bg-white/50 p-3">
            <div className="flex flex-wrap items-center gap-2"><b>Parcela {p.numero}{p.descricao ? ` (${p.descricao})` : ""}</b> · vence {fmtDia(p.vencimento)} · <Dinheiro v={p.valorCentavos} /> · {pagar ? "pago" : "recebido"} <Dinheiro v={p.confirmado} /> · saldo <b><Dinheiro v={p.saldo} /></b> <Badge tom={p.situacao.vencida ? "critico" : p.situacao.codigo === "quitada" ? "ok" : p.situacao.parcial ? "atencao" : "info"}>{p.situacao.rotulo}</Badge>{p.dataEsperada && <Badge tom="info" icone={false}>esperado {fmtDia(p.dataEsperada)}</Badge>}</div>
            <ul className="mt-2 space-y-1 text-[12.5px]">{d.baixas.filter((b) => b.b.parcelaId === p.id).map(({ b, contaNome, registradaPorNome }) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2">{fmtDia(b.dataPagamento)} · <Dinheiro v={b.valorCentavos} /> · {contaNome} · {b.forma ?? ""} · por {registradaPorNome} · <Badge tom={b.status === "confirmada" ? "ok" : b.status === "rejeitada" ? "neutro" : "atencao"}>{rotulo(BAIXA_STATUS, b.status)}</Badge>{b.estornoDeId && <Badge tom="critico">estorno</Badge>}{b.excecaoSemAprovacao && <Badge tom="critico">exceção</Badge>}{b.autoconfirmacao && <span className="text-muted">(autoconfirmada)</span>}{b.motivo && <span className="text-muted">— {b.motivo}</span>}
                <ListaAnexos anexos={comprovantes.find((c) => c.id === b.id)?.a ?? []} />
                {b.status === "aguardando_conferencia" && (pode(ctx, "financeiro.aprovar") || pode(ctx, "financeiro.baixa.confirmar")) && <ActionForm action={acaoDecidirBaixa} className="flex gap-1">{H}<input type="hidden" name="baixaId" value={b.id} /><input name="motivo" placeholder="Motivo se rejeitar" className="input !w-40 !py-1" /><Enviar className="btn btn-ok btn-sm" name="op" value="confirmar">Confirmar</Enviar><Enviar className="btn btn-danger btn-sm" name="op" value="rejeitar">Rejeitar</Enviar></ActionForm>}
                {b.status === "confirmada" && !b.estornoDeId && pode(ctx, "financeiro.estornar") && <details><summary className="cursor-pointer text-muted">estornar</summary><ActionForm action={acaoDecidirBaixa} className="flex gap-1">{H}<input type="hidden" name="op" value="estornar" /><input type="hidden" name="baixaId" value={b.id} /><input name="motivo" placeholder="Motivo (devolução, erro…)" className="input !w-48 !py-1" required /><Enviar className="btn btn-danger btn-sm">Estornar</Enviar></ActionForm></details>}
              </li>))}</ul>
            {p.saldo > 0 && !p.cancelada && pode(ctx, "financeiro.baixa.registrar") && (ob.situacaoAprovacao === "aprovada" || (pagar && ob.situacaoAprovacao === "aguardando_aprovacao" && pode(ctx, "financeiro.baixa.excecao"))) && (
              <details className="mt-2"><summary className="cursor-pointer text-[13px] font-semibold text-ice-strong">Registrar {pagar ? "pagamento" : "recebimento"} realizado</summary>
                <ActionForm action={acaoBaixa} className="mt-2 grid gap-2 sm:grid-cols-3">{H}<input type="hidden" name="parcelaId" value={p.id} />
                  <input name="valor" defaultValue={centavosParaInput(p.saldo)} className="input" aria-label="Valor" /><input type="date" name="data" defaultValue={hojeSP()} className="input" aria-label="Data" />
                  <select name="contaId" className="select" required aria-label="Conta"><option value="">Conta…</option>{contas.filter((c) => c.ativo).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
                  <select name="forma" className="select" aria-label="Forma">{["pix", "transferencia", "boleto", "dinheiro", "cartao", "outro"].map((f) => <option key={f}>{f}</option>)}</select>
                  <input name="obs" placeholder="Observação" className="input" /><label className="text-[12px] text-muted">Comprovante<input type="file" name="comprovante" accept="image/*,application/pdf" className="block text-[12px]" /></label>
                  {ob.situacaoAprovacao === "aguardando_aprovacao" && <div className="sm:col-span-3 rounded-xl bg-bad-soft p-2 text-[12.5px] text-bad"><label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="excecao" required />O pagamento JÁ ACONTECEU sem aprovação prévia (exceção)</label><input name="justificativa" placeholder="Justificativa" className="input mt-1" required /><span>Comprovante obrigatório. Entra no caixa realizado e gera alerta ao gestor.</span></div>}
                  <Enviar className="btn btn-primary sm:col-span-3">Registrar</Enviar>
                </ActionForm>
                <p className="hint">Registrar = fato ocorrido (não movimenta banco). Parcial permitido; o saldo restante continua em aberto.</p>
              </details>
            )}
            {!pagar && p.saldo > 0 && pode(ctx, "financeiro.cobranca") && <ActionForm action={acaoObrigacao} className="mt-2 flex flex-wrap gap-2">{H}<input type="hidden" name="op" value="dataEsperada" /><input type="hidden" name="parcelaId" value={p.id} /><label className="text-[12.5px] text-muted">Data esperada de recebimento <input type="date" name="data" defaultValue={p.dataEsperada ?? ""} className="input !w-40" /></label><Enviar className="btn btn-ghost btn-sm">Salvar</Enviar></ActionForm>}
          </div>
        ))}</div>
      </Card>
      {!pagar && ob.clienteId && (
        <Card titulo="Histórico de cobrança">
          <ul className="space-y-1 text-[13px]">{d.contatos.map(({ c, nome }) => <li key={c.id}>{fmtDataHora(c.em)} · {nome} · {c.canal}: {c.resumo}{c.proximaAcao && ` → ${c.proximaAcao} (${c.proximaAcaoEm ? fmtDia(c.proximaAcaoEm) : "sem data"})`}</li>)}</ul>
          {pode(ctx, "financeiro.cobranca") && <ActionForm action={acaoCobranca} className="mt-3 grid gap-2 sm:grid-cols-4" resetar><input type="hidden" name="clienteId" value={ob.clienteId} />{H}<select name="canal" className="select">{["telefone", "whatsapp", "email", "presencial", "outro"].map((c) => <option key={c}>{c}</option>)}</select><input name="resumo" placeholder="Resumo do contato" className="input sm:col-span-3" required /><input name="proximaAcao" placeholder="Próxima ação" className="input sm:col-span-2" /><input type="date" name="proximaAcaoEm" className="input" aria-label="Data" /><Enviar className="btn btn-ghost">Registrar contato</Enviar></ActionForm>}
        </Card>
      )}
    </div>
  );
}
