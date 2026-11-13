import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { listarClientes } from "@/server/services/cadastros";
import { Badge, Card, PageHeader, Paginacao, Vazio } from "@/components/ui";

export const metadata = { title: "Clientes" };
export default async function Clientes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await exigirCtx(); const sp = await searchParams; const offset = Number(sp.offset ?? 0);
  const { rows, total } = await listarClientes(db, ctx, { busca: sp.busca, limite: 50, offset });
  return (
    <div>
      <PageHeader titulo="Clientes" subtitulo={`${total} cliente(s)`} acoes={<>{<form action="/clientes" className="flex gap-2"><input name="busca" defaultValue={sp.busca} placeholder="Nome ou documento" className="input !w-56" aria-label="Buscar" /><button className="btn btn-ghost">Buscar</button></form>}{pode(ctx, "cliente.gerenciar") && <Link href="/clientes/novo" className="btn btn-primary"><Plus size={16} />Novo cliente</Link>}</>} />
      <Card pad={false}>
        {rows.length === 0 ? <Vazio titulo="Nenhum cliente encontrado" /> : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Cliente</th><th>Documento</th><th>Telefone</th><th>Locais</th><th>Equipamentos</th><th>Contratos ativos</th></tr></thead>
            <tbody>{rows.map((c) => <tr key={c.id}><td><Link href={`/clientes/${c.id}`} className="font-semibold text-navy hover:underline">{c.nome}</Link> {c.demo && <Badge tom="neutro" icone={false}>demonstrativo</Badge>}{!c.ativo && <Badge tom="neutro">inativo</Badge>}</td><td>{c.documento ?? "—"}</td><td>{c.telefone ?? "—"}</td><td>{c.locais}</td><td>{c.equipamentos}</td><td>{c.contratosAtivos}</td></tr>)}</tbody></table></div>
        )}
        <Paginacao total={total} limite={50} offset={offset} base={`/clientes${sp.busca ? `?busca=${sp.busca}` : ""}`} />
      </Card>
    </div>
  );
}
