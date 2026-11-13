import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Truck } from "lucide-react";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { checklistDoDia, modeloChecklist, temAcessoChecklistVeiculo, veiculosParaChecklist } from "@/server/services/veiculos";
import { ActionForm, Enviar } from "@/components/action-form";
import { Aviso, Badge, Card, PageHeader } from "@/components/ui";
import { fmtDia, fmtHora, hojeSP } from "@/lib/datas";
import { acaoChecklistVeiculo } from "../veiculos/actions";

export const metadata = { title: "Checklist de hoje" };

/** Checklist diário do veículo leve: feito de manhã, antes do primeiro check-in. Só equipe própria (autônomo não tem). */
export default async function ChecklistHoje({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await exigirCtx(); const sp = await searchParams;
  if (!temAcessoChecklistVeiculo(ctx)) notFound();
  const [feito, veics, { modelo, itens }] = await Promise.all([checklistDoDia(db, ctx), veiculosParaChecklist(db, ctx), modeloChecklist(db, ctx, "veiculo_saida")]);
  const refazer = sp.refazer === "1";
  const sel = veics.find((v) => v.id === sp.veiculo) ?? veics.find((v) => v.id === (feito?.r.veiculoId ?? ctx.profissional?.veiculoId)) ?? null;
  const nomeV = (v: { identificacao: string; placa: string | null; modelo: string | null }) => [v.placa ?? v.identificacao, v.modelo].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader titulo="Checklist do veículo de hoje" voltar={{ href: "/", rotulo: "Início" }} subtitulo={`${fmtDia(hojeSP())} · ${modelo.nome} · faça antes do primeiro atendimento`} />

      {feito && !refazer && (
        <Card>
          <div className="flex items-start gap-3">
            <span className="ic ok"><CheckCircle2 size={20} aria-hidden /></span>
            <div className="flex-1">
              <b className="text-[15px] text-navy">Checklist de hoje feito</b>
              <p className="text-[13.5px] text-text-2">Veículo {feito.placa ?? feito.identificacao} · às {fmtHora(feito.r.realizadoEm)}. Check-in das visitas liberado.</p>
              <div className="mt-3 flex flex-wrap gap-2"><Link href="/" className="btn btn-primary">Ver minhas visitas</Link><Link href="/checklist-hoje?refazer=1" className="btn btn-ghost">Refazer (troca de veículo ou condição)</Link></div>
            </div>
          </div>
        </Card>
      )}

      {(!feito || refazer) && (
        <>
          <Card titulo="1. Placa do veículo de hoje" icone={Truck}>
            {veics.length === 0 ? <Aviso tom="atencao">Nenhum veículo ativo cadastrado. Fale com o escritório.</Aviso> : (
              <div className="grid gap-2 sm:grid-cols-2">{veics.map((v) => (
                <Link key={v.id} href={`/checklist-hoje?veiculo=${v.id}${refazer ? "&refazer=1" : ""}`} aria-current={sel?.id === v.id ? "true" : undefined}
                  className={`flex min-h-12 items-center justify-between gap-2 rounded-2xl border px-3 py-2 text-[14px] font-semibold ${sel?.id === v.id ? "border-navy bg-navy text-white" : "border-white bg-white/70 text-navy"}`}>
                  <span>{nomeV(v)}</span>{v.id === ctx.profissional?.veiculoId && <span className="text-[11px] font-medium opacity-80">último usado</span>}
                </Link>
              ))}</div>
            )}
          </Card>

          {sel && (
            <ActionForm action={acaoChecklistVeiculo} className="space-y-3">
              <input type="hidden" name="veiculoId" value={sel.id} /><input type="hidden" name="tipo" value="veiculo_saida" /><input type="hidden" name="destino" value="inicio" />{feito && <input type="hidden" name="forcar" value="1" />}
              <Card titulo={`2. Quilometragem — ${nomeV(sel)}`}><input id="km" name="km" inputMode="numeric" className="input" placeholder={sel.odometroKm ? `último registrado: ${sel.odometroKm} km` : "km atual"} required aria-label="Quilometragem atual" /></Card>
              <h2 className="pt-1 text-[15px] font-semibold text-navy">3. Itens ({itens.length}) — marque Irregular só se houver problema</h2>
              {itens.map((i, n) => (
                <Card key={i.id}>
                  <input type="hidden" name="itemId" value={i.id} />
                  <div className="mb-2 flex items-start justify-between gap-2"><b className="text-[14.5px] text-navy">{n + 1}. {i.descricao}</b><Badge tom={i.criticidade === "critica" ? "critico" : i.criticidade === "alta" ? "atencao" : "neutro"}>{i.criticidade === "critica" ? "crítico" : i.criticidade}</Badge></div>
                  <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={i.descricao}>
                    {[["conforme", "OK"], ["irregular", "Irregular"], ["nao_aplica", "Não se aplica"]].map(([v, r]) => (
                      <label key={v} className="flex min-h-12 cursor-pointer items-center justify-center rounded-full border border-white bg-white/70 px-2 text-center text-[13.5px] font-semibold has-[:checked]:bg-navy has-[:checked]:text-white"><input type="radio" name={`r_${i.id}`} value={v} defaultChecked={v === "conforme"} className="sr-only" />{r}</label>
                    ))}
                  </div>
                  <details className="mt-2"><summary className="cursor-pointer text-[12.5px] font-semibold text-ice-strong">Irregular? Descrever e fotografar</summary>
                    <input name={`o_${i.id}`} placeholder="Descreva a irregularidade" className="input mt-2" />
                    <label className="mt-2 block text-[12.5px] text-muted">{i.exigeFotoIrregular ? "Foto obrigatória se irregular" : "Foto (opcional)"}<input type="file" name={`f_${i.id}`} accept="image/*" capture="environment" multiple className="mt-1 block w-full text-[12.5px]" /></label>
                  </details>
                </Card>
              ))}
              <Card><label className="label" htmlFor="obs">Observações</label><textarea id="obs" name="observacoes" className="textarea" rows={2} /></Card>
              <Enviar className="btn btn-primary btn-lg w-full" pendente="Enviando…">Concluir checklist e liberar check-in</Enviar>
              <p className="hint text-center">Irregularidades viram pendência para o escritório. Irregularidade crítica bloqueia o uso do veículo até liberação do gestor.</p>
            </ActionForm>
          )}
        </>
      )}
    </div>
  );
}
