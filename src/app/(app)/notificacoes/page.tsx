import Link from "next/link";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { minhasNotificacoes } from "@/server/services/notificacoes";
import { ActionForm, Enviar } from "@/components/action-form";
import { Badge, Card, PageHeader, Vazio } from "@/components/ui";
import { fmtDataHora } from "@/lib/datas";
import { acaoLer } from "./actions";

export const metadata = { title: "Notificações" };
export default async function Notificacoes() {
  const ctx = await exigirCtx();
  const ns = await minhasNotificacoes(db, ctx);
  const naoLidas = ns.filter((n) => !n.lidaEm);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader titulo="Notificações" subtitulo="Eventos do mesmo problema são agrupados. Ler não resolve o registro de origem." acoes={naoLidas.length > 0 && <ActionForm action={acaoLer}>{naoLidas.map((n) => <input key={n.id} type="hidden" name="ids" value={n.id} />)}<Enviar className="btn btn-ghost btn-sm">Marcar todas como lidas</Enviar></ActionForm>} />
      <Card pad={false}>
        {ns.length === 0 ? <Vazio titulo="Nenhuma notificação aberta" /> : <ul className="divide-y divide-white">{ns.map((n) => (
          <li key={n.id} className={`flex items-start gap-3 p-4 ${n.lidaEm ? "opacity-70" : ""}`}>
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.lidaEm ? "bg-line-strong" : "bg-ice"}`} aria-label={n.lidaEm ? "lida" : "não lida"} />
            <div className="flex-1"><div className="flex flex-wrap items-center gap-2">{n.link ? <Link href={n.link} className="font-semibold text-navy hover:underline">{n.titulo}</Link> : <b>{n.titulo}</b>}<Badge tom={n.prioridade === "alta" || n.prioridade === "critica" ? "alerta" : "neutro"}>{n.prioridade}</Badge>{n.ocorrencias > 1 && <Badge tom="info" icone={false}>{n.ocorrencias}×</Badge>}</div>
              {n.mensagem && <p className="text-[13px] text-text-2">{n.mensagem}</p>}<p className="text-[12px] text-muted">{fmtDataHora(n.atualizadoEm)}</p></div>
            {!n.lidaEm && <ActionForm action={acaoLer} mostrarSucesso={false}><input type="hidden" name="ids" value={n.id} /><Enviar className="btn btn-ghost btn-sm">Lida</Enviar></ActionForm>}
          </li>))}</ul>}
      </Card>
    </div>
  );
}
