import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { exigirCtx } from "@/server/auth/sessao";
import { relatoriosDisponiveis } from "@/server/services/relatorios";
import { PageHeader, Vazio } from "@/components/ui";

export const metadata = { title: "Relatórios" };
export default async function Relatorios() {
  const ctx = await exigirCtx();
  const rs = relatoriosDisponiveis(ctx);
  return (
    <div>
      <PageHeader titulo="Relatórios" subtitulo="Mesmas restrições das telas. Exportação CSV registrada na auditoria." />
      {rs.length === 0 ? <Vazio titulo="Nenhum relatório disponível para o seu perfil" /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rs.map((r) => (
          <Link key={r.id} href={`/relatorios/${r.id}`} className="card card-click flex gap-3 p-4"><span className="ic"><BarChart3 size={18} /></span><span><b className="text-navy">{r.titulo}</b><span className="block text-[12.5px] text-muted">{r.descricao}</span></span></Link>
        ))}</div>
      )}
    </div>
  );
}
