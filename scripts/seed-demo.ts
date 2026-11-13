/**
 * Dados de DEMONSTRAÇÃO (fictícios). Bloqueado quando APP_ENV=production.
 * Contas demo têm usuario.demo = true e são recusadas no login/sessão em produção.
 * Uso: npm run db:seed-demo
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { and, eq } from "drizzle-orm";
import * as s from "../src/server/db/schema";
import { garantirEstrutura } from "../src/server/services/estrutura";
import { carregarCtx, type Ctx } from "../src/server/auth/contexto";
import { hashSenha } from "../src/server/auth/senha";
import { criarOS, aprovarComercialmente, conferirOS } from "../src/server/services/os";
import { criarVisita } from "../src/server/services/agenda";
import { checkin, salvarExecucao, checkout } from "../src/server/services/execucao";
import { salvarContrato } from "../src/server/services/cadastros";
import { salvarMaterial, registrarEntrega, confirmarRecebimento, informarMovimento, conferirMovimento } from "../src/server/services/materiais";
import { registrarEstoqueInicial, definirDataCorte } from "../src/server/services/implantacao";
import { salvarFerramenta, entregarFerramenta, confirmarFerramenta } from "../src/server/services/ferramentas";
import { gerarMensalidades, gerarRecebivelOS, registrarBaixa, criarObrigacao, definirSaldoInicial } from "../src/server/services/financeiro";
import { definirValorAutonomo } from "../src/server/services/autonomos";
import { ingerirPedido } from "../src/server/services/pedidos";
import { hojeSP, instanteSP, somarDias } from "../src/lib/datas";
import { popularMassa } from "./seed-massa";

if (process.env.APP_ENV === "production") { console.error("Seed de demonstração bloqueado em produção."); process.exit(1); }
const SENHA = process.env.DEMO_SENHA ?? "Demo-thermo-2026";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema: s });
type T = Parameters<Parameters<typeof db.transaction>[0]>[0];
const tx = <R>(fn: (t: T) => Promise<R>) => db.transaction(fn);

async function main() {
  const [ja] = await db.select().from(s.empresa).where(eq(s.empresa.nome, "Thermobrás (DEMONSTRAÇÃO)"));
  if (ja) { console.log("Demonstração base já existe."); await popularMassa(db, ja.id); await renomearDemonstrativo(); await pool.end(); return; }
  const [emp] = await db.insert(s.empresa).values({ nome: "Thermobrás (DEMONSTRAÇÃO)", config: { financeiro: { politicaDelegacaoDefinida: false } } }).returning();
  await tx((t) => garantirEstrutura(t, emp.id));
  const hash = await hashSenha(SENHA);
  const papelId = async (c: string) => (await db.select().from(s.papel).where(and(eq(s.papel.empresaId, emp.id), eq(s.papel.codigo, c))))[0].id;
  async function user(nome: string, email: string, papeis: string[], prof?: { vinculo: "autonomo" | "proprio"; funcao?: string; competencias?: string[]; regioes?: string[] }) {
    const [u] = await db.insert(s.usuario).values({ empresaId: emp.id, nome, email, senhaHash: hash, demo: true }).returning();
    for (const p of papeis) await db.insert(s.usuarioPapel).values({ usuarioId: u.id, papelId: await papelId(p) });
    let pid: string | null = null;
    if (prof) {
      const [p] = await db.insert(s.profissional).values({ empresaId: emp.id, nome, vinculo: prof.vinculo, funcao: prof.funcao ?? "tecnico", usuarioId: u.id, competencias: prof.competencias ?? [], regioes: prof.regioes ?? [] }).returning();
      await db.insert(s.materialPosicao).values({ empresaId: emp.id, tipo: "profissional", nome: `Custódia — ${nome}`, profissionalId: p.id });
      pid = p.id;
    }
    return { u, pid, ctx: async () => (await carregarCtx(db, u.id)) as Ctx };
  }
  const gestor = await user("Gestor Demo (sócio 1)", "gestor@demo.thermobras.local", ["gestor"]);
  await user("Gestor Demo (sócio 2)", "socio@demo.thermobras.local", ["gestor"]);
  const admin = await user("Administrativo Demo", "admin@demo.thermobras.local", ["administrativo"], { vinculo: "proprio", funcao: "administrativo" });
  const fin = await user("Financeiro Demo", "financeiro@demo.thermobras.local", ["financeiro_operador"]);
  const aut1 = await user("Técnico Autônomo A (demo)", "autonomo.a@demo.thermobras.local", ["tecnico"], { vinculo: "autonomo", competencias: ["split", "cassete", "limpeza"], regioes: ["centro"] });
  const aut2 = await user("Técnico Autônomo B (demo)", "autonomo.b@demo.thermobras.local", ["tecnico"], { vinculo: "autonomo", competencias: ["split", "vrf"] });
  const aut3 = await user("Técnico Autônomo C (demo)", "autonomo.c@demo.thermobras.local", ["tecnico"], { vinculo: "autonomo" });
  const prop1 = await user("Técnico Próprio 1 (demo)", "proprio1@demo.thermobras.local", ["tecnico"], { vinculo: "proprio", competencias: ["split", "limpeza", "eletrica"], regioes: ["centro", "jardim américa"] });
  const prop2 = await user("Técnico Próprio 2 (demo)", "proprio2@demo.thermobras.local", ["tecnico"], { vinculo: "proprio", competencias: ["split", "cassete"] });
  const [ajud] = await db.insert(s.profissional).values({ empresaId: emp.id, nome: "Ajudante Próprio (demo, sem login)", vinculo: "proprio", funcao: "ajudante" }).returning();
  const G = await gestor.ctx(), A = await admin.ctx(), F = await fin.ctx();

  // veículos (sem placas reais)
  const veics: Array<typeof s.veiculo.$inferSelect> = [];
  for (let i = 1; i <= 5; i++) {
    const [v] = await db.insert(s.veiculo).values({ empresaId: emp.id, identificacao: `DEMO-0${i}`, modelo: ["Fiorino", "Saveiro", "Strada", "Kangoo", "Doblò"][i - 1], demo: true, odometroKm: 40000 + i * 7300, odometroAtualizadoEm: new Date(),
      parametrosManutencao: i <= 3 ? { oleo: { km: 10000, dias: 180 }, alinhamento: { km: 10000, dias: 365 }, rodizio: { km: 10000, dias: null } } : {} }).returning();
    veics.push(v);
  }
  await db.update(s.profissional).set({ veiculoId: veics[0].id }).where(eq(s.profissional.id, prop1.pid!));
  await db.insert(s.veiculoManutencao).values([
    { veiculoId: veics[0].id, tipo: "oleo", data: somarDias(hojeSP(), -170), km: 37500, registradoPor: gestor.u.id },
    { veiculoId: veics[1].id, tipo: "oleo", data: somarDias(hojeSP(), -60), km: 48000, registradoPor: gestor.u.id },
  ]);
  await db.insert(s.pneu).values([
    { empresaId: emp.id, veiculoId: veics[0].id, identificacao: "PN-DEMO-001", posicao: "DE", instaladoEm: somarDias(hojeSP(), -400), kmInstalacao: 22000 },
    { empresaId: emp.id, veiculoId: null, identificacao: "PN-DEMO-002", posicao: "DD", instaladoEm: somarDias(hojeSP(), -500), kmInstalacao: 15000, retiradoEm: somarDias(hojeSP(), -30), kmRetirada: 44000, motivoRetirada: "Desgaste irregular (lateral)", situacao: "retirado" },
  ]);

  // clientes
  const mkCli = async (nome: string, bairro: string, tel: string) => {
    const [c] = await db.insert(s.cliente).values({ empresaId: emp.id, nome, tipo: "PJ", telefone: tel, demo: true }).returning();
    const [l] = await db.insert(s.clienteLocal).values({ clienteId: c.id, nome: "Unidade principal", logradouro: "Rua Exemplo", numero: String(100 + nome.length), bairro, cidade: "Cidade Demo", uf: "SP" }).returning();
    const [ct] = await db.insert(s.clienteContato).values({ clienteId: c.id, nome: "Contato Demo", telefone: tel, principal: true }).returning();
    const e1 = (await db.insert(s.equipamento).values({ clienteId: c.id, localId: l.id, tipo: "split", marca: "Marca X", modelo: "12.000 BTU", capacidadeBtu: 12000, identificacao: "Sala 1" }).returning())[0];
    const e2 = (await db.insert(s.equipamento).values({ clienteId: c.id, localId: l.id, tipo: "cassete", marca: "Marca Y", modelo: "36.000 BTU", capacidadeBtu: 36000, identificacao: "Recepção" }).returning())[0];
    return { c, l, ct, e1, e2 };
  };
  const c1 = await mkCli("Clínica Exemplo (demo)", "Centro", "(00) 0000-0001");
  const c2 = await mkCli("Escritório Fictício (demo)", "Jardim América", "(00) 0000-0002");
  const c3 = await mkCli("Mercado Modelo (demo — contrato)", "Centro", "(00) 0000-0003");
  const c4 = await mkCli("Condomínio Teste (demo — contrato)", "Vila Nova", "(00) 0000-0004");
  const k1 = await tx((t) => salvarContrato(t, G, null, { clienteId: c3.c.id, numero: "CT-DEMO-01", descricao: "Manutenção preventiva mensal", cobertura: "Limpeza e verificação de 2 equipamentos/mês", valorMensalCentavos: 45000, inicio: somarDias(hojeSP(), -120), diaVencimento: 10, visitasIncluidasMes: 1, status: "ativo" }));
  await tx((t) => salvarContrato(t, G, null, { clienteId: c4.c.id, numero: "CT-DEMO-02", descricao: "PMOC", cobertura: "Plano de manutenção", valorMensalCentavos: 120000, inicio: somarDias(hojeSP(), -60), diaVencimento: 5, visitasIncluidasMes: 2, status: "ativo" }));

  // implantação
  await tx((t) => definirDataCorte(t, G, somarDias(hojeSP(), -90)));
  const [banco] = await db.insert(s.contaFinanceira).values({ empresaId: emp.id, nome: "Banco Demo" }).returning();
  const [caixa] = await db.insert(s.contaFinanceira).values({ empresaId: emp.id, nome: "Caixa Demo" }).returning();
  await tx((t) => definirSaldoInicial(t, G, banco.id, 1500000, somarDias(hojeSP(), -90), "Implantação (demo)"));
  await tx((t) => definirSaldoInicial(t, G, caixa.id, 50000, somarDias(hojeSP(), -90), "Implantação (demo)"));

  // materiais e estoque inicial
  const [almox] = await db.select().from(s.materialPosicao).where(and(eq(s.materialPosicao.empresaId, emp.id), eq(s.materialPosicao.tipo, "almoxarifado")));
  const mats: Record<string, string> = {};
  for (const [codigo, nome, espec, un, ret, q] of [["CU-14", "Tubo de cobre", "1/4\" (6,35 mm) — flexível", "m", true, "60"], ["CU-38", "Tubo de cobre", "3/8\" (9,52 mm) — flexível", "m", true, "45"], ["CU-12", "Tubo de cobre", "1/2\" (12,7 mm) — flexível", "m", true, "20"], ["GAS-410", "Gás refrigerante R-410A", "Cilindro", "kg", false, "11.3"], ["CABO-PP", "Cabo PP 4x1,5 mm²", "", "m", false, "100"], ["SUP-500", "Suporte para condensadora", "500 mm", "un", false, "8"], ["CAP-35", "Capacitor 35 µF", "", "un", false, "3"]] as const) {
    const m = await tx((t) => salvarMaterial(t, A, null, { codigo, nome, especificacao: espec || null, unidade: un, controlaRetalho: ret, estoqueMinimo: un === "un" ? "2" : "10" }));
    mats[codigo] = m.id;
    await tx((t) => registrarEstoqueInicial(t, A, { materialId: m.id, posicaoId: almox.id, quantidade: q }));
  }
  // ferramentas
  const kit = await tx((t) => salvarFerramenta(t, A, null, { codigo: "KIT-01", nome: "Maleta de manifold", tipo: "conjunto" }));
  await tx((t) => salvarFerramenta(t, A, null, { codigo: "KIT-01-A", nome: "Manifold digital", tipo: "ferramenta", conjuntoId: kit.id }));
  await tx((t) => salvarFerramenta(t, A, null, { codigo: "KIT-01-B", nome: "Mangueiras (jogo)", tipo: "ferramenta", conjuntoId: kit.id }));
  const bomba = await tx((t) => salvarFerramenta(t, A, null, { codigo: "BV-01", nome: "Bomba de vácuo", tipo: "ferramenta" }));
  await db.update(s.ferramenta).set({ exclusiva: true }).where(eq(s.ferramenta.id, bomba.id));
  await tx((t) => salvarFerramenta(t, A, null, { codigo: "VAC-01", nome: "Vacuômetro", tipo: "ferramenta" }));
  await tx((t) => salvarFerramenta(t, A, null, { codigo: "ESC-01", nome: "Escada 7 degraus", tipo: "ferramenta" }));
  const furad = await tx((t) => salvarFerramenta(t, A, null, { codigo: "FUR-01", nome: "Furadeira de impacto", tipo: "ferramenta" }));
  const m1 = await tx((t) => entregarFerramenta(t, A, kit.id, { profissionalId: prop1.pid! }));
  await tx(async (t) => confirmarFerramenta(t, await prop1.ctx(), m1.id));
  await tx((t) => entregarFerramenta(t, A, furad.id, { profissionalId: aut1.pid! }));

  // OS 1: avulsa, equipe mista, 2 visitas (1ª parcial), cobrança 550 com 200 recebidos
  const amanha = somarDias(hojeSP(), 1);
  const os1 = await tx((t) => criarOS(t, G, { origem: "avulso", clienteId: c1.c.id, localId: c1.l.id, contatoId: c1.ct.id, descricao: "Instalação de split 12.000 BTU na sala 1 (demo)", equipamentos: [c1.e1.id], prioridade: "alta",
    itens: [{ tipo: "servico", descricao: "Instalação split até 12.000 BTU", quantidade: "1", unidade: "un", precoUnitarioCentavos: 55000 }, { tipo: "material", descricao: "Tubo de cobre 1/4\" (incluso no preço da instalação)", materialId: mats["CU-14"], quantidade: "10", unidade: "m", precoUnitarioCentavos: 0 }], demo: true }));
  await db.update(s.ordemServico).set({ competenciasExigidas: ["split"], qtdProfissionais: 2 }).where(eq(s.ordemServico.id, os1.id));
  await tx((t) => aprovarComercialmente(t, A, os1.id));
  const v1 = await tx((t) => criarVisita(t, A, os1.id, { inicio: instanteSP(hojeSP(), "08:00"), fim: instanteSP(hojeSP(), "12:00"), equipe: { profissionalIds: [prop1.pid!, aut1.pid!, ajud.id], responsavelId: prop1.pid! } }));
  const ent = await tx((t) => registrarEntrega(t, A, { materialId: mats["CU-14"], quantidade: "10", origemPosicaoId: almox.id, profissionalId: prop1.pid!, osId: os1.id }));
  const P1 = await prop1.ctx();
  await tx((t) => confirmarRecebimento(t, P1, ent.id));
  await tx((t) => checkin(t, P1, v1.id));
  await tx((t) => salvarExecucao(t, P1, v1.id, { equipamentoId: c1.e1.id, diagnostico: "Ponto elétrico ausente", servicoRealizado: "Fixação de evaporadora e passagem de tubulação", testeFuncionamento: "nao_testado", resultado: "parcial" }));
  await tx((t) => checkout(t, P1, v1.id, { resultado: "parcial", motivo: "defeito_adicional", pendenciaDescricao: "Falta ponto elétrico dedicado (responsabilidade do cliente).", proximaAcao: "Retornar após o cliente instalar o ponto elétrico" }));
  const c7 = await tx((t) => informarMovimento(t, P1, { tipo: "consumo", materialId: mats["CU-14"], quantidade: "7", osId: os1.id }));
  await tx((t) => informarMovimento(t, P1, { tipo: "devolucao", materialId: mats["CU-14"], quantidade: "3", osId: os1.id, retalho: true }));
  await tx((t) => conferirMovimento(t, A, c7.id, "7"));
  await tx((t) => criarVisita(t, A, os1.id, { inicio: instanteSP(amanha, "13:00"), fim: instanteSP(amanha, "15:00"), equipe: { profissionalIds: [prop1.pid!, aut1.pid!], responsavelId: prop1.pid! } }));
  const ob1 = await tx((t) => gerarRecebivelOS(t, G, os1.id, { parcelas: [{ vencimento: somarDias(hojeSP(), -5), valorCentavos: 55000 }] }));
  const [p1] = await db.select().from(s.parcela).where(eq(s.parcela.obrigacaoId, ob1.id));
  await tx((t) => registrarBaixa(t, G, { parcelaId: p1.id, contaId: banco.id, valorCentavos: 20000, dataPagamento: somarDias(hojeSP(), -3), forma: "pix" }));

  // OS 2: contrato — concluída e conferida, autônomo com valor
  const os2 = await tx((t) => criarOS(t, A, { origem: "contrato", contratoId: k1.id, clienteId: c3.c.id, localId: c3.l.id, descricao: "Preventiva mensal (demo)", equipamentos: [c3.e1.id], demo: true }));
  const v2 = await tx((t) => criarVisita(t, A, os2.id, { inicio: instanteSP(somarDias(hojeSP(), -2), "09:00"), fim: instanteSP(somarDias(hojeSP(), -2), "11:00"), equipe: { profissionalIds: [aut2.pid!] } }));
  // visita passada: registro direto do resultado (demonstração)
  await db.update(s.visita).set({ situacao: "finalizada", resultado: "concluida", checkinEm: instanteSP(somarDias(hojeSP(), -2), "09:10"), checkoutEm: instanteSP(somarDias(hojeSP(), -2), "10:40"), checkinPor: gestor.u.id, checkoutPor: gestor.u.id }).where(eq(s.visita.id, v2.id));
  await db.insert(s.visitaExecucao).values({ visitaId: v2.id, equipamentoId: c3.e1.id, diagnostico: "Filtros saturados", servicoRealizado: "Limpeza de filtros e serpentina", testeFuncionamento: "ok", resultado: "concluido" });
  await db.update(s.ordemServico).set({ etapa: "servico_concluido", situacaoConferencia: "pendente" }).where(eq(s.ordemServico.id, os2.id));
  await tx((t) => conferirOS(t, A, os2.id));
  const [sv] = await db.select().from(s.autonomoServico).where(eq(s.autonomoServico.osId, os2.id));
  await tx((t) => definirValorAutonomo(t, G, sv.id, 18000, "Preventiva mensal — por visita"));
  await tx((t) => gerarMensalidades(t, G, hojeSP()));

  // OS 3: sem equipe (fila); OS 4: retorno/garantia
  await tx((t) => criarOS(t, A, { origem: "avulso", clienteId: c2.c.id, localId: c2.l.id, descricao: "Equipamento não gela (demo)", equipamentos: [c2.e2.id], prioridade: "urgente", demo: true }));
  // pedido demo aguardando programação
  await tx((t) => ingerirPedido(t, emp.id, "demo", { idExterno: "DEMO-PED-001", versao: "1", cliente: { nome: "Cliente de pedido (demo)", telefone: "(00) 0000-0009" }, itens: [{ descricao: "Higienização de 3 splits", quantidade: 3, valorUnitario: 18000 }], valorTotal: 54000, condicoesPagamento: "50% entrada + 50% em 30 dias", observacoes: "Pedido FICTÍCIO de demonstração" }));

  // contas a pagar
  const cat = async (c: string) => (await db.select().from(s.categoriaFinanceira).where(and(eq(s.categoriaFinanceira.empresaId, emp.id), eq(s.categoriaFinanceira.codigo, c))))[0].id;
  await tx(async (t) => criarObrigacao(t, F, { natureza: "pagar", categoriaId: await cat("material"), beneficiarioNome: "Fornecedor demo", descricao: "Compra de gás (demo)", valorBrutoCentavos: 89000, origemTipo: "manual", parcelas: [{ vencimento: hojeSP(), valorCentavos: 89000 }] }));
  await tx(async (t) => criarObrigacao(t, G, { natureza: "pagar", categoriaId: await cat("veiculo"), beneficiarioNome: "Oficina demo", veiculoId: veics[0].id, descricao: "Alinhamento DEMO-01", valorBrutoCentavos: 18000, origemTipo: "manual", parcelas: [{ vencimento: somarDias(hojeSP(), 4), valorCentavos: 18000 }] }));
  await tx(async (t) => criarObrigacao(t, G, { natureza: "pagar", categoriaId: await cat("uber_ferramenta"), beneficiarioNome: "Transporte por aplicativo", descricao: "Uber para levar escada esquecida (demo)", valorBrutoCentavos: 3800, origemTipo: "manual", parcelas: [{ vencimento: somarDias(hojeSP(), -10), valorCentavos: 3800 }] }));

  console.log("\nDemonstração criada (dados FICTÍCIOS). Senha de todas as contas demo:", SENHA);
  for (const e of ["gestor", "socio", "admin", "financeiro", "autonomo.a", "autonomo.b", "autonomo.c", "proprio1", "proprio2"]) console.log(`  ${e}@demo.thermobras.local`);
  void aut3; void prop2; void caixa;
  await popularMassa(db, emp.id);
  await renomearDemonstrativo();
  await pool.end();
}

/** Troca "demo"/"Demo"/"DEMO-" por "demonstrativo" nos textos exibidos dos dados fictícios (idempotente; não toca e-mails, códigos ou chaves). */
async function renomearDemonstrativo() {
  const pular = new Set(["email", "acao", "origem", "provedor", "codigo", "tipo", "situacao", "entidade_tipo", "senha_hash", "token_hash", "chave", "chave_unicidade"]);
  const { rows } = await pool.query(`select table_name, column_name from information_schema.columns where table_schema = 'public' and data_type in ('text','character varying')`);
  let n = 0;
  for (const r of rows as Array<{ table_name: string; column_name: string }>) {
    if (pular.has(r.column_name) || r.column_name.startsWith("chave") || r.table_name.startsWith("__")) continue;
    const t = `"${r.table_name}"`, c = `"${r.column_name}"`;
    const res = await pool.query(`update ${t} set ${c} = regexp_replace(regexp_replace(regexp_replace(${c}, '\\mDEMO-', 'DEMONSTRATIVO-', 'g'), '\\mDemo\\M', 'Demonstrativo', 'g'), '\\mdemo\\M', 'demonstrativo', 'g') where ${c} ~ '\\m(DEMO-|Demo\\M|demo\\M)' and ${c} !~ '@demo\\.'`);
    n += res.rowCount ?? 0;
  }
  const js = await pool.query(`select table_name, column_name from information_schema.columns where table_schema = 'public' and data_type = 'jsonb'`);
  for (const r of js.rows as Array<{ table_name: string; column_name: string }>) {
    const t = `"${r.table_name}"`, c = `"${r.column_name}"`;
    const res = await pool.query(`update ${t} set ${c} = regexp_replace(regexp_replace(${c}::text, '\\(demo\\)', '(demonstrativo)', 'g'), '\\mDemo\\M', 'Demonstrativo', 'g')::jsonb where ${c}::text ~ '(\\(demo\\)|\\mDemo\\M)'`);
    n += res.rowCount ?? 0;
  }
  if (n) console.log(`Textos demonstrativos ajustados: ${n}`);
}
main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
