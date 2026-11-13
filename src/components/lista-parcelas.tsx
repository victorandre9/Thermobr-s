import Link from "next/link";
import { db } from "@/server/db";
import type { Ctx } from "@/server/auth/contexto";
import { pode } from "@/server/auth/contexto";
import { listarParcelas } from "@/server/services/financeiro";
import { Badge, Card, ChipLink, Dinheiro, Filtros, PageHeader, Paginacao, Vazio } from "./ui";
import { OBRIGACAO_APROVACAO, rotulo } from "@/lib/dominio";
import { fmtDia } from "@/lib/datas";

export async function ListaParcelas({ ctx, natureza, sp }: { ctx: Ctx; natureza: "receber" | "pagar"; sp: Record<string, string | undefined> }) {
  const situacao = (sp.situacao ?? "abertas") as "abertas"; const offset = Number(sp.offset ?? 0);
  const { rows, total, somaSaldo } = await listarParcelas(db, ctx, { natureza, situacao, de: sp.de, ate: sp.ate, clienteId: sp.clienteId, aprovacao: sp.aprovacao, limite: 50, offset });
  const base = `/financeiro/${natureza}?` + new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "offset" && v) as [string, string][]).toString();
  const titulo = natureza === "receber" ? "Contas a receber" : "Contas a pagar";
  return (
    <div>
      <PageHeader titulo={titulo} subtitulo={<>{total} parcela(s) · saldo em aberto no filtro: <b><Dinheiro v={somaSaldo} /></b>{sp.de && ` · ${fmtDia(sp.de)} a ${fmtDia(sp.ate)}`}{sp.clienteId && rows[0]?.clienteNome && <> · cliente: <b>{rows[0].clienteNome}</b> <Link href={`/financeiro/${natureza}?situacao=${situacao}`} className="font-semibold text-ice-strong">(limpar)</Link></>}</>} acoes={pode(ctx, "financeiro.lancar") && <Link href={`/financeiro/nova?natureza=${natureza}`} className="btn btn-primary">Novo lançamento</Link>} />
      <Filtros>{[["abertas", "Em aberto"], ["a_vencer", "A vencer"], ["vencidas", "Vencidas"], ["hoje", "Vencem hoje"], ["quitadas", natureza === "receber" ? "Recebidas" : "Pagas"], ["todas", "Todas"]].map(([k, r]) => <ChipLink key={k} href={`/financeiro/${natureza}?situacao=${k}${sp.clienteId ? `&clienteId=${sp.clienteId}` : ""}`} ativo={situacao === k}>{r}</ChipLink>)}
        {natureza === "pagar" && <ChipLink href="/financeiro/pagar?situacao=todas&aprovacao=aguardando_aprovacao" ativo={sp.aprovacao === "aguardando_aprovacao"}>Aguardando aprovação</ChipLink>}</Filtros>
      <Card pad={false}>
        {rows.length === 0 ? <Vazio titulo="Nenhuma parcela neste filtro">{situacao === "abertas" ? "Sem contas em aberto registradas — isso não significa saldo garantido; verifique se todos os lançamentos foram cadastrados." : null}</Vazio> : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Vencimento</th><th>{natureza === "receber" ? "Cliente" : "Beneficiário"}</th><th>Descrição</th><th>Valor</th><th>{natureza === "receber" ? "Recebido" : "Pago"}</th><th>Saldo</th><th>Situação</th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.parcelaId}><td className="whitespace-nowrap">{fmtDia(p.vencimento)}</td><td>{p.clienteNome && p.clienteId && pode(ctx, "cliente.ver") ? <Link href={`/clientes/${p.clienteId}`} className="font-medium text-ice-strong hover:underline">{p.clienteNome}</Link> : p.clienteNome ?? p.fornecedorNome ?? p.profissionalNome ?? p.beneficiarioNome ?? "—"}</td>
                <td><Link href={`/financeiro/obrigacoes/${p.obrigacaoId}`} className="font-medium text-navy hover:underline">{p.descricao}</Link><div className="text-[12px] text-muted">{p.categoriaNome}{p.descricaoParcela ? ` · ${p.descricaoParcela}` : ""}{p.notaFiscalRef ? ` · NF ${p.notaFiscalRef}` : ""}</div></td>
                <td><Dinheiro v={p.valorCentavos} /></td><td><Dinheiro v={p.confirmado} />{p.aguardando > 0 && <div className="text-[11.5px] text-warn">+<Dinheiro v={p.aguardando} /> em conferência</div>}</td><td className="font-semibold"><Dinheiro v={p.saldo} /></td>
                <td className="space-y-1"><Badge tom={p.situacao.vencida ? "critico" : p.situacao.codigo === "quitada" ? "ok" : p.situacao.parcial ? "atencao" : "info"}>{p.situacao.rotulo}</Badge>{p.situacaoAprovacao !== "aprovada" && <div><Badge tom="atencao">{rotulo(OBRIGACAO_APROVACAO, p.situacaoAprovacao)}</Badge></div>}</td></tr>
            ))}</tbody></table></div>
        )}
        <Paginacao total={total} limite={50} offset={offset} base={base} />
      </Card>
    </div>
  );
}
