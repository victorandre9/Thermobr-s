/**
 * Massa de dados de TESTE/DEMONSTRAÇÃO (fictícios) para validar o app com o cliente.
 * Cria clientes "fantasmas", contratos, OS em todas as etapas, visitas passadas/hoje/futuras,
 * materiais, ferramentas, veículos, financeiro, autônomos, pendências e relatórios — tudo coerente
 * entre setores e gerado pelos mesmos serviços do app (mesmas regras).
 * Executa uma única vez por empresa demo (marca empresa.config.demo.massa).
 */
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as s from "../src/server/db/schema";
import { carregarCtx, type Ctx } from "../src/server/auth/contexto";
import { criarOS, aprovarComercialmente, conferirOS, recalcularEtapa, atualizarOS, cancelarOS } from "../src/server/services/os";
import { criarVisita } from "../src/server/services/agenda";
import { salvarContrato, salvarFornecedor } from "../src/server/services/cadastros";
import { registrarEntrega, confirmarRecebimento, informarMovimento, conferirMovimento, registrarCompra, registrarContagem } from "../src/server/services/materiais";
import { salvarFerramenta, entregarFerramenta, confirmarFerramenta, registrarOcorrenciaFerramenta, solicitarDevolucao, transferirFerramenta } from "../src/server/services/ferramentas";
import { gerarMensalidades, gerarRecebivelOS, registrarBaixa, criarObrigacao, decidirObrigacao, registrarContatoCobranca, definirDataEsperada, registrarTransferencia } from "../src/server/services/financeiro";
import { definirValorAutonomo, conferirServicoAutonomo, prepararResumoSemanal, liberarResumo, registrarAdiantamento } from "../src/server/services/autonomos";
import { ingerirPedido } from "../src/server/services/pedidos";
import { garantirPendencia, atribuirPendencia } from "../src/server/services/pendencias";
import { emitirRelatorio, registrarCiencia } from "../src/server/services/relatorio-atendimento";
import { registrarManutencao } from "../src/server/services/veiculos";
import { hojeSP, instanteSP, somarDias, somarMeses, primeiroDiaMes, diaSemana } from "../src/lib/datas";

type DB = NodePgDatabase<typeof s>;
type T = Parameters<Parameters<DB["transaction"]>[0]>[0];

// gerador determinístico (mesmos dados a cada carga)
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(20261113);
const pick = <X,>(a: readonly X[]) => a[Math.floor(R() * a.length)];
const int = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));

const BAIRROS = ["Centro", "Jardim América", "Vila Nova", "Boa Vista", "Santa Cruz", "Parque das Flores", "Distrito Industrial", "São José", "Alto da Colina", "Jardim Europa"];
const RUAS = ["Rua das Acácias", "Av. Brasil", "Rua XV de Novembro", "Rua Sete de Setembro", "Av. das Nações", "Rua Dom Pedro II", "Rua das Palmeiras", "Rua Tiradentes", "Av. Santos Dumont", "Rua Marechal Deodoro"];
const NOMES_CONTATO = ["Ana Paula", "Carlos Eduardo", "Fernanda Lima", "Roberto Alves", "Juliana Costa", "Marcelo Souza", "Patrícia Rocha", "Ricardo Mendes", "Sandra Ribeiro", "Tiago Martins", "Vanessa Duarte", "Eduardo Pires"];
const CARGOS = ["Gerente", "Proprietário(a)", "Síndico(a)", "Recepção", "Manutenção predial", "Administrativo"];
const AVULSOS = ["Padaria Pão Dourado", "Clínica Odonto Sorriso", "Escritório Contábil Alfa", "Academia Corpo em Forma", "Restaurante Sabor Caseiro", "Farmácia Vida Plena", "Loja Moda Bella", "Pet Shop Amigo Fiel", "Residência Família Souza", "Residência Família Oliveira", "Residência Família Lima", "Ótica Visão Clara", "Imobiliária Casa Certa", "Salão Beleza Pura", "Consultório Dr. Ferreira", "Papelaria Ponto Final"];
const CONTRATOS = ["Supermercado Bom Preço", "Hotel Recanto Azul", "Colégio Saber Mais", "Laboratório Análise Certa", "Condomínio Residencial Ipês", "Hospital Veterinário Patas", "Coworking Espaço Livre", "Auto Escola Direção Certa"];
const EQUIP = [["split hi-wall", 9000], ["split hi-wall", 12000], ["split hi-wall", 18000], ["split hi-wall", 24000], ["cassete", 36000], ["cassete", 48000], ["piso-teto", 60000]] as const;
const MARCAS = ["Marca Alfa", "Marca Beta", "Marca Gama", "Marca Delta"];
const AMBIENTES = ["Recepção", "Sala 1", "Sala 2", "Escritório", "Quarto casal", "Sala de reunião", "Consultório", "Salão principal", "Cozinha", "Depósito"];
const SERVICOS: Array<{ d: string; comp: string; preco: number }> = [
  { d: "Higienização completa de split", comp: "limpeza", preco: 18000 }, { d: "Instalação de split até 12.000 BTU", comp: "split", preco: 55000 },
  { d: "Instalação de split 18.000 a 24.000 BTU", comp: "split", preco: 75000 }, { d: "Manutenção corretiva — não gela", comp: "split", preco: 25000 },
  { d: "Troca de capacitor", comp: "eletrica", preco: 22000 }, { d: "Recarga de gás R-410A", comp: "split", preco: 38000 },
  { d: "Desentupimento de dreno", comp: "limpeza", preco: 15000 }, { d: "Manutenção de cassete", comp: "cassete", preco: 42000 },
];
const DIAGS = ["Filtros saturados e serpentina suja", "Capacitor estufado", "Baixa pressão de gás — vazamento na porca flange", "Dreno obstruído", "Sem ponto elétrico dedicado", "Placa eletrônica com oxidação", "Ruído no ventilador da condensadora"];
const fone = () => `(00) 9${int(1000, 9999)}-${int(1000, 9999)}`;

export async function popularMassa(db: DB, empresaId: string) {
  const [emp] = await db.select().from(s.empresa).where(eq(s.empresa.id, empresaId));
  const cfg = (emp.config ?? {}) as Record<string, unknown>;
  if ((cfg.demo as { massa?: number } | undefined)?.massa) { console.log("Massa de teste já carregada."); return; }
  const tx = <X,>(fn: (t: T) => Promise<X>) => db.transaction(fn);
  const user = async (prefixo: string) => { const [u] = await db.select().from(s.usuario).where(and(eq(s.usuario.empresaId, empresaId), sql`${s.usuario.email} like ${prefixo + "@%"}`)); return (await carregarCtx(db, u.id)) as Ctx; };
  const G = await user("gestor"), G2 = await user("socio"), A = await user("admin"), F = await user("financeiro");
  const T: Record<string, Ctx> = { aut1: await user("autonomo.a"), aut2: await user("autonomo.b"), aut3: await user("autonomo.c"), prop1: await user("proprio1"), prop2: await user("proprio2") };
  const pid = (k: string) => T[k].profissional!.id;
  const [ajud] = await db.select().from(s.profissional).where(and(eq(s.profissional.empresaId, empresaId), eq(s.profissional.funcao, "ajudante")));
  const hoje = hojeSP();
  console.log("Carregando massa de teste…");

  // ---------------------------------------------------------------- profissionais e veículos
  await db.update(s.profissional).set({ competencias: ["split", "limpeza", "cassete"], regioes: ["centro", "boa vista", "são josé"] }).where(eq(s.profissional.id, pid("aut3")));
  await db.update(s.profissional).set({ competencias: ["split", "cassete", "eletrica"], regioes: ["vila nova", "santa cruz", "parque das flores"] }).where(eq(s.profissional.id, pid("prop2")));
  await db.update(s.profissional).set({ regioes: ["jardim américa", "jardim europa", "alto da colina"] }).where(eq(s.profissional.id, pid("aut2")));
  const veics = await db.select().from(s.veiculo).where(eq(s.veiculo.empresaId, empresaId)).orderBy(s.veiculo.identificacao);
  await db.update(s.profissional).set({ veiculoId: veics[1].id }).where(eq(s.profissional.id, pid("prop2")));
  await db.update(s.veiculo).set({ responsavelProfissionalId: pid("prop1") }).where(eq(s.veiculo.id, veics[0].id));
  await db.update(s.veiculo).set({ responsavelProfissionalId: pid("prop2") }).where(eq(s.veiculo.id, veics[1].id));
  await db.update(s.veiculo).set({ parametrosManutencao: { oleo: { km: 10000, dias: 180 }, alinhamento: { km: 10000, dias: 365 }, rodizio: { km: 8000, dias: null } } }).where(eq(s.veiculo.id, veics[3].id));

  // ---------------------------------------------------------------- clientes
  type Cli = { id: string; nome: string; locais: Array<{ id: string; bairro: string }>; contatos: string[]; eqs: string[]; contrato?: string };
  const clientes: Cli[] = [];
  const novoCliente = async (nome: string, tipo: "PF" | "PJ") => {
    const [c] = await db.insert(s.cliente).values({ empresaId, nome, tipo, telefone: fone(), email: `contato@${nome.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "").slice(0, 14)}.exemplo`, documento: tipo === "PJ" ? `00.000.${int(100, 999)}/0001-${int(10, 99)}` : `000.${int(100, 999)}.${int(100, 999)}-${int(10, 99)}`, observacoes: "Cliente fictício para testes", demo: true }).returning();
    const cli: Cli = { id: c.id, nome, locais: [], contatos: [], eqs: [] };
    for (let i = 0; i < (tipo === "PJ" && R() > 0.6 ? 2 : 1); i++) {
      const bairro = pick(BAIRROS);
      const [l] = await db.insert(s.clienteLocal).values({ clienteId: c.id, nome: i ? "Filial" : tipo === "PF" ? "Residência" : "Matriz", logradouro: pick(RUAS), numero: String(int(10, 2500)), complemento: R() > 0.7 ? `Sala ${int(1, 30)}` : null, bairro, cidade: "Cidade Exemplo", uf: "SP", cep: `00${int(100, 999)}-${int(100, 999)}`, instrucoesAcesso: R() > 0.5 ? pick(["Interfone 12 — falar com a recepção", "Estacionar nos fundos", "Chave com o zelador", "Acesso pela garagem, portão 2"]) : null }).returning();
      cli.locais.push({ id: l.id, bairro });
      for (let k = 0; k < int(1, 3); k++) {
        const [tp, btu] = pick(EQUIP);
        const [e] = await db.insert(s.equipamento).values({ clienteId: c.id, localId: l.id, tipo: tp, marca: pick(MARCAS), modelo: `${btu.toLocaleString("pt-BR")} BTU`, capacidadeBtu: btu, numeroSerie: `SN${int(100000, 999999)}`, identificacao: `${pick(AMBIENTES)}${k ? " " + (k + 1) : ""}` }).returning();
        cli.eqs.push(e.id);
      }
    }
    for (let k = 0; k < int(1, 2); k++) { const [ct] = await db.insert(s.clienteContato).values({ clienteId: c.id, nome: pick(NOMES_CONTATO), telefone: fone(), email: null, cargo: pick(CARGOS), principal: k === 0 }).returning(); cli.contatos.push(ct.id); }
    clientes.push(cli);
    return cli;
  };
  for (const n of AVULSOS) await novoCliente(n, n.startsWith("Residência") ? "PF" : "PJ");
  const contratosCli: Cli[] = [];
  for (const [i, n] of CONTRATOS.entries()) {
    const c = await novoCliente(n, "PJ");
    const k = await tx((t) => salvarContrato(t, G, null, { clienteId: c.id, numero: `CT-${2026}-${String(i + 10).padStart(3, "0")}`, descricao: "Manutenção preventiva programada", cobertura: `Preventiva mensal de até ${c.eqs.length} equipamento(s), visitas corretivas sem custo de mão de obra`, valorMensalCentavos: int(30, 250) * 1000, inicio: somarMeses(primeiroDiaMes(hoje), -int(3, 10)), diaVencimento: pick([5, 10, 15, 20]), visitasIncluidasMes: int(1, 2), status: "ativo", locais: c.locais.map((l) => l.id) }));
    c.contrato = k.id; contratosCli.push(c);
  }
  const forn: Array<typeof s.fornecedor.$inferSelect> = [];
  for (const n of ["Refrigeração Polo Frio (fictício)", "Distribuidora Ar & Cia (fictício)", "Auto Peças Estrada (fictício)", "Posto Rota Sul (fictício)"]) forn.push(await tx((t) => salvarFornecedor(t, G, null, { nome: n, documento: `00.${int(100, 999)}.${int(100, 999)}/0001-00`, telefone: fone(), email: null })));

  // ---------------------------------------------------------------- agenda: controle de ocupação
  const ocup = new Set<string>();
  const vagas: Array<[string, string]> = [["08:00", "12:00"], ["13:00", "17:00"]];
  const tecnicos = ["aut1", "aut2", "aut3", "prop1", "prop2"];
  const equipeLivre = (dia: string, v: number, n: number, preferido?: string) => {
    const livres = tecnicos.filter((k) => !ocup.has(`${k}|${dia}|${v}`));
    const ordem = preferido && livres.includes(preferido) ? [preferido, ...livres.filter((x) => x !== preferido)] : livres.sort(() => R() - 0.5);
    return ordem.slice(0, n);
  };
  const diaUtil = (d: string) => { let x = d; while ([0].includes(diaSemana(x))) x = somarDias(x, 1); return x; };
  async function programar(osId: string, dia: string, n = 1, preferido?: string, comAjudante = false) {
    for (let tent = 0; tent < 30; tent++) {
      const dd = diaUtil(somarDias(dia, Math.floor(tent / 2) * (dia < hoje ? -1 : 1)));
      const v = tent % 2;
      const eq = equipeLivre(dd, v, n, preferido);
      if (eq.length < n) continue;
      const ids = eq.map(pid);
      if (comAjudante && !ocup.has(`ajud|${dd}|${v}`)) { ids.push(ajud.id); ocup.add(`ajud|${dd}|${v}`); }
      let vis;
      try { vis = await tx((t) => criarVisita(t, A, osId, { inicio: instanteSP(dd, vagas[v][0]), fim: instanteSP(dd, vagas[v][1]), equipe: { profissionalIds: ids, responsavelId: ids[0], veiculoId: eq[0].startsWith("prop") ? T[eq[0]].profissional!.veiculoId : null } })); }
      catch { for (const k of eq) ocup.add(`${k}|${dd}|${v}`); continue; } // horário já ocupado (ex.: carga base)
      for (const k of eq) ocup.add(`${k}|${dd}|${v}`);
      return { visita: vis, dia: dd, vaga: v, equipe: eq, ids };
    }
    throw new Error("Sem agenda livre");
  }
  async function executar(p: Awaited<ReturnType<typeof programar>>, resultado: "concluida" | "parcial" | "nao_realizada", motivo?: string) {
    const ini = instanteSP(p.dia, vagas[p.vaga][0]);
    const chk = new Date(ini.getTime() + int(0, 40) * 60000);
    const out = new Date(chk.getTime() + int(60, 210) * 60000);
    const resp = T[p.equipe[0]];
    const [vrow] = await db.select().from(s.visita).where(eq(s.visita.id, p.visita.id));
    const eqs = await db.select().from(s.osEquipamento).where(eq(s.osEquipamento.osId, vrow.osId));
    for (const e of eqs.length ? eqs : [{ equipamentoId: null }]) {
      await db.insert(s.visitaExecucao).values({ visitaId: p.visita.id, equipamentoId: e.equipamentoId, diagnostico: pick(DIAGS), servicoRealizado: resultado === "nao_realizada" ? null : pick(["Limpeza de filtros, serpentina e bandeja", "Substituição do capacitor e teste", "Correção de vazamento e recarga", "Instalação com suporte e tubulação embutida", "Desobstrução do dreno e teste de escoamento"]), testeFuncionamento: resultado === "concluida" ? "ok" : resultado === "parcial" ? "falhou" : "nao_testado", resultado: resultado === "concluida" ? "concluido" : resultado === "parcial" ? "parcial" : "nao_realizado", atualizadoPor: resp.usuarioId });
    }
    for (const [i, k] of p.ids.entries()) await db.insert(s.visitaParticipacao).values({ visitaId: p.visita.id, profissionalId: k, chegadaEm: new Date(chk.getTime() + i * 5 * 60000), saidaEm: new Date(out.getTime() - i * 10 * 60000), registradoPor: resp.usuarioId });
    const pend = resultado === "concluida" ? null : { motivo: motivo!, pendencia: { falta_material: "Faltou capacitor/peça compatível", peca_divergente: "Peça entregue não corresponde ao modelo", ausencia_cliente: "Cliente ausente no horário combinado", falta_acesso: "Sem acesso à condensadora (telhado)", defeito_adicional: "Defeito adicional na placa eletrônica", outro: "Chuva forte impediu o serviço externo" }[motivo!] ?? "Pendência", acao: "Reagendar após resolver a pendência" };
    await db.update(s.visita).set({ situacao: "finalizada", resultado, motivoResultado: pend?.motivo ?? null, pendenciaDescricao: pend?.pendencia ?? null, proximaAcao: pend?.acao ?? null, checkinEm: chk, checkinPor: resp.usuarioId, checkoutEm: out, checkoutPor: resp.usuarioId }).where(eq(s.visita.id, p.visita.id));
    if (pend) await tx((t) => garantirPendencia(t, resp, { tipo: "visita_impedimento", titulo: `Visita ${resultado === "parcial" ? "parcial" : "não realizada"}: ${pend.pendencia}`, descricao: `${pend.pendencia}. Próxima ação: ${pend.acao}`, osId: vrow.osId, visitaId: p.visita.id, profissionalId: resp.profissional!.id, prioridade: "alta", chave: `visita_impedimento:${p.visita.id}` }));
    await tx((t) => recalcularEtapa(t, vrow.osId));
  }
  const osAvulsa = async (c: Cli, o: { pr?: string; aprovar?: boolean; serv?: typeof SERVICOS[number]; obs?: string } = {}) => {
    const sv = o.serv ?? pick(SERVICOS);
    const os = await tx((t) => criarOS(t, G, { origem: "avulso", clienteId: c.id, localId: c.locais[0].id, contatoId: c.contatos[0], descricao: `${sv.d} — ${c.nome}`, prioridade: o.pr ?? pick(["normal", "normal", "alta", "baixa", "urgente"]), observacoes: o.obs ?? null, equipamentos: c.eqs.slice(0, int(1, Math.min(2, c.eqs.length))), aprovada: o.aprovar ?? true, demo: true,
      itens: [{ tipo: "servico", descricao: sv.d, quantidade: "1", unidade: "un", precoUnitarioCentavos: sv.preco, custoUnitarioCentavos: Math.round(sv.preco * 0.25) }] }));
    await tx((t) => atualizarOS(t, G, os.id, { competenciasExigidas: [sv.comp], qtdProfissionais: sv.d.startsWith("Instalação") ? 2 : 1 }));
    return os;
  };
  const osContrato = async (c: Cli, desc: string) => tx((t) => criarOS(t, A, { origem: "contrato", contratoId: c.contrato!, clienteId: c.id, localId: c.locais[0].id, contatoId: c.contatos[0], descricao: desc, equipamentos: c.eqs, demo: true }));

  // ---------------------------------------------------------------- materiais e estoque extra
  const [almox] = await db.select().from(s.materialPosicao).where(and(eq(s.materialPosicao.empresaId, empresaId), eq(s.materialPosicao.tipo, "almoxarifado")));
  const mats = Object.fromEntries((await db.select().from(s.material).where(eq(s.material.empresaId, empresaId))).map((m) => [m.codigo, m]));
  await tx((t) => registrarCompra(t, A, { fornecedorId: forn[0].id, data: somarDias(hoje, -20), documento: "NF 104.552 (fictícia)", itens: [{ materialId: mats["CU-14"].id, quantidade: "60", custoUnitarioCentavos: 2890 }, { materialId: mats["CU-38"].id, quantidade: "60", custoUnitarioCentavos: 4150 }, { materialId: mats["CAP-35"].id, quantidade: "10", custoUnitarioCentavos: 3500 }, { materialId: mats["CABO-PP"].id, quantidade: "100", custoUnitarioCentavos: 690 }], receberAgora: true, gerarObrigacao: true, vencimento: somarDias(hoje, 10) }));
  await tx((t) => registrarCompra(t, A, { fornecedorId: forn[1].id, data: somarDias(hoje, -2), documento: "Pedido 7781 (fictício)", itens: [{ materialId: mats["GAS-410"].id, quantidade: "11.3", custoUnitarioCentavos: 8900 }, { materialId: mats["SUP-500"].id, quantidade: "6", custoUnitarioCentavos: 4500 }], receberAgora: false, gerarObrigacao: true, vencimento: somarDias(hoje, 25) }));

  const usarMaterial = async (osId: string, tec: string, cod: string, entregue: string, consumido: string, devolvido: string | null, conferir = true) => {
    const m = await tx((t) => registrarEntrega(t, A, { materialId: mats[cod].id, quantidade: entregue, origemPosicaoId: almox.id, profissionalId: pid(tec), osId }));
    await tx((t) => confirmarRecebimento(t, T[tec], m.id));
    const c = await tx((t) => informarMovimento(t, T[tec], { tipo: "consumo", materialId: mats[cod].id, quantidade: consumido, osId }));
    const d = devolvido ? await tx((t) => informarMovimento(t, T[tec], { tipo: "devolucao", materialId: mats[cod].id, quantidade: devolvido, osId, retalho: cod.startsWith("CU") })) : null;
    if (conferir) { await tx((t) => conferirMovimento(t, A, c.id, consumido)); if (d) await tx((t) => conferirMovimento(t, A, d.id, devolvido!)); }
  };

  // ---------------------------------------------------------------- OS encerradas (últimos 60 dias) com cobrança e pagamentos
  const [banco] = await db.select().from(s.contaFinanceira).where(and(eq(s.contaFinanceira.empresaId, empresaId), eq(s.contaFinanceira.nome, "Banco Demo")));
  const [caixa] = await db.select().from(s.contaFinanceira).where(and(eq(s.contaFinanceira.empresaId, empresaId), eq(s.contaFinanceira.nome, "Caixa Demo")));
  const encerradas: string[] = [];
  for (let i = 0; i < 18; i++) {
    const c = clientes[i % AVULSOS.length];
    const os = await osAvulsa(c);
    const p = await programar(os.id, somarDias(hoje, -int(5, 58)), 1, undefined, R() > 0.7);
    await executar(p, "concluida");
    if (i % 3 === 0) await usarMaterial(os.id, p.equipe[0], pick(["CU-14", "CU-38"]), "6", String(int(3, 5)), null, true).catch(() => undefined);
    await tx((t) => conferirOS(t, A, os.id));
    encerradas.push(os.id);
    const [it] = await db.select().from(s.osItem).where(eq(s.osItem.osId, os.id));
    const venc = somarDias(p.dia, int(5, 25));
    const ob = await tx((t) => gerarRecebivelOS(t, F.grants.has("os.valores.ver") ? F : G, os.id, { parcelas: [{ vencimento: venc, valorCentavos: it.precoUnitarioCentavos! }] }));
    const [pa] = await db.select().from(s.parcela).where(eq(s.parcela.obrigacaoId, ob.id));
    const sorte = R();
    if (sorte < 0.55 && venc <= hoje) await tx((t) => registrarBaixa(t, G, { parcelaId: pa.id, contaId: R() > 0.3 ? banco.id : caixa.id, valorCentavos: pa.valorCentavos, dataPagamento: venc, forma: pick(["pix", "pix", "dinheiro", "transferencia", "cartao"]) }));
    else if (sorte < 0.75) await tx((t) => registrarBaixa(t, G, { parcelaId: pa.id, contaId: banco.id, valorCentavos: Math.round(pa.valorCentavos * 0.4), dataPagamento: venc < hoje ? venc : hoje, forma: "pix", motivo: "Pagamento parcial combinado" }));
    else if (venc < hoje) {
      await tx((t) => registrarContatoCobranca(t, F, { clienteId: c.id, obrigacaoId: ob.id, canal: pick(["telefone", "whatsapp", "email"]), resumo: pick(["Cliente pediu boleto atualizado", "Prometeu pagar na próxima semana", "Não atendeu — deixado recado", "Aguardando aprovação do financeiro do cliente"]), proximaAcao: "Retornar contato", proximaAcaoEm: somarDias(hoje, int(-3, 4)) }));
      if (R() > 0.5) await tx((t) => definirDataEsperada(t, F, pa.id, somarDias(hoje, int(2, 12)), "Combinado por telefone"));
    }
    // autônomos: valor combinado e conferência
    const linhas = await db.select().from(s.autonomoServico).where(eq(s.autonomoServico.osId, os.id));
    for (const l of linhas) {
      await tx((t) => definirValorAutonomo(t, G, l.id, int(8, 25) * 1000, `Serviço ${l.descricao.toLowerCase()}`));
      if (R() > 0.25) await tx((t) => conferirServicoAutonomo(t, F, l.id));
    }
  }

  // ---------------------------------------------------------------- contratos: visitas incluídas (passadas e futuras) + mensalidades
  for (const [i, c] of contratosCli.entries()) {
    const os = await osContrato(c, "Preventiva mensal programada (contrato)");
    const p = await programar(os.id, somarDias(hoje, -int(3, 25)), 1, i % 2 ? "prop2" : "aut3");
    await executar(p, "concluida");
    await tx((t) => conferirOS(t, A, os.id));
    if (i < 5) { const f = await osContrato(c, "Preventiva do mês seguinte (contrato)"); await programar(f.id, somarDias(hoje, int(2, 12)), 1); }
  }
  for (const m of [-2, -1]) await tx((t) => gerarMensalidades(t, G, somarMeses(primeiroDiaMes(hoje), m)));
  const mens = await db.select({ p: s.parcela }).from(s.parcela).innerJoin(s.obrigacao, eq(s.obrigacao.id, s.parcela.obrigacaoId)).where(and(eq(s.obrigacao.empresaId, empresaId), eq(s.obrigacao.origemTipo, "contrato")));
  for (const { p } of mens) {
    if (p.vencimento > hoje) continue;
    const r = R();
    if (r < 0.65) await tx((t) => registrarBaixa(t, G, { parcelaId: p.id, contaId: banco.id, valorCentavos: p.valorCentavos, dataPagamento: somarDias(p.vencimento, int(0, 3)) > hoje ? hoje : somarDias(p.vencimento, int(0, 3)), forma: "boleto" }));
    else if (r < 0.8) await tx((t) => registrarBaixa(t, G, { parcelaId: p.id, contaId: banco.id, valorCentavos: Math.round(p.valorCentavos / 2), dataPagamento: p.vencimento, forma: "pix", motivo: "Metade paga; restante combinado" }));
  }

  // ---------------------------------------------------------------- serviços concluídos com conferência pendente / retornos / não realizados
  for (let i = 0; i < 4; i++) { const os = await osAvulsa(clientes[(i + 3) % AVULSOS.length]); const p = await programar(os.id, somarDias(hoje, -int(1, 4)), 1); await executar(p, "concluida"); }
  const motivos = ["falta_material", "ausencia_cliente", "falta_acesso", "defeito_adicional", "peca_divergente"];
  for (const [i, mo] of motivos.entries()) {
    const os = await osAvulsa(clientes[(i + 7) % AVULSOS.length], { pr: "alta" });
    const p = await programar(os.id, somarDias(hoje, -int(1, 9)), i === 0 ? 2 : 1);
    await executar(p, i === 1 ? "nao_realizada" : "parcial", mo);
    if (mo === "peca_divergente") await tx((t) => informarMovimento(t, T[p.equipe[0]], { tipo: "segregacao", materialId: mats["CAP-35"].id, quantidade: "1", osId: os.id, observacao: "Capacitor entregue é 25 µF; equipamento pede 35 µF" })).catch(() => undefined);
  }

  // ---------------------------------------------------------------- hoje: atrasada, em atendimento, mais tarde
  const osHoje1 = await osAvulsa(clientes[1], { pr: "urgente", serv: SERVICOS[3] });
  const ph1 = await programar(osHoje1.id, hoje, 1, "aut2");
  const osHoje2 = await osAvulsa(clientes[4], { serv: SERVICOS[0] });
  const ph2 = await programar(osHoje2.id, hoje, 1, "prop1");
  await db.update(s.visita).set({ situacao: "em_atendimento", checkinEm: new Date(Date.now() - 50 * 60000), checkinPor: T[ph2.equipe[0]].usuarioId }).where(eq(s.visita.id, ph2.visita.id));
  await db.insert(s.visitaParticipacao).values({ visitaId: ph2.visita.id, profissionalId: pid(ph2.equipe[0]), chegadaEm: new Date(Date.now() - 50 * 60000), registradoPor: T[ph2.equipe[0]].usuarioId });
  await tx((t) => recalcularEtapa(t, osHoje2.id));
  const osHoje3 = await osAvulsa(clientes[6], { serv: SERVICOS[1] });
  await programar(osHoje3.id, hoje, 2, "aut1", true);
  void ph1;

  // ---------------------------------------------------------------- futuras (próximos 12 dias) e fila
  for (let i = 0; i < 10; i++) {
    const os = await osAvulsa(clientes[(i * 3 + 2) % AVULSOS.length]);
    const p = await programar(os.id, somarDias(hoje, int(1, 12)), R() > 0.7 ? 2 : 1);
    if (i % 4 === 0) await tx((t) => atualizarOS(t, A, os.id, { situacaoMaterial: "pendente", motivoEtapa: "Aguardando chegada do gás R-410A", proximaAcao: "Conferir entrega do fornecedor", proximaAcaoEm: somarDias(hoje, 2), responsavelResolucaoId: A.usuarioId }));
    if (i === 2) await tx((t) => registrarEntrega(t, A, { materialId: mats["CU-38"].id, quantidade: "8", origemPosicaoId: almox.id, profissionalId: pid(p.equipe[0]), osId: os.id }));
  }
  for (let i = 0; i < 4; i++) await osAvulsa(clientes[(i + 11) % AVULSOS.length], { pr: i === 0 ? "urgente" : "normal" });
  await osAvulsa(clientes[14], { aprovar: false, obs: "Orçamento enviado; aguardando aceite do cliente" });
  await osAvulsa(clientes[15], { aprovar: false, obs: "Cliente pediu segunda opção de equipamento" });
  const cancel = await osAvulsa(clientes[13]);
  await tx((t) => cancelarOS(t, A, cancel.id, "Cliente desistiu do serviço"));
  // retorno/garantia vinculado
  const ret = await tx((t) => criarOS(t, A, { origem: "retorno_garantia", osOrigemId: encerradas[2], clienteId: clientes[2].id, localId: clientes[2].locais[0].id, descricao: "Garantia: equipamento voltou a pingar após a instalação", prioridade: "alta", equipamentos: clientes[2].eqs.slice(0, 1), demo: true }));
  await programar(ret.id, somarDias(hoje, 2), 1);

  // ---------------------------------------------------------------- pedidos (Treeunfe simulado — demo)
  for (let i = 0; i < 5; i++) {
    const sv = pick(SERVICOS);
    await tx((t) => ingerirPedido(t, empresaId, "demo", { idExterno: `DEMO-PED-${String(i + 2).padStart(3, "0")}`, versao: "1", atualizadoEm: new Date(Date.now() - i * 3600000).toISOString(), cliente: { nome: `${pick(["Mercearia", "Clínica", "Escritório", "Residência"])} ${pick(["Santa Luzia", "Primavera", "Horizonte", "Bela Vista", "Aurora"])} (fictício)`, telefone: fone() }, endereco: `${pick(RUAS)}, ${int(10, 900)} — ${pick(BAIRROS)}`, itens: [{ descricao: sv.d, quantidade: int(1, 3), valorUnitario: sv.preco }], valorTotal: sv.preco, condicoesPagamento: pick(["À vista no PIX", "50% entrada + 50% em 30 dias", "Boleto 15 dias"]), observacoes: "Pedido FICTÍCIO de demonstração" }));
  }

  // ---------------------------------------------------------------- ferramentas: mais itens e situações
  const nf = async (codigo: string, nome: string, tipo = "ferramenta", exclusiva = false) => { const f = await tx((t) => salvarFerramenta(t, A, null, { codigo, nome, tipo })); if (exclusiva) await db.update(s.ferramenta).set({ exclusiva: true }).where(eq(s.ferramenta.id, f.id)); return f; };
  const entregar = async (f: { id: string }, tec: string) => { const m = await tx((t) => entregarFerramenta(t, A, f.id, { profissionalId: pid(tec) })); await tx((t) => confirmarFerramenta(t, T[tec], m.id)); };
  const kit2 = await nf("KIT-02", "Maleta de manifold 2", "conjunto");
  for (const [c, n] of [["KIT-02-A", "Manifold analógico"], ["KIT-02-B", "Mangueiras (jogo) 2"], ["KIT-02-C", "Termômetro de contato"]]) await tx((t) => salvarFerramenta(t, A, null, { codigo: c, nome: n, tipo: "ferramenta", conjuntoId: kit2.id }));
  await entregar(kit2, "prop2");
  const recolh = await nf("REC-01", "Recolhedora de gás", "ferramenta", true);
  const flang = await nf("FLA-01", "Flangeador excêntrico"); await entregar(flang, "aut2");
  const alicate = await nf("ALI-01", "Alicate amperímetro"); await entregar(alicate, "aut1");
  const escada2 = await nf("ESC-02", "Escada extensível 12 degraus"); await entregar(escada2, "prop1");
  await tx((t) => registrarOcorrenciaFerramenta(t, T.prop1, escada2.id, "deixada_cliente", `Escada ficou no cliente ${clientes[4].nome}; buscar amanhã`));
  const vac2 = await nf("VAC-02", "Vacuômetro digital"); await entregar(vac2, "aut3");
  await tx((t) => registrarOcorrenciaFerramenta(t, T.aut3, vac2.id, "dano", "Visor trincado após queda"));
  const furad2 = await nf("FUR-02", "Furadeira de impacto 2"); await entregar(furad2, "aut2");
  await tx((t) => registrarOcorrenciaFerramenta(t, A, furad2.id, "falta", "Não encontrada no retorno da visita; técnico verificando no carro"));
  const nivel = await nf("NIV-01", "Nível a laser"); await entregar(nivel, "prop2");
  await tx((t) => solicitarDevolucao(t, T.prop2, nivel.id, "boa", "Não vou usar esta semana"));
  const cortador = await nf("COR-01", "Cortador de tubo"); await entregar(cortador, "aut1");
  await tx((t) => transferirFerramenta(t, T.aut1, cortador.id, pid("aut3"), "Emprestado para instalação de amanhã"));
  await nf("BAL-01", "Balança para gás"); await nf("DET-01", "Detector de vazamento eletrônico", "ferramenta", true);
  void recolh;

  // ---------------------------------------------------------------- materiais: pendências de conferência, divergência, contagem
  const osMat = encerradas[5];
  const m1 = await tx((t) => registrarEntrega(t, A, { materialId: mats["CU-14"].id, quantidade: "10", origemPosicaoId: almox.id, profissionalId: pid("aut1"), osId: osMat }));
  await tx((t) => confirmarRecebimento(t, T.aut1, m1.id));
  const cc = await tx((t) => informarMovimento(t, T.aut1, { tipo: "consumo", materialId: mats["CU-14"].id, quantidade: "7", osId: osMat }));
  const dv = await tx((t) => informarMovimento(t, T.aut1, { tipo: "devolucao", materialId: mats["CU-14"].id, quantidade: "3", osId: osMat, retalho: true }));
  await tx((t) => conferirMovimento(t, A, cc.id, "7"));
  await tx((t) => conferirMovimento(t, A, dv.id, "1")); // devolveu 1 de 3 → 2 m a localizar
  const m2 = await tx((t) => registrarEntrega(t, A, { materialId: mats["CABO-PP"].id, quantidade: "15", origemPosicaoId: almox.id, profissionalId: pid("prop2") }));
  await tx((t) => confirmarRecebimento(t, T.prop2, m2.id));
  await tx((t) => informarMovimento(t, T.prop2, { tipo: "consumo", materialId: mats["CABO-PP"].id, quantidade: "9", osId: encerradas[7] }));
  await tx((t) => informarMovimento(t, T.prop2, { tipo: "perda", materialId: mats["CABO-PP"].id, quantidade: "2", observacao: "Cabo danificado ao passar pela parede", osId: encerradas[7] }));
  await tx((t) => registrarContagem(t, A, { materialId: mats["SUP-500"].id, posicaoId: almox.id, quantidadeContada: "7", observacao: "Contagem mensal" }));

  // ---------------------------------------------------------------- veículos: checklists, irregularidades, manutenção
  const chk = async (veic: typeof veics[number], prof: string, dias: number, irregular: string | null) => {
    const [mod] = await db.select().from(s.checklistModelo).where(and(eq(s.checklistModelo.empresaId, empresaId), eq(s.checklistModelo.tipo, "veiculo_saida"), eq(s.checklistModelo.ativo, true)));
    const itens = await db.select().from(s.checklistModeloItem).where(eq(s.checklistModeloItem.modeloId, mod.id));
    const quando = new Date(Date.now() - dias * 86400000 - 3 * 3600000);
    const [r] = await db.insert(s.checklistResposta).values({ empresaId, modeloId: mod.id, tipo: "veiculo_saida", veiculoId: veic.id, profissionalId: pid(prof), usuarioId: T[prof].usuarioId, km: (veic.odometroKm ?? 40000) - dias * 60, modeloVersao: mod.versao, realizadoEm: quando, validoAte: new Date(quando.getTime() + 12 * 3600000) }).returning();
    for (const it of itens) await db.insert(s.checklistRespostaItem).values({ respostaId: r.id, itemId: it.id, descricao: it.descricao, criticidade: it.criticidade, exigeFotoIrregular: it.exigeFotoIrregular, resultado: irregular && it.descricao.startsWith(irregular) ? "irregular" : "conforme", observacao: irregular && it.descricao.startsWith(irregular) ? "Observado no checklist" : null });
  };
  for (let d = 1; d <= 6; d++) { await chk(veics[0], "prop1", d, d === 3 ? "Luzes" : null); await chk(veics[1], "prop2", d, null); }
  await chk(veics[1], "prop2", 0, null); // prop2 fez hoje; prop1 não (aparece como faltante)
  const irr = async (v: typeof veics[number], titulo: string, prioridade: string, prazo: number, resp: string | null, terceiro?: string) => {
    const p = await tx((t) => garantirPendencia(t, A, { tipo: "veiculo_irregularidade", titulo: `${v.identificacao}: ${titulo}`, descricao: titulo, veiculoId: v.id, prioridade, prazo: somarDias(hoje, prazo), entidadeTipo: "veiculo", entidadeId: v.id, chave: `seed-veic:${v.id}:${titulo}` }));
    if (resp) await tx((t) => atribuirPendencia(t, G, p.id, { responsavelId: resp, prazo: somarDias(hoje, prazo), prioridade, proximaAcao: "Levar à oficina", aguardandoTerceiro: terceiro ?? null }));
  };
  await irr(veics[0], "Pneu dianteiro esquerdo com desgaste irregular", "alta", -2, A.usuarioId);
  await irr(veics[0], "Lanterna traseira direita queimada", "media", 3, A.usuarioId);
  await irr(veics[3], "Barulho no freio ao frear", "critica", 0, G.usuarioId, "Oficina Auto Peças Estrada — aguardando peça");
  await irr(veics[2], "Amassado na porta lateral", "baixa", 15, null);
  await tx((t) => registrarManutencao(t, G, { veiculoId: veics[3].id, tipo: "oleo", data: somarDias(hoje, -200), km: 30000, descricao: "Troca de óleo e filtro" }));
  await tx((t) => registrarManutencao(t, G, { veiculoId: veics[2].id, tipo: "alinhamento", data: somarDias(hoje, -40), km: 61000, descricao: "Alinhamento e balanceamento", fornecedorId: forn[2].id, valorCentavos: 16000, vencimento: somarDias(hoje, -10) }));

  // ---------------------------------------------------------------- financeiro: despesas, aprovações, exceção, restritas, transferências
  const cat = async (c: string) => (await db.select().from(s.categoriaFinanceira).where(and(eq(s.categoriaFinanceira.empresaId, empresaId), eq(s.categoriaFinanceira.codigo, c))))[0].id;
  const pagar = async (ctx: Ctx, codigo: string, descricao: string, valor: number, venc: number, beneficiario: string, opts: { pagar?: boolean; aprovar?: boolean; fornecedorId?: string } = {}) => {
    const ob = await tx(async (t) => criarObrigacao(t, ctx, { natureza: "pagar", categoriaId: await cat(codigo), descricao, beneficiarioNome: beneficiario, fornecedorId: opts.fornecedorId ?? null, valorBrutoCentavos: valor, origemTipo: "manual", competencia: primeiroDiaMes(somarDias(hoje, venc)), parcelas: [{ vencimento: somarDias(hoje, venc), valorCentavos: valor }] }));
    if (opts.aprovar && ob.situacaoAprovacao !== "aprovada") await tx((t) => decidirObrigacao(t, G, ob.id, true));
    if (opts.pagar) { const [pa] = await db.select().from(s.parcela).where(eq(s.parcela.obrigacaoId, ob.id)); await tx((t) => registrarBaixa(t, G, { parcelaId: pa.id, contaId: banco.id, valorCentavos: valor, dataPagamento: somarDias(hoje, Math.min(venc, 0)), forma: "transferencia" })); }
    return ob;
  };
  for (const m of [-2, -1, 0]) {
    await pagar(G, "administrativa", `Aluguel do galpão — ${somarMeses(hoje, m).slice(5, 7)}/${somarMeses(hoje, m).slice(0, 4)}`, 320000, m * 30 + 5, "Imobiliária (fictícia)", { pagar: m < 0 });
    await pagar(G, "salarios", `Folha equipe própria — ${somarMeses(hoje, m).slice(5, 7)}/${somarMeses(hoje, m).slice(0, 4)}`, 980000, m * 30 + 5, "Equipe própria", { pagar: m < 0 });
    await pagar(G, "veiculo", `Combustível frota — ${somarMeses(hoje, m).slice(5, 7)}/${somarMeses(hoje, m).slice(0, 4)}`, int(180, 260) * 1000, m * 30 + 10, "Posto Rota Sul (fictício)", { pagar: m < 0, fornecedorId: forn[3].id });
  }
  await pagar(G, "retirada_socios", "Retirada dos sócios — mês anterior", 800000, -8, "Sócios", { pagar: true });
  await pagar(F, "administrativa", "Internet e telefonia", 34990, 3, "Operadora (fictícia)");
  await pagar(F, "ferramenta", "Compra de bomba de vácuo reserva", 289000, 6, "Refrigeração Polo Frio (fictício)", { fornecedorId: forn[0].id });
  await pagar(F, "uber_ferramenta", "Uber para levar escada esquecida", 4250, -6, "Transporte por aplicativo", { aprovar: true, pagar: true });
  await pagar(F, "uber_ferramenta", "Uber para levar manifold esquecido", 3790, -15, "Transporte por aplicativo", { aprovar: true, pagar: true });
  await pagar(F, "impostos_taxas", "DAS / impostos do mês (pagamento)", 154000, 7, "Receita (fictícia)", { aprovar: true });
  await pagar(F, "administrativa", "Contador — honorários", 85000, -3, "Escritório contábil (fictício)", { aprovar: true });
  // exceção: pago antes de aprovar (com comprovante simulado)
  const exc = await pagar(F, "material", "Compra urgente de capacitor no balcão", 12800, 0, "Loja de peças (fictícia)");
  const [pe] = await db.select().from(s.parcela).where(eq(s.parcela.obrigacaoId, exc.id));
  await db.insert(s.baixa).values({ empresaId, parcelaId: pe.id, contaId: caixa.id, valorCentavos: 12800, dataPagamento: hoje, forma: "dinheiro", status: "confirmada", registradaPor: F.usuarioId, confirmadaPor: F.usuarioId, confirmadaEm: new Date(), autoconfirmacao: true, excecaoSemAprovacao: true, motivo: "Técnico precisava da peça na hora; comprovante anexado" });
  await tx((t) => registrarTransferencia(t, G, { origemContaId: banco.id, destinoContaId: caixa.id, valorCentavos: 150000, data: somarDias(hoje, -12), descricao: "Reforço do caixa para despesas pequenas" }));
  // dupla aprovação configurada para ferramentas acima de R$ 2.000 (exemplo — política a definir pelos donos)
  await db.update(s.categoriaFinanceira).set({ duplaAprovacaoAcimaCentavos: 200000 }).where(and(eq(s.categoriaFinanceira.empresaId, empresaId), eq(s.categoriaFinanceira.codigo, "ferramenta")));
  void G2;

  // ---------------------------------------------------------------- autônomos: adiantamento, resumo liberado e pago
  await tx((t) => registrarAdiantamento(t, F, { profissionalId: pid("aut1"), valorCentavos: 15000, data: somarDias(hoje, -9), descricao: "Adiantamento combustível" }));
  for (const k of ["aut1", "aut2", "aut3"]) {
    try {
      const r = await tx((t) => prepararResumoSemanal(t, F, pid(k), somarDias(hoje, -7)));
      if (k !== "aut3") {
        await tx((t) => liberarResumo(t, G, r.id));
        const [rr] = await db.select().from(s.resumoSemanalAutonomo).where(eq(s.resumoSemanalAutonomo.id, r.id));
        if (k === "aut1" && rr.obrigacaoId) { const [pa] = await db.select().from(s.parcela).where(eq(s.parcela.obrigacaoId, rr.obrigacaoId)); await tx((t) => registrarBaixa(t, G, { parcelaId: pa.id, contaId: banco.id, valorCentavos: pa.valorCentavos, dataPagamento: hoje, forma: "pix" })); }
      }
    } catch (e) { console.log(`(resumo ${k}: ${(e as Error).message})`); }
  }

  // ---------------------------------------------------------------- pendências gerais (central do gestor)
  const pg = async (tipo: string, titulo: string, prioridade: string, prazo: number | null, resp: string | null, extra: { proximaAcao?: string; terceiro?: string; osId?: string } = {}) => {
    const p = await tx((t) => garantirPendencia(t, A, { tipo, titulo, descricao: titulo, prioridade, prazo: prazo === null ? null : somarDias(hoje, prazo), osId: extra.osId ?? null, chave: `seed:${titulo}` }));
    if (resp || extra.proximaAcao || extra.terceiro) await tx((t) => atribuirPendencia(t, G, p.id, { responsavelId: resp, prazo: prazo === null ? null : somarDias(hoje, prazo), prioridade, proximaAcao: extra.proximaAcao ?? null, aguardandoTerceiro: extra.terceiro ?? null }));
  };
  await pg("material_necessario", "Repor estoque de suporte 500 mm", "media", 1, A.usuarioId, { proximaAcao: "Cotar com 2 fornecedores" });
  await pg("outro", "Cliente pediu visita técnica para orçamento de VRF", "alta", 0, G.usuarioId, { proximaAcao: "Ligar e agendar visita" });
  await pg("outro", "Retorno do fornecedor sobre garantia de compressor", "media", 4, A.usuarioId, { terceiro: "Distribuidora Ar & Cia — análise do compressor" });
  await pg("outro", "Atualizar cadastro de equipamentos do Hotel Recanto Azul", "baixa", 6, null);
  await pg("outro", "Definir política de delegação financeira (donos)", "alta", -1, G.usuarioId, { proximaAcao: "Reunião dos sócios" });

  // ---------------------------------------------------------------- relatórios de atendimento emitidos
  for (const [i, osId] of encerradas.slice(0, 3).entries()) {
    try { const r = await tx((t) => emitirRelatorio(t, A, { osId, anexosIds: [] })); if (i < 2) await tx((t) => registrarCiencia(t, A, r.id, i === 0 ? { situacao: "registrada", nome: pick(NOMES_CONTATO), observacao: "Serviço acompanhado no local" } : { situacao: "ausente", observacao: "Responsável não estava; recepcionista acompanhou" })); } catch (e) { console.log(`(relatório: ${(e as Error).message})`); }
  }

  await db.update(s.empresa).set({ config: sql`jsonb_set(coalesce(${s.empresa.config}, '{}'::jsonb), '{demo}', '{"massa": 1}'::jsonb)` }).where(eq(s.empresa.id, empresaId));
  const [{ n: nOs }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.ordemServico).where(eq(s.ordemServico.empresaId, empresaId));
  const [{ n: nCli }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.cliente).where(eq(s.cliente.empresaId, empresaId));
  const [{ n: nVis }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.visita).where(eq(s.visita.empresaId, empresaId));
  console.log(`Massa de teste carregada: ${nCli} clientes, ${nOs} OS, ${nVis} visitas.`);
}
