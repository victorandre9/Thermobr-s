import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { qc } from "../db/sql";
import type { DBOrTx } from "../db";
import { cliente, clienteContato, clienteLocal, contrato, contratoLocal, equipamento, fornecedor, ordemServico } from "../db/schema";
import { type Ctx, exigir, pode } from "../auth/contexto";
import { ErroAcesso, ErroNegocio } from "../erros";
import { auditar } from "./auditoria";
import { clienteDoProfissionalSQL } from "./escopo";

// ---------------------------------------------------------------- clientes
export async function listarClientes(dbx: DBOrTx, ctx: Ctx, f: { busca?: string; limite?: number; offset?: number } = {}) {
  exigir(ctx, "cliente.ver", "empresa"); // carteira completa só para escopo empresa
  const conds = [eq(cliente.empresaId, ctx.empresaId)];
  if (f.busca) conds.push(or(ilike(cliente.nome, `%${f.busca}%`), ilike(cliente.documento, `%${f.busca}%`))!);
  const rows = await dbx.select({
    id: cliente.id, nome: cliente.nome, tipo: cliente.tipo, documento: cliente.documento, telefone: cliente.telefone, ativo: cliente.ativo, demo: cliente.demo,
    locais: sql<number>`(select count(*)::int from ${clienteLocal} l where l.cliente_id = ${qc(cliente.id)})`,
    equipamentos: sql<number>`(select count(*)::int from ${equipamento} e where e.cliente_id = ${qc(cliente.id)})`,
    contratosAtivos: sql<number>`(select count(*)::int from ${contrato} c where c.cliente_id = ${qc(cliente.id)} and c.status = 'ativo')`,
    total: sql<number>`count(*) over()::int`,
  }).from(cliente).where(and(...conds)).orderBy(asc(cliente.nome)).limit(f.limite ?? 50).offset(f.offset ?? 0);
  return { rows, total: rows[0]?.total ?? 0 };
}

export async function exigirAcessoCliente(dbx: DBOrTx, ctx: Ctx, clienteId: string) {
  if (pode(ctx, "cliente.ver", "empresa")) {
    const [c] = await dbx.select({ id: cliente.id }).from(cliente).where(and(eq(cliente.id, clienteId), eq(cliente.empresaId, ctx.empresaId)));
    if (c) return;
  } else if (pode(ctx, "cliente.ver", "proprio") && ctx.profissional) {
    const [c] = await dbx.select({ id: cliente.id }).from(cliente).where(and(eq(cliente.id, clienteId), clienteDoProfissionalSQL(ctx.profissional.id, sql`${qc(cliente.id)}`)));
    if (c) return;
  }
  throw new ErroAcesso();
}

export async function obterCliente(dbx: DBOrTx, ctx: Ctx, id: string) {
  exigir(ctx, "cliente.ver", "empresa");
  const [c] = await dbx.select().from(cliente).where(and(eq(cliente.id, id), eq(cliente.empresaId, ctx.empresaId)));
  if (!c) throw new ErroAcesso();
  const [contatos, locais, equipamentos, contratos, oss] = await Promise.all([
    dbx.select().from(clienteContato).where(eq(clienteContato.clienteId, id)).orderBy(desc(clienteContato.principal), asc(clienteContato.nome)),
    dbx.select().from(clienteLocal).where(eq(clienteLocal.clienteId, id)).orderBy(asc(clienteLocal.nome)),
    dbx.select().from(equipamento).where(eq(equipamento.clienteId, id)).orderBy(asc(equipamento.identificacao)),
    pode(ctx, "contrato.ver") ? dbx.select().from(contrato).where(eq(contrato.clienteId, id)).orderBy(desc(contrato.inicio)) : Promise.resolve([]),
    pode(ctx, "os.ver") ? dbx.select({ id: ordemServico.id, numero: ordemServico.numero, etapa: ordemServico.etapa, origem: ordemServico.origem, descricao: ordemServico.descricao, criadoEm: ordemServico.criadoEm })
      .from(ordemServico).where(eq(ordemServico.clienteId, id)).orderBy(desc(ordemServico.numero)).limit(50) : Promise.resolve([]),
  ]);
  const verValores = pode(ctx, "contrato.valores.ver");
  return { cliente: c, contatos, locais, equipamentos, contratos: contratos.map((k) => ({ ...k, valorMensalCentavos: verValores ? k.valorMensalCentavos : null })), oss };
}

export interface DadosCliente { tipo: string; nome: string; documento?: string | null; email?: string | null; telefone?: string | null; observacoes?: string | null; versao?: number }
export async function salvarCliente(tx: DBOrTx, ctx: Ctx, id: string | null, d: DadosCliente) {
  exigir(ctx, "cliente.gerenciar");
  if (!d.nome.trim()) throw new ErroNegocio("Informe o nome do cliente.", "nome");
  if (id) {
    const [antes] = await tx.select().from(cliente).where(and(eq(cliente.id, id), eq(cliente.empresaId, ctx.empresaId)));
    if (!antes) throw new ErroAcesso();
    const { versao, ...dados } = d;
    const [c] = await tx.update(cliente).set({ ...dados, versao: antes.versao + 1 }).where(and(eq(cliente.id, id), eq(cliente.versao, versao ?? antes.versao))).returning();
    if (!c) throw new ErroNegocio("Este registro foi alterado por outro usuário depois que você abriu a tela. Recarregue para ver a versão atual e refaça a alteração.");
    await auditar(tx, ctx, { acao: "cliente.atualizado", entidadeTipo: "cliente", entidadeId: id, antes, depois: c });
    return c;
  }
  const { versao: _v, ...novo } = d; void _v;
  const [c] = await tx.insert(cliente).values({ ...novo, empresaId: ctx.empresaId }).returning();
  await auditar(tx, ctx, { acao: "cliente.criado", entidadeTipo: "cliente", entidadeId: c.id, depois: c });
  return c;
}

async function clienteDaEmpresa(tx: DBOrTx, ctx: Ctx, clienteId: string) {
  const [c] = await tx.select({ id: cliente.id }).from(cliente).where(and(eq(cliente.id, clienteId), eq(cliente.empresaId, ctx.empresaId)));
  if (!c) throw new ErroAcesso();
}

export async function salvarContato(tx: DBOrTx, ctx: Ctx, clienteId: string, id: string | null, d: { nome: string; telefone?: string | null; email?: string | null; cargo?: string | null; principal?: boolean }) {
  exigir(ctx, "cliente.gerenciar"); await clienteDaEmpresa(tx, ctx, clienteId);
  if (id) { const [r] = await tx.update(clienteContato).set(d).where(and(eq(clienteContato.id, id), eq(clienteContato.clienteId, clienteId))).returning(); return r; }
  const [r] = await tx.insert(clienteContato).values({ ...d, clienteId }).returning();
  await auditar(tx, ctx, { acao: "cliente.contato_criado", entidadeTipo: "cliente", entidadeId: clienteId, depois: r });
  return r;
}

export async function salvarLocal(tx: DBOrTx, ctx: Ctx, clienteId: string, id: string | null, d: Omit<typeof clienteLocal.$inferInsert, "id" | "clienteId">) {
  exigir(ctx, "cliente.gerenciar"); await clienteDaEmpresa(tx, ctx, clienteId);
  if (!d.nome?.trim()) throw new ErroNegocio("Informe o nome do local.", "nome");
  if (id) { const [r] = await tx.update(clienteLocal).set(d).where(and(eq(clienteLocal.id, id), eq(clienteLocal.clienteId, clienteId))).returning(); return r; }
  const [r] = await tx.insert(clienteLocal).values({ ...d, clienteId }).returning();
  await auditar(tx, ctx, { acao: "cliente.local_criado", entidadeTipo: "cliente", entidadeId: clienteId, depois: r });
  return r;
}

export async function salvarEquipamento(tx: DBOrTx, ctx: Ctx, clienteId: string, id: string | null, d: Omit<typeof equipamento.$inferInsert, "id" | "clienteId">) {
  exigir(ctx, "cliente.gerenciar"); await clienteDaEmpresa(tx, ctx, clienteId);
  if (d.localId) {
    const [l] = await tx.select().from(clienteLocal).where(and(eq(clienteLocal.id, d.localId), eq(clienteLocal.clienteId, clienteId)));
    if (!l) throw new ErroNegocio("Local não pertence ao cliente.");
  }
  if (id) { const [r] = await tx.update(equipamento).set(d).where(and(eq(equipamento.id, id), eq(equipamento.clienteId, clienteId))).returning(); return r; }
  const [r] = await tx.insert(equipamento).values({ ...d, clienteId }).returning();
  await auditar(tx, ctx, { acao: "cliente.equipamento_criado", entidadeTipo: "cliente", entidadeId: clienteId, depois: r });
  return r;
}

export async function opcoesClientes(dbx: DBOrTx, ctx: Ctx) {
  exigir(ctx, "cliente.ver", "empresa");
  return dbx.select({ id: cliente.id, nome: cliente.nome }).from(cliente).where(and(eq(cliente.empresaId, ctx.empresaId), eq(cliente.ativo, true))).orderBy(asc(cliente.nome));
}

// ---------------------------------------------------------------- fornecedores
export async function listarFornecedores(dbx: DBOrTx, ctx: Ctx) {
  if (!pode(ctx, "fornecedor.gerenciar") && !pode(ctx, "financeiro.ver") && !pode(ctx, "material.movimentar")) throw new ErroAcesso();
  return dbx.select().from(fornecedor).where(eq(fornecedor.empresaId, ctx.empresaId)).orderBy(asc(fornecedor.nome));
}
export async function salvarFornecedor(tx: DBOrTx, ctx: Ctx, id: string | null, d: { nome: string; documento?: string | null; telefone?: string | null; email?: string | null; observacoes?: string | null }) {
  if (!pode(ctx, "fornecedor.gerenciar") && !pode(ctx, "financeiro.lancar")) throw new ErroAcesso();
  if (!d.nome.trim()) throw new ErroNegocio("Informe o nome.", "nome");
  if (id) { const [r] = await tx.update(fornecedor).set(d).where(and(eq(fornecedor.id, id), eq(fornecedor.empresaId, ctx.empresaId))).returning(); return r; }
  const [r] = await tx.insert(fornecedor).values({ ...d, empresaId: ctx.empresaId }).returning();
  await auditar(tx, ctx, { acao: "fornecedor.criado", entidadeTipo: "fornecedor", entidadeId: r.id, depois: r });
  return r;
}

// ---------------------------------------------------------------- contratos
export async function listarContratos(dbx: DBOrTx, ctx: Ctx) {
  exigir(ctx, "contrato.ver");
  const verValores = pode(ctx, "contrato.valores.ver");
  const rows = await dbx.select({ c: contrato, clienteNome: cliente.nome }).from(contrato).innerJoin(cliente, eq(cliente.id, contrato.clienteId))
    .where(eq(contrato.empresaId, ctx.empresaId)).orderBy(asc(cliente.nome));
  return rows.map((r) => ({ ...r.c, clienteNome: r.clienteNome, valorMensalCentavos: verValores ? r.c.valorMensalCentavos : null }));
}

export interface DadosContrato { clienteId: string; numero: string; descricao?: string | null; cobertura?: string | null; valorMensalCentavos?: number | null; inicio: string; fim?: string | null; diaVencimento: number; visitasIncluidasMes?: number | null; status: string; locais?: string[]; versao?: number }
export async function salvarContrato(tx: DBOrTx, ctx: Ctx, id: string | null, d: DadosContrato) {
  exigir(ctx, "contrato.gerenciar");
  await clienteDaEmpresa(tx, ctx, d.clienteId);
  if (d.diaVencimento < 1 || d.diaVencimento > 31) throw new ErroNegocio("Dia de vencimento inválido.", "diaVencimento");
  if (d.fim && d.fim < d.inicio) throw new ErroNegocio("Fim da vigência anterior ao início.", "fim");
  const { locais, versao, ...dados } = d;
  // Valor só pode ser definido/alterado por quem vê valores; caso contrário preserva o existente.
  if (!pode(ctx, "contrato.valores.ver")) delete (dados as Partial<DadosContrato>).valorMensalCentavos;
  let r;
  if (id) {
    const [antes] = await tx.select().from(contrato).where(and(eq(contrato.id, id), eq(contrato.empresaId, ctx.empresaId)));
    if (!antes) throw new ErroAcesso();
    [r] = await tx.update(contrato).set({ ...dados, versao: antes.versao + 1 }).where(and(eq(contrato.id, id), eq(contrato.versao, versao ?? antes.versao))).returning();
    if (!r) throw new ErroNegocio("Este registro foi alterado por outro usuário depois que você abriu a tela. Recarregue para ver a versão atual e refaça a alteração.");
    await auditar(tx, ctx, { acao: "contrato.atualizado", entidadeTipo: "contrato", entidadeId: id, antes, depois: r, sensivel: antes.valorMensalCentavos !== r.valorMensalCentavos });
  } else {
    [r] = await tx.insert(contrato).values({ ...dados, empresaId: ctx.empresaId }).returning();
    await auditar(tx, ctx, { acao: "contrato.criado", entidadeTipo: "contrato", entidadeId: r.id, depois: r });
  }
  if (locais) {
    await tx.delete(contratoLocal).where(eq(contratoLocal.contratoId, r.id));
    if (locais.length) await tx.insert(contratoLocal).values(locais.map((localId) => ({ contratoId: r.id, localId })));
  }
  return r;
}
