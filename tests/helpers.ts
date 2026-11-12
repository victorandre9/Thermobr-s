import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, and } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { carregarCtx, type Ctx } from "@/server/auth/contexto";
import { garantirEstrutura } from "@/server/services/estrutura";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
export const db = drizzle(pool, { schema });
export type TDB = typeof db;

let seq = 0;
export async function novoUsuario(empresaId: string, nome: string, papeis: string[], prof?: { vinculo: "autonomo" | "proprio"; veiculoId?: string | null }) {
  seq++;
  const [u] = await db.insert(schema.usuario).values({ empresaId, nome, email: `${nome.toLowerCase().replace(/\W/g, "")}${seq}-${Math.random().toString(36).slice(2, 8)}@teste.local` }).returning();
  for (const codigo of papeis) {
    const [p] = await db.select().from(schema.papel).where(and(eq(schema.papel.empresaId, empresaId), eq(schema.papel.codigo, codigo)));
    await db.insert(schema.usuarioPapel).values({ usuarioId: u.id, papelId: p.id });
  }
  let profissionalId: string | null = null;
  if (prof) {
    const [p] = await db.insert(schema.profissional).values({ empresaId, nome, vinculo: prof.vinculo, usuarioId: u.id, veiculoId: prof.veiculoId ?? null }).returning();
    await db.insert(schema.materialPosicao).values({ empresaId, tipo: "profissional", nome: `Custódia — ${nome}`, profissionalId: p.id });
    profissionalId = p.id;
  }
  return { usuarioId: u.id, profissionalId };
}

export async function ctxDe(usuarioId: string): Promise<Ctx> {
  const c = await carregarCtx(db, usuarioId);
  if (!c) throw new Error("ctx");
  return c;
}

export async function cenario() {
  const [emp] = await db.insert(schema.empresa).values({ nome: `Empresa teste ${Date.now()}-${Math.random()}` }).returning();
  await db.transaction((tx) => garantirEstrutura(tx, emp.id));
  const [v1] = await db.insert(schema.veiculo).values({ empresaId: emp.id, identificacao: "V1" }).returning();
  const [v2] = await db.insert(schema.veiculo).values({ empresaId: emp.id, identificacao: "V2" }).returning();
  const g = await novoUsuario(emp.id, "Gestor", ["gestor"]);
  const g2 = await novoUsuario(emp.id, "Socio", ["gestor"]);
  const adm = await novoUsuario(emp.id, "Admin", ["administrativo"]);
  const fin = await novoUsuario(emp.id, "Financeiro", ["financeiro_operador"]);
  const aut = await novoUsuario(emp.id, "Autonomo", ["tecnico"], { vinculo: "autonomo" });
  const aut2 = await novoUsuario(emp.id, "Autonomo Dois", ["tecnico"], { vinculo: "autonomo" });
  const prop = await novoUsuario(emp.id, "Proprio", ["tecnico"], { vinculo: "proprio", veiculoId: v1.id });
  const ctx = {
    gestor: await ctxDe(g.usuarioId), gestor2: await ctxDe(g2.usuarioId), admin: await ctxDe(adm.usuarioId), fin: await ctxDe(fin.usuarioId),
    aut: await ctxDe(aut.usuarioId), aut2: await ctxDe(aut2.usuarioId), prop: await ctxDe(prop.usuarioId),
  };
  const [cli] = await db.insert(schema.cliente).values({ empresaId: emp.id, nome: "Cliente Teste" }).returning();
  const [local] = await db.insert(schema.clienteLocal).values({ clienteId: cli.id, nome: "Sede" }).returning();
  const [eq1] = await db.insert(schema.equipamento).values({ clienteId: cli.id, localId: local.id, tipo: "split" }).returning();
  const [conta] = await db.insert(schema.contaFinanceira).values({ empresaId: emp.id, nome: "Banco A", saldoInicialCentavos: 100000, saldoInicialData: "2026-01-01" }).returning();
  const [conta2] = await db.insert(schema.contaFinanceira).values({ empresaId: emp.id, nome: "Caixa", saldoInicialCentavos: 0, saldoInicialData: "2026-01-01" }).returning();
  return { empresaId: emp.id, ctx, v1, v2, cli, local, eq1, conta, conta2, prof: { aut: aut.profissionalId!, aut2: aut2.profissionalId!, prop: prop.profissionalId! } };
}

export const tx = <T>(fn: (t: Parameters<Parameters<TDB["transaction"]>[0]>[0]) => Promise<T>) => db.transaction(fn);

export function amanha(h: number, durH = 2) {
  const d = new Date(Date.now() + 86400000); d.setUTCHours(h, 0, 0, 0);
  return [d, new Date(d.getTime() + durH * 3600000)] as const;
}
