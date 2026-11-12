import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { checklistValido, modeloChecklist, podeChecklistVeiculo, obterVeiculo } from "@/server/services/veiculos";
import { ActionForm, Enviar } from "@/components/action-form";
import { Aviso, Badge, Card, PageHeader } from "@/components/ui";
import { fmtDataHora } from "@/lib/datas";
import { acaoChecklistVeiculo } from "../../actions";

export const metadata = { title: "Checklist do veículo" };
export default async function Checklist({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await exigirCtx(); const { id } = await params; const sp = await searchParams;
  if (!podeChecklistVeiculo(ctx, id)) notFound(); // autônomo e não designados: inexistente para o perfil
  const tipo = sp.tipo === "veiculo_retorno" ? "veiculo_retorno" : "veiculo_saida";
  const [{ modelo, itens }, d, valido] = await Promise.all([modeloChecklist(db, ctx, tipo), obterVeiculo(db, ctx, id), checklistValido(db, id, tipo, { profissionalId: ctx.profissional?.id ?? null, usuarioId: ctx.usuarioId })]);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader titulo={`Checklist — ${d.veiculo.identificacao}`} voltar={{ href: `/veiculos/${id}`, rotulo: d.veiculo.identificacao }} subtitulo={`${modelo.nome} · modelo versão ${modelo.versao} · válido por ${modelo.validadeHoras}h para o mesmo responsável`} />
      <div className="flex gap-2"><a className="chip" aria-current={tipo === "veiculo_saida" ? "true" : undefined} href="?tipo=veiculo_saida">Saída</a><a className="chip" aria-current={tipo === "veiculo_retorno" ? "true" : undefined} href="?tipo=veiculo_retorno">Retorno</a></div>
      {valido && <Aviso tom="ok" titulo="Checklist válido neste turno">Feito por {valido.nome} em {fmtDataHora(valido.r.realizadoEm)}, válido até {fmtDataHora(valido.r.validoAte)}. Não é preciso refazer a cada cliente.</Aviso>}
      <ActionForm action={acaoChecklistVeiculo} className="space-y-3">
        <input type="hidden" name="veiculoId" value={id} /><input type="hidden" name="tipo" value={tipo} />{valido && <input type="hidden" name="forcar" value="1" />}
        <Card><label className="label" htmlFor="km">Quilometragem atual</label><input id="km" name="km" inputMode="numeric" className="input" placeholder={d.veiculo.odometroKm ? `último: ${d.veiculo.odometroKm}` : "km"} required /></Card>
        {itens.map((i) => (
          <Card key={i.id}>
            <input type="hidden" name="itemId" value={i.id} />
            <div className="mb-2 flex items-start justify-between gap-2"><b className="text-[14.5px] text-navy">{i.descricao}</b><Badge tom={i.criticidade === "critica" ? "critico" : i.criticidade === "alta" ? "alerta" : "neutro"}>{i.criticidade}</Badge></div>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={i.descricao}>
              {[["conforme", "Conforme"], ["irregular", "Irregular"], ["nao_aplica", "Não se aplica"]].map(([v, r]) => (
                <label key={v} className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-white bg-white/70 px-2 text-[13.5px] font-semibold has-[:checked]:bg-navy has-[:checked]:text-white"><input type="radio" name={`r_${i.id}`} value={v} defaultChecked={v === "conforme"} className="sr-only" />{r}</label>
              ))}
            </div>
            <input name={`o_${i.id}`} placeholder="Descreva a irregularidade" className="input mt-2" />
            <label className="mt-2 block text-[12.5px] text-muted">{i.exigeFotoIrregular ? "Foto obrigatória se irregular" : "Foto (opcional)"}<input type="file" name={`f_${i.id}`} accept="image/*" capture="environment" multiple className="mt-1 block w-full text-[12.5px]" /></label>
          </Card>
        ))}
        <Card><label className="label" htmlFor="obs">Observações</label><textarea id="obs" name="observacoes" className="textarea" rows={2} /></Card>
        <Enviar className="btn btn-primary btn-lg w-full" pendente="Enviando…">{valido ? "Registrar novo checklist (ex.: troca de condição)" : "Enviar checklist"}</Enviar>
      </ActionForm>
    </div>
  );
}
