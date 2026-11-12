import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DBOrTx = DB | Tx;

const g = globalThis as unknown as { __pgPool?: Pool; __db?: DB };

function criarPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido. Copie .env.example para .env.local.");
  return new Pool({
    connectionString: url,
    max: process.env.VERCEL ? 5 : 10,
    ssl: process.env.DATABASE_SSL ? { rejectUnauthorized: true } : undefined,
  });
}

export function getPool(): Pool {
  if (!g.__pgPool) g.__pgPool = criarPool();
  return g.__pgPool;
}

export const db: DB = g.__db ?? (g.__db = drizzle(getPool(), { schema }));
export { schema };
