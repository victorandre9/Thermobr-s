# Diagnóstico para a reformulação (Polar OS)

> Feito em 2026-11-27 sobre o commit `17fc845` (branch `claude/skills-ecc`). Somente leitura: nenhum código foi alterado.
> Ferramentas usadas: skill **codebase-onboarding** (seções 1–2), agente **code-explorer** (seção 2), skill **click-path-audit** (seção 3), agente **spec-miner** (seção 4).
> O click-path foi feito lendo o código das telas, não clicando no navegador. Números de cliques são o mínimo no caminho feliz.

## Resumo em 6 linhas

1. **Visita não existe sozinha**: sempre nasce dentro de uma OS. "Criar visita" = abrir OS → "Nova visita" → "Programar".
2. **Técnico não fica na visita**: a equipe é a tabela `agenda_reserva` (uma linha por profissional). Ela também define o que o técnico pode ver.
3. **Material fica em 3 lugares sem ligação entre si**: previsão (`os_item`), reserva (`material_reserva`) e movimento (`material_movimento`). Tudo é conciliado **por OS**, nunca por visita ou técnico.
4. **Fluxo do gestor**: OS já existente → ~8 a 10 cliques, 3 telas, 4 cargas de página. Do zero → ~12 a 14 cliques, 4 telas.
5. **Maiores perdas de contexto**:
   - o material não se liga à visita nem ao técnico (CP-05);
   - um item incluído depois na OS não entra na previsão de material (CP-07);
   - mudar a data sem clicar "Verificar" agenda no horário antigo (CP-03).
6. **Cerca de 150 regras de negócio** estão listadas na seção 4. Toda reformulação precisa preservá-las, ou descartar alguma de forma consciente.

---

## 1. Visão geral (onboarding)

| Camada | Tecnologia |
|---|---|
| App | Next.js 16 (App Router, `src/proxy.ts`), React 19, TypeScript 5.9 |
| Visual | Tailwind 4, tema "vidro claro" (`src/app/globals.css`), ícones lucide |
| Dados | PostgreSQL + Drizzle ORM (`src/server/db/schema.ts`, ~1190 linhas); restrições extras em `drizzle/0001`, `0003`, `0004` (CHECK/EXCLUDE) |
| Arquivos | S3 compatível (`STORAGE_DRIVER`), PDF com `@react-pdf/renderer` |
| Testes | Vitest: `tests/aceite.test.ts`, `tests/aditivo.test.ts` (Postgres `thermobras_test`) |
| Publicação | Vercel + Neon; crons diários (`vercel.json`) |

**Caminho de uma ação (do clique até o banco):**
1. Tela (server component) em `src/app/(app)/<área>/page.tsx`.
2. O formulário `ActionForm` (`src/components/action-form.tsx`) envia uma chave `_idem`, para que dois toques não dupliquem a ação.
3. A server action em `<área>/actions.ts` chama `executar()` (`src/server/acao.ts`). Ele abre uma transação, monta o `Ctx` e traduz os erros em mensagem.
4. O serviço em `src/server/services/<área>.ts` faz a autorização (`exigir` / `exigirAcesso*`), filtra por empresa, grava, audita e trava as linhas com `for update`.
5. O Postgres garante o que é crítico: EXCLUDE de agenda e recurso, CHECK de saldo e chaves únicas.

**Comandos:**
- `npm run dev` — sobe o app em desenvolvimento.
- `npm test` — roda os testes.
- `npm run typecheck` — confere os tipos.
- `npm run db:generate` e `npm run db:migrate` — geram e aplicam migrações.
- `npm run db:seed-demo` — carrega dados de demonstração (nunca em produção).

---

## 2. Mapa do app

### 2.1 Entidades principais e como se ligam

```
cliente ─┬─ cliente_local ── equipamento
         ├─ cliente_contato
         └─ contrato ── contrato_local
pedido_externo ──(1:1)──► ordem_servico (OS)
                              │  clienteId, localId, contatoId, contratoId, osOrigemId (retorno)
                              ├─ os_equipamento (N:N equipamento)
                              ├─ os_item (serviço/peça/material previsto ou extra; materialId SEM FK)
                              ├─ material_reserva (reserva do estoque, por OS)
                              └─ visita (1:N, sequência 1,2,3…)
                                   ├─ agenda_reserva (1 linha por profissional = EQUIPE; responsável/auxiliar)
                                   ├─ recurso_reserva (veículo / ferramenta exclusiva)
                                   ├─ visita_participacao (chegada/saída de cada um)
                                   ├─ visita_execucao (ficha por equipamento)
                                   └─ relatorio_atendimento
usuario ──(0..1)── profissional (técnico: vínculo próprio/autônomo, competências, regiões)
material ── material_saldo (por posição: almoxarifado, veículo, profissional…)
         └─ material_movimento (entrega, consumo, devolução…; osId/visitaId SEM FK)
```

**Status:**
- **OS** tem várias dimensões separadas:
  - `etapa`, que é **calculada** por `recalcularEtapa` em `os.ts:204` e não é editada à mão;
  - `situacaoComercial`;
  - `situacaoMaterial`, que é **manual**;
  - `situacaoConferencia`;
  - `prioridade`.
- **Visita**: `nao_agendada → agendada → em_atendimento → finalizada`, ou `cancelada`. O resultado pode ser `concluida`, `parcial` ou `nao_realizada`.
- **Material**: o movimento passa por `informado`, `em_transito`, `confirmado`, `recusado` ou `cancelado`. A reserva fica `ativa`, `atendida` ou `cancelada`.

**Ligações importantes:**
- **Pedido → OS**: `criarOSDoPedido` (`pedidos.ts:115`). Um pedido gera no máximo uma OS.
- **OS → visita**: `criarVisita` (`agenda.ts:17`). Se já vier com horário e equipe, chama `agendarVisita` (`agenda.ts:34`).
- **Visita → técnico**: existe só por `agenda_reserva`. Não há campo `visita.tecnicoId`. O acesso do técnico a OS, visita e cliente depende de ele ter reserva **ativa** (`escopo.ts`).
- **Material**:
  - previsão em `os_item.materialId`;
  - reserva em `material_reserva`, por OS;
  - entrega em `registrarEntrega` (`materiais.ts:134`), que consome a reserva da OS;
  - consumo e devolução são informados pelo técnico na tela da visita e conferidos por outra pessoa;
  - a conciliação é **por OS** (`conciliacaoOS`, `materiais.ts:501`).
- **Pedido de material em campo**: vira só uma pendência em texto livre (`solicitarMaterial`, `execucao.ts:181`), sem item estruturado.
- **Não há** "pedido de material" interno. `pedido_externo` é a venda que chega de fora, e `compra` é reposição de estoque.
- **Ligações sem chave estrangeira** (a integridade depende só do código):
  - `os_item.materialId` e `os_item.visitaId`;
  - `material_movimento.osId`, `visitaId` e `compraId`;
  - `pendencia.osId` e `pendencia.visitaId`;
  - `pedido_externo.osId`;
  - `visita.veiculoId` e `profissional.veiculoId`;
  - `compra.osId`.

### 2.2 Telas (`src/app/(app)/`)

| Rota | Para quê | Serviços |
|---|---|---|
| `/` (+ `_home/*`) | Início por perfil (gestor, administrativo, financeiro, técnico) | inicio, produtividade, fluxo, agenda, pendencias… |
| `/os`, `/os/nova`, `/os/[id]`, `/os/[id]/programar` | Lista, criação, detalhe (a tela mais pesada: 268 linhas, com itens, visitas, material, prontidão, cobrança, autônomos, relatório, anexos e histórico) e programação com recomendação de técnicos | os, agenda, recomendacao, materiais, prontidao, autonomos, financeiro, relatorio-atendimento |
| `/visitas`, `/visitas/[id]` | Lista com filtros. A tela do técnico tem check-in, ficha, fotos, material informado, solicitações e check-out | visitas, execucao, prontidao, materiais |
| `/agenda` | Calendário e indisponibilidades | agenda |
| `/pedidos`, `/pedidos/[id]` | Pedidos externos para programar | pedidos |
| `/clientes`, `/clientes/novo`, `/clientes/[id]` | Cliente com contatos, locais, equipamentos e contratos (sem rota própria para equipamento) | cadastros |
| `/contratos` | Lista e cadastro de contratos | cadastros |
| `/materiais` (+ `compras`, `conferencia`, `custodias`, `divergencias`, `minha-custodia`) | Catálogo, saldos, entrega, entrada, compras, conferência e divergências | materiais |
| `/ferramentas`, `/veiculos`, `/checklist-hoje` | Ativos e checklists | ferramentas, veiculos |
| `/pendencias` | Central de tratativas | pendencias |
| `/financeiro/*`, `/meus-pagamentos`, `/minhas-despesas` | Financeiro, autônomos e despesas do técnico | financeiro, fluxo, autonomos, despesas |
| `/relatorios`, `/notificacoes`, `/conta`, `/configuracoes/*` | Relatórios, avisos, senha, configurações | relatorios, notificacoes, usuarios, config, rotinas |

### 2.3 Perfis
Os papéis padrão ficam em `src/server/auth/permissoes.ts`:
- **gestor**: tudo;
- **administrativo**: operação, sem financeiro;
- **financeiro_operador**: lança, mas não aprova;
- **financeiro_consulta**: nasce desativado;
- **técnico**: tudo em escopo `proprio`.

São cerca de 55 permissões, cada uma com escopo `proprio` ou `empresa`. Detalhes em `docs/ACESSOS.md`.

### 2.4 Pontos que pesam numa reformulação
- `recalcularEtapa` é chamado por muitas ações. Qualquer status novo passa por ele.
- `os/[id]/page.tsx` concentra muita coisa. `os/actions.ts` mistura agenda, materiais, financeiro, autônomos e prontidão.
- `agenda_reserva` guarda ao mesmo tempo a equipe da visita, as indisponibilidades e a base da permissão do técnico. Mexer nela afeta agenda, conflitos e escopo.

---

## 3. Click-path: gestor cria visita → atribui técnico → seleciona material

Escopo: perfil com `os.gerenciar` + `agenda.gerenciar` + `material.movimentar` (gestor). Contagem feita lendo o código das telas (não com navegador). "Clique" = clique em botão/link/caixa; digitar e escolher em lista contam como **campo**, não clique. Sem mudança de código.

Pré-condição importante: **não existe "criar visita" solta**. Visita só nasce dentro de uma OS (`criarVisita(osId)` em `src/server/services/agenda.ts:17`). Então o caminho real começa na OS.

### Resumo

| Passo | Tela(s) | Cliques (mín.) | Campos | Recarregamentos |
|---|---|---|---|---|
| 0. (se não há OS) Criar OS | `/os` → `/os/nova` (2 estados) | 4 | 12 fixos + 1 caixa por equipamento + até 35 de itens | 2 |
| 1. Criar visita | `/os/[id]` | 1 | 0 | 1 |
| 2. Atribuir técnico (programar) | `/os/[id]/programar` | 3 a 5 | 4 (dia, início, fim, veículo) + caixas de técnicos, responsável, ferramentas (+ motivo se reagendar) | 2 |
| 3a. Selecionar material (reservar) | volta para `/os/[id]`, rolar até "Materiais da OS" | 2 | 3 (material, qtd, posição) | 1 |
| 3b. Entregar material ao técnico | outra área: `/materiais` | 2 | 4 (+ OS opcional) | 1 |
| **Total (OS já existe)** | **3 telas, 4 cargas de página** | **~8 a 10** | **~11 + listas** | |
| **Total (do zero)** | **4 telas, 7 cargas** | **~12 a 14** | **~23 + itens** | |

### Passo 0 — Nova OS (`src/app/(app)/os/nova/page.tsx`)
1. Menu → `/os` → botão "Nova OS" (2 cliques).
2. Card "1. Cliente": escolher cliente (1 campo) + clicar **"Carregar locais e equipamentos"** (1 clique, recarrega a página via GET). Só depois aparece o resto do formulário.
3. Card "2. Dados da OS": origem, prioridade, contrato, OS original, local, contato, descrição, competências (texto livre separado por vírgula), nº de profissionais, observações, "já aprovado" = **11 campos** + 1 caixa por equipamento.
4. Card "3. Serviços e peças previstos": **5 linhas fixas × 7 campos = 35 campos** (tipo, descrição, material do cadastro, qtd, unidade, preço, custo).
5. "Criar OS" (1 clique) → redireciona para `/os/[id]`.

### Passo 1 — Nova visita (`src/app/(app)/os/[id]/page.tsx:54`)
- Botão "Nova visita" no topo (1 clique). Envia só `osId` → visita criada **sem data e sem equipe** (`acaoNovaVisita`, `os/actions.ts`).
- Mostra "Visita criada (sem agendamento)" e **fica na mesma página**. Não leva para a programação.

### Passo 2 — Programar / atribuir técnico (`src/app/(app)/os/[id]/programar/page.tsx`)
- Achar a visita no card "Visitas" e clicar **"Programar"** (1 clique).
- Card "1. Intervalo e recursos": dia, início, fim, veículo (4 campos) ou chip de vaga; **"Verificar"** (1 clique, recarrega) para atualizar a recomendação.
- Card "2. Técnicos indicados": caixas por técnico (pré-marcados os indicados), rádio "responsável", caixas de ferramentas exclusivas, motivo (se reagendamento).
- "Confirmar agendamento" (1 clique). Mostra "Agenda atualizada." e **fica na tela de programar** (sem redirecionar).

### Passo 3a — Reservar material (`os/[id]/page.tsx:152-170`)
- Clicar "Voltar" para a OS (1 clique) e rolar até "Materiais da OS — conciliação" (fica abaixo de Dados, Visitas, Serviços e peças).
- Formulário "Reservar do estoque": material, quantidade, posição (3 campos) → "Reservar" (1 clique).

### Passo 3b — Entregar ao técnico (`src/app/(app)/materiais/page.tsx:37-44`)
- Sair da OS, ir ao menu Materiais (1 clique). Card "Entregar a técnico": material, quantidade, origem, técnico, OS (opcional) → "Registrar entrega" (1 clique).

### Onde o gestor perde contexto

| # | Onde | O que acontece | Efeito | Gravidade |
|---|---|---|---|---|
| CP-01 | Nova visita (`os/[id]/page.tsx:54`) | Cria visita vazia e não abre a programação | Clique extra; risco de visitas "não agendadas" esquecidas | Média |
| CP-02 | Programar → sucesso (`acaoAgendar`) | Não redireciona; gestor fica na tela de programar | Precisa voltar à OS para cuidar do material | Média |
| CP-03 | Programar, card 1 × card 2 | Dia/hora/veículo do card 2 vêm de campos ocultos da URL. Se o gestor mudar dia/hora no card 1 e **não** clicar "Verificar", o agendamento usa o horário antigo | **Agenda horário diferente do que está na tela** (padrão "estado velho") | Alta |
| CP-04 | Programar, ferramentas exclusivas | As caixas de ferramenta ficam no card 2; o "Verificar" (card 1) não as envia, então a recomendação nunca considera conflito de ferramenta (`recomendacao.ts:52` só roda com `?ferramentas=`) | Conflito de ferramenta só aparece como erro no envio | Média |
| CP-05 | Material x visita/técnico | Reserva é **por OS**, sem visita nem técnico (`reservarParaOS`). Na entrega (`/materiais`) a lista de técnicos é a empresa toda, OS é opcional e **não há campo de visita** (o serviço aceita `visitaId`, a tela não envia) | Gestor não liga "este material vai com este técnico nesta visita"; prontidão e conciliação ficam só no nível da OS | Alta |
| CP-06 | Entrega fora da OS | A entrega fica em outra área (`/materiais`); a OS mostra só a conciliação | Troca de tela; precisa lembrar número da OS, material e quantidade | Média |
| CP-07 | "Incluir item" na OS (`os/[id]/page.tsx:141-145`) | O formulário não tem "material do cadastro" (só na criação da OS) | Item incluído depois **não entra** na previsão de material (conciliação e prontidão só contam itens com `materialId`) | Alta |
| CP-08 | Reservar do estoque | Lista de posição não mostra saldo disponível; erro só ao enviar | Tentativa e erro | Baixa |
| CP-09 | "Situação de material" manual (`Editar dados operacionais`) | Campo manual separado das reservas/entregas reais | Pode dizer "ok" sem material reservado, ou "pendente" com tudo entregue; prontidão usa esse campo como impeditivo | Média |
| CP-10 | Nova OS → "Carregar locais e equipamentos" | Recarrega a página para mostrar o resto | Se trocar de cliente depois, perde o que digitou | Baixa |
| CP-11 | Nova OS, competências | Texto livre separado por vírgula | Erro de digitação ("splitt") zera a recomendação sem aviso claro | Média |

Padrões do click-path-audit encontrados: CP-03 = estado velho/stale (campos ocultos vs. campos visíveis); CP-07 = transição faltando; CP-05 = dado que o serviço aceita mas a tela não envia. Nenhum caso de "botão que se desfaz" (o `ActionForm` é simples: envia, mostra mensagem, opcionalmente limpa ou redireciona — `src/components/action-form.tsx`).

---

## 4. Regras de negócio atuais (spec-miner)

**Base da extração:**
- **Fontes:** `src/server/services/*.ts`, `src/server/auth/*`, `src/lib/{dominio,quantidade}.ts`, `drizzle/0001`, `0003` e `0004`, e os testes.
- **Commit:** `17fc845`.

**Como ler cada regra:**
- **[Req]** é uma regra disparada por uma ação: QUANDO acontece X, ENTÃO o sistema faz Y.
- **[Inv]** é uma regra que vale sempre.
- `enforced` indica onde a regra é aplicada no código.
- `test` indica o teste que cobre a regra. `aceite›X` é o describe X em `tests/aceite.test.ts`; `aditivo›X` é o mesmo em `tests/aditivo.test.ts`.

**Lacuna:** os arquivos `dashboard.ts`, `inicio.ts`, `produtividade.ts`, `relatorios.ts` e `estrutura.ts`, as rotas `src/app/api/*` e as regras que existem só na tela ainda **não** foram mineradas. Fica para uma segunda rodada.

### 4.1 Perfis e permissões
- **R-auth-01** [Inv] Uma permissão vale com escopo `proprio` ou `empresa`. Escopo `empresa` também atende `proprio`. Se a mesma permissão vem por duas vias, vale a mais ampla. `enforced: contexto.pode()`, `carregarCtx()`
- **R-auth-02** [Inv] Só papéis ativos concedem permissão. `financeiro_consulta` nasce desativado. `enforced: carregarCtx()`, `PAPEIS_PADRAO`
- **R-auth-03** [Inv] Usuário inativo, ou conta demo em produção, fica sem acesso. `enforced: carregarCtx()`
- **R-auth-04** [Inv] No escopo `proprio`, o técnico só alcança OS, visita ou cliente se tiver `agenda_reserva` **ativa** numa visita ligada a eles. `enforced: escopo.exigirAcessoOS()`, `exigirAcessoVisita()`, `*DoProfissionalSQL()`
- **R-auth-05** [Inv] Tudo é filtrado por `empresaId`. Registro de outra empresa gera `ErroAcesso` com mensagem genérica, sem revelar se ele existe. `enforced: escopo.*`
- **R-auth-06** [Req] Com 5 ou mais falhas de login em 15 min para o mesmo e-mail, o login é bloqueado. Toda tentativa é registrada. `enforced: autenticacao.autenticar()`
- **R-auth-07** [Req] Login com sucesso abre sessão de 7 dias, guardando só o hash do token. A sessão é renovada a cada uso, no máximo 1 vez por hora. `enforced: autenticar()`, `validarSessao()`
- **R-auth-08** [Inv] A senha precisa ter 10 caracteres ou mais, com letras e números. `enforced: senha.validarForcaSenha()`
- **R-auth-09** [Req] Redefinição de senha emitida pelo gestor: token de uso único, válido por 1 h. Ao usar, revoga todas as sessões e audita. `enforced: emitirRedefinicao()`, `redefinirComToken()`
- **R-auth-10** [Req] Conta demo em produção: login recusado e a lista de contas demo vem vazia. `enforced: autenticarDemo()`, `contasDemo()`
- **R-auth-11** [Req] Trocar a senha exige a senha atual. A troca zera `deveTrocarSenha` e é auditada. `enforced: trocarSenha()`
- **R-auth-12** [Req] Ninguém altera os próprios papéis ou permissões, nem desativa a si mesmo. Exige `usuario.gerenciar` e é auditado como sensível. `enforced: usuarios.definirPapeis()`, `concederPermissao()`, `definirAtivo()` · test: aceite›Administrativo
- **R-auth-13** [Inv] Estas permissões não podem ser concedidas com escopo `proprio`: usuario.gerenciar, configuracao.gerenciar, financeiro.aprovar, financeiro.estornar, financeiro.saldo_inicial, autonomo.liberar, divergencia.aprovar e auditoria.ver. `enforced: concederPermissao()`
- **R-auth-14** [Req] Desativar usuário revoga as sessões dele. `enforced: definirAtivo()`
- **R-auth-15** [Req] Usuário novo nasce com `deveTrocarSenha=true`. O e-mail é guardado em minúsculas e é único. `enforced: criarUsuario()`, schema
- **R-auth-16** [Req] Só o gestor muda o vínculo (autônomo ou próprio). Autônomo não tem veículo: ao virar autônomo, `veiculoId` é zerado. `enforced: atualizarProfissional()`
- **R-auth-17** [Req] Criar profissional cria também a posição de custódia de material dele. `enforced: criarProfissionalInterno()`
- **R-auth-18** [Inv] A auditoria nunca grava campos com senha, token, hash ou secret (filtro recursivo). `enforced: auditoria.auditar()`
- **R-auth-19** [Req] Toda ação roda em transação, com o Ctx. Erros do banco viram mensagem: 23P01 = conflito de agenda ou recurso, 23514 = saldo, 23505 = duplicidade. `enforced: acao.executar()`, `traduzirErroBanco()`
- **R-auth-20** [Inv] Papéis padrão:
  - gestor tem tudo;
  - administrativo não tem financeiro;
  - operador financeiro não aprova;
  - técnico tem só escopo `proprio`: os.ver, agenda.ver, visita.executar, cliente.ver, ferramenta.ver/confirmar, material.ver/informar, veiculo.ver/checklist, autonomo.valores.ver e pendencia.ver.

  `enforced: PAPEIS_PADRAO`

### 4.2 Pedidos externos
- **R-ped-01** [Inv] Pedido único por (empresa, origem, idExterno). Versão única por (pedido, hash). `enforced: schema`
- **R-ped-02** [Req] Cada chegada é processada com trava por empresa+origem+id. O hash é sha256 do JSON com chaves ordenadas. Toda chegada vai para o log. `enforced: ingerirPedido()`
- **R-ped-03** [Req] Pedido novo entra como `para_programar` (ou `cancelado`). O cliente é ligado se o documento bater. Notifica quem tem `pedido.programar`. `enforced: ingerirPedido()`
- **R-ped-04** [Req] Mesmo hash = duplicado: nada muda, só o log. `enforced: ingerirPedido()` · test: aceite›Pedidos externos
- **R-ped-05** [Req] Hash novo depois de a OS existir: o pedido vai para `conferencia`, sem sobrescrever nada, e notifica com prioridade alta. `enforced: ingerirPedido()` · test: idem
- **R-ped-06** [Req] Hash novo sem OS: substitui os dados e grava nova versão. `enforced: ingerirPedido()`
- **R-ped-07** [Req] Pedido de origem demo em produção, ou sem idExterno, dá erro. `enforced: ingerirPedido()`
- **R-ped-08** [Req] Criar OS a partir do pedido exige `pedido.programar` e o pedido em `para_programar`, ainda sem OS. A OS nasce avulsa, já aprovada, com `referenciaExterna`. O pedido passa a `os_criada`. `enforced: criarOSDoPedido()`
- **R-ped-09** [Inv] Um pedido gera no máximo uma OS. `enforced: os.criarOS()`, índice único · test: aditivo›Origem única
- **R-ped-10** [Req] Resolver conferência exige descrever a decisão. O pedido volta a `os_criada`. `enforced: resolverConferenciaPedido()`
- **R-ped-11** [Req] Descartar exige motivo e só vale para pedido em `para_programar` ou `cancelado`. `enforced: descartarPedido()`
- **R-ped-12** [Req] A integração só fica `conectada` se o teste real passar. A Treeunfe hoje fica `aguardando_validacao`. `enforced: testarIntegracao()` · test: aceite›Pedidos
- **R-ped-13** [Req] Reprocessar um log exige `integracao.gerenciar`. O reprocessamento é idempotente. `enforced: reprocessarLog()`

### 4.3 OS
- **R-os-01** [Inv] A OS tem a etapa (aberta, em_planejamento, aguardando_material, pronta_para_atendimento, em_atendimento, pendente_retorno, servico_concluido, encerrada, cancelada) e dimensões separadas: comercial, material e conferência. `enforced: lib/dominio`
- **R-os-02** [Req] A etapa é recalculada, e a primeira regra que bater vale. Encerrada e cancelada são finais; visitas canceladas são ignoradas.
  1. Alguma visita em atendimento → em_atendimento.
  2. Há visita agendada → aguardando_material se o material está pendente; senão pronta_para_atendimento.
  3. A última visita finalizada não foi concluída → pendente_retorno.
  4. A última foi concluída e não há visita não agendada → servico_concluido, com conferência `pendente`.
  5. Material pendente → aguardando_material.
  6. Há visitas → em_planejamento.
  7. Nenhuma das anteriores → aberta.

  `enforced: os.recalcularEtapa()`
- **R-os-03** [Req] Criar OS exige `os.gerenciar` e descrição. Local, contato e equipamentos precisam ser do cliente. Origem contrato exige contrato ativo do cliente. Retorno exige OS de origem do mesmo cliente. `enforced: criarOS()`
- **R-os-04** [Req] OS avulsa nasce `rascunho`; contrato e retorno nascem `aprovada`. O número vem de contador atômico por empresa. `enforced: criarOS()`, `proximoNumero()`
- **R-os-05** [Inv] Preço e custo de item só são gravados e exibidos para quem tem `os.valores.ver` / `os.custos.ver`. Para os demais, o servidor manda null. `enforced: inserirItem()`, `obterOS()` · test: aceite›Autônomo
- **R-os-06** [Req] Quantidade > 0, com até 3 casas. Unidade un, cx, rolo ou par não aceita fração. `enforced: quantidade.parseQtdInput()`
- **R-os-07** [Req] OS encerrada ou cancelada não é editada. A edição tem controle de versão: se a versão divergir, dá erro de "alterado por outro usuário". `enforced: atualizarOS()` · test: aditivo›Concorrência
- **R-os-08** [Req] Aprovação comercial só a partir de `rascunho`. `enforced: aprovarComercialmente()`
- **R-os-09** [Req] Cancelar OS:
  - exige motivo;
  - é bloqueado se houver visita em atendimento;
  - cancela as visitas agendadas e não agendadas;
  - desativa as reservas de agenda futuras;
  - cancela os serviços de autônomo pendentes.

  `enforced: cancelarOS()`
- **R-os-10** [Req] Conferir OS exige `os.conferir` e etapa `servico_concluido`; fora disso, só o gestor, com exceção. A OS vai para `encerrada`/`conferida`, e os serviços de autônomo com valor passam a aguardar conferência. `enforced: conferirOS()`
- **R-os-11** [Req] Decidir extra exige `os.extra.aprovar` e item em `extra_solicitado`. Aprovar sem preço só se o item for incluído no contrato. A decisão resolve a pendência do item. `enforced: decidirItemExtra()`
- **R-os-12** [Req] Total previsto = soma dos itens previstos ou aprovados que não estão no contrato. Visível só com `os.valores.ver`. `enforced: obterOS()`
- **R-os-13** [Req] Lista de OS no escopo `proprio` mostra só as OS em que o técnico participa. `enforced: condicoesOS()`

### 4.4 Agenda
- **R-ag-01** [Inv] Um profissional não pode ter duas reservas ativas sobrepostas (EXCLUDE no banco). A reserva (visita, profissional) é única quando ativa. `enforced: drizzle/0001` · test: aceite›Agenda
- **R-ag-02** [Inv] Veículo e ferramenta exclusiva não podem ter reservas sobrepostas (EXCLUDE). `enforced: drizzle/0004` · test: aditivo›Agenda
- **R-ag-03** [Inv] O fim previsto da visita é maior que o início. A sequência é única por OS. `enforced: drizzle/0001`
- **R-ag-04** [Req] Criar visita exige `agenda.gerenciar` e OS que não esteja encerrada nem cancelada. Sequência = maior existente + 1. Tipo: continuação (se não for a primeira), contrato ou atendimento. `enforced: agenda.criarVisita()`
- **R-ag-05** [Req] Agendar exige:
  - fim > início;
  - pelo menos 1 profissional ativo;
  - visita ainda não iniciada, finalizada ou cancelada;
  - motivo, se for reagendamento.

  As reservas antigas são desativadas e as novas inseridas de uma vez. O responsável é o escolhido, se estiver na equipe, ou o primeiro da lista; os outros ficam como auxiliares. `enforced: agendarVisita()`
- **R-ag-06** [Req] O veículo precisa estar ativo e a ferramenta precisa ser exclusiva da empresa. `enforced: agendarVisita()`
- **R-ag-07** [Req] Depois de agendar, o sistema:
  - grava o histórico de reagendamento;
  - cria o serviço de autônomo (sem valor) para cada autônomo da equipe;
  - resolve as pendências de remarcação ou retorno;
  - recalcula a etapa.

  `enforced: agendarVisita()` · test: aceite›Técnico
- **R-ag-08** [Req] Cancelar visita exige motivo, é bloqueado se ela estiver em atendimento ou finalizada, e desativa as reservas de agenda e de recursos. `enforced: cancelarVisita()`
- **R-ag-09** [Req] Indisponibilidade exige fim > início e é uma reserva sujeita ao EXCLUDE. `enforced: registrarIndisponibilidade()`
- **R-ag-10** [Req] O técnico pede remarcação ou retorno só de visita dele, com descrição. Gera pendência de prioridade alta. `enforced: solicitarRemarcacao()`
- **R-ag-11** [Req] A recomendação de técnicos:
  - trata como impedimento: estar inativo, não ter as competências exigidas, ter conflito de horário;
  - mostra os dados que faltam como limitação;
  - não agenda sozinha.

  `enforced: recomendacao.recomendarTecnicos()` · test: aditivo›Recomendação
- **R-ag-12** [Req] Faixa de horário exige `configuracao.gerenciar` e hora final > inicial. `enforced: salvarVaga()`

### 4.5 Visita / atendimento
- **R-ex-01** [Inv] Situação da visita: `nao_agendada → agendada → em_atendimento → finalizada`, ou `cancelada`. Resultado: concluída, parcial ou não realizada.
- **R-ex-02** [Req] Check-in e check-out só pelo responsável (ou por quem tem `visita.executar` no escopo empresa). O auxiliar registra só a própria chegada e saída. `enforced: exigirResponsavel()` · test: aditivo›Agenda
- **R-ex-03** [Req] Check-in do técnico próprio:
  - sem o checklist de veículo do dia → erro, quando a configuração exige (padrão);
  - sem veículo → abre pendência;
  - com irregularidade crítica sem liberação → erro, se a configuração estiver ligada;
  - autônomo não passa por essas checagens.

  `enforced: checkin()` · test: aceite›Técnico
- **R-ex-04** [Req] Check-in só a partir de `agendada`, com o horário do servidor. Repetir não duplica. `enforced: checkin()` · test: aditivo›Concorrência
- **R-ex-05** [Req] A ficha só é salva com a visita em atendimento. O equipamento precisa ser da OS. É uma ficha por equipamento. `enforced: salvarExecucao()`
- **R-ex-06** [Req] Concluir a visita exige:
  - ficha com serviço realizado;
  - ficha de todos os equipamentos da OS;
  - teste OK em todos (exceto os não realizados);
  - pelo menos 1 foto.

  `enforced: checkout()`
- **R-ex-07** [Req] Visita parcial ou não realizada exige motivo padronizado, descrição da pendência e próxima ação. O motivo "outro" exige comentário. Abre pendência de prioridade alta. Falta de material ou peça divergente marca o material da OS como `pendente`. `enforced: checkout()` · test: aceite›Visita parcial e retorno
- **R-ex-08** [Req] Check-out repetido não duplica. `enforced: checkout()`
- **R-ex-09** [Req] Chegada repetida é ignorada. Saída exige chegada antes e visita iniciada. `enforced: registrarParticipacao()`
- **R-ex-10** [Req] Pedido de extra do técnico vira item `extra_solicitado`, sem preço, mais uma pendência. Pedido de material vira pendência `material_necessario`. `enforced: solicitarExtra()`, `solicitarMaterial()`
- **R-ex-11** [Inv] O técnico não vê preço nem dados financeiros na visita. `enforced: obterVisitaTecnico()`
- **R-ex-12** [Req] O relatório PDF só sai depois de a visita estar finalizada. As versões são sequenciais. As evidências são só imagens da visita. Os campos externos seguem uma lista explícita. `enforced: emitirRelatorio()` · test: aditivo›Relatório
- **R-ex-13** [Req] Ciência do cliente: uma por versão. "Registrada" exige nome; "ausente" e "recusada" exigem observação. Ciência não é aprovação. `enforced: registrarCiencia()`

### 4.6 Prontidão
- **R-pr-01** [Req] Cada item de prontidão sai como ok, impeditivo, alerta ou não se aplica:
  - sem agendamento ou sem endereço → impeditivo;
  - sem contato ou sem equipamento → alerta;
  - equipe vazia → impeditivo; equipe menor que o necessário → alerta;
  - material da OS `pendente` → impeditivo;
  - ferramentas ou kit sem conferência → alerta;
  - pendência crítica → impeditivo;
  - veículo com irregularidade crítica, ou sem checklist obrigatório → impeditivo;
  - autônomo → não se aplica.

  A visita está "pronta" quando não há nenhum impeditivo. `enforced: prontidaoVisita()` · test: aditivo›Prontidão
- **R-pr-02** [Req] Liberar exceção exige `os.conferir` + `agenda.gerenciar` e justificativa. Item de veículo só o gestor libera. O item liberado vira alerta. `enforced: liberarItemProntidao()`

### 4.7 Materiais
- **R-mat-01** [Inv] Saldo ≥ 0, reservado ≥ 0 e reservado ≤ saldo (CHECK no banco). Movimento com quantidade > 0 e origem ≠ destino. `enforced: drizzle/0001` · test: aceite›Materiais
- **R-mat-02** [Inv] Quantidades usam numeric(14,3), com contas em milésimos. Posições virtuais (fornecedor, consumo, perda, ajuste) não têm saldo. `enforced: toMilli()`, `debitar()`, `creditar()`
- **R-mat-03** [Inv] Movimento com a mesma chave de idempotência devolve o já existente. `enforced: inserirMov()`
- **R-mat-04** [Req] Material com movimentos não troca de unidade. O custo só é gravado por quem tem `material.custos.ver`. `enforced: salvarMaterial()`
- **R-mat-05** [Req] Entrada avulsa: já entra confirmada e credita o destino. `enforced: registrarEntradaAvulsa()`
- **R-mat-06** [Req] Entrega:
  - a origem não pode ser virtual nem segregada;
  - fica `em_transito` e debita a origem na hora;
  - se houver reserva ativa da OS, consome essa reserva.

  `enforced: registrarEntrega()`
- **R-mat-07** [Req] Só o recebedor confirma o recebimento (ou o responsável pelo veículo, ou quem movimenta, se o destino for local). A confirmação credita uma vez. A recusa exige motivo e abre pendência. `enforced: confirmarRecebimento()`, `recusarRecebimento()`
- **R-mat-08** [Req] Transferência: debita a origem na hora e credita o destino na confirmação. Saindo de uma custódia, só o custodiante ou quem movimenta. `enforced: solicitarTransferencia()` · test: aceite›Materiais
- **R-mat-09** [Req] Consumo, devolução, perda ou segregação informados pelo técnico ficam `informado` e **não mexem no saldo**. Perda e segregação exigem justificativa. `enforced: informarMovimento()` · test: aceite›Materiais
- **R-mat-10** [Req] Conferir movimento:
  - exige `material.conferir` (perda exige `divergencia.aprovar`);
  - quem registrou não confere (salvo gestor), e o custodiante também não;
  - conferido 0 → recusado;
  - conferido > informado → erro (exceto devolução);
  - devolução com retalho cria o retalho.

  `enforced: conferirMovimento()`
- **R-mat-11** [Req] Devolução conferida abaixo do informado vira divergência "a localizar" e pendência, sem baixa automática. `enforced: conferirMovimento()` · test: aceite›Materiais
- **R-mat-12** [Req] Reservar para a OS aumenta o reservado. Sem saldo disponível → erro "registre a necessidade de compra". Cancelar a reserva devolve. `enforced: reservarParaOS()`, `cancelarReserva()`
- **R-mat-13** [Req] Contagem física diferente do esperado abre divergência e pendência. `enforced: registrarContagem()`
- **R-mat-14** [Req] Decidir divergência:
  - exige `divergencia.aprovar` e justificativa;
  - nem o custodiante nem quem abriu decidem (exceto gestor, com autoaprovação registrada);
  - perda aprovada debita para "perda"; ajuste credita a partir de "ajuste".

  `enforced: decidirDivergencia()`
- **R-mat-15** [Req] Compra:
  - exige pelo menos 1 item;
  - total = soma de round(custo × qtd);
  - o recebimento cria as entradas;
  - gera uma única conta a pagar, que exige vencimento.

  `enforced: registrarCompra()`, `receberCompra()`
- **R-mat-16** [Req] Custódia remanescente: o próprio custodiante não autoriza. Exige justificativa. `enforced: autorizarCustodiaRemanescente()`
- **R-mat-17** [Req] Conciliação por OS: a OS está conciliada quando entregue = consumo validado + devolução conferida + perdas + segregado + custódia autorizada, e "a localizar" = 0. `enforced: conciliacaoOS()` · test: aceite›Materiais
- **R-mat-18** [Req] Estoque inicial: uma única vez por material + posição. Exige movimentar + conferir. `enforced: registrarEstoqueInicial()`

### 4.8 Ferramentas
- **R-fer-01** [Inv] Situações: disponivel, reservada, aguardando_confirmacao, em_custodia, devolucao_pendente, no_cliente, extraviada, baixada. No máximo 1 movimento pendente por ferramenta. Código único. `enforced: schema`
- **R-fer-02** [Req] Reservar só a partir de `disponivel`, para OS da empresa. `enforced: reservarFerramenta()`
- **R-fer-03** [Req] Entrega a profissional ativo → aguardando confirmação. Idempotente. `enforced: entregarFerramenta()`
- **R-fer-04** [Req] Só o novo responsável confirma. Conjuntos levam os componentes junto. Recebida danificada → pendência. A recusa devolve a ferramenta ao estado anterior. `enforced: confirmarFerramenta()`, `recusarFerramenta()`
- **R-fer-05** [Req] A devolução é pedida pelo custodiante ou por quem movimenta, e conferida por outra pessoa. A ferramenta volta a disponível e as pendências são encerradas. `enforced: solicitarDevolucao()`, `conferirDevolucao()`
- **R-fer-06** [Req] Transferência só a partir de custódia. Fica pendente até o destino confirmar. `enforced: transferirFerramenta()`
- **R-fer-07** [Req] Ocorrências: falta → extraviada; deixada no cliente → no_cliente; dano → danificada. Cada uma abre pendência. Quem localiza não pode ser o custodiante. `enforced: registrarOcorrenciaFerramenta()`, `localizarFerramenta()`
- **R-fer-08** [Req] Checklist do kit:
  - cobre só o que está sob custódia;
  - todos os itens exigem resposta;
  - irregular → pendência;
  - pode ser reutilizado com o mesmo profissional, a mesma composição e dentro da validade.

  `enforced: responderChecklistFerramentas()` · test: aditivo›Prontidão
- **R-fer-09** [Req] Custódia inicial (implantação) só para ferramenta disponível e sem custodiante. `enforced: custodiaInicialFerramenta()`

### 4.9 Veículos
- **R-vei-01** [Inv] Autônomo nunca faz checklist de veículo, salvo com escopo empresa. `enforced: podeChecklistVeiculo()` · test: aceite›Autônomo
- **R-vei-02** [Req] Checklist de veículo:
  - todos os itens respondidos;
  - irregular exige descrição;
  - foto quando o item pede.

  A validade é a menor entre (agora + horas) e o fim do dia em SP. Irregularidade gera pendência com prazo: crítica 0 dia, alta 2 dias, demais 7 dias. `enforced: responderChecklistVeiculo()`
- **R-vei-03** [Req] No checklist de saída do técnico próprio, a placa escolhida vira o veículo designado (auditado). `enforced: responderChecklistVeiculo()` · test: aceite›Técnico
- **R-vei-04** [Req] Reutilização do checklist: mesmo veículo, tipo e responsável, dentro da validade. `enforced: checklistValido()`
- **R-vei-05** [Req] Odômetro: inteiro ≥ 0. Reduzir exige permissão de correção e motivo (auditado). `enforced: registrarOdometro()` · test: aceite›Técnico
- **R-vei-06** [Req] Modelo de checklist: validade de 1 a 72 h, pelo menos 1 item. Cada mudança gera nova versão. Só 1 modelo ativo por tipo. `enforced: salvarModeloChecklist()` · test: aditivo›Prontidão
- **R-vei-07** [Req] Designar veículo só para técnico próprio. Resolve a pendência "sem veículo". `enforced: designarVeiculo()`
- **R-vei-08** [Req] Pneu: um por posição instalada. Retirada exige motivo e km ≥ km de instalação. `enforced: instalarPneu()`, `retirarPneu()`
- **R-vei-09** [Req] Alerta de manutenção: vale o que vencer primeiro, data ou km. Sem parâmetros → "sem base". Km com mais de 15 dias → aparece como limitação. `enforced: alertasManutencao()` · test: aceite›Veículos
- **R-vei-10** [Req] Manutenção com valor gera conta a pagar (exige vencimento). Km maior que o atual atualiza o odômetro. `enforced: registrarManutencao()`

### 4.10 Pendências e notificações
- **R-pen-01** [Inv] Uma pendência aberta por chave. Abrir de novo devolve a existente. `enforced: garantirPendencia()`
- **R-pen-02** [Req] Quem é notificado depende do tipo da pendência:
  - veículo → veiculo.irregularidade.tratar;
  - ferramenta → ferramenta.movimentar;
  - material → material.conferir;
  - demais → agenda.gerenciar.

  Se a pendência tiver responsável, só ele é notificado. `enforced: garantirPendencia()`
- **R-pen-03** [Req] Resolver ou cancelar exige `pendencia.resolver` e descrição. Divergência de material ou falta de ferramenta não podem ser encerradas por quem abriu (exceto gestor). `enforced: resolverPendencia()`
- **R-pen-04** [Req] Atribuir leva a pendência para "em andamento". Liberação excepcional só o gestor faz. `enforced: atribuirPendencia()`
- **R-pen-05** [Req] O técnico vê só as pendências dele ou abertas por ele. `enforced: condicoesPendencia()`
- **R-pen-06** [Req] Grupos da central: aguardando terceiro, crítica ou vencida, hoje, esta semana, sem prazo. `enforced: centralPendencias()`
- **R-not-01** [Inv] Uma notificação aberta por usuário e chave. Repetir soma ocorrências e volta a "não lida". `enforced: notificar()`
- **R-not-02** [Inv] Ler não resolve. A notificação só se encerra quando a origem é resolvida. `enforced: marcarLidas()`, `encerrarNotificacoes()`
- **R-not-03** [Req] Destinatários: usuários ativos com a permissão em escopo empresa. `enforced: usuariosComPermissao()` · test: aceite›Administrativo

### 4.11 Clientes e contratos
- **R-cad-01** [Req] Cliente exige `cliente.ver` (empresa). O técnico só vê clientes que atendeu. `enforced: listarClientes()`, `exigirAcessoCliente()`
- **R-cad-02** [Req] Cliente exige nome e tem controle de versão. Contato, local e equipamento precisam ser do cliente. `enforced: salvarCliente()`, `salvarLocal()`, `salvarEquipamento()`
- **R-cad-03** [Req] Fornecedor: grava quem tem `fornecedor.gerenciar` ou `financeiro.lancar`. `enforced: salvarFornecedor()`
- **R-con-01** [Req] Contrato:
  - dia de vencimento de 1 a 31;
  - fim ≥ início;
  - número único;
  - valor só com `contrato.valores.ver`, e mudança de valor é auditada como sensível.

  `enforced: salvarContrato()`
- **R-con-02** [Req] Mensalidade: uma por contrato e mês, só para contrato ativo e vigente. Contrato sem valor fica de fora e é sinalizado. `enforced: gerarMensalidades()` · test: aceite›Cobrança

### 4.12 Financeiro e caixa
- **R-fin-01** [Inv] Dinheiro em centavos inteiros. Parcela > 0. Desconto entre 0 e o bruto. Transferência entre contas diferentes. `enforced: drizzle/0001`
- **R-fin-02** [Inv] Baixa > 0. Estorno < 0, ligado à baixa original, no máximo 1 por baixa. `enforced: drizzle/0001`
- **R-fin-03** [Inv] Obrigação única por chave. `enforced: garantirObrigacao()`
- **R-fin-04** [Req] Criar obrigação:
  - exige `financeiro.lancar`;
  - a categoria precisa ser da mesma natureza (restrita exige permissão);
  - desconto exige permissão;
  - a soma das parcelas é igual ao líquido;
  - conta a receber exige cliente.

  `enforced: criarObrigacao()`
- **R-fin-05** [Req] Autoaprovação quando a origem já está aprovada, ou quando o criador aprova e o valor não exige dupla aprovação. Fica registrada. Solicitação de técnico nunca se aprova sozinha. `enforced: criarObrigacao()` · test: aceite›Operador
- **R-fin-06** [Req] Aprovar exige `financeiro.aprovar`. Rejeitar exige motivo. Ninguém aprova o próprio pagamento (exceto gestor). Uma decisão por pessoa. Valor acima do limite exige 2 aprovadores. `enforced: decidirObrigacao()` · test: aditivo›Perfis
- **R-fin-07** [Req] Cancelar exige motivo. É bloqueado se houver baixas não estornadas ou aguardando conferência. `enforced: cancelarObrigacao()`
- **R-fin-08** [Req] Baixa:
  - obrigação aprovada e conta ativa;
  - valor ≤ saldo da parcela;
  - data ≥ saldo inicial;
  - idempotente.

  `enforced: registrarBaixa()` · test: aceite›Cobrança
- **R-fin-09** [Req] Pagamento sem aprovação prévia é uma exceção: exige permissão própria, justificativa e comprovante. Entra marcado e alerta o gestor. `enforced: registrarBaixa()` · test: aditivo›Perfis
- **R-fin-10** [Req] A baixa entra confirmada se quem lança pode aprovar ou confirmar e não é o beneficiário. Senão, fica aguardando conferência. `enforced: registrarBaixa()` · test: aceite›Operador
- **R-fin-11** [Req] Conferir baixa: o beneficiário não confere. Rejeitar exige motivo. `enforced: decidirBaixa()`
- **R-fin-12** [Req] Estorno exige permissão e motivo. Cria uma baixa inversa e a original é preservada. `enforced: estornarBaixa()`
- **R-fin-13** [Req] Transferência entre contas da empresa. Idempotente. Confirmada direto, ou fica aguardando. `enforced: registrarTransferencia()`
- **R-fin-14** [Req] Saldo inicial exige permissão. Alterar exige motivo, e o valor anterior fica na auditoria. `enforced: definirSaldoInicial()` · test: aceite›Operador
- **R-fin-15** [Req] Recebível da OS:
  - exige OS aprovada e permissões de lançar + ver valores;
  - principal: um por OS avulsa;
  - extra aprovado: um por item;
  - item sem preço bloqueia.

  `enforced: gerarRecebivelOS()` · test: aditivo›Origem única
- **R-fin-16** [Req] Situação da parcela: cancelada > quitada > vencida/parcial/a vencer. `enforced: situacaoParcela()`
- **R-fin-17** [Inv] Categoria restrita fica oculta para quem não tem permissão, e o resultado é marcado como parcial. `enforced: condicoesParcelas()`, `fluxo.*`
- **R-fin-18** [Req] Contato de cobrança exige resumo. A data esperada não muda o vencimento. `enforced: registrarContatoCobranca()`
- **R-fin-19** [Req] Obrigação legado exige data de corte e identificador. `enforced: lancarObrigacaoLegado()` · test: aditivo›Previsão
- **R-flu-01** [Req] Saldo realizado = saldo inicial + baixas confirmadas + transferências confirmadas. Sem saldo inicial → "incompleto". `enforced: saldosRealizados()` · test: aceite›Caixa
- **R-flu-02** [Inv] Transferência não altera o consolidado. Baixa aguardando conferência não conta como realizada. `enforced: saldosRealizados()`
- **R-flu-03** [Req] Projeção:
  - só parcelas aprovadas;
  - a pagar pelo vencimento, e vencido conta como hoje;
  - a receber pela data esperada; vencido sem previsão fica fora;
  - aponta o primeiro dia de saldo negativo.

  `enforced: fluxo.projecao()` · test: aditivo›Previsão

### 4.13 Despesas e autônomos
- **R-des-01** [Req] Só técnico próprio lança diária ou reembolso. Data não futura. Idempotente. A conta a pagar sempre aguarda aprovação. `enforced: lancarDespesaTecnico()` · test: aditivo›Despesas
- **R-des-02** [Req] A situação mostrada (Recusada, Cancelada, Paga, Aprovada, Aguardando) é calculada. `enforced: minhasDespesas()`
- **R-aut-01** [Inv] Serviço de autônomo: `aguardando_valor → aguardando_conferencia → conferido → liberado`, ou cancelado. "Pago" é calculado. Único por OS, profissional e chave. `enforced: autonomos.ts`
- **R-aut-02** [Req] Valor combinado exige permissão. Alterar exige motivo. Se o serviço já foi conferido, a alteração exige nova conferência. `enforced: definirValorAutonomo()`
- **R-aut-03** [Req] Conferir exige OS encerrada e valor definido. Ninguém confere o próprio serviço. `enforced: conferirServicoAutonomo()`
- **R-aut-04** [Req] Resumo semanal: um por profissional e semana. Adiantamentos são abatidos uma única vez. A previsão de pagamento cai no dia configurado (padrão sexta). `enforced: prepararResumoSemanal()` · test: aceite›Autônomos
- **R-aut-05** [Req] Liberar gera uma única conta a pagar já aprovada. `enforced: liberarResumo()`
- **R-aut-06** [Req] Adiantamento só para autônomo. Gera conta a pagar. `enforced: registrarAdiantamento()`
- **R-aut-07** [Req] Acordo adicional exige justificativa e não gera receita. "Coberto" cancela com valor 0. `enforced: adicionarAcordoAutonomo()`, `marcarCoberto()` · test: aditivo›Origem única
- **R-aut-08** [Inv] O autônomo vê só os próprios serviços. O técnico próprio não tem serviços de autônomo. `enforced: listarServicosAutonomos()` · test: aceite›Autônomo

### 4.14 Rotinas e anexos
- **R-rot-01** [Req] Cada rotina roda uma vez por chave: por mês nas mensalidades, por dia nas demais. Erro conta tentativa. Execuções concorrentes não duplicam. `enforced: executarRotina()` · test: aditivo›Concorrência
- **R-rot-02** [Req] As rotinas rodam com um usuário de sistema de permissões mínimas. A rotina de pedidos hoje sempre registra "ignorado". `enforced: ctxSistema()`
- **R-anx-01** [Req] Anexo: JPG, PNG, WEBP, HEIC ou PDF, até 10 MB. O acesso herda a permissão da entidade. `enforced: anexos.validarArquivo()`

---

## 5. Incertezas e inconsistências encontradas

Itens 1 e 3 conferidos manualmente no código; os demais vêm do spec-miner.

1. **Checklist do veículo designado**: o `docs/ACESSOS.md` diz que é "só do veículo designado", mas o código não verifica (`podeChecklistVeiculo` ignora o veículo). Documento e código divergem.
2. **Prontidão não bloqueia** a saída. Os impeditivos só aparecem na tela. O check-in só bloqueia por checklist de veículo e por irregularidade crítica.
3. **Cancelar OS** (`os.ts:172`) só desativa reservas de agenda com início no futuro e **não** desativa `recurso_reserva`. Já cancelar visita desativa as duas.
4. `conferirDevolucao` (ferramentas): a condição de situação não muda nada; a ferramenta danificada também volta a "disponível".
5. Um pedido externo cancelado continua cancelado mesmo se chegar uma versão nova que não é cancelada.
6. Pedidos de extra ou de material pelo técnico não checam a situação da visita: dá para pedir em visita finalizada ou cancelada.
7. O técnico que sai da equipe num reagendamento perde o acesso ao histórico da OS (o acesso depende de reserva **ativa**).
8. Nada impede um gestor de desativar o último outro gestor. A função `contarGestores` existe, mas não é usada.
9. `solicitarTransferencia` repete a mesma checagem de permissão duas vezes. Com custódia de origem, o custodiante transfere mesmo sem `material.informar`.
10. Despesa: o cálculo de vencimento tem um caminho que nunca acontece; na prática, vence sempre hoje.
11. Não minerados nesta rodada: `dashboard.ts`, `inicio.ts`, `produtividade.ts`, `relatorios.ts`, `estrutura.ts` e `src/app/api/*`.

## 6. Recomendações para a reformulação (do diagnóstico)

- **Fluxo único de programação**: "Nova visita" abre direto a programação. Depois de agendar, voltar à OS na seção de material. Isso resolve CP-01 e CP-02.
- **Recalcular a recomendação automaticamente** ao mudar dia, hora, veículo ou ferramenta, sem campos ocultos. Isso resolve CP-03 e CP-04.
- **Ligar material à visita e ao técnico**: reserva e entrega com `visitaId` e equipe pré-selecionada, e a entrega feita dentro da OS ou da visita. Isso resolve CP-05 e CP-06. Antes, decidir se a conciliação continua por OS ou passa a ser por visita (R-mat-17).
- **"Incluir item" com material do cadastro** (CP-07), e derivar `situacaoMaterial` das reservas e entregas em vez de deixar manual (CP-09). Atenção: isso muda R-os-02 e R-pr-01.
- **Competências escolhidas de uma lista**, não digitadas (CP-11).
- **Separar a tela da OS** em abas: Visitas, Material, Cobrança, Relatório.
- Antes de mudar qualquer regra da seção 4, marcar qual regra muda e criar o teste dela. Os testes de aceite já cobrem boa parte das regras.
