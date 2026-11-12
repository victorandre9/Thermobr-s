# Operação: implantação, rotinas, backup

> Nada foi publicado em produção. Os passos abaixo devem ser executados por um responsável autorizado.

## Infraestrutura prevista
- **Vercel** (aplicação Next.js) · **Neon** (PostgreSQL) · **bucket privado S3 compatível** para anexos (ex.: AWS S3 ou Cloudflare R2 — escolha e contratação pendentes). `STORAGE_DRIVER=local` é recusado em produção.

## Variáveis de ambiente
Ver `.env.example` (sem segredos). Na Vercel: `APP_ENV=production`, `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (migrações), `DATABASE_SSL=1`, `APP_URL`, `STORAGE_DRIVER=s3` + `S3_*`, `CRON_SECRET`. `TREEUNFE_*` somente após validação da API de pedidos.

## Primeira implantação (homologação)
1. Criar banco no Neon (a extensão `btree_gist` é criada pela migração).
2. `DATABASE_URL_UNPOOLED=... npm run db:migrate` (somente aplica migrações novas; nenhuma é destrutiva).
3. `npm run db:bootstrap` com `EMPRESA_NOME`, `GESTOR_NOME`, `GESTOR_EMAIL`, `GESTOR_SENHA` (forte, fora do código).
4. Entrar, trocar senha, seguir **Configurações → Implantação** (data de corte, saldos iniciais, contas antigas, estoque inicial, custódias) e cadastrar a estrutura real (profissionais, vínculos, veículos, parâmetros de manutenção, valores com autônomos).
5. Nunca rodar `db:seed-demo` em produção (o script recusa com `APP_ENV=production`; contas demo também são recusadas no login).

## Rotinas agendadas (Vercel Cron — `vercel.json`)
- `mensalidades` (diária, idempotente por competência), `lembretes` (diária), `pedidos` (diária — consulta periódica, **não** é tempo real; hoje registra "ignorado" até a integração ser validada).
- Chamadas autenticadas por `CRON_SECRET`. Cada execução fica em `rotina_execucao` (sucesso, erro, tentativa); reprocessamento manual em **Configurações → Rotinas**. Repetir no mesmo período não duplica.
- O plano Hobby da Vercel só aceita cron diário (por isso todas as rotinas são diárias). No plano Pro, a rotina de pedidos pode ficar mais frequente.

## Backup e restauração
- **Ainda não há backup ativo configurado por este projeto.** No Neon, verificar/contratar a retenção de histórico (point-in-time restore) do plano escolhido.
- Backup lógico adicional (recomendado diário, fora do Neon):
  `pg_dump --format=custom --no-owner "$DATABASE_URL_UNPOOLED" > thermobras-AAAAMMDD.dump`
- Restauração em banco novo (nunca sobre produção sem decisão):
  `pg_restore --no-owner --dbname "$NOVO_DATABASE_URL" thermobras-AAAAMMDD.dump`
- Anexos: habilitar versionamento/replicação no bucket; o banco guarda apenas a chave do objeto.
- Testar a restauração periodicamente em homologação.

## Segurança operacional
- Sessões em cookie httpOnly/secure, token armazenado como hash; bloqueio após 5 tentativas em 15 min; redefinição por link de uso único (1 h) emitido pelo gestor (sem provedor de e-mail configurado).
- Desativar usuário revoga sessões (e acesso a anexos). Histórico preservado.
- Logs de auditoria não guardam senhas/tokens. Exportações CSV são auditadas e protegidas contra injeção de fórmula.

## Deploy na Vercel (projeto `thermobras`)
- Branch de produção: `main`. Cada push na `main` gera um deploy de produção; outras branches geram prévias.
- O build usa `npm run vercel-build`: sem banco, só compila; com o Neon conectado (`DATABASE_URL`), aplica as migrações e, fora de `APP_ENV=production`, cria os dados de demonstração uma única vez.
- Para a demonstração, não defina `APP_ENV=production` (a tela de escolha de usuário só aparece fora de produção).
