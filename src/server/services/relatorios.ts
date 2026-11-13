/**
 * Relatórios essenciais. Cada relatório usa os mesmos serviços/condições das telas, portanto as mesmas restrições.
 * A exportação CSV chama exatamente a mesma função (sem paginação, limite de segurança).
 */
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { DBOrTx } from "../db";
import { qc } from "../db/sql";
import {
  auditoria, baixa, categoriaFinanceira, checklistResposta, cliente, clienteLocal, compra, equipamento, ferramenta, ferramentaMovimento, material, materialDivergencia, materialMovimento,
  obrigacao, ordemServico, parcela, pendencia, pneu, profissional, usuario, veiculo, veiculoManutencao, visita, visitaExecucao,
} from "../db/schema";
import { type Ctx, exigir, pode } from "../auth/contexto";
import type { Permissao } from "../auth/permissoes";
import { listarOS } from "./os";
import { listarVisitas } from "./visitas";
import { listarParcelas } from "./financeiro";
import { realizadoPeriodo, projecao, saldosRealizados } from "./fluxo";
import { listarServicosAutonomos } from "./autonomos";
import { custosOperacionais, produtividadeTecnicos } from "./produtividade";
import { OS_ETAPAS, OS_ORIGENS, VISITA_RESULTADOS, MOTIVOS_RESULTADO, rotulo, AUTONOMO_SITUACAO, FERRAMENTA_SITUACOES, FERRAMENTA_CONDICOES, MATERIAL_MOV_TIPOS, MATERIAL_MOV_STATUS, OBRIGACAO_APROVACAO, VISITA_SITUACOES } from "@/lib/dominio";
import { intervaloDiaSP, primeiroDiaMes, somarMeses, hojeSP } from "@/lib/datas";

export type TipoColuna = "texto" | "moeda" | "data" | "datahora" | "qtd" | "numero";
export interface Coluna { chave: string; rotulo: string; tipo?: TipoColuna }
export interface Resultado { colunas: Coluna[]; linhas: Record<string, unknown>[]; total: number; avisos: string[] }
export interface Filtros { de?: string; ate?: string; clienteId?: string; profissionalId?: string; etapa?: string; origem?: string; situacao?: string; veiculoId?: string; acao?: string; limite?: number; offset?: number }

export interface DefRelatorio { id: string; titulo: string; descricao: string; permissoes: Permissao[]; filtros: Array<keyof Filtros>; gerar: (dbx: DBOrTx, ctx: Ctx, f: Filtros) => Promise<Resultado> }

const LIM = (f: Filtros) => ({ limite: f.limite ?? 50, offset: f.offset ?? 0 });
const periodo = (f: Filtros) => { const de = f.de ?? primeiroDiaMes(hojeSP()); const ate = f.ate ?? hojeSP(); return { de, ate, ini: intervaloDiaSP(de)[0], fim: intervaloDiaSP(ate)[1] }; };

const minutos = (m: number | null) => (m === null ? "—" : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`);
const VINC: Record<string, string> = { proprio: "Equipe própria", autonomo: "Autônomo" };

export const RELATORIOS: DefRelatorio[] = [
  {
    id: "os", titulo: "1. Ordens de serviço", descricao: "Por período de abertura, situação, origem, cliente, técnico e pendência.", permissoes: ["relatorio.operacional", "os.ver"], filtros: ["de", "ate", "etapa", "origem", "clienteId", "profissionalId"],
    async gerar(dbx, ctx, f) {
      const { ini, fim } = periodo(f);
      const ids = (await dbx.select({ id: ordemServico.id }).from(ordemServico).where(and(eq(ordemServico.empresaId, ctx.empresaId), gte(ordemServico.criadoEm, ini), lt(ordemServico.criadoEm, fim)))).map((r) => r.id);
      const r = await listarOS(dbx, ctx, { etapa: f.etapa, origem: f.origem, clienteId: f.clienteId, profissionalId: f.profissionalId, ids, ...LIM(f) });
      return { total: r.total, avisos: [], colunas: [{ chave: "numero", rotulo: "OS", tipo: "numero" }, { chave: "cliente", rotulo: "Cliente" }, { chave: "origem", rotulo: "Origem" }, { chave: "etapa", rotulo: "Situação" }, { chave: "material", rotulo: "Material" }, { chave: "equipe", rotulo: "Equipe" }, { chave: "motivo", rotulo: "Motivo/pendência" }, { chave: "avanco", rotulo: "Último avanço", tipo: "datahora" }],
        linhas: r.rows.map((o) => ({ numero: o.numero, cliente: o.clienteNome, origem: rotulo(OS_ORIGENS, o.origem), etapa: rotulo(OS_ETAPAS, o.etapa), material: o.situacaoMaterial, equipe: o.equipe ?? "", motivo: o.motivoEtapa ?? o.proximaAcao ?? "", avanco: o.ultimoAvancoEm })) };
    },
  },
  {
    id: "visitas", titulo: "2. Agenda e visitas", descricao: "Visitas realizadas/não realizadas, início/fim, duração e motivos de retorno.", permissoes: ["relatorio.operacional", "agenda.ver"], filtros: ["de", "ate", "profissionalId", "situacao"],
    async gerar(dbx, ctx, f) {
      const { de, ate } = periodo(f);
      const r = await listarVisitas(dbx, ctx, { de, ate, profissionalId: f.profissionalId, filtro: (f.situacao as "finalizadas") ?? "todas", ...LIM(f) });
      return { total: r.total, avisos: [], colunas: [{ chave: "os", rotulo: "OS", tipo: "numero" }, { chave: "seq", rotulo: "Visita", tipo: "numero" }, { chave: "cliente", rotulo: "Cliente" }, { chave: "equipe", rotulo: "Equipe" }, { chave: "previsto", rotulo: "Previsto", tipo: "datahora" }, { chave: "checkin", rotulo: "Início", tipo: "datahora" }, { chave: "checkout", rotulo: "Fim", tipo: "datahora" }, { chave: "duracao", rotulo: "Duração (min)", tipo: "numero" }, { chave: "situacao", rotulo: "Situação" }, { chave: "resultado", rotulo: "Resultado" }, { chave: "motivo", rotulo: "Motivo" }],
        linhas: r.rows.map((v) => ({ os: v.osNumero, seq: v.sequencia, cliente: v.clienteNome, equipe: v.equipe ?? "", previsto: v.inicio, checkin: v.checkinEm, checkout: v.checkoutEm, duracao: v.checkinEm && v.checkoutEm ? Math.round((v.checkoutEm.getTime() - v.checkinEm.getTime()) / 60000) : null, situacao: rotulo(VISITA_SITUACOES, v.situacao), resultado: rotulo(VISITA_RESULTADOS, v.resultado), motivo: rotulo(MOTIVOS_RESULTADO, v.motivo) })) };
    },
  },
  {
    id: "historico", titulo: "3. Histórico de atendimento", descricao: "Por cliente, local e equipamento.", permissoes: ["relatorio.operacional", "os.ver"], filtros: ["clienteId", "de", "ate"],
    async gerar(dbx, ctx, f) {
      exigir(ctx, "os.ver", "empresa");
      const { ini, fim } = periodo({ de: f.de ?? "2000-01-01", ate: f.ate });
      const conds = [eq(ordemServico.empresaId, ctx.empresaId), sql`${visita.checkoutEm} >= ${ini.toISOString()} and ${visita.checkoutEm} < ${fim.toISOString()}`];
      if (f.clienteId) conds.push(eq(ordemServico.clienteId, f.clienteId));
      const rows = await dbx.select({ os: ordemServico.numero, cliente: cliente.nome, local: clienteLocal.nome, equipamento: sql<string>`coalesce(${equipamento.identificacao}, ${equipamento.tipo}, 'Geral')`, data: visita.checkoutEm, diagnostico: visitaExecucao.diagnostico, servico: visitaExecucao.servicoRealizado, teste: visitaExecucao.testeFuncionamento, resultado: visita.resultado, total: sql<number>`count(*) over()::int` })
        .from(visitaExecucao).innerJoin(visita, eq(visita.id, visitaExecucao.visitaId)).innerJoin(ordemServico, eq(ordemServico.id, visita.osId)).innerJoin(cliente, eq(cliente.id, ordemServico.clienteId))
        .leftJoin(clienteLocal, eq(clienteLocal.id, ordemServico.localId)).leftJoin(equipamento, eq(equipamento.id, visitaExecucao.equipamentoId))
        .where(and(...conds)).orderBy(desc(visita.checkoutEm)).limit(LIM(f).limite).offset(LIM(f).offset);
      return { total: rows[0]?.total ?? 0, avisos: [], colunas: [{ chave: "data", rotulo: "Data", tipo: "datahora" }, { chave: "os", rotulo: "OS", tipo: "numero" }, { chave: "cliente", rotulo: "Cliente" }, { chave: "local", rotulo: "Local" }, { chave: "equipamento", rotulo: "Equipamento" }, { chave: "diagnostico", rotulo: "Diagnóstico" }, { chave: "servico", rotulo: "Serviço" }, { chave: "teste", rotulo: "Teste" }, { chave: "resultado", rotulo: "Resultado" }],
        linhas: rows.map(({ total, ...r }) => (void total, { ...r, resultado: rotulo(VISITA_RESULTADOS, r.resultado) })) };
    },
  },
  {
    id: "receber", titulo: "4. Contas a receber", descricao: "Parcelas, recebimentos parciais, vencidos e histórico de cobrança.", permissoes: ["relatorio.financeiro", "financeiro.ver"], filtros: ["de", "ate", "clienteId", "situacao"],
    async gerar(dbx, ctx, f) {
      const r = await listarParcelas(dbx, ctx, { natureza: "receber", situacao: (f.situacao as "abertas") ?? "todas", de: f.de, ate: f.ate, clienteId: f.clienteId, ...LIM(f) });
      return { total: r.total, avisos: [], colunas: [{ chave: "vencimento", rotulo: "Vencimento", tipo: "data" }, { chave: "cliente", rotulo: "Cliente" }, { chave: "descricao", rotulo: "Descrição" }, { chave: "valor", rotulo: "Valor", tipo: "moeda" }, { chave: "recebido", rotulo: "Recebido (confirmado)", tipo: "moeda" }, { chave: "saldo", rotulo: "Saldo", tipo: "moeda" }, { chave: "situacao", rotulo: "Situação" }, { chave: "nf", rotulo: "NF (ref.)" }],
        linhas: r.rows.map((p) => ({ vencimento: p.vencimento, cliente: p.clienteNome, descricao: `${p.descricao}${p.descricaoParcela ? " · " + p.descricaoParcela : ""}`, valor: p.valorCentavos, recebido: p.confirmado, saldo: p.saldo, situacao: p.situacao.rotulo, nf: p.notaFiscalRef ?? "" })) };
    },
  },
  {
    id: "pagar", titulo: "5. Contas a pagar", descricao: "Pagamentos efetuados e aprovações pendentes.", permissoes: ["relatorio.financeiro", "financeiro.ver"], filtros: ["de", "ate", "situacao"],
    async gerar(dbx, ctx, f) {
      const r = await listarParcelas(dbx, ctx, { natureza: "pagar", situacao: (f.situacao as "abertas") ?? "todas", de: f.de, ate: f.ate, ...LIM(f) });
      return { total: r.total, avisos: pode(ctx, "financeiro.restrito.ver") ? [] : ["Categorias restritas não incluídas."], colunas: [{ chave: "vencimento", rotulo: "Vencimento", tipo: "data" }, { chave: "beneficiario", rotulo: "Beneficiário" }, { chave: "categoria", rotulo: "Categoria" }, { chave: "descricao", rotulo: "Descrição" }, { chave: "valor", rotulo: "Valor", tipo: "moeda" }, { chave: "pago", rotulo: "Pago (confirmado)", tipo: "moeda" }, { chave: "saldo", rotulo: "Saldo", tipo: "moeda" }, { chave: "aprovacao", rotulo: "Aprovação" }, { chave: "situacao", rotulo: "Situação" }],
        linhas: r.rows.map((p) => ({ vencimento: p.vencimento, beneficiario: p.fornecedorNome ?? p.profissionalNome ?? p.beneficiarioNome ?? "", categoria: p.categoriaNome, descricao: p.descricao, valor: p.valorCentavos, pago: p.confirmado, saldo: p.saldo, aprovacao: rotulo(OBRIGACAO_APROVACAO, p.situacaoAprovacao), situacao: p.situacao.rotulo })) };
    },
  },
  {
    id: "fluxo", titulo: "6. Fluxo realizado e previsto", descricao: "Por conta, período e categoria, com dados faltantes sinalizados.", permissoes: ["relatorio.financeiro", "financeiro.fluxo.ver"], filtros: ["de", "ate"],
    async gerar(dbx, ctx, f) {
      const { de, ate } = periodo(f);
      const rp = await realizadoPeriodo(dbx, ctx, de, ate);
      const sal = await saldosRealizados(dbx, ctx, ate);
      const pj = await projecao(dbx, ctx, 30);
      const linhas: Record<string, unknown>[] = [
        ...sal.contas.map((c) => ({ tipo: "Saldo por conta", item: c.nome, entradas: c.entradas, saidas: c.saidas, valor: c.saldo, obs: c.saldo === null ? "Sem saldo inicial" : `Saldo inicial em ${c.saldoInicialData}` })),
        ...rp.porCategoria.map((c) => ({ tipo: c.natureza === "receber" ? "Realizado — entradas" : "Realizado — saídas", item: c.categoria, entradas: c.natureza === "receber" ? c.total : null, saidas: c.natureza === "pagar" ? c.total : null, valor: null, obs: "" })),
        { tipo: "Previsto 30 dias", item: "A receber (aprovado, a vencer)", entradas: pj.receberPrevisto, saidas: null, valor: null, obs: `Vencidos a receber à parte: ${(pj.receberVencido / 100).toFixed(2)}` },
        { tipo: "Previsto 30 dias", item: "A pagar (aprovado)", entradas: null, saidas: pj.pagarPrevisto + pj.pagarVencido, valor: null, obs: "Inclui vencidos" },
        { tipo: "Previsto 30 dias", item: "Saldo projetado", entradas: null, saidas: null, valor: pj.saldoProjetado, obs: pj.incompleta ? "Projeção incompleta" : "" },
      ];
      return { total: linhas.length, avisos: [...pj.avisos, ...(rp.registros ? [] : ["Sem baixas confirmadas no período."])], linhas,
        colunas: [{ chave: "tipo", rotulo: "Tipo" }, { chave: "item", rotulo: "Conta/categoria" }, { chave: "entradas", rotulo: "Entradas", tipo: "moeda" }, { chave: "saidas", rotulo: "Saídas", tipo: "moeda" }, { chave: "valor", rotulo: "Saldo", tipo: "moeda" }, { chave: "obs", rotulo: "Observação" }] };
    },
  },
  {
    id: "autonomos", titulo: "7. Autônomos", descricao: "Por profissional, serviço, semana e situação de liberação/pagamento.", permissoes: ["relatorio.financeiro", "autonomo.valores.ver"], filtros: ["profissionalId", "situacao"],
    async gerar(dbx, ctx, f) {
      exigir(ctx, "autonomo.valores.ver", "empresa");
      const rows = await listarServicosAutonomos(dbx, ctx, { profissionalId: f.profissionalId, situacao: f.situacao });
      const pag = rows.slice(LIM(f).offset, LIM(f).offset + LIM(f).limite);
      return { total: rows.length, avisos: [], colunas: [{ chave: "profissional", rotulo: "Profissional" }, { chave: "os", rotulo: "OS", tipo: "numero" }, { chave: "cliente", rotulo: "Cliente" }, { chave: "servico", rotulo: "Serviço" }, { chave: "valor", rotulo: "Valor combinado", tipo: "moeda" }, { chave: "situacao", rotulo: "Situação" }, { chave: "previsao", rotulo: "Previsão pagto.", tipo: "data" }],
        linhas: pag.map((r) => ({ profissional: r.profissionalNome, os: r.osNumero, cliente: r.clienteNome, servico: r.s.descricao, valor: r.s.valorCombinadoCentavos, situacao: rotulo(AUTONOMO_SITUACAO, r.situacaoExibida), previsao: r.previsao })) };
    },
  },
  {
    id: "ferramentas", titulo: "8. Ferramentas", descricao: "Por custodiante, movimentação, falta e dano.", permissoes: ["relatorio.operacional", "ferramenta.ver"], filtros: ["profissionalId", "de", "ate"],
    async gerar(dbx, ctx, f) {
      exigir(ctx, "ferramenta.ver", "empresa");
      const { ini, fim } = periodo({ de: f.de ?? "2000-01-01", ate: f.ate });
      const conds = [eq(ferramentaMovimento.empresaId, ctx.empresaId), gte(ferramentaMovimento.registradoEm, ini), lt(ferramentaMovimento.registradoEm, fim)];
      if (f.profissionalId) conds.push(sql`(${ferramentaMovimento.deProfissionalId} = ${f.profissionalId} or ${ferramentaMovimento.paraProfissionalId} = ${f.profissionalId})`);
      const rows = await dbx.select({ em: ferramentaMovimento.registradoEm, codigo: ferramenta.codigo, nome: ferramenta.nome, tipo: ferramentaMovimento.tipo, status: ferramentaMovimento.status,
        de: sql<string | null>`(select nome from ${profissional} where id = ${qc(ferramentaMovimento.deProfissionalId)})`, para: sql<string | null>`(select nome from ${profissional} where id = ${qc(ferramentaMovimento.paraProfissionalId)})`,
        condicao: ferramentaMovimento.condicao, situacaoAtual: ferramenta.situacao, obs: ferramentaMovimento.observacao, total: sql<number>`count(*) over()::int` })
        .from(ferramentaMovimento).innerJoin(ferramenta, eq(ferramenta.id, ferramentaMovimento.ferramentaId)).where(and(...conds)).orderBy(desc(ferramentaMovimento.registradoEm)).limit(LIM(f).limite).offset(LIM(f).offset);
      return { total: rows[0]?.total ?? 0, avisos: [], colunas: [{ chave: "em", rotulo: "Data", tipo: "datahora" }, { chave: "codigo", rotulo: "Código" }, { chave: "nome", rotulo: "Ferramenta" }, { chave: "tipo", rotulo: "Movimento" }, { chave: "status", rotulo: "Status" }, { chave: "de", rotulo: "De" }, { chave: "para", rotulo: "Para" }, { chave: "condicao", rotulo: "Condição" }, { chave: "situacaoAtual", rotulo: "Situação atual" }, { chave: "obs", rotulo: "Observação" }],
        linhas: rows.map(({ total, ...r }) => (void total, { ...r, condicao: rotulo(FERRAMENTA_CONDICOES, r.condicao), situacaoAtual: rotulo(FERRAMENTA_SITUACOES, r.situacaoAtual) })) };
    },
  },
  {
    id: "materiais", titulo: "9. Materiais", descricao: "Por OS/técnico/local: entregue, consumido validado, devolvido conferido, custódia e diferença.", permissoes: ["relatorio.operacional", "material.ver"], filtros: ["de", "ate", "profissionalId"],
    async gerar(dbx, ctx, f) {
      exigir(ctx, "material.ver", "empresa");
      const { ini, fim } = periodo({ de: f.de ?? "2000-01-01", ate: f.ate });
      const conds = [eq(materialMovimento.empresaId, ctx.empresaId), gte(materialMovimento.registradoEm, ini), lt(materialMovimento.registradoEm, fim)];
      if (f.profissionalId) conds.push(sql`exists (select 1 from material_posicao p where p.profissional_id = ${f.profissionalId} and p.id in (${qc(materialMovimento.origemPosicaoId)}, ${qc(materialMovimento.destinoPosicaoId)}))`);
      const rows = await dbx.select({ em: materialMovimento.registradoEm, os: sql<number | null>`(select numero from ${ordemServico} where id = ${qc(materialMovimento.osId)})`, material: material.nome, espec: material.especificacao, tipo: materialMovimento.tipo, status: materialMovimento.status,
        origem: sql<string>`(select nome from material_posicao where id = ${qc(materialMovimento.origemPosicaoId)})`, destino: sql<string>`(select nome from material_posicao where id = ${qc(materialMovimento.destinoPosicaoId)})`,
        informado: materialMovimento.quantidadeInformada, quantidade: materialMovimento.quantidade, unidade: materialMovimento.unidade, total: sql<number>`count(*) over()::int` })
        .from(materialMovimento).innerJoin(material, eq(material.id, materialMovimento.materialId)).where(and(...conds)).orderBy(desc(materialMovimento.registradoEm)).limit(LIM(f).limite).offset(LIM(f).offset);
      const [div] = await dbx.select({ n: sql<number>`count(*)::int` }).from(materialDivergencia).where(and(eq(materialDivergencia.empresaId, ctx.empresaId), sql`${materialDivergencia.situacao} in ('aberta','em_investigacao')`));
      return { total: rows[0]?.total ?? 0, avisos: div.n ? [`${div.n} divergência(s) aberta(s) — ver Materiais > Divergências. Conciliação detalhada por OS na tela da OS.`] : [], colunas: [{ chave: "em", rotulo: "Data", tipo: "datahora" }, { chave: "os", rotulo: "OS", tipo: "numero" }, { chave: "material", rotulo: "Material" }, { chave: "espec", rotulo: "Especificação" }, { chave: "tipo", rotulo: "Movimento" }, { chave: "status", rotulo: "Status" }, { chave: "origem", rotulo: "Origem" }, { chave: "destino", rotulo: "Destino" }, { chave: "informado", rotulo: "Qtd. informada", tipo: "qtd" }, { chave: "quantidade", rotulo: "Qtd. efetiva", tipo: "qtd" }, { chave: "unidade", rotulo: "Un." }],
        linhas: rows.map(({ total, ...r }) => (void total, { ...r, tipo: rotulo(MATERIAL_MOV_TIPOS, r.tipo), status: rotulo(MATERIAL_MOV_STATUS, r.status) })) };
    },
  },
  {
    id: "veiculos", titulo: "10. Veículos", descricao: "Checklists, irregularidades, correções, pneus, quilometragem e manutenção.", permissoes: ["relatorio.operacional", "veiculo.ver"], filtros: ["veiculoId", "de", "ate"],
    async gerar(dbx, ctx, f) {
      exigir(ctx, "veiculo.ver", "empresa");
      const { ini, fim, de, ate } = periodo({ de: f.de ?? primeiroDiaMes(hojeSP()), ate: f.ate });
      const vs = await dbx.select().from(veiculo).where(and(eq(veiculo.empresaId, ctx.empresaId), f.veiculoId ? eq(veiculo.id, f.veiculoId) : sql`true`));
      const linhas: Record<string, unknown>[] = [];
      for (const v of vs) {
        const [cl] = await dbx.select({ n: sql<number>`count(*)::int` }).from(checklistResposta).where(and(eq(checklistResposta.veiculoId, v.id), gte(checklistResposta.realizadoEm, ini), lt(checklistResposta.realizadoEm, fim)));
        const [ir] = await dbx.select({ abertas: sql<number>`count(*) filter (where ${pendencia.situacao} in ('aberta','em_andamento'))::int`, corrigidas: sql<number>`count(*) filter (where ${pendencia.situacao} = 'resolvida' and ${pendencia.resolvidaEm} >= ${ini.toISOString()} and ${pendencia.resolvidaEm} < ${fim.toISOString()})::int` }).from(pendencia).where(and(eq(pendencia.veiculoId, v.id), eq(pendencia.tipo, "veiculo_irregularidade")));
        const [mn] = await dbx.select({ n: sql<number>`count(*)::int` }).from(veiculoManutencao).where(and(eq(veiculoManutencao.veiculoId, v.id), sql`${veiculoManutencao.data} between ${de} and ${ate}`));
        const [pn] = await dbx.select({ trocas: sql<number>`count(*) filter (where ${pneu.retiradoEm} between ${de} and ${ate})::int` }).from(pneu).where(eq(pneu.veiculoId, v.id));
        linhas.push({ veiculo: v.identificacao, placa: v.placa ?? "", km: v.odometroKm, kmEm: v.odometroAtualizadoEm, checklists: cl.n, irregAbertas: ir.abertas, irregCorrigidas: ir.corrigidas, manutencoes: mn.n, pneusRetirados: pn.trocas });
      }
      return { total: linhas.length, avisos: ["Previsões de manutenção na tela Veículos (consideram data e KM disponíveis)."], linhas,
        colunas: [{ chave: "veiculo", rotulo: "Veículo" }, { chave: "placa", rotulo: "Placa" }, { chave: "km", rotulo: "KM atual", tipo: "numero" }, { chave: "kmEm", rotulo: "KM atualizado em", tipo: "datahora" }, { chave: "checklists", rotulo: "Checklists", tipo: "numero" }, { chave: "irregAbertas", rotulo: "Irregularidades abertas", tipo: "numero" }, { chave: "irregCorrigidas", rotulo: "Corrigidas no período", tipo: "numero" }, { chave: "manutencoes", rotulo: "Manutenções", tipo: "numero" }, { chave: "pneusRetirados", rotulo: "Pneus retirados", tipo: "numero" }] };
    },
  },
  {
    id: "auditoria", titulo: "11. Auditoria", descricao: "Aprovações, estornos, ajustes, perdas e mudanças sensíveis.", permissoes: ["auditoria.ver"], filtros: ["de", "ate", "acao"],
    async gerar(dbx, ctx, f) {
      const { ini, fim } = periodo({ de: f.de ?? somarMeses(hojeSP(), -1), ate: f.ate });
      const conds = [eq(auditoria.empresaId, ctx.empresaId), gte(auditoria.em, ini), lt(auditoria.em, fim)];
      if (f.acao) conds.push(sql`${auditoria.acao} ilike ${f.acao + "%"}`); else conds.push(eq(auditoria.sensivel, true));
      const rows = await dbx.select({ em: auditoria.em, usuario: usuario.nome, acao: auditoria.acao, entidade: auditoria.entidadeTipo, id: auditoria.entidadeId, motivo: auditoria.motivo, antes: auditoria.antes, depois: auditoria.depois, total: sql<number>`count(*) over()::int` })
        .from(auditoria).leftJoin(usuario, eq(usuario.id, auditoria.usuarioId)).where(and(...conds)).orderBy(desc(auditoria.em)).limit(LIM(f).limite).offset(LIM(f).offset);
      return { total: rows[0]?.total ?? 0, avisos: f.acao ? [] : ["Exibindo somente eventos sensíveis. Filtre por ação (ex.: financeiro., material., os.) para ver todos."], colunas: [{ chave: "em", rotulo: "Data", tipo: "datahora" }, { chave: "usuario", rotulo: "Usuário" }, { chave: "acao", rotulo: "Ação" }, { chave: "entidade", rotulo: "Registro" }, { chave: "motivo", rotulo: "Motivo" }, { chave: "antes", rotulo: "Antes" }, { chave: "depois", rotulo: "Depois" }],
        linhas: rows.map(({ total, ...r }) => (void total, { ...r, entidade: `${r.entidade}${r.id ? " " + String(r.id).slice(0, 8) : ""}`, antes: r.antes ? JSON.stringify(r.antes).slice(0, 300) : "", depois: r.depois ? JSON.stringify(r.depois).slice(0, 300) : "" })) };
    },
  },
  {
    id: "produtividade", titulo: "12. Produtividade por técnico", descricao: "Agendadas x realizadas, concluídas, parciais, não realizadas, tempo em campo e média por visita, lado a lado.", permissoes: ["relatorio.operacional", "agenda.ver"], filtros: ["de", "ate"],
    async gerar(dbx, ctx, f) {
      const { de, ate } = periodo(f);
      const rows = await produtividadeTecnicos(dbx, ctx, de, ate);
      return { total: rows.length, avisos: ["Cumprimento = concluídas ÷ visitas já vencidas no período. Tempo em campo = chegada e saída registradas por cada técnico."],
        colunas: [{ chave: "nome", rotulo: "Técnico" }, { chave: "vinculo", rotulo: "Vínculo" }, { chave: "agendadas", rotulo: "Agendadas", tipo: "numero" }, { chave: "concluidas", rotulo: "Concluídas", tipo: "numero" }, { chave: "parciais", rotulo: "Parciais", tipo: "numero" }, { chave: "naoRealizadas", rotulo: "Não realizadas", tipo: "numero" }, { chave: "naoIniciadas", rotulo: "Não iniciadas (atrasadas)", tipo: "numero" }, { chave: "emAberto", rotulo: "A realizar", tipo: "numero" }, { chave: "cumprimento", rotulo: "Cumprimento" }, { chave: "campo", rotulo: "Tempo em campo" }, { chave: "media", rotulo: "Média por visita" }],
        linhas: rows.map((r) => ({ ...r, vinculo: VINC[r.vinculo] ?? r.vinculo, cumprimento: r.cumprimento === null ? "—" : `${r.cumprimento}%`, campo: minutos(r.minutosCampo), media: minutos(r.mediaMinutos) })) };
    },
  },
  {
    id: "custos", titulo: "13. Custos por técnico, OS e categoria", descricao: "Despesas, diárias, reembolsos, autônomos e demais contas a pagar do período, agrupadas.", permissoes: ["relatorio.financeiro", "financeiro.ver"], filtros: ["de", "ate", "situacao"],
    async gerar(dbx, ctx, f) {
      const { de, ate } = periodo(f);
      const ag = f.situacao === "os" ? "os" : f.situacao === "categoria" ? "categoria" : "tecnico";
      const r = await custosOperacionais(dbx, ctx, de, ate, ag);
      return { total: r.linhas.length, avisos: [`Total do período: ${(r.total / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Considera parcelas com vencimento no período (aprovadas ou aguardando). ${ag === "tecnico" ? "Só entram lançamentos ligados a um técnico." : ag === "os" ? "Só entram lançamentos ligados a uma OS." : ""}`.trim()],
        colunas: [{ chave: "rotulo", rotulo: ag === "tecnico" ? "Técnico" : ag === "os" ? "OS" : "Categoria" }, ...(ag === "categoria" ? [] : [{ chave: "detalhe", rotulo: "Categorias" }]), { chave: "lancamentos", rotulo: "Lançamentos", tipo: "numero" as const }, { chave: "valorCentavos", rotulo: "Valor", tipo: "moeda" as const }],
        linhas: r.linhas.map((l) => ({ ...l })) };
    },
  },
  {
    id: "acompanhamento", titulo: "Acompanhamento 6/12 meses", descricao: "Indicadores mensais a partir dos registros: atrasos, Uber por ferramentas, reposições, divergências, retornos e manutenção. Sem ROI ou economia estimada.", permissoes: ["relatorio.operacional", "relatorio.financeiro"], filtros: ["situacao"],
    async gerar(dbx, ctx, f) {
      const meses = f.situacao === "12" ? 12 : 6;
      const inicio = somarMeses(primeiroDiaMes(hojeSP()), -(meses - 1));
      const linhas: Record<string, unknown>[] = [];
      for (let i = 0; i < meses; i++) {
        const m0 = somarMeses(inicio, i), m1 = somarMeses(inicio, i + 1);
        const [i0] = intervaloDiaSP(m0); const [i1] = intervaloDiaSP(m1);
        const [os] = await dbx.select({ abertas: sql<number>`count(*) filter (where ${ordemServico.criadoEm} >= ${i0.toISOString()} and ${ordemServico.criadoEm} < ${i1.toISOString()})::int`, retornos: sql<number>`count(*) filter (where ${ordemServico.origem} = 'retorno_garantia' and ${ordemServico.criadoEm} >= ${i0.toISOString()} and ${ordemServico.criadoEm} < ${i1.toISOString()})::int` }).from(ordemServico).where(eq(ordemServico.empresaId, ctx.empresaId));
        const [vs] = await dbx.select({ fin: sql<number>`count(*)::int`, nc: sql<number>`count(*) filter (where ${visita.resultado} in ('parcial','nao_realizada'))::int` }).from(visita).where(and(eq(visita.empresaId, ctx.empresaId), sql`${visita.checkoutEm} >= ${i0.toISOString()} and ${visita.checkoutEm} < ${i1.toISOString()}`));
        const [uber] = await dbx.select({ v: sql<string>`coalesce(sum(${baixa.valorCentavos}),0)` }).from(baixa).innerJoin(parcela, eq(parcela.id, baixa.parcelaId)).innerJoin(obrigacao, eq(obrigacao.id, parcela.obrigacaoId)).innerJoin(categoriaFinanceira, eq(categoriaFinanceira.id, obrigacao.categoriaId))
          .where(and(eq(baixa.empresaId, ctx.empresaId), eq(baixa.status, "confirmada"), eq(categoriaFinanceira.codigo, "uber_ferramenta"), sql`${baixa.dataPagamento} >= ${m0} and ${baixa.dataPagamento} < ${m1}`));
        const [rep] = await dbx.select({ n: sql<number>`count(*)::int` }).from(compra).where(and(eq(compra.empresaId, ctx.empresaId), sql`${compra.data} >= ${m0} and ${compra.data} < ${m1}`));
        const [dv] = await dbx.select({ n: sql<number>`count(*)::int` }).from(materialDivergencia).where(and(eq(materialDivergencia.empresaId, ctx.empresaId), sql`${materialDivergencia.abertaEm} >= ${i0.toISOString()} and ${materialDivergencia.abertaEm} < ${i1.toISOString()}`, sql`${materialDivergencia.tipo} <> 'sobra'`));
        const [mn] = await dbx.select({ n: sql<number>`count(*)::int` }).from(veiculoManutencao).innerJoin(veiculo, eq(veiculo.id, veiculoManutencao.veiculoId)).where(and(eq(veiculo.empresaId, ctx.empresaId), sql`${veiculoManutencao.data} >= ${m0} and ${veiculoManutencao.data} < ${m1}`));
        const linha: Record<string, unknown> = { mes: m0.slice(0, 7), osAbertas: os.abertas, retornos: os.retornos, visitasFinalizadas: vs.fin, visitasNaoConcluidas: vs.nc, divergencias: dv.n, compras: rep.n, manutencoes: mn.n };
        if (pode(ctx, "financeiro.ver")) {
          const [rec] = await dbx.select({
            antigos: sql<string>`coalesce(sum(${baixa.valorCentavos}) filter (where ${obrigacao.criadoEm} < ${intervaloDiaSP(inicio)[0].toISOString()}),0)`,
            novos: sql<string>`coalesce(sum(${baixa.valorCentavos}) filter (where ${obrigacao.criadoEm} >= ${intervaloDiaSP(inicio)[0].toISOString()}),0)`,
          }).from(baixa).innerJoin(parcela, eq(parcela.id, baixa.parcelaId)).innerJoin(obrigacao, eq(obrigacao.id, parcela.obrigacaoId))
            .where(and(eq(baixa.empresaId, ctx.empresaId), eq(baixa.status, "confirmada"), eq(obrigacao.natureza, "receber"), sql`${baixa.dataPagamento} >= ${m0} and ${baixa.dataPagamento} < ${m1}`));
          const [atr] = await dbx.select({ v: sql<string>`coalesce(sum(${parcela.valorCentavos} - coalesce((select sum(b.valor_centavos) from ${baixa} b where b.parcela_id = ${qc(parcela.id)} and b.status = 'confirmada' and b.data_pagamento < ${m1}),0)),0)` })
            .from(parcela).innerJoin(obrigacao, eq(obrigacao.id, parcela.obrigacaoId)).where(and(eq(obrigacao.empresaId, ctx.empresaId), eq(obrigacao.natureza, "receber"), eq(parcela.cancelada, false), eq(obrigacao.situacaoAprovacao, "aprovada"), sql`${parcela.vencimento} < ${m1}`));
          Object.assign(linha, { uber: Number(uber.v), recuperacaoAntigos: Number(rec.antigos), recebidoNovos: Number(rec.novos), emAtrasoFimMes: Number(atr.v) });
        }
        linhas.push(linha);
      }
      const fin = pode(ctx, "financeiro.ver");
      return { total: linhas.length, linhas, avisos: [`Recuperação de recebíveis antigos = recebimentos de obrigações criadas antes de ${inicio.split("-").reverse().join("/")}; separado de vendas novas.`, "Não há cálculo de economia, ROI ou lucro: faltam custos comparáveis anteriores ao sistema."],
        colunas: [{ chave: "mes", rotulo: "Mês" }, { chave: "osAbertas", rotulo: "OS abertas", tipo: "numero" }, { chave: "retornos", rotulo: "Retornos/garantia", tipo: "numero" }, { chave: "visitasFinalizadas", rotulo: "Visitas finalizadas", tipo: "numero" }, { chave: "visitasNaoConcluidas", rotulo: "Parciais/não realizadas", tipo: "numero" }, { chave: "divergencias", rotulo: "Divergências de material", tipo: "numero" }, { chave: "compras", rotulo: "Compras/reposições", tipo: "numero" }, { chave: "manutencoes", rotulo: "Manutenções de veículos", tipo: "numero" },
          ...(fin ? [{ chave: "uber", rotulo: "Uber por ferramenta (pago)", tipo: "moeda" as const }, { chave: "emAtrasoFimMes", rotulo: "Recebíveis em atraso (fim do mês)", tipo: "moeda" as const }, { chave: "recuperacaoAntigos", rotulo: "Recuperação de antigos", tipo: "moeda" as const }, { chave: "recebidoNovos", rotulo: "Recebido de vendas novas", tipo: "moeda" as const }] : [])] };
    },
  },
];

export function relatoriosDisponiveis(ctx: Ctx) {
  return RELATORIOS.filter((r) => r.permissoes.every((p) => pode(ctx, p, p === "os.ver" || p === "agenda.ver" ? "empresa" : "empresa")));
}

export async function gerarRelatorio(dbx: DBOrTx, ctx: Ctx, id: string, f: Filtros) {
  const def = RELATORIOS.find((r) => r.id === id);
  if (!def) throw new Error("Relatório inexistente");
  for (const p of def.permissoes) exigir(ctx, p);
  return { def, resultado: await def.gerar(dbx, ctx, f) };
}

