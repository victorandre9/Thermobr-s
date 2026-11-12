import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { exigir } from "@/server/auth/contexto";
import { rotinaExecucao } from "@/server/db/schema";
import { ROTINAS } from "@/server/services/rotinas";
import { ActionForm, Enviar } from "@/components/action-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { fmtDataHora } from "@/lib/datas";
import { acaoRotina } from "../actions";

export const metadata = { title: "Rotinas" };
export default async function Rotinas() {
  const ctx = await exigirCtx(); exigir(ctx, "configuracao.gerenciar");
  const ex = await db.select().from(rotinaExecucao).where(eq(rotinaExecucao.empresaId, ctx.empresaId)).orderBy(desc(rotinaExecucao.iniciadoEm)).limit(50);
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader titulo="Rotinas automáticas" voltar={{ href: "/configuracoes", rotulo: "Configurações" }} subtitulo="Executadas no servidor pelo agendador (Vercel Cron) — não dependem de navegador aberto. Repetir uma execução no mesmo período não duplica efeitos." />
      <Card titulo="Rotinas"><ul className="space-y-2">{Object.entries(ROTINAS).map(([k, d]) => <li key={k} className="flex flex-wrap items-center justify-between gap-2 text-[13.5px]"><span><b>{k}</b> — {d}</span><ActionForm action={acaoRotina}><input type="hidden" name="rotina" value={k} /><Enviar className="btn btn-ghost btn-sm">Executar / reprocessar agora</Enviar></ActionForm></li>)}</ul></Card>
      <Card titulo="Execuções" pad={false}><ul className="divide-y divide-white">{ex.length === 0 ? <li className="p-4 text-[13px] text-muted">Nenhuma execução registrada.</li> : ex.map((e) => <li key={e.id} className="p-3 text-[12.5px]">{fmtDataHora(e.iniciadoEm)} · <b>{e.rotina}</b> · {e.chave.split(":")[1]} · <Badge tom={e.status === "sucesso" ? "ok" : e.status === "erro" ? "critico" : "neutro"}>{e.status}</Badge> · tentativa {e.tentativa} · {e.disparadoPor.startsWith("usuario") ? "manual" : "agendador"} · {e.mensagem}</li>)}</ul></Card>
    </div>
  );
}
