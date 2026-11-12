# Thermobrás — gestão operacional e financeira

Aplicativo web (desktop e celular) para a operação da Thermobrás: pedidos → OS → agenda → atendimento em campo, ferramentas, veículos, materiais e financeiro operacional (cobranças, pagamentos, autônomos e previsão de caixa).

> Não faz emissão fiscal, cálculo de impostos, folha de pagamento, PIX/boletos ou integração bancária. Registrar um recebimento/pagamento aqui registra um **fato**; não movimenta dinheiro.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL (Neon) com Drizzle ORM · sessão própria (bcrypt + cookie httpOnly) · anexos em armazenamento privado (local em dev, S3 compatível em produção) · PDF com `@react-pdf/renderer` (MIT) · testes com Vitest contra Postgres real.

## Rodar localmente

Pré-requisitos: Node 22+, PostgreSQL 16 com a extensão `btree_gist` disponível.

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
createdb thermobras_dev
```

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/thermobras_dev npm run db:migrate
```

Dados FICTÍCIOS de demonstração (bloqueado com `APP_ENV=production`):

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/thermobras_dev npm run db:seed-demo
```

```bash
npm run dev
```

Acesse http://localhost:3000. Contas demo (senha `Demo-thermo-2026`, só fora de produção): `gestor@`, `socio@`, `admin@`, `financeiro@`, `autonomo.a@`, `autonomo.b@`, `autonomo.c@`, `proprio1@`, `proprio2@` — todas `@demo.thermobras.local`.

Primeiro gestor real (homologação/produção, sem dados demo):

```bash
DATABASE_URL=... EMPRESA_NOME="Thermobrás" GESTOR_NOME="Nome" GESTOR_EMAIL="email@empresa" GESTOR_SENHA="senha-forte" npm run db:bootstrap
```

## Testes

```bash
npm test
```

Usa o banco `thermobras_test` (recriado a cada execução; o nome precisa conter "test"). Cobre os critérios de aceite do escopo e do aditivo (43 testes): permissões por perfil, checklist de veículo do autônomo, concorrência de agenda e estoque, idempotência de pedidos/baixas/confirmações, cobrança única por OS/contrato, recebimento parcial, projeção de caixa, conciliação de materiais 10/7/3, PDF externo sem dados internos, versão otimista e rotinas.

```bash
npm run typecheck
```

## Documentação

- `docs/PLANO.md` — arquitetura, plano e checklist de entregas (atualizado)
- `docs/ACESSOS.md` — matriz de permissões por papel (gerada do código)
- `docs/FLUXOS.md` — fluxos implementados e regras de negócio
- `docs/OPERACAO.md` — implantação na Vercel/Neon, variáveis, rotinas, backup e restauração
- `docs/BACKLOG.md` — evoluções fora desta entrega
- `AGENTS.md` — convenções para quem for continuar o desenvolvimento

## Identidade visual

Tema claro "vidro" (branco com gelo) a partir do tema Empresarial do Galato, com azul-marinho #102238, verdes #187B51/#36C86D, cinza #657486 e fundos suaves. A logo oficial ainda não foi adicionada como arquivo: coloque-a em `public/brand/` e informe o caminho em `src/lib/marca.ts` (`LOGO_SRC`). Até lá, o nome aparece em texto. Assinatura discreta da Mafra no rodapé do menu.
