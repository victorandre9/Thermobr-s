/** Estrutura mínima idempotente de uma empresa: papéis padrão, posições virtuais, categorias, checklists, vagas, integração. */
import { and, eq, sql } from "drizzle-orm";
import type { DBOrTx } from "../db";
import {
  agendaVaga, categoriaFinanceira, checklistModelo, checklistModeloItem, integracao, materialPosicao, papel, papelPermissao,
} from "../db/schema";
import { PAPEIS_PADRAO } from "../auth/permissoes";

export async function garantirPapeis(tx: DBOrTx, empresaId: string) {
  for (const p of PAPEIS_PADRAO) {
    let [row] = await tx.select().from(papel).where(and(eq(papel.empresaId, empresaId), eq(papel.codigo, p.codigo)));
    if (!row) {
      [row] = await tx.insert(papel).values({ empresaId, codigo: p.codigo, nome: p.nome, descricao: p.descricao, ativo: p.ativo, sistema: true }).returning();
      const grants = Object.entries(p.grants).map(([permissao, escopo]) => ({ papelId: row.id, permissao, escopo: escopo! }));
      if (grants.length) await tx.insert(papelPermissao).values(grants);
    } else if (p.codigo === "gestor") {
      // gestor sempre recebe permissões novas
      const grants = Object.entries(p.grants).map(([permissao, escopo]) => ({ papelId: row.id, permissao, escopo: escopo! }));
      await tx.insert(papelPermissao).values(grants).onConflictDoNothing();
    }
  }
}

const POSICOES_VIRTUAIS = [
  { tipo: "fornecedor", nome: "Fornecedor (entradas)" },
  { tipo: "consumo", nome: "Aplicado em serviço" },
  { tipo: "perda", nome: "Perdas aprovadas" },
  { tipo: "ajuste", nome: "Ajustes de inventário" },
];

export async function garantirPosicoes(tx: DBOrTx, empresaId: string) {
  const existentes = await tx.select().from(materialPosicao).where(eq(materialPosicao.empresaId, empresaId));
  const tem = (t: string) => existentes.some((p) => p.tipo === t);
  for (const v of POSICOES_VIRTUAIS) if (!tem(v.tipo)) await tx.insert(materialPosicao).values({ empresaId, tipo: v.tipo, nome: v.nome, virtual: true });
  if (!tem("almoxarifado")) await tx.insert(materialPosicao).values({ empresaId, tipo: "almoxarifado", nome: "Almoxarifado principal" });
  if (!tem("segregado")) await tx.insert(materialPosicao).values({ empresaId, tipo: "segregado", nome: "Segregado (aguardando conferência)" });
}

const CATEGORIAS = [
  { natureza: "receber", codigo: "servico_avulso", nome: "Serviço avulso" },
  { natureza: "receber", codigo: "contrato", nome: "Mensalidade de contrato" },
  { natureza: "receber", codigo: "extra_contrato", nome: "Extra de contrato" },
  { natureza: "receber", codigo: "outros_receber", nome: "Outras entradas" },
  { natureza: "pagar", codigo: "material", nome: "Materiais e peças" },
  { natureza: "pagar", codigo: "autonomo", nome: "Técnicos autônomos" },
  { natureza: "pagar", codigo: "adiantamento_autonomo", nome: "Adiantamento a autônomo" },
  { natureza: "pagar", codigo: "veiculo", nome: "Veículos (manutenção, combustível)" },
  { natureza: "pagar", codigo: "ferramenta", nome: "Ferramentas" },
  { natureza: "pagar", codigo: "uber_ferramenta", nome: "Transporte por aplicativo (ferramenta esquecida)" },
  { natureza: "pagar", codigo: "administrativa", nome: "Despesas administrativas" },
  { natureza: "pagar", codigo: "impostos_taxas", nome: "Impostos e taxas (pagamento)" },
  { natureza: "pagar", codigo: "salarios", nome: "Salários e encargos", restrita: true },
  { natureza: "pagar", codigo: "retirada_socios", nome: "Retiradas dos sócios", restrita: true },
  { natureza: "pagar", codigo: "outros_pagar", nome: "Outras saídas" },
];

export async function garantirCategorias(tx: DBOrTx, empresaId: string) {
  await tx.insert(categoriaFinanceira).values(CATEGORIAS.map((c) => ({ empresaId, ...c, restrita: c.restrita ?? false }))).onConflictDoNothing();
}

const CHECKLISTS = [
  { tipo: "veiculo_saida", nome: "Saída do veículo", validadeHoras: 12, itens: [
    ["Pneus: calibragem e desgaste visual", "alta", true], ["Estepe, macaco e chave de roda", "media", false], ["Luzes (farol, lanterna, freio, setas)", "alta", true],
    ["Avarias na lataria/vidros", "media", true], ["Nível de óleo e água (visual)", "media", false], ["Freios (percepção ao sair)", "critica", false],
    ["Documentos do veículo", "media", false], ["Limpeza e organização da carga", "baixa", false],
  ] },
  { tipo: "veiculo_retorno", nome: "Retorno do veículo", validadeHoras: 12, itens: [
    ["Avarias novas", "media", true], ["Pneus (visual)", "media", true], ["Ferramentas e materiais descarregados/conferidos", "media", false],
  ] },
  { tipo: "ferramentas_saida", nome: "Ferramentas — saída", validadeHoras: 12, itens: [] },
  { tipo: "ferramentas_retorno", nome: "Ferramentas — retorno", validadeHoras: 12, itens: [] },
] as const;

export async function garantirChecklists(tx: DBOrTx, empresaId: string) {
  for (const c of CHECKLISTS) {
    const [ex] = await tx.select().from(checklistModelo).where(and(eq(checklistModelo.empresaId, empresaId), eq(checklistModelo.tipo, c.tipo)));
    if (ex) continue;
    const [m] = await tx.insert(checklistModelo).values({ empresaId, tipo: c.tipo, nome: c.nome, validadeHoras: c.validadeHoras }).returning();
    if (c.itens.length) await tx.insert(checklistModeloItem).values(c.itens.map(([descricao, criticidade, exigeFotoIrregular], i) => ({ modeloId: m.id, ordem: i, descricao, criticidade, exigeFotoIrregular })));
  }
}

export async function garantirVagas(tx: DBOrTx, empresaId: string) {
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(agendaVaga).where(eq(agendaVaga.empresaId, empresaId));
  if (n > 0) return;
  // Configuração inicial: 2 vagas diárias (editável em Configurações > Agenda).
  await tx.insert(agendaVaga).values([
    { empresaId, nome: "Manhã", horaInicio: "08:00", horaFim: "12:00", ordem: 1 },
    { empresaId, nome: "Tarde", horaInicio: "13:00", horaFim: "17:00", ordem: 2 },
  ]);
}

export async function garantirIntegracao(tx: DBOrTx, empresaId: string) {
  await tx.insert(integracao).values({ empresaId, provedor: "treeunfe", status: "aguardando_validacao",
    observacao: "API de pedidos não confirmada. A API fiscal da Treeunfe não comprova acesso a pedidos. Validar documentação oficial e plano contratado." })
    .onConflictDoNothing();
}

export async function garantirEstrutura(tx: DBOrTx, empresaId: string) {
  await garantirPapeis(tx, empresaId);
  await garantirPosicoes(tx, empresaId);
  await garantirCategorias(tx, empresaId);
  await garantirChecklists(tx, empresaId);
  await garantirVagas(tx, empresaId);
  await garantirIntegracao(tx, empresaId);
}
