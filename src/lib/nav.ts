import type { Ctx } from "@/server/auth/contexto";
import { pode } from "@/server/auth/contexto";
import { temAcessoChecklistVeiculo } from "@/server/services/veiculos";

export interface ItemNav { href: string; rotulo: string; icone: string; grupo: string }

/** Menu calculado no servidor a partir das permissões (a autorização real está nos serviços). */
export function montarNav(ctx: Ctx): { itens: ItemNav[]; tecnico: boolean } {
  const tecnico = !pode(ctx, "os.ver", "empresa") && !!ctx.profissional;
  const i: ItemNav[] = [{ href: "/", rotulo: tecnico ? "Minhas visitas" : "Início", icone: "home", grupo: "" }];
  if (tecnico) {
    i.push({ href: "/agenda", rotulo: "Minha agenda", icone: "calendar", grupo: "" });
    if (pode(ctx, "ferramenta.ver", "proprio")) i.push({ href: "/ferramentas", rotulo: "Ferramentas", icone: "wrench", grupo: "" });
    if (pode(ctx, "material.ver", "proprio")) i.push({ href: "/materiais/minha-custodia", rotulo: "Materiais", icone: "package", grupo: "" });
    if (temAcessoChecklistVeiculo(ctx)) { i.push({ href: "/checklist-hoje", rotulo: "Checklist de hoje", icone: "check", grupo: "" }); i.push({ href: "/veiculos", rotulo: "Meu veículo", icone: "truck", grupo: "" }); }
    if (ctx.profissional?.vinculo === "proprio") i.push({ href: "/minhas-despesas", rotulo: "Despesas e diárias", icone: "wallet", grupo: "" });
    if (ctx.profissional?.vinculo === "autonomo" && pode(ctx, "autonomo.valores.ver", "proprio")) i.push({ href: "/meus-pagamentos", rotulo: "Meus pagamentos", icone: "wallet", grupo: "" });
    if (pode(ctx, "pendencia.ver", "proprio")) i.push({ href: "/pendencias", rotulo: "Pendências", icone: "alert", grupo: "" });
    return { itens: i, tecnico };
  }
  const op = "Operação";
  // Foco do perfil: só mostra módulos operacionais a quem trabalha na operação (agenda/OS).
  const operacional = pode(ctx, "agenda.ver", "empresa") || pode(ctx, "os.gerenciar");
  if (pode(ctx, "pedido.ver")) i.push({ href: "/pedidos", rotulo: "Pedidos", icone: "inbox", grupo: op });
  if (pode(ctx, "os.ver", "empresa") && operacional) i.push({ href: "/os", rotulo: "Ordens de serviço", icone: "clipboard", grupo: op });
  if (pode(ctx, "agenda.ver", "empresa")) { i.push({ href: "/agenda", rotulo: "Agenda", icone: "calendar", grupo: op }); i.push({ href: "/visitas", rotulo: "Visitas", icone: "map", grupo: op }); }
  if (pode(ctx, "pendencia.ver", "empresa") && operacional) i.push({ href: "/pendencias", rotulo: "Pendências", icone: "alert", grupo: op });
  if (pode(ctx, "cliente.ver", "empresa")) i.push({ href: "/clientes", rotulo: "Clientes", icone: "users", grupo: op });
  if (pode(ctx, "contrato.ver")) i.push({ href: "/contratos", rotulo: "Contratos", icone: "file", grupo: op });
  const at = "Ativos";
  if (pode(ctx, "ferramenta.ver", "empresa")) i.push({ href: "/ferramentas", rotulo: "Ferramentas", icone: "wrench", grupo: at });
  if (pode(ctx, "veiculo.ver", "empresa")) i.push({ href: "/veiculos", rotulo: "Veículos", icone: "truck", grupo: at });
  if (pode(ctx, "material.ver", "empresa") && (pode(ctx, "material.gerenciar") || pode(ctx, "material.movimentar") || pode(ctx, "material.conferir"))) i.push({ href: "/materiais", rotulo: "Materiais e peças", icone: "package", grupo: at });
  if (ctx.profissional && pode(ctx, "material.informar", "proprio")) i.push({ href: "/materiais/minha-custodia", rotulo: "Minha custódia", icone: "package", grupo: at });
  const fi = "Financeiro";
  if (!operacional && pode(ctx, "os.ver", "empresa") && pode(ctx, "os.valores.ver")) i.push({ href: "/os?situacao=para_cobrar", rotulo: "OS para cobrar", icone: "clipboard", grupo: fi });
  if (pode(ctx, "financeiro.ver")) { i.push({ href: "/financeiro/receber", rotulo: "Contas a receber", icone: "arrowDown", grupo: fi }); i.push({ href: "/financeiro/pagar", rotulo: "Contas a pagar", icone: "arrowUp", grupo: fi }); }
  if (pode(ctx, "financeiro.aprovar") || pode(ctx, "financeiro.baixa.confirmar")) i.push({ href: "/financeiro/aprovacoes", rotulo: "Aprovações e conferências", icone: "check", grupo: fi });
  if (pode(ctx, "financeiro.fluxo.ver")) i.push({ href: "/financeiro/caixa", rotulo: "Caixa e previsão", icone: "chart", grupo: fi });
  if (pode(ctx, "autonomo.valores.ver", "empresa")) i.push({ href: "/financeiro/autonomos", rotulo: "Autônomos", icone: "wallet", grupo: fi });
  if (pode(ctx, "financeiro.cobranca") || pode(ctx, "financeiro.ver")) i.push({ href: "/financeiro/cobranca", rotulo: "Cobrança", icone: "phone", grupo: fi });
  const ad = "Gestão";
  if (pode(ctx, "relatorio.operacional") || pode(ctx, "relatorio.financeiro") || pode(ctx, "auditoria.ver")) i.push({ href: "/relatorios", rotulo: "Relatórios", icone: "report", grupo: ad });
  if (pode(ctx, "usuario.gerenciar") || pode(ctx, "configuracao.gerenciar") || pode(ctx, "profissional.gerenciar") || pode(ctx, "integracao.gerenciar") || pode(ctx, "fornecedor.gerenciar")) i.push({ href: "/configuracoes", rotulo: "Configurações", icone: "settings", grupo: ad });
  return { itens: i, tecnico };
}
