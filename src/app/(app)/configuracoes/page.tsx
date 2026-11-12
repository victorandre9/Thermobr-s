import Link from "next/link";
import { Users, UserCog, CalendarClock, ClipboardCheck, Tags, Plug, Rocket, Truck, Timer } from "lucide-react";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Configurações" };
export default async function Config() {
  const ctx = await exigirCtx();
  const itens = [
    [pode(ctx, "usuario.gerenciar"), "/configuracoes/usuarios", "Usuários e permissões", "Papéis, concessões individuais, desativação, redefinição de senha", Users],
    [pode(ctx, "profissional.gerenciar"), "/configuracoes/profissionais", "Profissionais", "Vínculo (autônomo/próprio), competências e regiões", UserCog],
    [pode(ctx, "configuracao.gerenciar"), "/configuracoes/agenda", "Agenda", "Vagas diárias e horários", CalendarClock],
    [pode(ctx, "checklist.gerenciar"), "/configuracoes/checklists", "Checklists", "Modelos versionados de veículo e ferramentas", ClipboardCheck],
    [pode(ctx, "configuracao.gerenciar") && pode(ctx, "financeiro.aprovar"), "/configuracoes/categorias", "Categorias financeiras", "Dupla aprovação e categorias restritas", Tags],
    [pode(ctx, "pedido.ver"), "/configuracoes/integracoes", "Integrações", "Treeunfe (pedidos) — situação e registros", Plug],
    [pode(ctx, "configuracao.gerenciar"), "/configuracoes/implantacao", "Implantação e parâmetros", "Data de corte, política financeira, prazos", Rocket],
    [pode(ctx, "fornecedor.gerenciar") || pode(ctx, "financeiro.lancar"), "/configuracoes/fornecedores", "Fornecedores", "Cadastro de fornecedores", Truck],
    [pode(ctx, "configuracao.gerenciar"), "/configuracoes/rotinas", "Rotinas automáticas", "Execuções, falhas e reprocessamento", Timer],
  ] as const;
  return (
    <div><PageHeader titulo="Configurações" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{itens.filter((i) => i[0]).map(([, href, t, d, I]) => <Link key={href} href={href} className="card card-click flex gap-3 p-4"><span className="ic"><I size={18} /></span><span><b className="text-navy">{t}</b><span className="block text-[12.5px] text-muted">{d}</span></span></Link>)}</div>
    </div>
  );
}
