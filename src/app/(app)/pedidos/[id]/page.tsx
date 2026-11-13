import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { obterPedido } from "@/server/services/pedidos";
import { opcoesClientes } from "@/server/services/cadastros";
import { clienteLocal, equipamento } from "@/server/db/schema";
import { ActionForm, Enviar } from "@/components/action-form";
import { Aviso, Card, Campo, Dinheiro, PageHeader } from "@/components/ui";
import { fmtDataHora } from "@/lib/datas";
import { centavosParaInput } from "@/lib/money";
import { acaoConferenciaPedido, acaoDescartarPedido, acaoOSDoPedido } from "../actions";

export const metadata = { title: "Pedido" };
type Dados = { cliente: { nome: string; documento?: string; telefone?: string }; endereco?: string; itens: Array<{ descricao: string; quantidade: number; valorUnitario?: number | null }>; valorTotal?: number | null; condicoesPagamento?: string; observacoes?: string };

export default async function Pedido({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await exigirCtx(); const { id } = await params; const sp = await searchParams;
  const { pedido: p, versoes, logs, os } = await obterPedido(db, ctx, id);
  const d = p.dadosOriginais as unknown as Dados;
  const verValor = pode(ctx, "os.valores.ver");
  const clientes = p.situacao === "para_programar" ? await opcoesClientes(db, ctx) : [];
  const cid = sp.clienteId ?? p.clienteId ?? null;
  const [locais, eqs] = cid ? await Promise.all([db.select().from(clienteLocal).where(eq(clienteLocal.clienteId, cid)), db.select().from(equipamento).where(and(eq(equipamento.clienteId, cid)))]) : [[], []];
  const H = <input type="hidden" name="pedidoId" value={id} />;
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader titulo={`Pedido ${p.idExterno}`} voltar={{ href: "/pedidos", rotulo: "Pedidos" }} subtitulo={`Origem: ${p.origem === "demo" ? "demonstrativo (fictício)" : p.origem} · recebido ${fmtDataHora(p.recebidoEm)} · versão ${p.versaoExterna ?? "—"}`} />
      {p.situacao === "conferencia" && <Aviso tom="critico" titulo="Pedido alterado na origem após a criação da OS">{p.motivoConferencia}. Serviços realizados, parcelas e baixas NÃO foram alterados. Confira e registre a decisão.</Aviso>}
      <Card titulo="Dados originais (preservados, sem edição)">
        <p className="text-[14px]"><b>{d.cliente?.nome}</b> {d.cliente?.documento} {d.cliente?.telefone}</p>
        <ul className="mt-2 text-[13.5px]">{d.itens?.map((i, k) => <li key={k}>• {i.descricao} × {i.quantidade}{verValor && i.valorUnitario ? <> — <Dinheiro v={i.valorUnitario} /></> : null}</li>)}</ul>
        {verValor && d.valorTotal ? <p className="mt-2">Total do pedido: <Dinheiro v={d.valorTotal} /></p> : null}
        {d.condicoesPagamento && verValor && <p className="text-[13px] text-muted">Condições: {d.condicoesPagamento}</p>}
        {d.observacoes && <p className="text-[13px] text-muted">Obs.: {d.observacoes}</p>}
      </Card>
      {os && <Card titulo="OS gerada"><Link href={`/os/${os.id}`} className="font-semibold text-ice-strong">OS #{os.numero}</Link> — um pedido gera uma única OS; várias visitas são programadas dentro dela.</Card>}
      {p.situacao === "para_programar" && pode(ctx, "pedido.programar") && (
        <Card titulo="Montar OS">
          <form className="mb-3 flex gap-2" action={`/pedidos/${id}`}><select name="clienteId" defaultValue={cid ?? ""} className="select"><option value="">Selecione o cliente cadastrado…</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select><button className="btn btn-ghost">Usar</button></form>
          {cid ? (
            <ActionForm action={acaoOSDoPedido} className="space-y-3">{H}<input type="hidden" name="clienteId" value={cid} />
              <Campo rotulo="Local" nome="localId"><select id="localId" name="localId" className="select"><option value="">—</option>{locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></Campo>
              <Campo rotulo="Descrição" nome="descricao"><textarea id="descricao" name="descricao" className="textarea" defaultValue={d.itens?.map((i) => i.descricao).join("; ")} /></Campo>
              {eqs.length > 0 && <fieldset><legend className="label">Equipamentos</legend>{eqs.map((e) => <label key={e.id} className="mr-3 inline-flex items-center gap-1 text-[13px]"><input type="checkbox" name="equipamentos" value={e.id} />{e.identificacao ?? e.tipo}</label>)}</fieldset>}
              <div className="grid gap-2 sm:grid-cols-3"><input name="itemDescricao" defaultValue={d.itens?.[0]?.descricao} className="input" aria-label="Serviço" /><input name="itemQtd" defaultValue={String(d.itens?.[0]?.quantidade ?? 1)} className="input" aria-label="Qtd" />{verValor ? <input name="itemPreco" defaultValue={centavosParaInput(d.itens?.[0]?.valorUnitario ?? null)} className="input" aria-label="Preço" /> : <span className="hint">Preço: restrito</span>}</div>
              <Enviar>Criar OS</Enviar>
            </ActionForm>
          ) : <p className="text-[13px] text-muted">Selecione ou cadastre o cliente antes (Clientes &gt; Novo).</p>}
          <ActionForm action={acaoDescartarPedido} className="mt-4 flex gap-2 border-t border-white pt-3">{H}<input name="motivo" placeholder="Motivo para descartar" className="input" required /><Enviar className="btn btn-danger">Descartar</Enviar></ActionForm>
        </Card>
      )}
      {p.situacao === "conferencia" && pode(ctx, "pedido.programar") && <Card titulo="Registrar conferência"><ActionForm action={acaoConferenciaPedido} className="flex gap-2">{H}<input name="decisao" className="input" placeholder="Decisão tomada" required /><Enviar>Registrar</Enviar></ActionForm></Card>}
      <Card titulo={`Versões recebidas (${versoes.length}) e sincronização`}>
        <ul className="space-y-1 text-[12.5px]">{versoes.map((v) => <li key={v.id}>{fmtDataHora(v.recebidoEm)} · versão {v.versaoExterna ?? "—"} · {v.hashConteudo.slice(0, 10)}</li>)}</ul>
        <ul className="mt-2 space-y-1 text-[12.5px] text-muted">{logs.map((l) => <li key={l.id}>{fmtDataHora(l.em)} · {l.tipo} · {l.status} · {l.mensagem}</li>)}</ul>
      </Card>
    </div>
  );
}
