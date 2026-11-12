/**
 * Cria a empresa e o primeiro gestor (homologação/produção). Idempotente: se o e-mail existir, não faz nada.
 * Não cria dados de demonstração. Senha vem de variável de ambiente (nunca fixa no código).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { and, eq, sql } from "drizzle-orm";
import * as s from "../src/server/db/schema";
import { garantirEstrutura } from "../src/server/services/estrutura";
import { hashSenha, validarForcaSenha } from "../src/server/auth/senha";

async function main() {
  const { DATABASE_URL, EMPRESA_NOME, GESTOR_NOME, GESTOR_EMAIL, GESTOR_SENHA } = process.env;
  if (!DATABASE_URL || !EMPRESA_NOME || !GESTOR_NOME || !GESTOR_EMAIL || !GESTOR_SENHA) throw new Error("Defina DATABASE_URL, EMPRESA_NOME, GESTOR_NOME, GESTOR_EMAIL e GESTOR_SENHA.");
  const f = validarForcaSenha(GESTOR_SENHA); if (f) throw new Error(f);
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: process.env.DATABASE_SSL ? { rejectUnauthorized: true } : undefined });
  const db = drizzle(pool, { schema: s });
  const [ja] = await db.select().from(s.usuario).where(sql`lower(${s.usuario.email}) = ${GESTOR_EMAIL.toLowerCase()}`);
  if (ja) { console.log("Usuário já existe; nada a fazer."); await pool.end(); return; }
  await db.transaction(async (tx) => {
    let [emp] = await tx.select().from(s.empresa).where(eq(s.empresa.nome, EMPRESA_NOME));
    if (!emp) [emp] = await tx.insert(s.empresa).values({ nome: EMPRESA_NOME }).returning();
    await garantirEstrutura(tx, emp.id);
    const [u] = await tx.insert(s.usuario).values({ empresaId: emp.id, nome: GESTOR_NOME, email: GESTOR_EMAIL.toLowerCase(), senhaHash: await hashSenha(GESTOR_SENHA), deveTrocarSenha: true }).returning();
    const [p] = await tx.select().from(s.papel).where(and(eq(s.papel.empresaId, emp.id), eq(s.papel.codigo, "gestor")));
    await tx.insert(s.usuarioPapel).values({ usuarioId: u.id, papelId: p.id });
  });
  console.log("Empresa e gestor criados. Troca de senha será exigida no primeiro acesso.");
  await pool.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
