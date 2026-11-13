import Link from "next/link";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { listarPedidos, obterIntegracao } from "@/server/services/pedidos";
import { Aviso, Badge, Card, ChipLink, Filtros, PageHeader, Vazio } from "@/components/ui";
import { fmtDataHora } from "@/lib/datas";

export const metadata = { title: "Pedidos" };
const SIT: Record<string, string> = { para_programar: "Para programar", os_criada: "OS criada", conferencia: "Alterado — conferir", cancelado: "Cancelado na origem", descartado: "Descartado" };

export default async function Pedidos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await exigirCtx(); const sp = await searchParams;
  const sit = sp.situacao ?? "para_programar";
  const [rows, integ] = await Promise.all([listarPedidos(db, ctx, { situacao: sit === "todos" ? undefined : sit }), obterIntegracao(db, ctx)]);
  return (
    <div>
      <PageHeader titulo="Pedidos para programar" subtitulo="Entrada de pedidos externos → montagem da OS → equipe → agenda" />
      <div className="mb-4"><Aviso tom={integ.integracao?.status === "conectada" ? "ok" : "atencao"} titulo={`Integração Treeunfe: ${integ.integracao?.status === "conectada" ? "conectada" : "aguardando validação"}`}>
        A disponibilidade de API de PEDIDOS da Treeunfe não foi confirmada (API fiscal não comprova acesso a pedidos). Nenhum pedido real é importado até a validação. Pedidos marcados como “demonstrativo” são fictícios.</Aviso></div>
      <Filtros>{[...Object.entries(SIT), ["todos", "Todos"]].map(([k, r]) => <ChipLink key={k} href={`/pedidos?situacao=${k}`} ativo={sit === k}>{r}</ChipLink>)}</Filtros>
      <Card pad={false}>
        {rows.length === 0 ? <Vazio titulo="Nenhum pedido nesta situação">Quando a integração for validada, os pedidos aparecerão aqui automaticamente.</Vazio> : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Pedido</th><th>Cliente (origem)</th><th>Itens</th><th>Recebido</th><th>Situação</th><th>OS</th></tr></thead>
            <tbody>{rows.map(({ p, osNumero, clienteNome }) => {
              const d = p.dadosOriginais as { cliente?: { nome?: string }; itens?: Array<{ descricao: string }> };
              return (
                <tr key={p.id}><td><Link href={`/pedidos/${p.id}`} className="font-semibold text-navy hover:underline">{p.idExterno}</Link> {p.origem === "demo" && <Badge tom="neutro" icone={false}>demonstrativo</Badge>}</td>
                  <td>{d.cliente?.nome}{clienteNome && <div className="text-[12px] text-muted">Vinculado: {clienteNome}</div>}</td><td className="text-[12.5px]">{d.itens?.map((i) => i.descricao).join("; ")}</td>
                  <td className="text-[12.5px]">{fmtDataHora(p.recebidoEm)}</td><td><Badge tom={p.situacao === "conferencia" ? "critico" : p.situacao === "para_programar" ? "atencao" : "neutro"}>{SIT[p.situacao]}</Badge></td><td>{osNumero ? `#${osNumero}` : "—"}</td></tr>
              );
            })}</tbody></table></div>
        )}
      </Card>
    </div>
  );
}
