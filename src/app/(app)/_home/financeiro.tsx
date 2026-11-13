import Link from "next/link";
import { ArrowDownCircle, ArrowUpCircle, Phone, Wallet, LineChart } from "lucide-react";
import { db } from "@/server/db";
import type { Ctx } from "@/server/auth/contexto";
import { pode } from "@/server/auth/contexto";
import { compromissosHoje, cobrancas, pagamentosEConferencias, proximosDias, avisoConfiguracao } from "@/server/services/inicio";
import { saldosRealizados } from "@/server/services/fluxo";
import { Card, Dinheiro } from "@/components/ui";
import { AcoesRapidas, GradeKpi, Secao, Chips } from "./blocos";
import { AvisoConfig, Cabecalho, SeletorVisao, type SP } from "./comum";
import { fmtDataHora, fmtDia, hojeSP } from "@/lib/datas";
import { formatBRL } from "@/lib/money";

export async function HomeFinanceiro({ ctx, sp }: { ctx: Ctx; sp: SP }) {
  const h = [7, 15, 30].includes(Number(sp.h)) ? Number(sp.h) : 7;
  const fluxo = pode(ctx, "financeiro.fluxo.ver");
  const [hojeK, cob, pag, prox, sal, aviso] = await Promise.all([
    compromissosHoje(db, ctx), cobrancas(db, ctx), pagamentosEConferencias(db, ctx), fluxo ? proximosDias(db, ctx, h) : Promise.resolve(null), fluxo ? saldosRealizados(db, ctx) : Promise.resolve(null), avisoConfiguracao(db, ctx),
  ]);
  const hoje = hojeSP();
  return (
    <div className="space-y-6">
      <Cabecalho titulo="Financeiro" sub={`Hoje, ${fmtDia(hoje)}`} direita={<SeletorVisao ctx={ctx} atual="financeiro" />} />
      <AvisoConfig a={aviso} />

      <Secao titulo="Compromissos de hoje" sub="Os dois primeiros são saldos em aberto; os dois últimos, movimentações confirmadas">
        <GradeKpi itens={hojeK} />
      </Secao>

      <div className="grid gap-6 xl:grid-cols-2">
        <Secao titulo="Cobranças e atrasos" acao={<Link href="/financeiro/cobranca" className="btn btn-ghost btn-sm">Cobrança</Link>}>
          <Card pad={false}>
            <div className="grid grid-cols-3 divide-x divide-white text-center">
              <Link href="/financeiro/receber?situacao=vencidas" className="p-3"><div className="text-[12px] text-muted">Vencido a receber</div><div className="num whitespace-nowrap text-[15px] font-bold sm:text-[17px] text-bad">{formatBRL(cob.totalVencido)}</div></Link>
              <Link href="/financeiro/cobranca" className="p-3"><div className="text-[12px] text-muted">Clientes em atraso</div><div className="num whitespace-nowrap text-[15px] font-bold sm:text-[17px] text-navy">{cob.clientes}</div></Link>
              <Link href="/financeiro/cobranca?filtro=acao_vencida" className="p-3"><div className="text-[12px] text-muted">Ação hoje/atrasada</div><div className="num whitespace-nowrap text-[15px] font-bold sm:text-[17px] text-navy">{cob.acaoHojeOuAtrasada}</div></Link>
            </div>
            {cob.lista.length === 0 ? <p className="border-t border-white px-4 py-3 text-[13px] text-muted">Nenhuma cobrança vencida.</p> : (
              <ul className="border-t border-white">{cob.lista.map((c) => (
                <li key={c.clienteId} className="linha-acao">
                  <div className="min-w-0 flex-1"><Link href={`/clientes/${c.clienteId}`} className="text-[13.5px] font-bold text-navy hover:underline">{c.clienteNome}</Link>
                    <div className="text-[12px] text-muted">Venc. desde {fmtDia(c.maisAntigo)} · último contato {c.ultimoContato ? fmtDataHora(c.ultimoContato) : "nenhum"}{c.proximaAcaoEm ? ` · próx. ação ${fmtDia(c.proximaAcaoEm)}` : ""}</div></div>
                  <b className="num text-[13.5px] text-bad"><Dinheiro v={Number(c.totalVencido)} /></b>
                  <Link href={`/financeiro/receber?situacao=vencidas&clienteId=${c.clienteId}`} className="btn btn-ghost btn-sm">Abrir</Link>
                </li>
              ))}</ul>
            )}
          </Card>
        </Secao>

        <Secao titulo="Pagamentos e conferências" sub="Autorização não significa pagamento realizado">
          <GradeKpi itens={pag} colunasDesktop={2} />
        </Secao>
      </div>

      {prox && sal && (
        <Secao titulo="Caixa previsto" sub={`Saldo confirmado em ${fmtDia(sal.dataCorte)}`} acao={<Chips ativo={String(h)} opcoes={[7, 15, 30].map((n) => ({ chave: String(n), rotulo: `${n} dias`, href: `/?h=${n}` }))} />}>
          <Card pad={false}>
            <div className="grid grid-cols-2 divide-white text-center sm:grid-cols-4 sm:divide-x">
              <div className="px-2 py-3 sm:p-3"><div className="text-[12px] text-muted">Saldo confirmado</div><div className="num whitespace-nowrap text-[15px] font-bold sm:text-[17px] text-navy">{sal.consolidado === null ? "Sem base" : formatBRL(sal.consolidado)}</div></div>
              <div className="px-2 py-3 sm:p-3"><div className="text-[12px] text-muted">+ Entradas previstas</div><div className="num whitespace-nowrap text-[15px] font-bold sm:text-[17px] text-ok">{formatBRL(prox.receberPrevisto)}</div></div>
              <div className="px-2 py-3 sm:p-3"><div className="text-[12px] text-muted">− Saídas previstas</div><div className="num whitespace-nowrap text-[15px] font-bold sm:text-[17px] text-bad">{formatBRL(prox.pagarPrevisto + prox.pagarVencido)}</div></div>
              <div className="px-2 py-3 sm:p-3"><div className="text-[12px] text-muted">= Em {fmtDia(prox.fim).slice(0, 5)}</div><div className={`num whitespace-nowrap text-[15px] font-bold sm:text-[17px] ${prox.saldoProjetado !== null && prox.saldoProjetado < 0 ? "text-bad" : "text-navy"}`}>{prox.saldoProjetado === null ? "Sem base" : formatBRL(prox.saldoProjetado)}</div></div>
            </div>
            <div className="border-t border-white px-4 py-2.5 text-[12.5px] text-text-2">
              {prox.primeiroNegativo && <p className="font-semibold text-bad">⚠ Falta de caixa prevista em {fmtDia(prox.primeiroNegativo.dia)} (saldo {formatBRL(prox.primeiroNegativo.saldo)}).</p>}
              {prox.avisos.map((a) => <p key={a} className="text-warn">{a}</p>)}
              <details><summary className="cursor-pointer font-semibold text-ice-strong">Premissas</summary><ul className="mt-1 list-disc pl-5 text-muted">{prox.premissas.map((p) => <li key={p}>{p}</li>)}</ul></details>
            </div>
          </Card>
        </Secao>
      )}

      <Secao titulo="Ações rápidas">
        <AcoesRapidas itens={[
          ...(pode(ctx, "financeiro.baixa.registrar") ? [{ href: "/financeiro/receber?situacao=abertas", rotulo: "Registrar recebimento", icone: ArrowDownCircle }] : []),
          ...(pode(ctx, "financeiro.lancar") ? [{ href: "/financeiro/nova?natureza=pagar", rotulo: "Lançar conta a pagar", icone: ArrowUpCircle }] : []),
          ...(pode(ctx, "financeiro.cobranca") ? [{ href: "/financeiro/cobranca", rotulo: "Registrar cobrança", icone: Phone }] : []),
          ...(pode(ctx, "financeiro.baixa.registrar") ? [{ href: "/financeiro/pagar?situacao=abertas&aprovacao=aprovada", rotulo: "Preparar pagamento", icone: Wallet }] : []),
          ...(fluxo ? [{ href: "/financeiro/caixa", rotulo: "Extrato interno e caixa", icone: LineChart }] : []),
        ]} />
      </Secao>
    </div>
  );
}
