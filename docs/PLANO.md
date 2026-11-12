# Plano de execução — Thermobrás Gestão

Arquivo vivo. Atualize o checklist ao concluir cada item para permitir retomada se a sessão cair.

## Arquitetura

| Camada | Escolha | Motivo |
|---|---|---|
| Web | Next.js 16 (App Router) + React 19 + TypeScript | Vercel nativo, server components/actions |
| Estilo | Tailwind CSS 4 + tokens CSS próprios | Tema claro "Galato empresarial" adaptado com azul-gelo |
| Banco | PostgreSQL (Neon) via `pg` + Drizzle ORM | Migrações versionadas, transações, SQL explícito |
| Auth | Sessão própria: senha bcrypt, token aleatório em cookie httpOnly, hash SHA-256 no banco | Sem dependência externa; recuperação por link de uso único emitido pelo gestor |
| Autorização | Matriz `recurso.ação` × escopo (`proprio`/`empresa`) por papel + concessões individuais; checada nos serviços | Nunca só na UI |
| Anexos | Driver `local` (dev) / `s3` (S3 compatível privado); download só por rota autorizada | Sem links públicos permanentes |
| Testes | Vitest contra Postgres real (`thermobras_test`) | Regras de concorrência/unicidade dependem do banco |

Pastas:

```
src/app            rotas (UI + route handlers)
src/server/db      schema Drizzle e conexão
src/server/auth    sessão, contexto, matriz de permissões
src/server/services regras de negócio (toda escrita passa aqui, com ctx)
src/lib            utilidades puras (dinheiro, quantidade, datas BR)
src/components     UI reutilizável
drizzle/           migrações SQL versionadas
scripts/           migrate, seed-demo, bootstrap-admin
tests/             testes de aceite e regras
```

Princípios de consistência:
- Dinheiro em centavos inteiros (`bigint`); quantidades `numeric(14,3)` + unidade do material.
- Instantes `timestamptz` (UTC); datas de vencimento/competência `date` sem fuso; exibição America/Sao_Paulo.
- Agenda: `agenda_reserva` com `EXCLUDE USING gist` impede sobreposição de profissional no banco.
- Materiais: razão de movimentos + `material_saldo` com `CHECK (quantidade >= 0)`; confirmação por `UPDATE ... WHERE status = pendente`.
- Financeiro: obrigação → parcelas → baixas; só baixa confirmada altera realizado; estorno é baixa inversa; chave de unicidade por origem.
- Auditoria em toda mudança relevante (autor, ação, motivo, antes/depois).

## Fases e checklist

### Fase 0 — Base
- [x] Inspeção (repositório vazio; tema Galato lido como referência visual)
- [x] Scaffold Next/TS/Tailwind/Drizzle/Vitest
- [ ] Schema completo + migração inicial (+ SQL de exclusão/checks)
- [ ] Conexão, transações, auditoria
- [ ] Autenticação (login, sessão, logout, troca/redefinição de senha, bloqueio por tentativas)
- [ ] Matriz de permissões + papéis padrão + vínculo profissional
- [ ] Layout (menu lateral desktop, navegação curta mobile), tema, estados vazios/erro

### Fase 1 — Cadastros e acessos
- [ ] Usuários/papéis/permissões (gestor), sem autopromoção, desativação preserva histórico
- [ ] Profissionais (vínculo autônomo/próprio, veículo designado)
- [ ] Clientes, contatos, locais, equipamentos
- [ ] Fornecedores, contratos
- [ ] Configurações (vagas de agenda, prazos, políticas)

### Fase 2 — Pedidos, OS, agenda, visitas
- [ ] Adaptador de pedidos (Treeunfe "aguardando validação", demo identificado), idempotência, histórico de sync, conferência de alterações
- [ ] OS (numeração, origens, itens com preço/custo restritos, dimensões de status separadas)
- [ ] Agenda dia/semana, vagas configuráveis, reserva atômica de equipe, reagendamento com histórico, indisponibilidades
- [ ] Fluxo técnico mobile: minhas visitas, check-in/out idempotente, ficha por equipamento, resultado e motivos, solicitações (extra, retorno, material)
- [ ] Conferência administrativa, retorno/garantia vinculada

### Fase 3 — Ativos
- [ ] Ferramentas: custódia, movimentos com confirmação, transferência, checklist saída/retorno reutilizável, pendências
- [ ] Veículos: cadastro, odômetro (redução só com correção autorizada), checklist (elegibilidade!), irregularidades/tratativas, manutenções, pneus, alertas data/KM
- [ ] Materiais: unidades, posições (almoxarifado/veículo/profissional/segregado), reserva, entrega/confirmação, consumo/devolução informados e conferidos, transferência, retalhos, divergências, perdas aprovadas, conciliação por OS, compras

### Fase 4 — Financeiro operacional
- [ ] Contas financeiras e saldo inicial (gestor)
- [ ] Obrigações a receber/pagar, parcelas, baixas parciais, conferência, estorno, transferência entre contas
- [ ] Aprovações (autoaprovação explícita, dupla aprovação configurável, categorias restritas)
- [ ] Contratos: mensalidade por competência única
- [ ] Autônomos: valor combinado, conferência, liberação, resumo semanal, adiantamentos
- [ ] Cobrança: contatos, próxima ação
- [ ] Fluxo realizado/previsto 7/15/30/60/90 com premissas e lacunas

### Fase 5 — Dashboards, notificações, relatórios
- [ ] Balões por perfil com lista filtrada de mesmo total
- [ ] Notificações agrupadas
- [ ] Relatórios 1–11 com CSV autorizado e paginação; acompanhamento 6/12 meses
- [ ] Auditoria consultável

### Fase 6 — Validação
- [ ] Testes de aceite (seção 16)
- [ ] Revisão desktop/mobile (screenshots)
- [ ] Documentação final (README, ACESSOS, FLUXOS, OPERACAO)

## Pendências externas (bloqueantes só para a parte indicada)
- Logo oficial em arquivo (enviar `public/brand/thermobras-logo.png`). Até lá, o nome aparece em texto simples.
- API de pedidos Treeunfe: confirmar documentação oficial e permissão do plano contratado.
- Credenciais Neon / bucket privado S3 compatível / domínio — configuração na Vercel.
- Estrutura real da equipe (nomes, vínculos), valores combinados com autônomos, parâmetros de manutenção por veículo.
