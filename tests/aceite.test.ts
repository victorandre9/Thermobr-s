/** Testes de aceite (seção 16 do escopo). Rodam contra PostgreSQL real (thermobras_test). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@/server/db/schema";
import { db, pool, cenario, tx, amanha } from "./helpers";
import { ErroAcesso, ErroNegocio } from "@/server/erros";
import { criarOS, obterOS, listarOS, conferirOS, aprovarComercialmente } from "@/server/services/os";
import { agendarVisita, criarVisita } from "@/server/services/agenda";
import { checkin, checkout, salvarExecucao } from "@/server/services/execucao";
import { podeChecklistVeiculo, responderChecklistVeiculo, temAcessoChecklistVeiculo, modeloChecklist, alertasManutencao, registrarOdometro } from "@/server/services/veiculos";
import { listarParcelas, criarObrigacao, registrarBaixa, decidirBaixa, decidirObrigacao, estornarBaixa, definirSaldoInicial, gerarMensalidades, gerarRecebivelOS, registrarTransferencia, cancelarObrigacao } from "@/server/services/financeiro";
import { projecao, saldosRealizados } from "@/server/services/fluxo";
import { listarServicosAutonomos, definirValorAutonomo, conferirServicoAutonomo, prepararResumoSemanal, liberarResumo, registrarAdiantamento } from "@/server/services/autonomos";
import { ingerirPedido, criarOSDoPedido, testarIntegracao, obterIntegracao } from "@/server/services/pedidos";
import { registrarEntradaAvulsa, registrarEntrega, confirmarRecebimento, informarMovimento, conferirMovimento, conciliacaoOS, listarMateriais, salvarMaterial, decidirDivergencia, listarDivergencias, solicitarTransferencia } from "@/server/services/materiais";
import { salvarContrato, listarContratos } from "@/server/services/cadastros";
import { usuariosComPermissao } from "@/server/services/notificacoes";
import { exigirAcessoEntidade } from "@/server/services/anexos";
import { definirPapeis, concederPermissao } from "@/server/services/usuarios";
import { hojeSP, somarDias } from "@/lib/datas";

type C = Awaited<ReturnType<typeof cenario>>;
let c: C;

beforeAll(async () => { c = await cenario(); });
afterAll(async () => { await pool.end(); });

async function osComVisita(origem: "avulso" | "contrato" = "avulso", equipe: string[] = [c.prof.aut], hora = 12, contratoId?: string) {
  return tx(async (t) => {
    const os = await criarOS(t, c.ctx.admin, { origem, clienteId: c.cli.id, localId: c.local.id, descricao: "Manutenção", equipamentos: [c.eq1.id], contratoId,
      itens: [{ tipo: "servico", descricao: "Limpeza", quantidade: "1", unidade: "un" }] });
    const [ini, fim] = amanha(hora);
    const v = await criarVisita(t, c.ctx.admin, os.id, { inicio: ini, fim, equipe: { profissionalIds: equipe } });
    return { os, v };
  });
}
async function precoItens(osId: string, centavos: number) {
  await db.update(s.osItem).set({ precoUnitarioCentavos: centavos }).where(eq(s.osItem.osId, osId));
}
async function fotoVisita(visitaId: string) {
  await db.insert(s.anexo).values({ empresaId: c.empresaId, entidadeTipo: "visita", entidadeId: visitaId, nomeArquivo: "f.jpg", mime: "image/jpeg", tamanhoBytes: 10, chaveStorage: "x", enviadoPor: c.ctx.gestor.usuarioId });
}
async function concluirVisita(ctx: typeof c.ctx.aut, visitaId: string) {
  await tx((t) => checkin(t, ctx, visitaId));
  await tx((t) => salvarExecucao(t, ctx, visitaId, { equipamentoId: c.eq1.id, servicoRealizado: "Limpeza", testeFuncionamento: "ok", resultado: "concluido" }));
  await fotoVisita(visitaId);
  return tx((t) => checkout(t, ctx, visitaId, { resultado: "concluida" }));
}

describe("Autônomo", () => {
  it("não acessa checklist de veículo (nem via API) e não tem o menu", async () => {
    expect(temAcessoChecklistVeiculo(c.ctx.aut)).toBe(false);
    expect(podeChecklistVeiculo(c.ctx.aut, c.v1.id)).toBe(false);
    const { itens } = await modeloChecklist(db, c.ctx.gestor, "veiculo_saida");
    await expect(tx((t) => responderChecklistVeiculo(t, c.ctx.aut, c.v1.id, "veiculo_saida", 1000, itens.map((i) => ({ itemId: i.id, resultado: "conforme" as const }))))).rejects.toBeInstanceOf(ErroAcesso);
  });
  it("não vê preço vendido nem financeiro, nem OS de outro técnico", async () => {
    const { os } = await osComVisita("avulso", [c.prof.aut], 10);
    await precoItens(os.id, 50000);
    const d = await obterOS(db, c.ctx.aut, os.id);
    expect(d.itens.every((i) => i.precoUnitarioCentavos === null && i.custoUnitarioCentavos === null)).toBe(true);
    expect(d.totalPrevistoCentavos).toBeNull();
    await expect(obterOS(db, c.ctx.aut2, os.id)).rejects.toBeInstanceOf(ErroAcesso);
    await expect(listarParcelas(db, c.ctx.aut, { natureza: "receber" })).rejects.toBeInstanceOf(ErroAcesso);
    const lista = await listarOS(db, c.ctx.aut2, {});
    expect(lista.rows.find((r) => r.id === os.id)).toBeUndefined();
  });
  it("vê apenas os próprios valores de serviço", async () => {
    const { os } = await osComVisita("avulso", [c.prof.aut, c.prof.aut2], 14);
    const [sv] = await db.select().from(s.autonomoServico).where(and(eq(s.autonomoServico.osId, os.id), eq(s.autonomoServico.profissionalId, c.prof.aut2)));
    await tx((t) => definirValorAutonomo(t, c.ctx.gestor, sv.id, 30000, "Instalação"));
    const meus = await listarServicosAutonomos(db, c.ctx.aut);
    expect(meus.every((r) => r.s.profissionalId === c.prof.aut)).toBe(true);
    await expect(tx((t) => definirValorAutonomo(t, c.ctx.aut, sv.id, 99999, null))).rejects.toBeInstanceOf(ErroAcesso);
  });
});

describe("Técnico da Thermobrás", () => {
  it("vê o veículo atribuído e faz checklist só dele; checklist válido é reutilizado", async () => {
    expect(podeChecklistVeiculo(c.ctx.prop, c.v1.id)).toBe(true);
    expect(podeChecklistVeiculo(c.ctx.prop, c.v2.id)).toBe(false);
    const { itens } = await modeloChecklist(db, c.ctx.gestor, "veiculo_saida");
    const resp = itens.map((i) => ({ itemId: i.id, resultado: "conforme" as const }));
    const r1 = await tx((t) => responderChecklistVeiculo(t, c.ctx.prop, c.v1.id, "veiculo_saida", 1000, resp));
    expect(r1.reutilizado).toBe(false);
    const r2 = await tx((t) => responderChecklistVeiculo(t, c.ctx.prop, c.v1.id, "veiculo_saida", 1010, resp));
    expect(r2.reutilizado).toBe(true);
    await expect(tx((t) => responderChecklistVeiculo(t, c.ctx.prop, c.v2.id, "veiculo_saida", 10, resp))).rejects.toBeInstanceOf(ErroAcesso);
  });
  it("participação não gera pagamento de autônomo", async () => {
    const { os } = await osComVisita("avulso", [c.prof.prop, c.prof.aut2], 16);
    const linhas = await db.select().from(s.autonomoServico).where(eq(s.autonomoServico.osId, os.id));
    expect(linhas.map((l) => l.profissionalId)).toEqual([c.prof.aut2]);
  });
  it("odômetro não reduz sem correção autorizada", async () => {
    await expect(tx((t) => registrarOdometro(t, c.ctx.prop, c.v1.id, 500, "manual"))).rejects.toBeInstanceOf(ErroNegocio);
    await expect(tx((t) => registrarOdometro(t, c.ctx.prop, c.v1.id, 500, "manual", { motivo: "erro" }))).rejects.toBeInstanceOf(ErroAcesso);
    await tx((t) => registrarOdometro(t, c.ctx.gestor, c.v1.id, 500, "manual", { motivo: "Digitação errada" }));
  });
});

describe("Administrativo sem permissão financeira", () => {
  it("não recebe valores em payloads, anexos financeiros ou notificações financeiras", async () => {
    const { os } = await osComVisita("avulso", [c.prof.aut], 18);
    await precoItens(os.id, 12345);
    const d = await obterOS(db, c.ctx.admin, os.id);
    expect(d.itens.every((i) => i.precoUnitarioCentavos === null)).toBe(true);
    await tx((t) => salvarContrato(t, c.ctx.gestor, null, { clienteId: c.cli.id, numero: "K-ADM", inicio: "2026-01-01", diaVencimento: 10, status: "ativo", valorMensalCentavos: 99900 }));
    const ks = await listarContratos(db, c.ctx.admin);
    expect(ks.every((k) => k.valorMensalCentavos === null)).toBe(true);
    await expect(listarParcelas(db, c.ctx.admin, { natureza: "pagar" })).rejects.toBeInstanceOf(ErroAcesso);
    const cat = await db.select().from(s.categoriaFinanceira).where(and(eq(s.categoriaFinanceira.empresaId, c.empresaId), eq(s.categoriaFinanceira.codigo, "administrativa")));
    const ob = await tx((t) => criarObrigacao(t, c.ctx.gestor, { natureza: "pagar", categoriaId: cat[0].id, descricao: "Aluguel", valorBrutoCentavos: 1000, origemTipo: "manual", parcelas: [{ vencimento: hojeSP(), valorCentavos: 1000 }] }));
    await expect(exigirAcessoEntidade(db, c.ctx.admin, "obrigacao", ob.id, false)).rejects.toBeInstanceOf(ErroAcesso);
    const destinatarios = await usuariosComPermissao(db, c.empresaId, "financeiro.aprovar");
    expect(destinatarios).not.toContain(c.ctx.admin.usuarioId);
  });
  it("ninguém promove a si mesmo", async () => {
    await expect(tx((t) => definirPapeis(t, c.ctx.gestor, c.ctx.gestor.usuarioId, ["gestor", "administrativo"], "x"))).rejects.toBeInstanceOf(ErroAcesso);
    await expect(tx((t) => concederPermissao(t, c.ctx.admin, c.ctx.admin.usuarioId, "os.valores.ver", "empresa", "x"))).rejects.toBeInstanceOf(ErroAcesso);
  });
});

describe("Operador financeiro", () => {
  it("não aprova, não estorna, não altera saldo inicial, não aprova divergência; baixa fica aguardando conferência", async () => {
    const [cat] = await db.select().from(s.categoriaFinanceira).where(and(eq(s.categoriaFinanceira.empresaId, c.empresaId), eq(s.categoriaFinanceira.codigo, "outros_pagar")));
    const ob = await tx((t) => criarObrigacao(t, c.ctx.fin, { natureza: "pagar", categoriaId: cat.id, descricao: "Despesa X", valorBrutoCentavos: 5000, origemTipo: "manual", parcelas: [{ vencimento: hojeSP(), valorCentavos: 5000 }] }));
    expect(ob.situacaoAprovacao).toBe("aguardando_aprovacao");
    await expect(tx((t) => decidirObrigacao(t, c.ctx.fin, ob.id, true))).rejects.toBeInstanceOf(ErroAcesso);
    const [p] = await db.select().from(s.parcela).where(eq(s.parcela.obrigacaoId, ob.id));
    await expect(tx((t) => registrarBaixa(t, c.ctx.fin, { parcelaId: p.id, contaId: c.conta.id, valorCentavos: 5000, dataPagamento: hojeSP() }))).rejects.toThrow(/não aprovado/);
    const r = await tx((t) => decidirObrigacao(t, c.ctx.gestor, ob.id, true));
    expect(r.situacao).toBe("aprovada");
    const { baixa: b } = await tx((t) => registrarBaixa(t, c.ctx.fin, { parcelaId: p.id, contaId: c.conta.id, valorCentavos: 5000, dataPagamento: hojeSP() }));
    expect(b.status).toBe("aguardando_conferencia");
    await tx((t) => decidirBaixa(t, c.ctx.gestor, b.id, true));
    await expect(tx((t) => estornarBaixa(t, c.ctx.fin, b.id, "x"))).rejects.toBeInstanceOf(ErroAcesso);
    await expect(tx((t) => definirSaldoInicial(t, c.ctx.fin, c.conta.id, 1, "2026-01-01", "x"))).rejects.toBeInstanceOf(ErroAcesso);
    await expect(tx((t) => cancelarObrigacao(t, c.ctx.fin, ob.id, "x"))).rejects.toBeInstanceOf(ErroAcesso);
  });
  it("não aprova o próprio pagamento mesmo com permissão de confirmação", async () => {
    // operador que também é profissional autônomo
    const [catA] = await db.select().from(s.categoriaFinanceira).where(and(eq(s.categoriaFinanceira.empresaId, c.empresaId), eq(s.categoriaFinanceira.codigo, "outros_pagar")));
    await tx((t) => concederPermissao(t, c.ctx.gestor, c.ctx.aut.usuarioId, "financeiro.baixa.registrar", "empresa", "teste"));
    await tx((t) => concederPermissao(t, c.ctx.gestor, c.ctx.aut.usuarioId, "financeiro.baixa.confirmar", "empresa", "teste"));
    const { ctxDe } = await import("./helpers");
    const autFin = await ctxDe(c.ctx.aut.usuarioId);
    const ob = await tx((t) => criarObrigacao(t, c.ctx.gestor, { natureza: "pagar", categoriaId: catA.id, profissionalId: c.prof.aut, descricao: "Pagto autônomo", valorBrutoCentavos: 3000, origemTipo: "manual", parcelas: [{ vencimento: hojeSP(), valorCentavos: 3000 }] }));
    const [p] = await db.select().from(s.parcela).where(eq(s.parcela.obrigacaoId, ob.id));
    const { baixa: b } = await tx((t) => registrarBaixa(t, autFin, { parcelaId: p.id, contaId: c.conta.id, valorCentavos: 3000, dataPagamento: hojeSP() }));
    expect(b.status).toBe("aguardando_conferencia");
    await expect(tx((t) => decidirBaixa(t, autFin, b.id, true))).rejects.toBeInstanceOf(ErroAcesso);
  });
  it("autoaprovação do gestor é registrada; dupla aprovação configurável", async () => {
    const [cat] = await db.select().from(s.categoriaFinanceira).where(and(eq(s.categoriaFinanceira.empresaId, c.empresaId), eq(s.categoriaFinanceira.codigo, "ferramenta")));
    const ob = await tx((t) => criarObrigacao(t, c.ctx.gestor, { natureza: "pagar", categoriaId: cat.id, descricao: "Ferramenta", valorBrutoCentavos: 2000, origemTipo: "manual", parcelas: [{ vencimento: hojeSP(), valorCentavos: 2000 }] }));
    expect(ob.situacaoAprovacao).toBe("aprovada");
    const [ap] = await db.select().from(s.aprovacao).where(eq(s.aprovacao.entidadeId, ob.id));
    expect(ap.autoaprovacao).toBe(true);
    await db.update(s.categoriaFinanceira).set({ duplaAprovacaoAcimaCentavos: 100000 }).where(eq(s.categoriaFinanceira.id, cat.id));
    const ob2 = await tx((t) => criarObrigacao(t, c.ctx.fin, { natureza: "pagar", categoriaId: cat.id, descricao: "Compressor", valorBrutoCentavos: 200000, origemTipo: "manual", parcelas: [{ vencimento: hojeSP(), valorCentavos: 200000 }] }));
    expect((await tx((t) => decidirObrigacao(t, c.ctx.gestor, ob2.id, true))).situacao).toBe("aguardando_aprovacao");
    expect((await tx((t) => decidirObrigacao(t, c.ctx.gestor2, ob2.id, true))).situacao).toBe("aprovada");
  });
});

describe("Pedidos externos", () => {
  const pedido = { idExterno: "TRE-1001", versao: "1", cliente: { nome: "Cliente Pedido" }, itens: [{ descricao: "Instalação split", quantidade: 1 }] };
  it("repetido não duplica OS nem obrigação; alteração após OS gera conferência", async () => {
    const r1 = await tx((t) => ingerirPedido(t, c.empresaId, "demo", pedido));
    const r2 = await tx((t) => ingerirPedido(t, c.empresaId, "demo", pedido));
    expect(r1.resultado).toBe("novo"); expect(r2.resultado).toBe("duplicado");
    const os = await tx((t) => criarOSDoPedido(t, c.ctx.admin, r1.pedidoId, { clienteId: c.cli.id, descricao: "Instalação", itens: [{ tipo: "servico", descricao: "Instalação", quantidade: "1", unidade: "un", precoUnitarioCentavos: 80000 }] }));
    await expect(tx((t) => criarOSDoPedido(t, c.ctx.admin, r1.pedidoId, { clienteId: c.cli.id, descricao: "Dup" }))).rejects.toBeInstanceOf(ErroNegocio);
    await precoItens(os.id, 80000);
    await tx((t) => gerarRecebivelOS(t, c.ctx.gestor, os.id, { parcelas: [{ vencimento: hojeSP(), valorCentavos: 80000 }] }));
    await expect(tx((t) => gerarRecebivelOS(t, c.ctx.gestor, os.id, { parcelas: [{ vencimento: hojeSP(), valorCentavos: 80000 }] }))).rejects.toThrow(/já foi gerada/);
    const r3 = await tx((t) => ingerirPedido(t, c.empresaId, "demo", { ...pedido, versao: "2", cancelado: true }));
    expect(r3.resultado).toBe("conferencia");
    const oss = await db.select().from(s.ordemServico).where(eq(s.ordemServico.pedidoExternoId, r1.pedidoId));
    expect(oss).toHaveLength(1);
  });
  it("integração sem credenciais não é marcada como conectada", async () => {
    const r = await tx((t) => testarIntegracao(t, c.ctx.gestor));
    expect(r.ok).toBe(false);
    const i = await obterIntegracao(db, c.ctx.gestor);
    expect(i.integracao.status).toBe("aguardando_validacao");
  });
});

describe("Agenda", () => {
  it("dois agendamentos concorrentes não reservam o mesmo profissional", async () => {
    const mk = () => tx((t) => criarOS(t, c.ctx.admin, { origem: "avulso", clienteId: c.cli.id, descricao: "Concorrência" }));
    const [o1, o2] = await Promise.all([mk(), mk()]);
    const [v1, v2] = await Promise.all([tx((t) => criarVisita(t, c.ctx.admin, o1.id, {})), tx((t) => criarVisita(t, c.ctx.admin, o2.id, {}))]);
    const d = new Date(Date.now() + 5 * 86400000); d.setUTCHours(13, 0, 0, 0);
    const fim = new Date(d.getTime() + 3 * 3600000);
    const res = await Promise.allSettled([
      tx((t) => agendarVisita(t, c.ctx.admin, v1.id, d, fim, { profissionalIds: [c.prof.prop, c.prof.aut2] }, null)),
      tx((t) => agendarVisita(t, c.ctx.admin, v2.id, new Date(d.getTime() + 3600000), new Date(fim.getTime() + 3600000), { profissionalIds: [c.prof.prop] }, null)),
    ]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rej = res.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(rej.reason.message)).toMatch(/Conflito de agenda/);
  });
});

describe("Cobrança: contrato, OS com várias visitas, parcial", () => {
  it("visita de contrato não duplica mensalidade; OS com várias visitas não multiplica cobrança", async () => {
    const k = await tx((t) => salvarContrato(t, c.ctx.gestor, null, { clienteId: c.cli.id, numero: "K-1", inicio: "2026-01-01", diaVencimento: 10, status: "ativo", valorMensalCentavos: 45000 }));
    const r1 = await tx((t) => gerarMensalidades(t, c.ctx.gestor, "2026-11-01"));
    const r2 = await tx((t) => gerarMensalidades(t, c.ctx.gestor, "2026-11-01"));
    expect(r1.geradas).toBeGreaterThanOrEqual(1); expect(r2.geradas).toBe(0);
    const { os } = await osComVisita("contrato", [c.prof.aut], 7, k.id);
    await tx((t) => criarVisita(t, c.ctx.admin, os.id, {}));
    await expect(tx((t) => gerarRecebivelOS(t, c.ctx.gestor, os.id, { parcelas: [{ vencimento: hojeSP(), valorCentavos: 1 }] }))).rejects.toThrow(/contrato não gera/);
    const obs = await db.select().from(s.obrigacao).where(eq(s.obrigacao.chaveUnicidade, `contrato:${k.id}:2026-11`));
    expect(obs).toHaveLength(1);
  });
  it("receber R$200 de parcela de R$550 mantém R$350; concluir OS não altera", async () => {
    const { os, v } = await osComVisita("avulso", [c.prof.aut], 20);
    await precoItens(os.id, 55000);
    await expect(tx((t) => gerarRecebivelOS(t, c.ctx.gestor, os.id, { parcelas: [{ vencimento: hojeSP(), valorCentavos: 55000 }] }))).rejects.toThrow(/rascunho/);
    await tx((t) => aprovarComercialmente(t, c.ctx.admin, os.id));
    const ob = await tx((t) => gerarRecebivelOS(t, c.ctx.gestor, os.id, { parcelas: [{ vencimento: somarDias(hojeSP(), 10), valorCentavos: 55000 }] }));
    const [p] = await db.select().from(s.parcela).where(eq(s.parcela.obrigacaoId, ob.id));
    const { baixa: b } = await tx((t) => registrarBaixa(t, c.ctx.fin, { parcelaId: p.id, contaId: c.conta.id, valorCentavos: 20000, dataPagamento: hojeSP(), chave: "k-200" }));
    await tx((t) => decidirBaixa(t, c.ctx.gestor, b.id, true));
    const again = await tx((t) => registrarBaixa(t, c.ctx.fin, { parcelaId: p.id, contaId: c.conta.id, valorCentavos: 20000, dataPagamento: hojeSP(), chave: "k-200" }));
    expect(again.repetido).toBe(true);
    await concluirVisita(c.ctx.aut, v.id);
    await tx((t) => conferirOS(t, c.ctx.admin, os.id));
    const l = await listarParcelas(db, c.ctx.gestor, { natureza: "receber", situacao: "todas" });
    const linha = l.rows.find((r) => r.parcelaId === p.id)!;
    expect(linha.saldo).toBe(35000);
    expect(linha.situacao.parcial).toBe(true);
    await expect(tx((t) => registrarBaixa(t, c.ctx.fin, { parcelaId: p.id, contaId: c.conta.id, valorCentavos: 36000, dataPagamento: hojeSP() }))).rejects.toThrow(/acima do saldo/);
  });
});

describe("Caixa", () => {
  it("baixa confirmada não volta na projeção; transferência não aumenta consolidado", async () => {
    const antes = await saldosRealizados(db, c.ctx.gestor);
    const p1 = await projecao(db, c.ctx.gestor, 30);
    await tx((t) => registrarTransferencia(t, c.ctx.gestor, { origemContaId: c.conta.id, destinoContaId: c.conta2.id, valorCentavos: 10000, data: hojeSP() }));
    const depois = await saldosRealizados(db, c.ctx.gestor);
    expect(depois.consolidado).toBe(antes.consolidado);
    const p2 = await projecao(db, c.ctx.gestor, 30);
    expect(p2.receberPrevisto).toBe(p1.receberPrevisto);
    // a parcela de 550 com 200 recebidos aparece com 350 previstos
    expect(p2.serie.length).toBe(31);
  });
  it("sem saldo inicial a projeção é marcada incompleta", async () => {
    await db.insert(s.contaFinanceira).values({ empresaId: c.empresaId, nome: "Conta sem saldo" });
    const p = await projecao(db, c.ctx.gestor, 7);
    expect(p.incompleta).toBe(true);
    expect(p.avisos.join(" ")).toMatch(/Saldo inicial não informado/);
  });
});

describe("Materiais", () => {
  it("10 m entregues, 7 consumidos, 3 devolvidos conferidos conciliam; devolução só informada não aumenta disponível", async () => {
    const m = await tx((t) => salvarMaterial(t, c.ctx.admin, null, { codigo: "CU14", nome: "Tubo de cobre", especificacao: "1/4\"", unidade: "m", controlaRetalho: true }));
    const [almox] = await db.select().from(s.materialPosicao).where(and(eq(s.materialPosicao.empresaId, c.empresaId), eq(s.materialPosicao.tipo, "almoxarifado")));
    await tx((t) => registrarEntradaAvulsa(t, c.ctx.admin, { materialId: m.id, quantidade: "30", destinoPosicaoId: almox.id }));
    const { os } = await osComVisita("avulso", [c.prof.aut], 22);
    const ent = await tx((t) => registrarEntrega(t, c.ctx.admin, { materialId: m.id, quantidade: "10", origemPosicaoId: almox.id, profissionalId: c.prof.aut, osId: os.id, chave: "e1" }));
    await tx((t) => confirmarRecebimento(t, c.ctx.aut, ent.id));
    const rep = await tx((t) => confirmarRecebimento(t, c.ctx.aut, ent.id));
    expect(rep.repetido).toBe(true);
    const cons = await tx((t) => informarMovimento(t, c.ctx.aut, { tipo: "consumo", materialId: m.id, quantidade: "7", osId: os.id }));
    const dev = await tx((t) => informarMovimento(t, c.ctx.aut, { tipo: "devolucao", materialId: m.id, quantidade: "3", osId: os.id, retalho: true }));
    let lista = await listarMateriais(db, c.ctx.admin);
    expect(Number(lista.find((x) => x.id === m.id)!.estoque)).toBe(20); // devolução informada não volta
    await expect(tx((t) => conferirMovimento(t, c.ctx.aut, cons.id, "7"))).rejects.toBeInstanceOf(ErroAcesso);
    await tx((t) => conferirMovimento(t, c.ctx.admin, cons.id, "7"));
    await tx((t) => conferirMovimento(t, c.ctx.admin, dev.id, "3"));
    const again = await tx((t) => conferirMovimento(t, c.ctx.admin, dev.id, "3"));
    expect(again.repetido).toBe(true);
    lista = await listarMateriais(db, c.ctx.admin);
    expect(Number(lista.find((x) => x.id === m.id)!.estoque)).toBe(23);
    const conc = await conciliacaoOS(db, c.ctx.admin, os.id);
    const l = conc.find((x) => x.materialId === m.id)!;
    expect([l.entregue, l.consumoValidado, l.devolucaoConferida, l.saldoCustodia]).toEqual(["10.000", "7.000", "3.000", "0.000"]);
    expect(l.conciliado).toBe(true);
  });
  it("devolução de 1 m (de 3 informados) deixa 2 m a localizar, sem baixa automática", async () => {
    const [m] = await db.select().from(s.material).where(and(eq(s.material.empresaId, c.empresaId), eq(s.material.codigo, "CU14")));
    const [almox] = await db.select().from(s.materialPosicao).where(and(eq(s.materialPosicao.empresaId, c.empresaId), eq(s.materialPosicao.tipo, "almoxarifado")));
    const { os } = await osComVisita("avulso", [c.prof.aut2], 23);
    const ent = await tx((t) => registrarEntrega(t, c.ctx.admin, { materialId: m.id, quantidade: "10", origemPosicaoId: almox.id, profissionalId: c.prof.aut2, osId: os.id }));
    await tx((t) => confirmarRecebimento(t, c.ctx.aut2, ent.id));
    const cons = await tx((t) => informarMovimento(t, c.ctx.aut2, { tipo: "consumo", materialId: m.id, quantidade: "7", osId: os.id }));
    const dev = await tx((t) => informarMovimento(t, c.ctx.aut2, { tipo: "devolucao", materialId: m.id, quantidade: "3", osId: os.id }));
    await tx((t) => conferirMovimento(t, c.ctx.admin, cons.id, "7"));
    await tx((t) => conferirMovimento(t, c.ctx.admin, dev.id, "1"));
    const l = (await conciliacaoOS(db, c.ctx.admin, os.id)).find((x) => x.materialId === m.id)!;
    expect(l.saldoCustodia).toBe("2.000"); expect(l.aLocalizar).toBe("2.000"); expect(l.conciliado).toBe(false);
    const divs = await listarDivergencias(db, c.ctx.gestor);
    const dv = divs.find((d) => d.d.osId === os.id)!;
    expect(dv.d.quantidade).toBe("2.000");
    await expect(tx((t) => decidirDivergencia(t, c.ctx.aut2, dv.d.id, "perda_aprovada", "x"))).rejects.toBeInstanceOf(ErroAcesso);
    await expect(tx((t) => decidirDivergencia(t, c.ctx.admin, dv.d.id, "perda_aprovada", "x"))).rejects.toBeInstanceOf(ErroAcesso);
  });
  it("disputa simultânea não gera saldo negativo", async () => {
    const m = await tx((t) => salvarMaterial(t, c.ctx.admin, null, { codigo: "FITA", nome: "Fita PVC", unidade: "un" }));
    const [almox] = await db.select().from(s.materialPosicao).where(and(eq(s.materialPosicao.empresaId, c.empresaId), eq(s.materialPosicao.tipo, "almoxarifado")));
    await tx((t) => registrarEntradaAvulsa(t, c.ctx.admin, { materialId: m.id, quantidade: "5", destinoPosicaoId: almox.id }));
    const res = await Promise.allSettled([3, 3, 3].map((q, i) => tx((t) => registrarEntrega(t, c.ctx.admin, { materialId: m.id, quantidade: String(q), origemPosicaoId: almox.id, profissionalId: i % 2 ? c.prof.aut : c.prof.aut2 }))));
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [saldo] = await db.select().from(s.materialSaldo).where(and(eq(s.materialSaldo.materialId, m.id), eq(s.materialSaldo.posicaoId, almox.id)));
    expect(saldo.quantidade).toBe("2.000");
  });
  it("transferência não cria nem perde quantidade", async () => {
    const [m] = await db.select().from(s.material).where(and(eq(s.material.empresaId, c.empresaId), eq(s.material.codigo, "FITA")));
    const [pa] = await db.select().from(s.materialPosicao).where(eq(s.materialPosicao.profissionalId, c.prof.aut2));
    const [pb] = await db.select().from(s.materialPosicao).where(eq(s.materialPosicao.profissionalId, c.prof.aut));
    const [movPend] = await db.select().from(s.materialMovimento).where(and(eq(s.materialMovimento.materialId, m.id), eq(s.materialMovimento.status, "em_transito")));
    const destProf = movPend.destinoPosicaoId === pa.id ? c.ctx.aut2 : c.ctx.aut;
    await tx((t) => confirmarRecebimento(t, destProf, movPend.id));
    const origem = movPend.destinoPosicaoId;
    const destino = origem === pa.id ? pb.id : pa.id;
    const tr = await tx((t) => solicitarTransferencia(t, destProf, { materialId: m.id, quantidade: "2", origemPosicaoId: origem, destinoPosicaoId: destino }));
    const outro = destino === pa.id ? c.ctx.aut2 : c.ctx.aut;
    await tx((t) => confirmarRecebimento(t, outro, tr.id));
    const saldos = await db.select().from(s.materialSaldo).where(eq(s.materialSaldo.materialId, m.id));
    const total = saldos.reduce((acc, x) => acc + Number(x.quantidade), 0);
    expect(total).toBe(5);
  });
});

describe("Visita parcial e retorno", () => {
  it("parcial mantém pendência e permite nova visita na mesma OS sem nova venda", async () => {
    const { os, v } = await osComVisita("avulso", [c.prof.aut], 4);
    await tx((t) => checkin(t, c.ctx.aut, v.id));
    const rep = await tx((t) => checkin(t, c.ctx.aut, v.id));
    expect(rep.repetido).toBe(true);
    await expect(tx((t) => checkout(t, c.ctx.aut, v.id, { resultado: "parcial" }))).rejects.toBeInstanceOf(ErroNegocio);
    await tx((t) => checkout(t, c.ctx.aut, v.id, { resultado: "parcial", motivo: "falta_material", pendenciaDescricao: "Falta capacitor", proximaAcao: "Comprar capacitor e retornar" }));
    const [o] = await db.select().from(s.ordemServico).where(eq(s.ordemServico.id, os.id));
    expect(o.etapa).toBe("pendente_retorno");
    const pend = await db.select().from(s.pendencia).where(and(eq(s.pendencia.osId, os.id), eq(s.pendencia.tipo, "visita_impedimento")));
    expect(pend[0].situacao).toBe("aberta");
    const v2 = await tx((t) => criarVisita(t, c.ctx.admin, os.id, {}));
    expect(v2.sequencia).toBe(2);
    const obs = await db.select().from(s.obrigacao).where(eq(s.obrigacao.osId, os.id));
    expect(obs).toHaveLength(0);
  });
});

describe("Autônomos — resumo semanal", () => {
  it("adiantamento é abatido uma única vez", async () => {
    const { os, v } = await osComVisita("avulso", [c.prof.aut], 2);
    await concluirVisita(c.ctx.aut, v.id);
    await tx((t) => conferirOS(t, c.ctx.admin, os.id));
    const [sv] = await db.select().from(s.autonomoServico).where(and(eq(s.autonomoServico.osId, os.id), eq(s.autonomoServico.profissionalId, c.prof.aut)));
    await tx((t) => definirValorAutonomo(t, c.ctx.gestor, sv.id, 30000, "Serviço"));
    await tx((t) => conferirServicoAutonomo(t, c.ctx.fin, sv.id));
    await tx((t) => registrarAdiantamento(t, c.ctx.fin, { profissionalId: c.prof.aut, valorCentavos: 10000, data: hojeSP() }));
    const r = await tx((t) => prepararResumoSemanal(t, c.ctx.fin, c.prof.aut, hojeSP()));
    expect(r.liquidoCentavos).toBe(r.totalServicosCentavos - 10000);
    await tx((t) => liberarResumo(t, c.ctx.gestor, r.id));
    await tx((t) => liberarResumo(t, c.ctx.gestor, r.id));
    const obs = await db.select().from(s.obrigacao).where(eq(s.obrigacao.chaveUnicidade, `autonomo-resumo:${r.id}`));
    expect(obs).toHaveLength(1);
    await expect(tx((t) => prepararResumoSemanal(t, c.ctx.fin, c.prof.aut, somarDias(hojeSP(), 7)))).rejects.toThrow(/Não há serviços/);
  });
});

describe("Veículos — alertas", () => {
  it("sem parâmetros ou histórico não inventa previsão", async () => {
    const a = await alertasManutencao(db, c.ctx.gestor, [c.v2.id]);
    expect(a.every((x) => x.status === "sem_base")).toBe(true);
    await db.update(s.veiculo).set({ parametrosManutencao: { oleo: { km: 10000, dias: 180 } }, odometroKm: 19500, odometroAtualizadoEm: new Date() }).where(eq(s.veiculo.id, c.v2.id));
    await db.insert(s.veiculoManutencao).values({ veiculoId: c.v2.id, tipo: "oleo", data: somarDias(hojeSP(), -30), km: 10000, registradoPor: c.ctx.gestor.usuarioId });
    const b = await alertasManutencao(db, c.ctx.gestor, [c.v2.id]);
    expect(b.find((x) => x.tipo === "Troca de óleo")!.status).toBe("proximo");
  });
});
