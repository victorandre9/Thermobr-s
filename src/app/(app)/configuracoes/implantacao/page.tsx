import Link from "next/link";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { exigir, pode } from "@/server/auth/contexto";
import { obterConfig } from "@/server/services/config";
import { saldosRealizados } from "@/server/services/fluxo";
import { ActionForm, Enviar } from "@/components/action-form";
import { Aviso, Badge, Card, PageHeader } from "@/components/ui";
import { fmtDia, NOMES_DIA } from "@/lib/datas";
import { acaoImplantacao } from "../actions";

export const metadata = { title: "Implantação" };
export default async function Implantacao() {
  const ctx = await exigirCtx(); exigir(ctx, "configuracao.gerenciar");
  const cfg = await obterConfig(db, ctx.empresaId);
  const sal = pode(ctx, "financeiro.fluxo.ver") ? await saldosRealizados(db, ctx) : null;
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader titulo="Implantação e parâmetros" voltar={{ href: "/configuracoes", rotulo: "Configurações" }} subtitulo="Entrada em operação: data de corte, saldos iniciais, contas antigas, estoque inicial e custódias." />
      <Card titulo="Roteiro de entrada em operação">
        <ol className="list-decimal space-y-1 pl-5 text-[13.5px]">
          <li>Data de corte: <b>{cfg.implantacao.dataCorte ? fmtDia(cfg.implantacao.dataCorte) : "não definida"}</b> {cfg.implantacao.dataCorte ? <Badge tom="ok">ok</Badge> : <Badge tom="atencao">pendente</Badge>}</li>
          <li>Saldos iniciais por conta (<Link className="text-ice-strong underline" href="/financeiro/caixa">Caixa</Link>): {sal ? (sal.incompleto ? <Badge tom="atencao">incompleto</Badge> : <Badge tom="ok">ok</Badge>) : "—"} — recebimentos anteriores já estão no saldo e não podem ser lançados de novo.</li>
          <li>Contas antigas a pagar/receber: <Link className="text-ice-strong underline" href="/financeiro/nova?natureza=receber">lançar como “anterior à implantação”</Link> (não contam como vendas novas).</li>
          <li>Estoque inicial conferido por posição: <Link className="text-ice-strong underline" href="/materiais">Materiais</Link>.</li>
          <li>Ferramentas e materiais já com profissionais: custódia inicial na página de cada ferramenta e entrega de materiais.</li>
        </ol>
        {pode(ctx, "financeiro.saldo_inicial") && <ActionForm action={acaoImplantacao} className="mt-3 flex gap-2"><input type="hidden" name="op" value="corte" /><input type="date" name="data" defaultValue={cfg.implantacao.dataCorte ?? ""} className="input !w-44" required /><Enviar className="btn btn-primary btn-sm">Definir data de corte</Enviar></ActionForm>}
      </Card>
      {pode(ctx, "financeiro.aprovar") && (
        <Card titulo="Política de delegação financeira">
          {!cfg.financeiro.politicaDelegacaoDefinida && <Aviso tom="atencao">Pendente de definição pelos donos. Limites monetários não foram presumidos.</Aviso>}
          <ActionForm action={acaoImplantacao} className="mt-3 space-y-2"><input type="hidden" name="op" value="politica" />
            <textarea name="observacao" defaultValue={cfg.financeiro.observacaoPolitica} rows={3} className="textarea" placeholder="Descreva o que o operador pode confirmar sozinho (ex.: recebimentos com comprovante; pagamentos já aprovados dentro do valor aprovado)." />
            <select name="definida" defaultValue={cfg.financeiro.politicaDelegacaoDefinida ? "1" : "0"} className="select !w-64"><option value="0">Ainda não definida</option><option value="1">Definida pelos donos</option></select>
            <Enviar className="btn btn-ghost btn-sm">Salvar</Enviar>
            <p className="hint">A política é aplicada concedendo permissões ao operador em Usuários (ex.: confirmar baixas). Exceções continuam exigindo aprovação.</p>
          </ActionForm>
        </Card>
      )}
      <Card titulo="Parâmetros operacionais">
        <ActionForm action={acaoImplantacao} className="grid gap-3 sm:grid-cols-2"><input type="hidden" name="op" value="parametros" />
          <label className="text-[13px]">Prazo de custódia de material (dias)<input name="prazoCustodia" defaultValue={cfg.materiais.prazoCustodiaDias} className="input" /></label>
          <label className="text-[13px]">Prazo de devolução de ferramenta (dias)<input name="prazoFerramenta" defaultValue={cfg.ferramentas.prazoDevolucaoDias} className="input" /></label>
          <label className="text-[13px]">Dia de previsão de pagamento dos autônomos<select name="diaPagamento" defaultValue={cfg.autonomos.diaSemanaPrevisaoPagamento} className="select">{NOMES_DIA.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></label>
          <div className="space-y-1 text-[13px]"><label className="flex items-center gap-2"><input type="checkbox" name="checklistObrig" defaultChecked={cfg.veiculos.checklistSaidaObrigatorio} />Checklist de saída obrigatório (técnicos próprios)</label><label className="flex items-center gap-2"><input type="checkbox" name="bloquearCritica" defaultChecked={cfg.veiculos.bloquearComIrregularidadeCritica} />Bloquear atendimento com irregularidade crítica sem liberação</label></div>
          <Enviar className="btn btn-primary sm:col-span-2">Salvar parâmetros</Enviar>
        </ActionForm>
      </Card>
    </div>
  );
}
