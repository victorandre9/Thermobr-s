<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Thermobrás — instruções do projeto

- Leia `docs/PLANO.md` (plano + checklist) antes de alterar. Atualize o checklist ao concluir itens.
- Toda escrita passa por `src/server/services/*` com `Ctx`; autorização no serviço (nunca só na UI). Server actions usam `executar()` de `src/server/acao.ts`.
- Dinheiro: centavos inteiros. Quantidades: `numeric(14,3)` com `toMilli/fromMilli`. Datas de calendário como `YYYY-MM-DD`; instantes em UTC exibidos em America/Sao_Paulo (`src/lib/datas.ts`).
- Em `sql\`...\`` dentro de SELECT de tabela única, use `qc(coluna)` (Drizzle não qualifica colunas nesse caso). Colunas criadas com `criadoEm()` se chamam `criado_em` no banco.
- Migrações: `npm run db:generate` (Drizzle) + migrações custom em `drizzle/*` para EXCLUDE/CHECK. Nunca destrutivas sem autorização.
- Testes: `npm test` (Postgres local `thermobras_test`, recriado a cada execução).
- Visual: tema "vidro claro" (branco com gelo) inspirado no tema Empresarial do Galato — tokens e classes em `src/app/globals.css`. Só o visual; não copiar funcionalidades do Galato.
