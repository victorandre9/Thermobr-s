// Build na Vercel: se houver banco conectado, aplica migrações (não destrutivas) e,
// fora de produção, cria os dados de demonstração uma única vez. Depois, next build.
import { execSync } from "node:child_process";
const run = (c) => execSync(c, { stdio: "inherit", env: process.env });
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (url) {
  process.env.DATABASE_URL ||= url;
  console.log("[vercel-build] Banco encontrado: aplicando migrações…");
  run("npx tsx scripts/migrate.ts");
  if (process.env.APP_ENV !== "production") { console.log("[vercel-build] Demonstração: garantindo dados demo…"); run("npx tsx scripts/seed-demo.ts"); }
} else {
  console.log("[vercel-build] Sem DATABASE_URL: conecte o Neon (Storage) para o app funcionar. Build segue.");
}
run("npx next build");
