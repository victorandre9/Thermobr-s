// Build na Vercel: se houver banco conectado, aplica migrações (não destrutivas) e,
// fora de produção, cria os dados de demonstração uma única vez. Depois, next build.
// Falha na carga de demonstração NÃO bloqueia o deploy (só avisa no log).
import { execSync } from "node:child_process";
const run = (c, env = process.env) => execSync(c, { stdio: "inherit", env });
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (url) {
  process.env.DATABASE_URL ||= url;
  const direto = { ...process.env, DATABASE_URL: url }; // scripts usam conexão direta (sem pooler)
  console.log("[vercel-build] Banco encontrado: aplicando migrações…");
  run("npx tsx scripts/migrate.ts", direto);
  if (process.env.APP_ENV !== "production") {
    console.log("[vercel-build] Demonstração: garantindo dados demo…");
    try { run("npx tsx scripts/seed-demo.ts", direto); }
    catch { console.warn("[vercel-build] AVISO: carga de demonstração falhou (ver erro acima). Build segue; app abre com o que já existe no banco."); }
  }
} else {
  console.log("[vercel-build] Sem DATABASE_URL: conecte o Neon (Storage) para o app funcionar. Build segue.");
}
run("npx next build");
