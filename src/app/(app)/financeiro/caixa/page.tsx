import Link from "next/link";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { saldosRealizados, realizadoPeriodo, projecao } from "@/server/services/fluxo";
import { listarContas } from "@/server/services/financeiro";
import { ActionForm, Enviar } from "@/components/action-form";
import { Aviso, Card, ChipLink, Dinheiro, Filtros, PageHeader } from "@/components/ui";
import { Barras } from "@/components/barras";
import { fmtDia, hojeSP, primeiroDiaMes } from "@/lib/datas";
import { formatBRL } from "@/lib/money";
import { acaoConta } from "../actions";

export const metadata = { title: "Caixa e previsão" };
export default async function Caixa({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await exigirCtx(); const sp = await searchParams;
  const h = Number(sp.h ?? 30); const de = sp.de ?? primeiroDiaMes(hojeSP()); const ate = sp.ate ?? hojeSP();
  const [sal, rp, pj, contas] = await Promise.all([saldosRealizados(db, ctx), realizadoPeriodo(db, ctx, de, ate), projecao(db, ctx, [7, 15, 30, 60, 90].includes(h) ? h : 30), listarContas(db, ctx)]);
  return (
    <div className="space-y-5">
      <PageHeader titulo="Caixa e previsão" subtitulo={`Data de corte: ${fmtDia(sal.dataCorte)}. Valores registrados aqui são fatos e previsões internas; nenhuma transação bancária é executada.`} />
      {pj.avisos.map((a) => <Aviso key={a} tom="atencao">{a}</Aviso>)}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card titulo="Saldo confirmado por conta" className="lg:col-span-2" pad={false}>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Conta</th><th>Saldo inicial</th><th>Entradas</th><th>Saídas</th><th>Transf. (±)</th><th>Saldo</th><th>Em conferência</th></tr></thead>
            <tbody>{sal.contas.map((c) => <tr key={c.contaId}><td className="font-semibold">{c.nome}</td><td>{c.saldoInicial === null ? <span className="text-[12px] font-semibold text-warn">Não informado</span> : <><Dinheiro v={c.saldoInicial} /><div className="text-[11.5px] text-muted">em {fmtDia(c.saldoInicialData)}</div></>}</td><td><Dinheiro v={c.entradas} /></td><td><Dinheiro v={c.saidas} /></td><td><Dinheiro v={c.transfEntrada - c.transfSaida} /></td><td className="font-bold">{c.saldo === null ? "—" : <Dinheiro v={c.saldo} />}</td><td className="text-[12.5px]"><Dinheiro v={c.aguardandoConferencia} /></td></tr>)}
              <tr><td className="font-bold">Consolidado</td><td colSpan={4} className="text-[12px] text-muted">Transferências não alteram o consolidado</td><td className="font-bold">{sal.consolidado === null ? "Sem base" : <Dinheiro v={sal.consolidado} />}{sal.incompleto && <div className="text-[11.5px] text-warn">incompleto</div>}</td><td /></tr></tbody></table></div>
        </Card>
        <Card titulo="Realizado no período">
          <form className="mb-3 flex flex-wrap gap-2" action="/financeiro/caixa"><input type="date" name="de" defaultValue={de} className="input !w-40" aria-label="De" /><input type="date" name="ate" defaultValue={ate} className="input !w-40" aria-label="Até" /><button className="btn btn-ghost btn-sm">Aplicar</button></form>
          {rp.registros === 0 ? <p className="text-[13px] text-muted">Sem baixas confirmadas no período.</p> : <div className="space-y-1 text-[14px]"><p>Recebido: <b><Dinheiro v={rp.recebido} /></b></p><p>Pago: <b><Dinheiro v={rp.pago} /></b></p><p>Diferença de caixa: <b><Dinheiro v={rp.diferencaCaixa} /></b></p><p className="text-[12px] text-muted">Diferença de caixa não é lucro líquido.{rp.omitidoRestrito && " Categorias restritas não incluídas."}</p></div>}
        </Card>
      </div>
      <Card titulo={`Previsão — próximos ${pj.horizonteDias} dias`}>
        <Filtros>{[7, 15, 30, 60, 90].map((n) => <ChipLink key={n} href={`/financeiro/caixa?h=${n}`} ativo={pj.horizonteDias === n}>{n} dias</ChipLink>)}</Filtros>
        <div className="grid gap-4 md:grid-cols-4 text-[13.5px]">
          <div>Saldo de partida<br /><b className="text-[18px]">{pj.saldoConfirmado === null ? "Sem base" : formatBRL(pj.saldoConfirmado)}</b></div>
          <div>+ A receber previsto<br /><b className="text-[18px] text-ok">{formatBRL(pj.receberPrevisto)}</b><div className="text-[11.5px] text-muted">inclui {formatBRL(pj.receberVencidoComPrevisao)} vencidos com data esperada</div></div>
          <div>− A pagar previsto<br /><b className="text-[18px] text-bad">{formatBRL(pj.pagarPrevisto + pj.pagarVencido)}</b><div className="text-[11.5px] text-muted">inclui {formatBRL(pj.pagarVencido)} vencidos</div></div>
          <div>= Saldo projetado<br /><b className={`text-[18px] ${pj.saldoProjetado !== null && pj.saldoProjetado < 0 ? "text-bad" : "text-navy"}`}>{pj.saldoProjetado === null ? "Sem base" : formatBRL(pj.saldoProjetado)}</b></div>
        </div>
        {pj.primeiroNegativo && <div className="mt-4"><Aviso tom="critico" titulo={`Risco de falta de caixa em ${fmtDia(pj.primeiroNegativo.dia)} (saldo ${formatBRL(pj.primeiroNegativo.saldo)})`}>Compromissos do dia: {pj.compromissosNoDia.map((c) => `${c.descricao} (${formatBRL(c.saldo)})`).join("; ") || "—"}. Recebimento previsto não é dinheiro garantido.</Aviso></div>}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div><h3 className="mb-2 text-[13px] font-semibold">Dias com movimento previsto</h3><Barras dados={pj.serie.filter((s) => s.entradas || s.saidas).map((s) => ({ rotulo: fmtDia(s.dia), valor: s.saldo, tom: s.saldo < 0 ? "bad" : "ice" }))} formato={formatBRL} vazio="Nenhum vencimento em aberto no horizonte." /></div>
          <div><h3 className="mb-2 text-[13px] font-semibold">Vencidos a receber SEM previsão (fora da série)</h3>{pj.vencidosSemPrevisao.length === 0 ? <p className="text-[13px] text-muted">Nenhum.</p> : <ul className="space-y-1 text-[13px]">{pj.vencidosSemPrevisao.map((v, i) => <li key={i}><Link className="text-ice-strong underline" href={`/financeiro/obrigacoes/${v.obrigacaoId}`}>{v.descricao}</Link> · venceu {fmtDia(v.vencimento)} · {formatBRL(v.saldo)}</li>)}</ul>}
            <p className="hint">Combine uma data esperada na cobrança para incluí-los na previsão.</p></div>
        </div>
        <details className="mt-3"><summary className="cursor-pointer text-[13px] font-semibold text-ice-strong">Premissas</summary><ul className="mt-2 list-disc pl-5 text-[12.5px] text-muted">{pj.premissas.map((p) => <li key={p}>{p}</li>)}{pj.pagarAguardandoAprovacao > 0 && <li>Pagamentos aguardando aprovação fora da série: {formatBRL(pj.pagarAguardandoAprovacao)}.</li>}</ul></details>
      </Card>
      <div className="grid gap-5 lg:grid-cols-3">
        {pode(ctx, "financeiro.saldo_inicial") && <Card titulo="Contas e saldo inicial (gestor)">
          <ActionForm action={acaoConta} className="mb-3 grid gap-2"><input type="hidden" name="op" value="saldo" /><select name="contaId" className="select" aria-label="Conta">{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select><div className="grid grid-cols-2 gap-2"><input name="valor" placeholder="Saldo (R$)" className="input" required /><input type="date" name="data" defaultValue={hojeSP()} className="input" aria-label="Data" /></div><input name="motivo" placeholder="Motivo (obrigatório ao alterar)" className="input" /><Enviar className="btn btn-ghost btn-sm">Definir saldo inicial</Enviar></ActionForm>
          <ActionForm action={acaoConta} className="flex gap-2" resetar><input type="hidden" name="op" value="nova" /><input name="nome" placeholder="Nova conta" className="input" required /><select name="tipo" className="select !w-28"><option>banco</option><option>caixa</option><option>outro</option></select><Enviar className="btn btn-ghost btn-sm">Criar</Enviar></ActionForm>
        </Card>}
        {pode(ctx, "financeiro.baixa.registrar") && <Card titulo="Transferência entre contas">
          <ActionForm action={acaoConta} className="grid gap-2" resetar><input type="hidden" name="op" value="transf" /><div className="grid grid-cols-2 gap-2"><select name="origem" className="select" aria-label="Origem">{contas.map((c) => <option key={c.id} value={c.id}>De: {c.nome}</option>)}</select><select name="destino" className="select" aria-label="Destino">{contas.map((c) => <option key={c.id} value={c.id}>Para: {c.nome}</option>)}</select></div><div className="grid grid-cols-2 gap-2"><input name="valor" placeholder="Valor" className="input" required /><input type="date" name="data" defaultValue={hojeSP()} className="input" aria-label="Data" /></div><Enviar className="btn btn-ghost btn-sm">Registrar</Enviar></ActionForm>
        </Card>}
        {pode(ctx, "financeiro.lancar") && pode(ctx, "contrato.valores.ver") && <Card titulo="Mensalidades de contratos">
          <ActionForm action={acaoConta} className="flex gap-2"><input type="hidden" name="op" value="mensalidades" /><input type="month" name="competencia" defaultValue={hojeSP().slice(0, 7)} className="input" aria-label="Competência" /><Enviar className="btn btn-ghost btn-sm">Gerar</Enviar></ActionForm>
          <p className="hint mt-2">Também executado automaticamente pela rotina diária. Uma por contrato/competência: repetir não duplica.</p>
        </Card>}
      </div>
    </div>
  );
}
