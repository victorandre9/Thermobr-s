import Link from "next/link";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { pendentesAprovacao } from "@/server/services/financeiro";
import { statusImplantacao } from "@/server/services/implantacao";
import { ActionForm, Enviar } from "@/components/action-form";
import { Aviso, Badge, Card, Dinheiro, PageHeader, Vazio } from "@/components/ui";
import { fmtDataHora, fmtDia } from "@/lib/datas";
import { acaoDecidirBaixa, acaoObrigacao } from "../actions";

export const metadata = { title: "Aprovações" };
export default async function Aprovacoes() {
  const ctx = await exigirCtx();
  const [p, impl] = await Promise.all([pendentesAprovacao(db, ctx), statusImplantacao(db, ctx)]);
  return (
    <div className="space-y-5">
      <PageHeader titulo="Aprovações e conferências" subtitulo="Obrigação → autorização → pagamento/recebimento realizado → conferência. Solicitações e aprovações não alteram o caixa." />
      {!impl.politicaDefinida && <Aviso tom="atencao" titulo="Política de delegação pendente de definição">Os donos ainda não definiram quais confirmações o operador financeiro pode fazer sozinho. Até lá, as baixas do operador ficam aguardando conferência. Limites monetários não foram presumidos.</Aviso>}
      {pode(ctx, "financeiro.aprovar") && (
        <Card titulo={`Lançamentos aguardando aprovação (${p.obrigacoes.length})`} pad={false}>
          {p.obrigacoes.length === 0 ? <Vazio titulo="Nada aguardando aprovação" /> : <ul className="divide-y divide-white">{p.obrigacoes.map((o) => (
            <li key={o.ob.id} className="flex flex-wrap items-center gap-3 p-4 text-[13.5px]">
              <div className="min-w-64 flex-1"><Link href={`/financeiro/obrigacoes/${o.ob.id}`} className="font-semibold text-navy hover:underline">{o.ob.descricao}</Link><div className="text-[12.5px] text-muted">{o.categoriaNome} · {o.fornecedorNome ?? o.profissionalNome ?? o.clienteNome ?? o.ob.beneficiarioNome ?? "—"} · lançado por {o.criadoPorNome} em {fmtDataHora(o.ob.criadoEm)}</div>
                {o.exigeDupla && <Badge tom="info">Dupla aprovação: {o.aprovacoes}/2</Badge>}{o.ob.criadoPor === ctx.usuarioId && <Badge tom="atencao">lançado por você — autoaprovação será registrada</Badge>}</div>
              <b><Dinheiro v={o.ob.valorBrutoCentavos - o.ob.descontoCentavos} /></b>
              {o.jaAprovei ? <Badge tom="ok">Você já decidiu</Badge> : <ActionForm action={acaoObrigacao} className="flex gap-1"><input type="hidden" name="obrigacaoId" value={o.ob.id} /><input name="motivo" placeholder="Motivo (rejeição)" className="input !w-40" /><Enviar className="btn btn-ok btn-sm" name="op" value="aprovar">Aprovar</Enviar><Enviar className="btn btn-danger btn-sm" name="op" value="rejeitar">Rejeitar</Enviar></ActionForm>}
            </li>))}</ul>}
        </Card>
      )}
      <Card titulo={`Baixas aguardando conferência (${p.baixas.length})`} pad={false}>
        {p.baixas.length === 0 ? <Vazio titulo="Nada aguardando conferência" /> : <ul className="divide-y divide-white">{p.baixas.map((b) => (
          <li key={b.b.id} className="flex flex-wrap items-center gap-3 p-4 text-[13.5px]">
            <div className="min-w-64 flex-1"><Link href={`/financeiro/obrigacoes/${b.obrigacaoId}`} className="font-semibold text-navy hover:underline">{b.descricao}</Link><div className="text-[12.5px] text-muted">{b.natureza === "receber" ? "Recebimento" : "Pagamento"} em {fmtDia(b.b.dataPagamento)} · {b.contaNome} · registrado por {b.registradaPorNome}</div></div>
            <b><Dinheiro v={b.b.valorCentavos} /></b>
            <ActionForm action={acaoDecidirBaixa} className="flex gap-1"><input type="hidden" name="baixaId" value={b.b.id} /><input name="motivo" placeholder="Motivo (rejeição)" className="input !w-40" /><Enviar className="btn btn-ok btn-sm" name="op" value="confirmar">Confirmar</Enviar><Enviar className="btn btn-danger btn-sm" name="op" value="rejeitar">Rejeitar</Enviar></ActionForm>
          </li>))}</ul>}
      </Card>
      {p.transferencias.length > 0 && <Card titulo="Transferências entre contas aguardando conferência"><ul className="space-y-2">{p.transferencias.map((t) => <li key={t.id} className="flex flex-wrap items-center gap-2 text-[13.5px]"><Dinheiro v={t.valorCentavos} /> em {fmtDia(t.data)} {t.descricao}<ActionForm action={acaoDecidirBaixa} className="flex gap-1"><input type="hidden" name="op" value="transf" /><input type="hidden" name="transferenciaId" value={t.id} /><Enviar className="btn btn-ok btn-sm" name="decisao" value="confirmar">Confirmar</Enviar><Enviar className="btn btn-danger btn-sm" name="decisao" value="rejeitar">Rejeitar</Enviar></ActionForm></li>)}</ul></Card>}
    </div>
  );
}
