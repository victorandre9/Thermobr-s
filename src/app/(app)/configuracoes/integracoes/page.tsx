import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { obterIntegracao } from "@/server/services/pedidos";
import { ActionForm, Enviar } from "@/components/action-form";
import { Aviso, Badge, Card, Dl, PageHeader } from "@/components/ui";
import { fmtDataHora } from "@/lib/datas";
import { acaoReprocessar, acaoTestarIntegracao } from "../../pedidos/actions";

export const metadata = { title: "Integrações" };
export default async function Integracoes() {
  const ctx = await exigirCtx();
  const { integracao: i, credenciaisPresentes, logs } = await obterIntegracao(db, ctx);
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader titulo="Integração Treeunfe — pedidos" voltar={{ href: "/configuracoes", rotulo: "Configurações" }} />
      <Aviso tom="atencao" titulo="Aguardando validação">A API de PEDIDOS não foi confirmada na documentação oficial do produto contratado. A API fiscal da Treeunfe não comprova acesso a pedidos. Nenhum endpoint, credencial ou webhook foi presumido. Se for adotada consulta periódica, ela não será em tempo real.</Aviso>
      <Card><Dl itens={[["Situação", <Badge key="s" tom={i?.status === "conectada" ? "ok" : "atencao"}>{i?.status === "conectada" ? "Conectada" : "Aguardando validação"}</Badge>], ["Credenciais no ambiente", credenciaisPresentes ? "Presentes (não exibidas)" : "Não configuradas"], ["Último teste", i?.ultimoTesteEm ? `${fmtDataHora(i.ultimoTesteEm)} — ${i.ultimoTesteResultado}` : "Nunca"], ["Observação", i?.observacao ?? "—"]]} />
        {pode(ctx, "integracao.gerenciar") && <ActionForm action={acaoTestarIntegracao} className="mt-4"><Enviar className="btn btn-ghost">Testar comunicação</Enviar></ActionForm>}</Card>
      <Card titulo="Registros de sincronização" pad={false}>
        <ul className="divide-y divide-white">{logs.length === 0 ? <li className="p-4 text-[13px] text-muted">Nenhum registro.</li> : logs.map((l) => <li key={l.id} className="flex flex-wrap items-center gap-2 p-3 text-[12.5px]">{fmtDataHora(l.em)} · {l.provedor === "demo" ? "demonstrativo" : l.provedor} · {l.tipo} · <Badge tom={l.status === "sucesso" ? "ok" : l.status === "erro" ? "critico" : "neutro"}>{l.status}</Badge> {l.idExterno} {l.mensagem}
          {l.status === "erro" && l.payload && pode(ctx, "integracao.gerenciar") ? <ActionForm action={acaoReprocessar}><input type="hidden" name="logId" value={l.id} /><Enviar className="btn btn-ghost btn-sm">Reprocessar</Enviar></ActionForm> : null}</li>)}</ul>
      </Card>
    </div>
  );
}
