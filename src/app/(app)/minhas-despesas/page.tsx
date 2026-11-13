import { notFound } from "next/navigation";
import { Receipt } from "lucide-react";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { minhasDespesas, podeLancarDespesa } from "@/server/services/despesas";
import { ActionForm, Enviar } from "@/components/action-form";
import { Badge, Card, Campo, Dinheiro, PageHeader, Vazio } from "@/components/ui";
import { fmtDataHora, hojeSP } from "@/lib/datas";
import { acaoLancarDespesa } from "./actions";

export const metadata = { title: "Despesas e diárias" };

/** Técnico da equipe própria: lança diárias e gastos (com comprovante) para aprovação e reembolso. */
export default async function MinhasDespesas() {
  const ctx = await exigirCtx();
  if (!podeLancarDespesa(ctx)) notFound();
  const lista = await minhasDespesas(db, ctx);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader titulo="Despesas e diárias" voltar={{ href: "/", rotulo: "Início" }} subtitulo="Lance aqui o que você gastou a serviço. O gestor aprova e o financeiro reembolsa." />
      <Card titulo="Nova despesa" icone={Receipt}>
        <ActionForm action={acaoLancarDespesa} className="space-y-3" resetar>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo">
            {[["reembolso", "Reembolso de gasto"], ["diaria", "Diária"]].map(([v, r]) => (
              <label key={v} className="flex min-h-12 cursor-pointer items-center justify-center rounded-full border border-white bg-white/70 px-2 text-center text-[13.5px] font-semibold has-[:checked]:bg-navy has-[:checked]:text-white"><input type="radio" name="tipo" value={v} defaultChecked={v === "reembolso"} className="sr-only" />{r}</label>
            ))}
          </div>
          <Campo rotulo="O que foi" nome="descricao"><input id="descricao" name="descricao" className="input" placeholder="Ex.: almoço em atendimento, estacionamento, pedágio, peça comprada no balcão" required /></Campo>
          <div className="grid grid-cols-2 gap-2">
            <Campo rotulo="Valor (R$)" nome="valor"><input id="valor" name="valor" inputMode="decimal" className="input" placeholder="0,00" required /></Campo>
            <Campo rotulo="Data do gasto" nome="data"><input id="data" name="data" type="date" defaultValue={hojeSP()} max={hojeSP()} className="input" required /></Campo>
          </div>
          <Campo rotulo="Nº da OS (se foi para um atendimento)" nome="os"><input id="os" name="os" inputMode="numeric" className="input" placeholder="Opcional" /></Campo>
          <label className="block text-[13px] font-semibold text-navy">Foto do comprovante (obrigatória no reembolso)
            <input type="file" name="comprovante" accept="image/*,application/pdf" capture="environment" multiple className="mt-1 block w-full text-[12.5px] font-normal" /></label>
          <Enviar className="btn btn-primary btn-lg w-full" pendente="Enviando…">Enviar para aprovação</Enviar>
        </ActionForm>
      </Card>
      <Card titulo="Minhas despesas" pad={false}>
        {lista.length === 0 ? <Vazio titulo="Nenhuma despesa lançada">O que você enviar aparece aqui com a situação.</Vazio> : (
          <ul className="divide-y divide-white">{lista.map((d) => (
            <li key={d.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0"><b className="text-[13.5px] text-navy">{d.descricao}</b><div className="text-[12px] text-muted">{fmtDataHora(d.criadoEm)}{d.osNumero ? ` · OS ${d.osNumero}` : ""}</div>
                <Badge tom={d.situacao === "Paga" ? "ok" : d.situacao === "Recusada" ? "critico" : d.situacao.startsWith("Aprovada") ? "info" : "atencao"}>{d.situacao}</Badge></div>
              <b className="num whitespace-nowrap text-[14px] text-navy"><Dinheiro v={d.valor} /></b>
            </li>
          ))}</ul>
        )}
      </Card>
    </div>
  );
}
