/** Testes do aditivo (seção 17) + consistência dos balões do dashboard com as listas. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, count, eq, sql } from "drizzle-orm";
import * as s from "@/server/db/schema";
import { db, pool, cenario, tx, amanha, ctxDe } from "./helpers";
import { ErroAcesso, ErroNegocio } from "@/server/erros";
import { criarOS, atualizarOS, conferirOS, aprovarComercialmente, listarOS } from "@/server/services/os";
import { criarVisita, agendarVisita } from "@/server/services/agenda";
import { checkin, checkout, registrarParticipacao, salvarExecucao } from "@/server/services/execucao";
import { recomendarTecnicos } from "@/server/services/recomendacao";
import { prontidaoVisita, liberarItemProntidao } from "@/server/services/prontidao";
import { salvarModeloChecklist, responderChecklistVeiculo, modeloChecklist, checklistValido, podeChecklistVeiculo } from "@/server/services/veiculos";
import { salvarFerramenta, entregarFerramenta, confirmarFerramenta, responderChecklistFerramentas } from "@/server/services/ferramentas";
import { criarObrigacao, registrarBaixa, decidirObrigacao, gerarRecebivelOS, definirDataEsperada, definirSaldoInicial } from "@/server/services/financeiro";
import { saldosRealizados, projecao } from "@/server/services/fluxo";
import { ingerirPedido, criarOSDoPedido } from "@/server/services/pedidos";
import { adicionarAcordoAutonomo, marcarCoberto } from "@/server/services/autonomos";
import { definirDataCorte, lancarObrigacaoLegado } from "@/server/services/implantacao";
import { emitirRelatorio, registrarCiencia, obterRelatorio, type ConteudoExterno } from "@/server/services/relatorio-atendimento";
import { executarRotina } from "@/server/services/rotinas";
import { baloesGestor } from "@/server/services/dashboard";
import { listarPendencias } from "@/server/services/pendencias";
import { listarVisitas } from "@/server/services/visitas";
import { concederPermissao, definirPapeis } from "@/server/services/usuarios";
import { hojeSP, somarDias, primeiroDiaMes } from "@/lib/datas";

type C = Awaited<ReturnType<typeof cenario>>;
let c: C;
beforeAll(async () => { c = await cenario(); });
afterAll(async () => { await pool.end(); });

const novaOS = (extra: Partial<Parameters<typeof criarOS>[2]> = {}) => tx((t) => criarOS(t, c.ctx.gestor, { origem: "avulso", clienteId: c.cli.id, localId: c.local.id, descricao: "Teste", equipamentos: [c.eq1.id], ...extra }));

describe("Recomendação de técnicos", () => {
  it("respeita requisitos obrigatórios e mostra limitações", async () => {
    await db.update(s.profissional).set({ competencias: ["split", "vrf"], regioes: ["centro"] }).where(eq(s.profissional.id, c.prof.aut));
    await db.update(s.clienteLocal).set({ bairro: "Centro" }).where(eq(s.clienteLocal.id, c.local.id));
    const os = await novaOS();
    await tx((t) => atualizarOS(t, c.ctx.gestor, os.id, { competenciasExigidas: ["vrf"], qtdProfissionais: 2 }));
    const [ini, fim] = amanha(6);
    // aut2 indisponível no horário
    await db.insert(s.agendaReserva).values({ empresaId: c.empresaId, profissionalId: c.prof.aut2, tipo: "indisponibilidade", periodo: `[${ini.toISOString()},${fim.toISOString()})`, motivo: "folga" });
    const r = await recomendarTecnicos(db, c.ctx.admin, os.id, ini, fim);
    const aut = r.candidatos.find((x) => x.profissionalId === c.prof.aut)!;
    const aut2 = r.candidatos.find((x) => x.profissionalId === c.prof.aut2)!;
    const prop = r.candidatos.find((x) => x.profissionalId === c.prof.prop)!;
    expect(aut.elegivel).toBe(true);
    expect(aut.motivos.join(" ")).toMatch(/Região/);
    expect(aut2.elegivel).toBe(false);
    expect(aut2.impedimentos.join(" ")).toMatch(/Indisponível/);
    expect(prop.elegivel).toBe(false);
    expect(prop.impedimentos.join(" ")).toMatch(/competência/);
    expect(prop.limitacoes.join(" ")).toMatch(/não cadastrad/);
    expect(r.avisos.join(" ")).toMatch(/Necessários 2/);
    // recomendação não agenda
    const [{ n }] = await db.select({ n: count() }).from(s.visita).where(eq(s.visita.osId, os.id));
    expect(n).toBe(0);
    await expect(recomendarTecnicos(db, c.ctx.aut, os.id, ini, fim)).rejects.toBeInstanceOf(ErroAcesso);
  });
});

describe("Prontidão e checklists", () => {
  it("autônomo permanece sem checklist de veículo mesmo com permissão concedida", async () => {
    await tx((t) => concederPermissao(t, c.ctx.gestor, c.ctx.aut.usuarioId, "veiculo.checklist", "proprio", "teste"));
    const aut = await ctxDe(c.ctx.aut.usuarioId);
    expect(podeChecklistVeiculo(aut, c.v1.id)).toBe(false);
  });
  it("prontidão diferencia impedimento de alerta e permite exceção justificada", async () => {
    const os = await novaOS();
    const [ini, fim] = amanha(9);
    const v = await tx((t) => criarVisita(t, c.ctx.admin, os.id, { inicio: ini, fim, equipe: { profissionalIds: [c.prof.aut] } }));
    await db.update(s.ordemServico).set({ situacaoMaterial: "pendente" }).where(eq(s.ordemServico.id, os.id));
    const p = await prontidaoVisita(db, c.ctx.admin, v.id);
    expect(p.pronta).toBe(false);
    expect(p.itens.find((i) => i.codigo === "materiais")!.status).toBe("impeditivo");
    expect(p.itens.find((i) => i.codigo.startsWith("veiculo:"))!.status).toBe("nao_aplica");
    await expect(tx((t) => liberarItemProntidao(t, c.ctx.admin, v.id, "materiais", ""))).rejects.toBeInstanceOf(ErroNegocio);
    await tx((t) => liberarItemProntidao(t, c.ctx.admin, v.id, "materiais", "Cliente fornece o material"));
    const p2 = await prontidaoVisita(db, c.ctx.admin, v.id);
    expect(p2.itens.find((i) => i.codigo === "materiais")!.liberacao).toBeTruthy();
  });
  it("alterar modelo de checklist não modifica respostas antigas", async () => {
    const { itens } = await modeloChecklist(db, c.ctx.gestor, "veiculo_saida");
    const r = await tx((t) => responderChecklistVeiculo(t, c.ctx.gestor, c.v2.id, "veiculo_saida", 100, itens.map((i) => ({ itemId: i.id, resultado: "conforme" as const }))));
    const antes = await db.select().from(s.checklistRespostaItem).where(eq(s.checklistRespostaItem.respostaId, r.resposta.id));
    const m = await tx((t) => salvarModeloChecklist(t, c.ctx.gestor, "veiculo_saida", { nome: "Saída v2", validadeHoras: 10, itens: [{ descricao: "Novo item único", criticidade: "alta", exigeFotoIrregular: true }] }));
    expect(m.versao).toBe(2);
    const depois = await db.select().from(s.checklistRespostaItem).where(eq(s.checklistRespostaItem.respostaId, r.resposta.id));
    expect(depois.map((x) => x.descricao)).toEqual(antes.map((x) => x.descricao));
    const [resp] = await db.select().from(s.checklistResposta).where(eq(s.checklistResposta.id, r.resposta.id));
    expect(resp.modeloVersao).toBe(1);
  });
  it("trocar responsável invalida a conferência do veículo; mudar o kit invalida a de ferramentas", async () => {
    const [{ id: veic }] = await db.insert(s.veiculo).values({ empresaId: c.empresaId, identificacao: "V-TROCA" }).returning();
    const { itens } = await modeloChecklist(db, c.ctx.gestor, "veiculo_saida");
    await tx((t) => responderChecklistVeiculo(t, c.ctx.gestor, veic, "veiculo_saida", 10, itens.map((i) => ({ itemId: i.id, resultado: "conforme" as const }))));
    expect(await checklistValido(db, veic, "veiculo_saida", { usuarioId: c.ctx.gestor.usuarioId })).not.toBeNull();
    expect(await checklistValido(db, veic, "veiculo_saida", { profissionalId: c.prof.prop })).toBeNull();
    // kit de ferramentas
    const f1 = await tx((t) => salvarFerramenta(t, c.ctx.admin, null, { codigo: "K1", nome: "Kit", tipo: "conjunto" }));
    await tx((t) => salvarFerramenta(t, c.ctx.admin, null, { codigo: "K1-A", nome: "Componente A", tipo: "ferramenta", conjuntoId: f1.id }));
    const m1 = await tx((t) => entregarFerramenta(t, c.ctx.admin, f1.id, { profissionalId: c.prof.prop }));
    await tx((t) => confirmarFerramenta(t, c.ctx.prop, m1.id));
    const kit = await db.select().from(s.ferramenta).where(eq(s.ferramenta.custodianteProfissionalId, c.prof.prop));
    expect(kit.length).toBe(2); // conjunto + componente listados
    const r1 = await tx((t) => responderChecklistFerramentas(t, c.ctx.prop, "ferramentas_saida", kit.map((f) => ({ ferramentaId: f.id, resultado: "conforme" as const }))));
    expect(r1.reutilizado).toBe(false);
    const f2 = await tx((t) => salvarFerramenta(t, c.ctx.admin, null, { codigo: "TRENA", nome: "Trena", tipo: "ferramenta" }));
    const m2 = await tx((t) => entregarFerramenta(t, c.ctx.admin, f2.id, { profissionalId: c.prof.prop }));
    await tx((t) => confirmarFerramenta(t, c.ctx.prop, m2.id));
    const kit2 = await db.select().from(s.ferramenta).where(eq(s.ferramenta.custodianteProfissionalId, c.prof.prop));
    const r2 = await tx((t) => responderChecklistFerramentas(t, c.ctx.prop, "ferramentas_saida", kit2.map((f) => ({ ferramentaId: f.id, resultado: "conforme" as const }))));
    expect(r2.reutilizado).toBe(false); // composição mudou → nova conferência
  });
});

describe("Perfis acumulados e financeiro com delegação", () => {
  it("acumular operador financeiro + técnico não permite aprovar o próprio pagamento", async () => {
    await tx((t) => definirPapeis(t, c.ctx.gestor, c.ctx.aut2.usuarioId, ["tecnico", "financeiro_operador"], "acúmulo"));
    await tx((t) => concederPermissao(t, c.ctx.gestor, c.ctx.aut2.usuarioId, "financeiro.baixa.confirmar", "empresa", "delegação"));
    const a2 = await ctxDe(c.ctx.aut2.usuarioId);
    const [cat] = await db.select().from(s.categoriaFinanceira).where(and(eq(s.categoriaFinanceira.empresaId, c.empresaId), eq(s.categoriaFinanceira.codigo, "outros_pagar")));
    const ob = await tx((t) => criarObrigacao(t, c.ctx.gestor, { natureza: "pagar", categoriaId: cat.id, profissionalId: c.prof.aut2, descricao: "Pagto", valorBrutoCentavos: 1000, origemTipo: "manual", parcelas: [{ vencimento: hojeSP(), valorCentavos: 1000 }] }));
    const [p] = await db.select().from(s.parcela).where(eq(s.parcela.obrigacaoId, ob.id));
    const { baixa: b } = await tx((t) => registrarBaixa(t, a2, { parcelaId: p.id, contaId: c.conta.id, valorCentavos: 1000, dataPagamento: hojeSP() }));
    expect(b.status).toBe("aguardando_conferencia");
  });
  it("pagamento já aprovado é confirmado por operador delegado sem aprovação duplicada; solicitação não altera caixa", async () => {
    await tx((t) => concederPermissao(t, c.ctx.gestor, c.ctx.fin.usuarioId, "financeiro.baixa.confirmar", "empresa", "política dos donos"));
    const fin = await ctxDe(c.ctx.fin.usuarioId);
    const [cat] = await db.select().from(s.categoriaFinanceira).where(and(eq(s.categoriaFinanceira.empresaId, c.empresaId), eq(s.categoriaFinanceira.codigo, "administrativa")));
    const antes = (await saldosRealizados(db, c.ctx.gestor)).consolidado!;
    const ob = await tx((t) => criarObrigacao(t, fin, { natureza: "pagar", categoriaId: cat.id, descricao: "Internet", valorBrutoCentavos: 9900, origemTipo: "manual", parcelas: [{ vencimento: hojeSP(), valorCentavos: 9900 }] }));
    expect((await saldosRealizados(db, c.ctx.gestor)).consolidado).toBe(antes); // solicitação
    await tx((t) => decidirObrigacao(t, c.ctx.gestor, ob.id, true));
    expect((await saldosRealizados(db, c.ctx.gestor)).consolidado).toBe(antes); // aprovação
    const [p] = await db.select().from(s.parcela).where(eq(s.parcela.obrigacaoId, ob.id));
    const { baixa: b } = await tx((t) => registrarBaixa(t, fin, { parcelaId: p.id, contaId: c.conta.id, valorCentavos: 9900, dataPagamento: hojeSP() }));
    expect(b.status).toBe("confirmada");
    expect((await saldosRealizados(db, c.ctx.gestor)).consolidado).toBe(antes - 9900); // pagamento realizado
  });
  it("pagamento realizado sem aprovação prévia é registrado como exceção com comprovante e entra no caixa", async () => {
    const [cat] = await db.select().from(s.categoriaFinanceira).where(and(eq(s.categoriaFinanceira.empresaId, c.empresaId), eq(s.categoriaFinanceira.codigo, "outros_pagar")));
    const ob = await tx((t) => criarObrigacao(t, c.ctx.fin, { natureza: "pagar", categoriaId: cat.id, descricao: "Peça urgente", valorBrutoCentavos: 5000, origemTipo: "manual", parcelas: [{ vencimento: hojeSP(), valorCentavos: 5000 }] }));
    const [p] = await db.select().from(s.parcela).where(eq(s.parcela.obrigacaoId, ob.id));
    await expect(tx((t) => registrarBaixa(t, c.ctx.fin, { parcelaId: p.id, contaId: c.conta.id, valorCentavos: 5000, dataPagamento: hojeSP(), excecao: { justificativa: "x", comprovanteAnexado: true } }))).rejects.toBeInstanceOf(ErroAcesso);
    await tx((t) => concederPermissao(t, c.ctx.gestor, c.ctx.fin.usuarioId, "financeiro.baixa.excecao", "empresa", "política"));
    const fin = await ctxDe(c.ctx.fin.usuarioId);
    await expect(tx((t) => registrarBaixa(t, fin, { parcelaId: p.id, contaId: c.conta.id, valorCentavos: 5000, dataPagamento: hojeSP(), excecao: { justificativa: "Fornecedor exigiu à vista", comprovanteAnexado: false } }))).rejects.toThrow(/comprovante/);
    const antes = (await saldosRealizados(db, c.ctx.gestor)).consolidado!;
    const { baixa: b } = await tx((t) => registrarBaixa(t, fin, { parcelaId: p.id, contaId: c.conta.id, valorCentavos: 5000, dataPagamento: hojeSP(), excecao: { justificativa: "Fornecedor exigiu à vista", comprovanteAnexado: true } }));
    expect(b.excecaoSemAprovacao).toBe(true);
    expect((await saldosRealizados(db, c.ctx.gestor)).consolidado).toBe(antes - 5000);
    const [ob2] = await db.select().from(s.obrigacao).where(eq(s.obrigacao.id, ob.id));
    expect(ob2.situacaoAprovacao).toBe("aguardando_aprovacao");
  });
});

describe("Origem única das cobranças", () => {
  it("pedido com várias OS é bloqueado; várias visitas não multiplicam a cobrança", async () => {
    const r = await tx((t) => ingerirPedido(t, c.empresaId, "demo", { idExterno: "SPLIT-1", cliente: { nome: "X" }, itens: [{ descricao: "A", quantidade: 1 }] }));
    const os = await tx((t) => criarOSDoPedido(t, c.ctx.gestor, r.pedidoId, { clienteId: c.cli.id, descricao: "A", itens: [{ tipo: "servico", descricao: "A", quantidade: "1", unidade: "un", precoUnitarioCentavos: 30000 }] }));
    await expect(tx((t) => criarOS(t, c.ctx.gestor, { origem: "avulso", clienteId: c.cli.id, descricao: "parte 2", pedidoExternoId: r.pedidoId }))).rejects.toThrow(/não é suportado/);
    await tx((t) => criarVisita(t, c.ctx.admin, os.id, {}));
    await tx((t) => criarVisita(t, c.ctx.admin, os.id, {}));
    await tx((t) => gerarRecebivelOS(t, c.ctx.gestor, os.id, { parcelas: [{ vencimento: hojeSP(), valorCentavos: 30000 }] }));
    const obs = await db.select().from(s.obrigacao).where(eq(s.obrigacao.osId, os.id));
    expect(obs).toHaveLength(1);
    expect(obs[0].valorBrutoCentavos).toBe(30000);
  });
  it("retorno pode ter custo autorizado ao autônomo sem gerar receita; acordo coberto não gera pagamento", async () => {
    const orig = await novaOS();
    const ret = await tx((t) => criarOS(t, c.ctx.gestor, { origem: "retorno_garantia", osOrigemId: orig.id, clienteId: c.cli.id, descricao: "Garantia" }));
    const [ini, fim] = amanha(15, 1);
    await tx((t) => criarVisita(t, c.ctx.admin, ret.id, { inicio: ini, fim, equipe: { profissionalIds: [c.prof.aut] } }));
    const [linha] = await db.select().from(s.autonomoServico).where(eq(s.autonomoServico.osId, ret.id));
    expect(linha.base).toBe("adicional_retorno");
    expect(linha.valorCombinadoCentavos).toBeNull(); // não presume gratuidade nem valor
    await tx((t) => adicionarAcordoAutonomo(t, c.ctx.gestor, { osId: ret.id, profissionalId: c.prof.aut, base: "visita", descricao: "Deslocamento extra", valorCentavos: 8000, motivo: "Autorizado pelo gestor" }));
    await tx((t) => marcarCoberto(t, c.ctx.gestor, linha.id, orig.id, "Coberto pela OS original"));
    await expect(tx((t) => gerarRecebivelOS(t, c.ctx.gestor, ret.id, { parcelas: [{ vencimento: hojeSP(), valorCentavos: 1 }] }))).rejects.toThrow(/Retorno/);
    const obs = await db.select().from(s.obrigacao).where(eq(s.obrigacao.osId, ret.id));
    expect(obs).toHaveLength(0);
  });
});

describe("Previsão e dados iniciais", () => {
  it("parcela vencida não vira entrada futura garantida; com data esperada entra uma única vez", async () => {
    const os = await novaOS({ itens: [{ tipo: "servico", descricao: "S", quantidade: "1", unidade: "un", precoUnitarioCentavos: 70000 }] });
    await tx((t) => aprovarComercialmente(t, c.ctx.gestor, os.id));
    const ob = await tx((t) => gerarRecebivelOS(t, c.ctx.gestor, os.id, { parcelas: [{ vencimento: somarDias(hojeSP(), -5), valorCentavos: 70000 }] }));
    const [p] = await db.select().from(s.parcela).where(eq(s.parcela.obrigacaoId, ob.id));
    const pj1 = await projecao(db, c.ctx.gestor, 30);
    expect(pj1.vencidosSemPrevisao.some((v) => v.obrigacaoId === ob.id)).toBe(true);
    expect(pj1.serie.reduce((t, d) => t + d.entradas, 0)).toBe(pj1.receberPrevisto);
    await tx((t) => definirDataEsperada(t, c.ctx.gestor, p.id, somarDias(hojeSP(), 3)));
    const pj2 = await projecao(db, c.ctx.gestor, 30);
    expect(pj2.vencidosSemPrevisao.some((v) => v.obrigacaoId === ob.id)).toBe(false);
    expect(pj2.receberPrevisto - pj1.receberPrevisto).toBe(70000);
    expect(pj2.serie.find((d) => d.dia === somarDias(hojeSP(), 3))!.entradas).toBeGreaterThanOrEqual(70000);
  });
  it("dados iniciais não duplicam vendas nem saldos", async () => {
    await tx((t) => definirDataCorte(t, c.ctx.gestor, somarDias(hojeSP(), -30)));
    const [cat] = await db.select().from(s.categoriaFinanceira).where(and(eq(s.categoriaFinanceira.empresaId, c.empresaId), eq(s.categoriaFinanceira.codigo, "outros_receber")));
    const base = { natureza: "receber" as const, categoriaId: cat.id, clienteId: c.cli.id, descricao: "Saldo antigo", valorBrutoCentavos: 12000, parcelas: [{ vencimento: somarDias(hojeSP(), -60), valorCentavos: 12000 }], identificador: "NF-ANTIGA-1" };
    const ob = await tx((t) => lancarObrigacaoLegado(t, c.ctx.gestor, base));
    expect(ob.legado).toBe(true);
    await expect(tx((t) => lancarObrigacaoLegado(t, c.ctx.gestor, base))).rejects.toThrow(/já foi gerada/);
    // recebimento anterior ao saldo inicial já está no saldo: bloqueado
    const [conta] = await db.insert(s.contaFinanceira).values({ empresaId: c.empresaId, nome: "Conta corte" }).returning();
    await tx((t) => definirSaldoInicial(t, c.ctx.gestor, conta.id, 50000, somarDias(hojeSP(), -30), ""));
    const [p] = await db.select().from(s.parcela).where(eq(s.parcela.obrigacaoId, ob.id));
    await expect(tx((t) => registrarBaixa(t, c.ctx.gestor, { parcelaId: p.id, contaId: conta.id, valorCentavos: 12000, dataPagamento: somarDias(hojeSP(), -40) }))).rejects.toThrow(/saldo inicial/);
  });
});

describe("Relatório de atendimento (PDF)", () => {
  it("documento externo não expõe informações internas e ciência não é aprovação", async () => {
    const os = await novaOS({ observacoes: "SEGREDO INTERNO", itens: [{ tipo: "servico", descricao: "Serviço", quantidade: "1", unidade: "un", precoUnitarioCentavos: 99999, custoUnitarioCentavos: 11111 }] });
    const [ini, fim] = amanha(17, 1);
    const v = await tx((t) => criarVisita(t, c.ctx.admin, os.id, { inicio: ini, fim, equipe: { profissionalIds: [c.prof.aut] } }));
    const [sv] = await db.select().from(s.autonomoServico).where(eq(s.autonomoServico.osId, os.id));
    await db.update(s.autonomoServico).set({ valorCombinadoCentavos: 77777 }).where(eq(s.autonomoServico.id, sv.id));
    await tx((t) => checkin(t, c.ctx.aut, v.id));
    await tx((t) => salvarExecucao(t, c.ctx.aut, v.id, { equipamentoId: c.eq1.id, servicoRealizado: "Limpeza", testeFuncionamento: "ok", observacoes: "OBS INTERNA DO TECNICO" }));
    await db.insert(s.anexo).values({ empresaId: c.empresaId, entidadeTipo: "visita", entidadeId: v.id, nomeArquivo: "f.jpg", mime: "image/jpeg", tamanhoBytes: 1, chaveStorage: "x", enviadoPor: c.ctx.gestor.usuarioId });
    await tx((t) => checkout(t, c.ctx.aut, v.id, { resultado: "concluida", comentario: "COMENTARIO INTERNO" }));
    const rel = await tx((t) => emitirRelatorio(t, c.ctx.admin, { osId: os.id, visitaId: v.id, anexosIds: [] }));
    const json = JSON.stringify(rel.conteudo);
    for (const proibido of ["99999", "11111", "77777", "SEGREDO", "OBS INTERNA", "COMENTARIO INTERNO", "999,99", "valor", "custo", "preco"]) expect(json).not.toContain(proibido);
    expect((rel.conteudo as unknown as ConteudoExterno).escopo).toBe("visita");
    const rel2 = await tx((t) => emitirRelatorio(t, c.ctx.admin, { osId: os.id, visitaId: v.id, anexosIds: [] }));
    expect(rel2.versao).toBe(2);
    await expect(tx((t) => registrarCiencia(t, c.ctx.admin, rel.id, { situacao: "recusada" }))).rejects.toBeInstanceOf(ErroNegocio);
    await tx((t) => registrarCiencia(t, c.ctx.admin, rel.id, { situacao: "registrada", nome: "Sr. Responsável" }));
    const r = await obterRelatorio(db, c.ctx.admin, rel.id);
    expect(r.r.cienciaSituacao).toBe("registrada");
    await expect(obterRelatorio(db, c.ctx.aut2, rel.id)).rejects.toBeInstanceOf(ErroAcesso);
  });
});

describe("Agenda: responsável conduz, participação individual, recursos exclusivos", () => {
  it("só o responsável inicia; auxiliar registra a própria participação; veículo exclusivo não conflita", async () => {
    const os = await novaOS();
    const [ini, fim] = amanha(19, 2);
    const v = await tx((t) => criarVisita(t, c.ctx.admin, os.id, { inicio: ini, fim, equipe: { profissionalIds: [c.prof.aut, c.prof.aut2], responsavelId: c.prof.aut, veiculoId: c.v2.id } }));
    await expect(tx((t) => checkin(t, c.ctx.aut2, v.id))).rejects.toBeInstanceOf(ErroAcesso);
    await tx((t) => checkin(t, c.ctx.aut, v.id));
    await tx((t) => registrarParticipacao(t, c.ctx.aut2, v.id, "chegada"));
    const parts = await db.select().from(s.visitaParticipacao).where(eq(s.visitaParticipacao.visitaId, v.id));
    expect(parts).toHaveLength(2);
    expect(parts.every((p) => p.saidaEm === null)).toBe(true);
    const os2 = await novaOS();
    const v2 = await tx((t) => criarVisita(t, c.ctx.admin, os2.id, {}));
    await expect(tx((t) => agendarVisita(t, c.ctx.admin, v2.id, ini, fim, { profissionalIds: [c.prof.prop], veiculoId: c.v2.id }, null))).rejects.toThrow(/veículo já está reservado/);
  });
});

describe("Concorrência e repetição", () => {
  it("edição desatualizada não apaga mudança recente", async () => {
    const os = await novaOS();
    const [atual] = await db.select().from(s.ordemServico).where(eq(s.ordemServico.id, os.id));
    await tx((t) => atualizarOS(t, c.ctx.gestor, os.id, { descricao: "Alterado por A", versao: atual.versao }));
    await expect(tx((t) => atualizarOS(t, c.ctx.admin, os.id, { descricao: "Tela antiga de B", versao: atual.versao }))).rejects.toThrow(/alterado por outro usuário/);
    const [depois] = await db.select().from(s.ordemServico).where(eq(s.ordemServico.id, os.id));
    expect(depois.descricao).toBe("Alterado por A");
  });
  it("rotina repetida não duplica efeitos e é registrada", async () => {
    await tx(async (t) => { const { salvarContrato } = await import("@/server/services/cadastros"); await salvarContrato(t, c.ctx.gestor, null, { clienteId: c.cli.id, numero: "K-ROT", inicio: "2026-01-01", diaVencimento: 5, status: "ativo", valorMensalCentavos: 10000 }); });
    const r1 = await executarRotina(db, "mensalidades", c.empresaId, "teste");
    const r2 = await executarRotina(db, "mensalidades", c.empresaId, "teste");
    expect(r1.status).toBe("sucesso");
    expect(r2.status).toBe("ja_executada");
    const n = await db.select().from(s.obrigacao).where(sql`${s.obrigacao.chaveUnicidade} like ${"contrato:%:" + primeiroDiaMes(hojeSP()).slice(0, 7)}`);
    expect(new Set(n.map((x) => x.chaveUnicidade)).size).toBe(n.length);
    const pedidos = await executarRotina(db, "pedidos", c.empresaId, "teste");
    expect(pedidos.status).toBe("ignorado"); // integração não validada: nada simulado
  });
  it("checkout/checkin concorrentes não duplicam", async () => {
    const os = await novaOS();
    const [ini, fim] = amanha(21, 1);
    const v = await tx((t) => criarVisita(t, c.ctx.admin, os.id, { inicio: ini, fim, equipe: { profissionalIds: [c.prof.aut2] } }));
    const rs = await Promise.allSettled([1, 2, 3].map(() => tx((t) => checkin(t, c.ctx.aut2, v.id))));
    expect(rs.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    const aud = await db.select().from(s.auditoria).where(and(eq(s.auditoria.acao, "visita.checkin"), eq(s.auditoria.entidadeId, v.id)));
    expect(aud).toHaveLength(1);
  });
});

describe("Dashboard rastreável", () => {
  it("cada balão tem o mesmo total da lista filtrada correspondente", async () => {
    const hoje = hojeSP();
    const bs = await baloesGestor(db, c.ctx.gestor, { de: primeiroDiaMes(hoje), ate: hoje });
    const get = (id: string) => bs.find((b) => b.id === id)!;
    expect(get("os_sem_equipe").quantidade).toBe((await listarOS(db, c.ctx.gestor, { semResponsavel: true, limite: 1000 })).total);
    expect(get("os_material").quantidade).toBe((await listarOS(db, c.ctx.gestor, { materialPendente: true, limite: 1000 })).total);
    expect(get("pend_sem_resp").quantidade).toBe((await listarPendencias(db, c.ctx.gestor, { semResponsavel: true, limite: 1000 })).total);
    expect(get("visitas_atrasadas").quantidade).toBe((await listarVisitas(db, c.ctx.gestor, { filtro: "atrasadas", limite: 1000 })).total);
    const { listarParcelas } = await import("@/server/services/financeiro");
    const venc = await listarParcelas(db, c.ctx.gestor, { natureza: "receber", situacao: "vencidas", limite: 1000 });
    expect(get("atraso").valorCentavos).toBe(venc.somaSaldo);
    // administrativo não recebe balões financeiros (nem valores)
    const ba = await baloesGestor(db, c.ctx.admin, { de: primeiroDiaMes(hoje), ate: hoje });
    expect(ba.some((b) => b.grupo === "financeiro")).toBe(false);
    expect(ba.every((b) => b.valorCentavos === undefined)).toBe(true);
    void conferirOS;
  });
});
