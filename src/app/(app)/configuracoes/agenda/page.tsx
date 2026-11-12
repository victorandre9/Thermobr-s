import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { exigir } from "@/server/auth/contexto";
import { listarVagas } from "@/server/services/agenda";
import { ActionForm, Enviar } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { NOMES_DIA } from "@/lib/datas";
import { acaoVaga } from "../actions";

export const metadata = { title: "Agenda — vagas" };
export default async function Vagas() {
  const ctx = await exigirCtx(); exigir(ctx, "configuracao.gerenciar");
  const vagas = await listarVagas(db, ctx);
  const Form = ({ v }: { v?: (typeof vagas)[number] }) => (
    <ActionForm action={acaoVaga} className="grid gap-2 sm:grid-cols-[1fr_110px_110px_2fr_70px_auto]" resetar={!v}>{v && <input type="hidden" name="id" value={v.id} />}
      <input name="nome" defaultValue={v?.nome} placeholder="Nome (ex.: Manhã)" className="input" required /><input type="time" name="horaInicio" defaultValue={v?.horaInicio.slice(0, 5) ?? "08:00"} className="input" /><input type="time" name="horaFim" defaultValue={v?.horaFim.slice(0, 5) ?? "12:00"} className="input" />
      <div className="flex flex-wrap items-center gap-2">{NOMES_DIA.map((d, i) => <label key={i} className="flex items-center gap-1 text-[12.5px]"><input type="checkbox" name="dias" value={i} defaultChecked={v ? v.diasSemana.includes(i) : i >= 1 && i <= 5} />{d}</label>)}</div>
      <input name="ordem" defaultValue={v?.ordem ?? 0} className="input" aria-label="Ordem" /><Enviar className="btn btn-ghost btn-sm">{v ? "Salvar" : "Incluir"}</Enviar>
    </ActionForm>
  );
  return (
    <div className="max-w-5xl space-y-5">
      <PageHeader titulo="Vagas da agenda" voltar={{ href: "/configuracoes", rotulo: "Configurações" }} subtitulo="Configuração inicial de duas vagas; ajuste para duas ou quatro conforme a operação. Serviços longos podem ocupar várias vagas." />
      <Card titulo="Vagas atuais"><div className="space-y-3">{vagas.map((v) => <Form key={v.id} v={v} />)}</div></Card>
      <Card titulo="Nova vaga"><Form /></Card>
    </div>
  );
}
