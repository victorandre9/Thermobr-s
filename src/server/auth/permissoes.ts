/**
 * Matriz de permissões: recurso.ação × escopo.
 *  - "proprio": apenas registros vinculados ao próprio profissional/usuário (visitas em que participa, custódias, pagamentos próprios).
 *  - "empresa": todos os registros da empresa.
 * Quem possui "empresa" também atende "proprio".
 * A checagem acontece nos serviços do servidor (src/server/services), nunca só na interface.
 */
export type Escopo = "proprio" | "empresa";

export const PERMISSOES = {
  // Operação
  "os.ver": "Consultar OS",
  "os.gerenciar": "Criar/editar/cancelar OS e itens",
  "os.conferir": "Conferência administrativa de OS/visitas",
  "os.valores.ver": "Ver preço cobrado do cliente",
  "os.custos.ver": "Ver custo de compra",
  "os.extra.aprovar": "Aprovar extras solicitados",
  "agenda.ver": "Consultar agenda",
  "agenda.gerenciar": "Agendar, remarcar, indisponibilidades",
  "visita.executar": "Check-in/out e ficha de execução",
  "pedido.ver": "Consultar pedidos externos",
  "pedido.programar": "Montar OS a partir de pedidos / conferir alterações",
  "integracao.gerenciar": "Configurar integrações e reprocessar",
  // Cadastros
  "cliente.ver": "Consultar clientes",
  "cliente.gerenciar": "Cadastrar clientes, locais, contatos, equipamentos",
  "fornecedor.gerenciar": "Cadastrar fornecedores",
  "contrato.ver": "Consultar contratos",
  "contrato.gerenciar": "Cadastrar contratos",
  "contrato.valores.ver": "Ver valores de contrato",
  "profissional.gerenciar": "Cadastrar profissionais e vínculos",
  // Ativos
  "ferramenta.ver": "Consultar ferramentas",
  "ferramenta.gerenciar": "Cadastrar ferramentas",
  "ferramenta.movimentar": "Separar, entregar, conferir devoluções",
  "ferramenta.confirmar": "Confirmar recebimento / solicitar devolução",
  "veiculo.ver": "Consultar veículos",
  "veiculo.gerenciar": "Cadastrar veículos, manutenções, pneus",
  "veiculo.checklist": "Executar checklist de veículo",
  "veiculo.irregularidade.tratar": "Tratar irregularidades de veículo",
  "veiculo.odometro.corrigir": "Autorizar correção (redução) de odômetro",
  "material.ver": "Consultar materiais e saldos",
  "material.gerenciar": "Cadastrar materiais e posições",
  "material.movimentar": "Registrar entrada, entrega, recebimento físico",
  "material.informar": "Confirmar recebimento e informar consumo/sobra/perda",
  "material.conferir": "Validar consumo e conferir devoluções",
  "material.custos.ver": "Ver custo de materiais",
  "divergencia.aprovar": "Aprovar perdas, ajustes e divergências",
  "checklist.gerenciar": "Configurar modelos de checklist",
  // Financeiro
  "financeiro.ver": "Consultar contas a receber/pagar",
  "financeiro.lancar": "Preparar obrigações, parcelas e despesas",
  "financeiro.baixa.registrar": "Registrar recebimentos/pagamentos para conferência",
  "financeiro.baixa.confirmar": "Confirmar recebimentos e pagamentos já aprovados",
  "financeiro.aprovar": "Aprovar despesas e obrigações, conferir baixas",
  "financeiro.estornar": "Autorizar estornos e cancelamentos",
  "financeiro.desconto": "Autorizar descontos",
  "financeiro.saldo_inicial": "Cadastrar/alterar saldo inicial das contas",
  "financeiro.fluxo.ver": "Fluxo de caixa e saldos",
  "financeiro.restrito.ver": "Categorias restritas (salários, retiradas)",
  "financeiro.cobranca": "Registrar contatos de cobrança",
  "autonomo.valores.ver": "Ver valores de autônomos",
  "autonomo.valores.definir": "Definir valor combinado com autônomo",
  "autonomo.resumo.preparar": "Preparar resumo semanal e solicitar liberação",
  "autonomo.liberar": "Liberar pagamento de autônomos",
  // Comuns
  "pendencia.ver": "Consultar pendências",
  "pendencia.resolver": "Resolver pendências",
  "relatorio.operacional": "Relatórios operacionais",
  "relatorio.financeiro": "Relatórios financeiros",
  "relatorio.exportar": "Exportar CSV",
  "usuario.gerenciar": "Administrar usuários e permissões",
  "configuracao.gerenciar": "Configurações da empresa",
  "auditoria.ver": "Consultar auditoria",
} as const;

export type Permissao = keyof typeof PERMISSOES;
export type Grant = Partial<Record<Permissao, Escopo>>;

const E: Escopo = "empresa";
const P: Escopo = "proprio";
const all = (perms: Permissao[], esc: Escopo = E): Grant => Object.fromEntries(perms.map((p) => [p, esc]));

export interface PapelPadrao { codigo: string; nome: string; descricao: string; ativo: boolean; grants: Grant }

/** Papéis padrão. O gestor pode ajustar concessões por usuário. */
export const PAPEIS_PADRAO: PapelPadrao[] = [
  {
    codigo: "gestor",
    nome: "Gestor geral / aprovador financeiro",
    descricao: "Donos. Acesso total, aprovações, exceções, configurações e auditoria.",
    ativo: true,
    grants: all(Object.keys(PERMISSOES) as Permissao[]),
  },
  {
    codigo: "administrativo",
    nome: "Administrativo e agenda",
    descricao: "Clientes, OS, agenda, equipes, ferramentas e materiais. Sem financeiro por padrão.",
    ativo: true,
    grants: {
      ...all(["os.ver", "os.gerenciar", "os.conferir", "agenda.ver", "agenda.gerenciar", "pedido.ver", "pedido.programar",
        "cliente.ver", "cliente.gerenciar", "fornecedor.gerenciar", "contrato.ver", "contrato.gerenciar", "profissional.gerenciar",
        "ferramenta.ver", "ferramenta.gerenciar", "ferramenta.movimentar", "veiculo.ver", "veiculo.gerenciar", "veiculo.checklist",
        "veiculo.irregularidade.tratar", "material.ver", "material.gerenciar", "material.movimentar", "material.conferir",
        "checklist.gerenciar", "pendencia.ver", "pendencia.resolver", "relatorio.operacional", "relatorio.exportar"]),
    },
  },
  {
    codigo: "financeiro_operador",
    nome: "Operador financeiro",
    descricao: "Prepara obrigações, registra baixas para conferência, cobrança e resumo de autônomos. Não aprova.",
    ativo: true,
    grants: {
      ...all(["os.ver", "os.valores.ver", "os.custos.ver", "cliente.ver", "contrato.ver", "contrato.valores.ver",
        "financeiro.ver", "financeiro.lancar", "financeiro.baixa.registrar", "financeiro.fluxo.ver", "financeiro.cobranca",
        "autonomo.valores.ver", "autonomo.resumo.preparar", "material.ver", "material.custos.ver", "relatorio.financeiro",
        "relatorio.exportar", "pendencia.ver"]),
    },
  },
  {
    codigo: "financeiro_consulta",
    nome: "Consulta financeira (sem edição)",
    descricao: "Previsto para evolução. Desativado inicialmente.",
    ativo: false,
    grants: all(["financeiro.ver", "financeiro.fluxo.ver", "relatorio.financeiro", "os.ver", "cliente.ver"]),
  },
  {
    codigo: "tecnico",
    nome: "Técnico",
    descricao: "Visitas, ferramentas e materiais próprios. Vínculo (autônomo/próprio) define pagamentos e checklist de veículo.",
    ativo: true,
    grants: {
      "os.ver": P, "agenda.ver": P, "visita.executar": P, "cliente.ver": P,
      "ferramenta.ver": P, "ferramenta.confirmar": P, "material.ver": P, "material.informar": P,
      "veiculo.ver": P, "veiculo.checklist": P, "autonomo.valores.ver": P, "pendencia.ver": P,
    },
  },
];

/** Permissões que só fazem sentido com escopo empresa (não são concedidas como "proprio"). */
export const SOMENTE_EMPRESA: Permissao[] = ["usuario.gerenciar", "configuracao.gerenciar", "financeiro.aprovar", "financeiro.estornar",
  "financeiro.saldo_inicial", "autonomo.liberar", "divergencia.aprovar", "auditoria.ver"];
