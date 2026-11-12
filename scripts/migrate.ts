/** Aplica migrações versionadas (drizzle/). Não destrutivo: apenas migrações novas são executadas. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL não definido");
  const pool = new Pool({ connectionString: url, ssl: process.env.DATABASE_SSL ? { rejectUnauthorized: true } : undefined });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("Migrações aplicadas.");
}
main().catch((e) => { console.error(e); process.exit(1); });
