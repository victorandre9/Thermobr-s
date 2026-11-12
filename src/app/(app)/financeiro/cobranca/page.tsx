import Link from "next/link";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { clientesEmAtraso } from "@/server/services/financeiro";
import { ActionForm, Enviar } from "@/components/action-form";
import { Badge, Card, ChipLink, Dinheiro, Filtros, PageHeader, Vazio } from "@/components/ui";
import { fmtDataHora, fmtDia, hojeSP } from "@/lib/datas";
import { acaoCobranca } from "../actions";

export const metadata = { title: "Cobrança" };
export default async function Cobranca({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await exigirCtx(); const sp = await searchParams; const hoje = hojeSP();
  let rows = await clientesEmAtraso(db, ctx);
  if (sp.filtro === "acao_vencida") rows = rows.filter((r) => r.proximaAcaoEm && r.proximaAcaoEm < hoje);
  return (
    <div className="space-y-5">
      <PageHeader titulo="Cobrança" subtitulo="Clientes com parcelas vencidas. Pagamento parcial não esconde o atraso." />
      <Filtros><ChipLink href="/financeiro/cobranca" ativo={!sp.filtro}>Todos em atraso</ChipLink><ChipLink href="/financeiro/cobranca?filtro=acao_vencida" ativo={sp.filtro === "acao_vencida"}>Próxima ação vencida</ChipLink></Filtros>
      <Card pad={false}>
        {rows.length === 0 ? <Vazio titulo="Nenhum cliente nesta lista" /> : <ul className="divide-y divide-white">{rows.map((r) => (
          <li key={r.clienteId} className="p-4 text-[13.5px]">
            <div className="flex flex-wrap items-center gap-2"><Link href={`/financeiro/receber?situacao=vencidas&clienteId=${r.clienteId}`} className="font-semibold text-navy hover:underline">{r.clienteNome}</Link><b><Dinheiro v={Number(r.totalVencido)} /></b><span className="text-muted">{r.parcelas} parcela(s) · desde {fmtDia(r.maisAntigo)} · {r.telefone ?? "sem telefone"}</span>
              {r.proximaAcaoEm && <Badge tom={r.proximaAcaoEm < hoje ? "critico" : "info"}>Próx. ação {fmtDia(r.proximaAcaoEm)}</Badge>}</div>
            <div className="text-[12.5px] text-muted">Último contato: {r.ultimoContato ? fmtDataHora(r.ultimoContato) : "nenhum"}{r.proximaAcao && ` · ${r.proximaAcao}`}</div>
            {pode(ctx, "financeiro.cobranca") && <ActionForm action={acaoCobranca} className="mt-2 grid gap-2 sm:grid-cols-[120px_1fr_1fr_150px_auto]" resetar><input type="hidden" name="clienteId" value={r.clienteId} /><select name="canal" className="select">{["telefone", "whatsapp", "email", "presencial", "outro"].map((c) => <option key={c}>{c}</option>)}</select><input name="resumo" placeholder="Resumo do contato" className="input" required /><input name="proximaAcao" placeholder="Próxima ação" className="input" /><input type="date" name="proximaAcaoEm" className="input" aria-label="Data" /><Enviar className="btn btn-ghost btn-sm">Registrar</Enviar></ActionForm>}
          </li>))}</ul>}
      </Card>
    </div>
  );
}
