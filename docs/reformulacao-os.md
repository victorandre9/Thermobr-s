# Reformulação: OS completa em uma tela

> **Status:** proposta, aguardando aprovação do Victor. Nada foi codado.
> **Base:** `docs/diagnostico.md` (CP-xx, regras R-xx) e `docs/referencias.md` (padrões Pxx).
> **Skills e agentes usados:**
> - **product-lens**: seção 1;
> - **intent-driven-development**: seção 2;
> - **council**: seção 3;
> - **blueprint**, com os agentes **planner** e **architect**: seção 4.

## 1. Usuários e trabalho principal (product-lens)

> As frequências e dores abaixo são **suposições a confirmar com o Victor**. O código não diz quantas OS a empresa abre por dia.

| | **Gestor** (escritório, perfil `gestor`/`administrativo`) | **Técnico** (equipe própria ou autônomo, no celular) | **Cliente** (condomínio, empresa, residência) |
|---|---|---|---|
| **Trabalho principal** | "Colocar o técnico certo, no dia certo, com o material certo, sem esquecer nada." | "Chegar sabendo o que fazer e com o que precisa, fazer, provar que fez e ir para o próximo." | "Ter o ar funcionando e saber quando o técnico chega e o que foi feito." |
| **Dor hoje** | 3–4 telas e 8–14 cliques por atendimento (CP-01..07). O material não se liga à visita nem ao técnico. Competência é digitada à mão. | Recebe a visita sem material separado por ela. Não há kit por tipo de serviço. O pedido de material em campo vira texto livre. | Não recebe aviso de chegada. Recebe só o PDF depois, enviado à mão. |
| **O que ganha nesta reformulação** | OS + visita + técnico + kit numa tela, em < 60 s. | Visita com o kit previsto e entregue para ela. Questionário por tipo de serviço (etapa posterior). | Indireto: menos visitas perdidas por falta de material. Aviso "a caminho" fica para depois. |
| **Como medir** | Tempo do 1º clique até "OS criada" e nº de cliques (medido em teste E2E) | % de visitas com o kit entregue antes do check-in; % de visitas parciais por falta de material (motivo `falta_material`) | Resolução na 1ª visita (P19, etapa posterior) |

**Diagnóstico (product-lens, modo 1):**
- **Para quem:** gestor de empresa de ar-condicionado com 3 a 30 técnicos.
- **Por que agora:** o diagnóstico mostrou que o fluxo atual é o maior gargalo, e a base de regras está madura e testada.
- **Versão 10 estrelas:** o sistema sugere horário + equipe + kit + rota, e o gestor só confirma.
- **MVP:** uma tela com cliente → tipo de serviço → (kit e competências preenchidos) → data/vaga → técnico pré-marcado → salvar.
- **Anti-objetivos (não fazer agora):** roteirização, offline, aviso por WhatsApp, GPS, despacho sem confirmação humana, relaxar conferências.
- **Métrica de sucesso:** OS típica criada em ≤ 60 s e ≤ 8 interações, medido no teste E2E com dados demo.
- **Recomendação: GO**, com o escopo da seção 2.

## 2. Critérios de aceite (intent-driven-development, brief completo)

**Status:** Rascunho · **Revisão:** 1 · **Aprovação antes de codar:** sim. Há migração de banco (tabela nova) e mudança de fluxo.

**Objetivo:** o gestor cria uma OS completa em **uma tela**, com cliente, tipo de serviço, data, técnico sugerido e kit de material, em **menos de 60 segundos**, sem perder nenhuma regra de controle atual.

**No escopo:**
- cadastro de **tipo de serviço**: competências, nº de técnicos, duração padrão e kit padrão;
- tela única "Nova OS";
- criação atômica (tudo ou nada) de OS + visita + agendamento + previsão e reserva do kit;
- material ligado à visita;
- fila "sem técnico".

**Fora do escopo:**
- roteirização e mapa;
- GPS;
- offline;
- aviso ao cliente;
- questionário por tipo de serviço;
- indicadores (FTFR e reincidência);
- reposição de estoque do técnico;
- mudar a tela do técnico.

**Fatos descobertos no código:**
- A OS é criada em `criarOS` (`os.ts`), a visita em `criarVisita` e o agendamento em `agendarVisita` (`agenda.ts`).
- A recomendação está em `recomendarTecnicos` (`recomendacao.ts`).
- A reserva é feita por `reservarParaOS` (`materiais.ts`).
- Todas essas funções rodam com a transação `tx` e o `Ctx`, então podem ser compostas numa transação só.
- O EXCLUDE no banco garante que um técnico não fica em dois lugares ao mesmo tempo.
- A reserva nunca passa do saldo (CHECK no banco).
- Competências hoje são texto livre (`ordem_servico.competencias_exigidas`, `profissional.competencias`).

**Regras de negócio a confirmar** (não vieram do código):
- quais são os tipos de serviço e kits reais da empresa;
- se a falta de material deve bloquear o agendamento;
- se 60 s vale para OS avulsa e de contrato.

**Riscos:**

| Área | Aplica? | Tratamento |
|---|---|---|
| Autorização | Sim | Cada parte continua exigindo a sua permissão (`os.gerenciar`, `agenda.gerenciar`, `material.movimentar`). Quem não tem uma delas vê a seção travada, e o servidor recusa. |
| Dados/migração | Sim | Tabelas novas e coluna `visita_id` na reserva, todas opcionais (só adiciona). Nenhuma migração destrutiva. As OS antigas continuam iguais. |
| Concorrência | Sim | Dois gestores agendando o mesmo técnico: o EXCLUDE recusa um deles, nada é gravado pela metade e a tela mostra a mensagem. |
| UX/acessibilidade | Sim | Navegação por teclado, rótulos e mensagens de erro junto ao campo. |
| Custo externo | Não | — |

### Critérios

**AC-001 — OS completa em uma tela** (Obrigatório)
- **Cenário:** gestor com dados demo; cliente com 1 local e 1 equipamento; tipo de serviço "Preventiva split" com kit de 2 materiais com saldo; técnico elegível livre amanhã às 08:00.
- **Ação:** abrir "Nova OS", escolher cliente, tipo de serviço e a vaga de amanhã às 08:00, e salvar.
- **Esperado:**
  - OS criada **e** visita 1 `agendada` com técnico responsável;
  - previsão do kit criada (itens com material);
  - reserva **ligada à visita**;
  - redirecionamento para o detalhe da OS;
  - **tudo numa única tela**, sem navegar para outra rota antes de salvar.
- **Não pode:** criar a visita vazia; exigir passar por `/os/[id]/programar`.
- **Verificação:** teste E2E com Playwright + teste de serviço (Vitest).

**AC-002 — Menos de 60 s e poucas interações** (Obrigatório)
- **Cenário:** o mesmo do AC-001.
- **Ação:** fluxo do AC-001 percorrido por script E2E, com tempo humano simulado de 3 s por campo.
- **Esperado:**
  - no máximo **8 interações** (cliques ou seleções), sem contar a digitação da descrição;
  - tempo do servidor ao salvar < 1 s com o banco de teste;
  - teste manual com o Victor < 60 s.
- **Verificação:** E2E (contagem de interações e tempo do servidor) + revisão manual do Victor (cronômetro).

**AC-003 — Tipo de serviço preenche o resto** (Obrigatório)
- **Cenário:** tipo de serviço com competências `[split]`, 1 técnico, 2 h de duração e um kit.
- **Ação:** escolher o tipo na Nova OS.
- **Esperado:** competências, nº de técnicos, hora de fim (início + duração) e linhas do kit preenchidos na tela, todos **editáveis**.
- **Não pode:** apagar o que o gestor já editou se ele trocar de tipo sem confirmar.
- **Verificação:** E2E (`nova-os.spec`: trocar de tipo depois de editar pede confirmação e mantém as edições). O projeto não tem infraestrutura de teste de componente.

**AC-004 — Técnico sugerido pré-marcado, gestor confirma** (Obrigatório)
- **Cenário:** 3 técnicos: 1 elegível livre, 1 ocupado, 1 sem a competência.
- **Ação:** escolher a data e a vaga.
- **Esperado:**
  - a lista mostra os 3, com motivos e impedimentos (como hoje);
  - o elegível vem pré-marcado como responsável;
  - a lista se atualiza **sozinha** ao mudar data, hora, veículo ou ferramenta, sem botão "Verificar";
  - o salvar usa exatamente o que está na tela.
- **Não pode:** agendar sem o gestor salvar (R-ag-11); usar horário diferente do exibido (CP-03).
- **Verificação:** E2E (mudar a hora e conferir que o salvo bate com a tela) + teste da recomendação.

**AC-005 — Salvar sem data ou técnico vai para a fila** (Obrigatório)
- **Cenário:** gestor preenche cliente e tipo, mas não escolhe data ou técnico.
- **Ação:** salvar.
- **Esperado (com `agenda.gerenciar`):**
  - OS e visita `nao_agendada` criadas, com o kit previsto ligado à visita;
  - a visita aparece na fila "Sem técnico" da agenda, com atalho para programar.
- **Esperado (sem `agenda.gerenciar`, só por concessão individual):**
  - só a OS é criada, com o kit previsto na OS (sem visita, porque criar visita exige `agenda.gerenciar`, R-ag-04);
  - a OS aparece no filtro "sem responsável" da lista de OS.
- **Verificação:** teste de serviço + E2E.

**AC-006 — Material: prevê sempre, reserva se houver saldo** (Obrigatório)
- **Cenário:** um material do kit tem saldo; outro não tem.
- **Ação:** salvar a OS agendada.
- **Esperado:**
  - os 2 itens ficam previstos;
  - se a visita tem data, o que tem saldo fica reservado **para a visita**;
  - se a visita não tem data, os itens ficam só previstos e a reserva é feita quando a visita for programada;
  - cancelar a visita libera a reserva, e remarcar a visita mantém a reserva nela;
  - o que falta fica sinalizado "aguardando material" (OS em `aguardando_material` e pendência `material_necessario`), sem impedir o salvar;
  - a tela avisa antes de salvar quais itens faltam.
- **Não pode:**
  - deixar o saldo negativo ou a reserva maior que o saldo (R-mat-01);
  - reservar sem `material.movimentar` (quem não tem só prevê).
- **Verificação:** testes de serviço (com saldo, sem saldo, sem permissão).

**AC-007 — Tudo ou nada** (Obrigatório)
- **Cenário:** outro gestor agendou o mesmo técnico no mesmo horário um instante antes.
- **Ação:** salvar.
- **Esperado:**
  - erro "conflito de agenda" junto da seção do técnico;
  - **nada** gravado (nem OS, nem visita, nem reserva, nem número de OS consumido de forma visível);
  - o formulário continua preenchido.
- **Não pode:** deixar a OS órfã ou uma reserva pendurada.
- **Verificação:** teste de concorrência (Vitest, dois envios em paralelo).

**AC-008 — Dois toques não duplicam** (Obrigatório)
- **Ação:** clicar "Criar OS" duas vezes rápido.
- **Esperado:** uma única OS (chave `_idem`).
- **Verificação:** teste de serviço.

**AC-009 — Permissões preservadas** (Obrigatório)
- **Cenário:** usuário com `os.gerenciar` sem `agenda.gerenciar` (ou sem `material.movimentar`).
- **Esperado:**
  - a seção sem permissão aparece travada, com explicação;
  - salvar cria só o que a pessoa pode;
  - o servidor recusa se a seção for forjada no envio.
- **Verificação:** testes de serviço por perfil + E2E `permissoes.spec` (seção travada na tela).

**AC-010 — Regras atuais continuam valendo** (Obrigatório)
- **Esperado:** `npm test` passa sem alterar nenhuma asserção existente, exceto as marcadas como mudança aprovada nesta reformulação.
- **Verificação:** local (`npm test`). O projeto não tem CI.

**AC-011 — Tipos de serviço e kits são cadastráveis** (Obrigatório)
- **Cenário:** gestor em Configurações.
- **Ação:** criar ou editar um tipo, com nome, competências (de uma lista), nº de técnicos, duração e kit (material + quantidade).
- **Esperado:**
  - competências escolhidas de uma lista, sem digitar;
  - mudar o kit **não altera** OS já criadas;
  - tipo desativado some da Nova OS, mas continua nas OS antigas.
- **Verificação:** testes de serviço + E2E curto.

**AC-012 — Acessível no teclado** (Importante)
- **Esperado:** dá para percorrer a tela inteira com Tab, com rótulos lidos e erros ligados aos campos (`aria-describedby`).
- **Verificação:** revisão manual + axe no E2E.

**Decisões que bloqueiam** (resolvidas na seção 3, à espera da confirmação do Victor):
- [ ] D1 técnico;
- [ ] D2 kit;
- [ ] D3 material ao salvar;
- [ ] D4 data e técnico obrigatórios?

## 3. Decisões polêmicas (council)

As vozes Cético, Pragmático e Crítico rodaram em agentes separados. Cada um recebeu só a pergunta e o contexto, para não ser influenciado pela conversa.

| Decisão | Architect | Cético | Pragmático | Crítico | **Veredito** |
|---|---|---|---|---|---|
| **D1 Técnico** | Pré-marcado, gestor confirma | Pré-marca **um**; os outros ficam em "trocar" | Pré-marca, gestor confirma ou troca | Pré-marca, nunca agenda sozinho | **Pré-marcado, confirmação no mesmo salvar. Nunca agenda sozinho.** |
| **D2 Kit** | Padrão por tipo, editável | Editável; começar com um "modelo" mínimo | Padrão editável, entidade mínima | Padrão editável; fixo quebra no 1º cliente | **Kit padrão por tipo de serviço, editável na OS.** |
| **D3 Material ao salvar** | Prevê sempre, reserva se houver saldo | Reserva parcial; cuidado para não prender estoque | Idem; liberar e expirar | Idem; trava contra disputa | **Prevê sempre. Reserva só quando a visita tem data (ver ajuste 2).** |
| **D4 Data e técnico** | Opcionais → fila | Opcionais → fila | Opcionais → fila | Opcionais → fila | **Opcionais. Sem eles, a visita vai para a fila "Sem técnico".** |

**Consenso:** as quatro vozes escolheram a mesma opção (b) em D1–D3 e "opcional" em D4.

**Ajustes que o council trouxe** (mudaram a minha proposta inicial):

1. **Competências viram lista antes da tela única.** Foi a "surpresa" de todas as três vozes. Sem isso a sugestão erra e o gestor deixa de confiar. Vira a **etapa 1** do plano.
2. **Não prender estoque à toa.** Este foi o principal ponto contra (Cético, Pragmático e Crítico):
   - reservar **só quando a visita tem data**;
   - cancelar ou remarcar a visita libera ou move a reserva;
   - OS sem data fica só com o material **previsto**.

   O AC-006 foi ajustado para isso. **Pergunta ao Victor:** reservar só se a data cair nos próximos N dias? (Sugestão: sem limite agora; medir antes.)
3. **"OS completa" = OS + 1ª visita.** As visitas seguintes continuam no fluxo de visita da OS. A reserva passa a ser **por visita** (`material_reserva.visita_id`), para que a troca de técnico ou uma 2ª visita não arraste o kit inteiro.

**A maior discordância:** o Cético prefere começar com um "modelo de OS" simples em vez da entidade "tipo de serviço". **Rejeitado em parte:** a entidade fica **mínima** (nome, competências, nº de técnicos, duração, kit), o que na prática é o modelo que ele sugeriu, mas com nome do negócio e ligada às competências.

**Questionamento da premissa:** ninguém contestou a meta de 60 s. O Cético lembrou que ela mede só o caminho feliz; por isso a fila "Sem técnico" é a válvula de escape.

**Alerta de controle (Crítico):** um item acrescentado ao kit na hora segue as mesmas regras. O consumo informado pelo técnico continua precisando de conferência por outra pessoa (R-mat-09/R-mat-10). O kit não cria atalho para dar baixa.

## 4. Plano em etapas (blueprint: planner + architect + revisão adversarial)

> **Avisos:**
> - O architect **não conseguiu** consultar `node_modules/next/dist/docs/` porque as dependências não estão instaladas. Os pontos de Next/React marcados **[conferir]** precisam ser checados antes do PR que os usa.
> - **Publicação:** nesta branch, o `vercel.json` **não** tem `ignoreCommand`. Então mudar só `docs/` também gera prévia na Vercel. A migração roda no build (`scripts/vercel-build.mjs`) com o banco conectado. Por isso toda migração precisa ser segura em produção.

### 4.1 Fatos do código que moldaram o plano
- **A recomendação depende de uma OS já gravada** (`recomendarTecnicos(osId)`). → O PR-4 cria uma versão "por requisitos", e a função atual vira um invólucro dela.
- **`criarOS` não tem idempotência.** → Coluna `ordem_servico.chave_idempotencia` com índice único parcial (AC-008).
- **O número da OS vem de um contador dentro da transação.** Se a transação é desfeita, o número volta (AC-007). As criações simultâneas ficam em fila, o que é aceitável para 3 a 30 técnicos.
- **`os_item.visita_id` já existe**, e é usada pelos extras pedidos em campo. → Não é coluna nova. "Item do kit" = item com material, `visita_id` preenchida e situação previsto/aprovado.
- **Cancelar uma visita ou uma OS não libera o material reservado.** `cancelarOS` também não libera veículo e ferramenta reservados (`recurso_reserva`). → Corrigido no PR-3a. É uma **mudança de comportamento** e depende da pergunta Q1.
- **Um teste grava competências em texto livre** (`tests/aditivo.test.ts:36-39`). A recomendação compara o texto exato. → A validação estrita entra só nos caminhos novos. A comparação passa a ignorar maiúsculas e minúsculas.
- **A fila de visitas sem data já existe** (`visitasSemAgenda` em `/agenda`).
- **Criar visita exige `agenda.gerenciar`** (R-ag-04). → Quem não tem essa permissão cria só a OS (AC-005).
- **Não há Playwright no `package.json`, nem teste de componente, nem CI.**

### 4.2 Regras que valem em todo PR
- **I1.** `npm test` passa sem alterar nenhuma asserção existente, exceto as mudanças aprovadas em Q1 e Q2.
- **I2.** `npm run typecheck` passa. Nos PRs que mexem em tela, `npm run build` também.
- **I3.** As migrações só acrescentam e são seguras para rodar no build de produção. FK ou CHECK sobre dados existentes usam `NOT VALID` e depois `VALIDATE`.
- **I4.** Toda escrita passa por `services/*` com `Ctx` e `exigir()`. As actions usam `executar()`. A tela travada é só ajuda visual: quem recusa é o servidor.
- **I5.** Tudo é filtrado por empresa. Dinheiro em centavos. Quantidades em `numeric(14,3)`. Datas e horas exibidas em São Paulo.
- **I6.** Nenhuma regra de controle afrouxa: R-ag-01/02, R-ag-04, R-ag-11, R-mat-01, R-mat-09/10, R-pr-01, R-os-03/04.
- **I7.** Toda escrita nova é auditada. Antes de usar uma API do Next, ler `node_modules/next/dist/docs/`.
- **I8.** Cada PR atualiza o checklist do `docs/PLANO.md` (regra do AGENTS.md). Não fica para o fim.

### 4.3 As etapas

| PR | O quê | Depende de | Pode ir junto com | Modelo |
|---|---|---|---|---|
| **1** | Competências viram lista | — | 3a, 4 | padrão |
| **2** | Tipo de serviço + kit (cadastro) | 1 | 3a, 3b, 4 | padrão |
| **3a** | Reserva por visita: estrutura, sincronizar e liberar | — | 1, 2, 4 | **mais forte** |
| **3b** | Entrega e prontidão por visita | 3a | 2, 4 | **mais forte** |
| **4** | Recomendação por requisitos + recálculo automático | — | 1, 2, 3a, 3b | padrão |
| **5** | Serviço único `criarOSCompleta` (tudo ou nada) | 1, 2, 3a | 6 | **mais forte** |
| **6** | Fila "Sem técnico" + "Nova visita" abre programação | **4** (mexem nos mesmos arquivos) | 5 | padrão |
| **7a** | Tela única: cliente, tipo e kit | 2, 5 | 8a | **mais forte** |
| **7b** | Tela única: data, vaga e técnicos | 4, 7a | 8a | **mais forte** |
| **8** | Dados demo + Playwright + E2E | 2 (8a); 6, 7b (8b/c) | — | padrão |
| **9** | Revisão final da documentação | 1–8 | — | padrão |

**Ordem:** `1 ∥ 3a ∥ 4` → `2 ∥ 3b ∥ 6` → `8a` → `5` → `7a` → `7b` → `8b/c` → `9`.

**Observação:** os PRs 3a e 3b não mudam nada para o usuário até o PR-5 entrar no ar, porque nada liga item de kit à visita antes dele. Os testes desses PRs montam os dados direto no banco.

---

#### PR-1 · Competências viram lista (CP-11, P02)
- **Tabela `competencia`:** empresa, código em minúsculas (com CHECK), nome, ativo. O código é único por empresa.
- **Preenchimento inicial (migração custom):** copia as competências que já existem nos profissionais e nas OS (`INSERT … ON CONFLICT DO NOTHING`). Erros de digitação viram linhas que o gestor pode desativar.
- **Serviço `competencias.ts`:**
  - `listarCompetencias`;
  - `salvarCompetencia` (exige `configuracao.gerenciar`, auditado);
  - `validarCompetencias` (estrito, usado só nos caminhos novos).
- **Telas:**
  - nova tela `Configurações → Competências`;
  - no profissional e na OS, os campos de texto viram caixas de marcar.
  - **Competência inativa que já estava marcada continua visível e marcada**, para não sumir sem aviso ao salvar.
- **Recomendação:** passa a comparar competências sem diferenciar maiúsculas e minúsculas. A Q7 decide se os dados antigos são normalizados.
- **Testes:**
  - lista só as ativas;
  - recusa código desconhecido;
  - sem permissão, recusa;
  - outra empresa não enxerga;
  - competência inativa marcada é mantida ao salvar;
  - "Split" e "split" contam como a mesma.
- **Pronto quando:** AC-011 (parte da lista) e AC-010.
- **Volta:** reverter o PR. A tabela fica sem uso.

#### PR-2 · Tipo de serviço + kit (P12)
- **Tabela `tipo_servico`:**
  - nome (único por empresa, sem diferenciar maiúsculas), competências;
  - nº de técnicos (1 a 10), duração (15 a 1440 min);
  - ativo, versão.
- **Tabela `tipo_servico_kit_item`:** material e quantidade > 0, com um material só uma vez por tipo.
- **Coluna opcional `ordem_servico.tipo_servico_id`.** Sem a coluna de versão: o kit é **copiado** para a OS, então ela não precisa saber a versão do tipo.
- **Serviço `tipos-servico.ts`:**
  - `salvarTipoServico` (controle de versão, troca o kit inteiro, auditado);
  - `listarTiposServico`;
  - `obterTipoServico`.
- **Tela `Configurações → Tipos de serviço`.**
- **Testes:**
  - cria um tipo válido;
  - recusa competência fora da lista;
  - recusa quantidade fracionada em unidade que não aceita fração;
  - tipo desativado some da lista, mas continua nas OS antigas;
  - editar o kit não altera OS já criadas;
  - sem permissão, recusa.
- **Pronto quando:** AC-011 (serviço). O E2E fica no PR-8.
- **Volta:** reverter o PR. A coluna opcional pode ficar.

#### PR-3a · Reserva por visita: estrutura, sincronizar e liberar (P08, CP-05)
- **Coluna opcional `material_reserva.visita_id`.**
  - FK composta `(visita_id, os_id) → visita(id, os_id)`, com `UNIQUE(id, os_id)` em `visita`. Garante que a visita é da mesma OS.
  - Declarada em `schema.ts`, para o snapshot do Drizzle não divergir.
  - Índice único parcial para reservas ativas por (visita, material, posição).
- **`sincronizarReservasVisita(visita)`** (exige `material.movimentar`):
  - **o que falta reservar = previsto da visita − reservado ativo da visita − entregue para a visita** (sem contar entregas recusadas ou canceladas). Assim nunca reserva de novo o que já foi entregue.
  - Trava o saldo (`FOR UPDATE`, sempre na mesma ordem: material e depois posição).
  - Reserva `mín(falta, disponível)`. Se a linha de reserva ativa já existe, **atualiza** essa linha em vez de criar outra.
  - Posição de onde sai a reserva: **pergunta Q3**.
  - Nunca lança erro por falta de estoque. O que faltou vira material `pendente` e a pendência `material_necessario` (chave `kit:<visita>`).
- **`liberarReservasVisita` e `liberarReservasOS`:**
  - funções **internas**, não chamadas direto pelas actions;
  - só mexem em reserva `ativa` e só reduzem o reservado (não movem saldo);
  - auditadas com origem "compensação" e o motivo.
  - Liberar não exige `material.movimentar`, porque é efeito de uma ação já autorizada. Essa assimetria fica documentada em `ACESSOS.md`.
- **Ligações no fluxo:**
  - `agendarVisita`: se o usuário tem `material.movimentar`, sincroniza. Remarcar mantém a reserva. Sem a permissão, mantém o que já existe e deixa a falta visível na prontidão.
  - `cancelarVisita`: libera.
  - `cancelarOS`: libera todas as reservas, conforme Q1. **Também desativa as reservas de veículo e ferramenta** (lacuna atual).
  - Visita finalizada e OS conferida (`conferirOS`): liberam o que sobrou reservado, conforme Q2.
- **Testes:**
  - reserva o que há e sinaliza o resto;
  - nunca passa do saldo;
  - duas reservas ao mesmo tempo pelo último item;
  - cancelar visita libera;
  - remarcar mantém;
  - cancelar OS libera material e recursos;
  - OS encerrada não deixa reserva presa;
  - entrega parcial e depois remarcar não reserva de novo;
  - sem `material.movimentar`, agenda mas não reserva;
  - reserva antiga, só por OS, continua igual.
- **Pronto quando:** AC-006 (ciclo de vida) e AC-009 (material).
- **Volta:** reverter o PR. A coluna fica opcional. Se a correção do `cancelarOS` precisar sair sozinha, ela fica num commit separado dentro do PR.

#### PR-3b · Entrega e prontidão por visita
- **`registrarEntrega` com visita:** consome a reserva **da visita**. Se ela não existir, consome a da OS sem visita, e para por aí. **Nunca consome a reserva de outra visita**, conforme Q4.
- **Prontidão** de visita com kit, sem afrouxar R-pr-01:
  - entregue e confirmado → `ok`;
  - só reservado → `alerta` (igual a hoje);
  - material `pendente` → `impeditivo`.

  Visita sem kit segue a regra de hoje. O teste `aditivo.test.ts:66-80` não muda.
- **Testes:**
  - entrega com duas visitas consome a reserva certa;
  - prontidão nos três estados.
- **Pronto quando:** CP-05 resolvido no fluxo de entrega.
- **Volta:** reverter o PR.

#### PR-4 · Recomendação por requisitos + recálculo automático (P05, CP-03, CP-04)
- **`recomendarTecnicosPara(alvo, início, fim, recursos)`.** `recomendarTecnicos(osId)` vira um invólucro, com a mesma saída.
- **Leituras GET (route handlers no padrão de `api/relatorios/[id]/csv`):**
  - `api/os/recomendacao`;
  - `api/clientes/[id]/opcoes`, que resolve o CP-10;
  - `api/materiais/disponibilidade`, que resolve o CP-08.
  - Todas autenticadas, com `exigir`, sem cache. **[conferir]**
- **Tela `os/[id]/programar`:**
  - acabam os campos ocultos e o "Verificar";
  - o recálculo é automático (espera 250 ms, cancela a chamada anterior e ignora respostas velhas);
  - o envio usa o que está na tela.
- **Testes:**
  - os atuais passam sem mudança;
  - sem OS, mostra 3 técnicos com motivos;
  - conflito de ferramenta é considerado;
  - o resultado é igual ao do invólucro.
- **Pronto quando:** AC-004 (serviço). CP-03 e CP-04 eliminados.
- **Volta:** reverter o PR. O invólucro mantém a tela antiga.

#### PR-5 · `criarOSCompleta` (tudo numa transação)
- **Coluna opcional `ordem_servico.chave_idempotencia`.** Índice único parcial em (empresa, chave) quando a chave não é nula.
- **`criarOSCompleta(tx, ctx, dados)`:**
  1. Trava pela chave (`pg_advisory_xact_lock`, **antes** do contador). Se a chave repetir na mesma empresa, devolve a OS existente (AC-008).
  2. Exige `os.gerenciar`. Se vier a parte da agenda sem `agenda.gerenciar`, recusa com `ErroAcesso` (AC-009).
  3. Valida o tipo, as competências e o kit.
  4. Cria a OS com os itens: serviços + **cópia** do kit.
  5. **Se tem `agenda.gerenciar`:** cria a visita 1, liga a ela os itens do kit e agenda se vier data e equipe. Senão a visita fica `nao_agendada`.
  6. **Se não tem `agenda.gerenciar`:** cria só a OS, com o kit previsto na OS (AC-005).
  7. Reserva só se houver data e `material.movimentar` (AC-006).
  8. Define a situação do material:
     - kit vazio → `sem_necessidade`;
     - faltou material → `pendente`;
     - tudo reservado → `disponivel`;
     - sem data, ou com data mas sem permissão de reservar → `nao_avaliado`.
  9. Recalcula a etapa e audita.
  - **Não capturar** o erro de conflito dentro de `criarOSCompleta`: ele precisa desfazer tudo.
- **Erros no campo certo:**
  - `traduzirErroBanco` passa a marcar o conflito de agenda (23P01) com `campo: "equipe"`;
  - `executar()` repassa o `campo`;
  - `EstadoAcao` ganha `campo?` (AC-007).
- **Action `acaoCriarOSCompleta`:** recebe JSON e redireciona para `/os/[id]`.
- **Testes:**
  - AC-001;
  - AC-005, com e sem `agenda.gerenciar`;
  - AC-006, nos 3 casos;
  - AC-007: envios em paralelo → 1 OS, contador +1, nada pendurado, `campo="equipe"`;
  - AC-008, em sequência e em paralelo;
  - AC-009: seção forjada;
  - serviço em menos de 1 s.
- **Pronto quando:** AC-001, 005, 006, 007, 008 e 009 no serviço.
- **Volta:** reverter o PR. A coluna opcional pode ficar. A tela antiga não depende deste serviço.

#### PR-6 · Fila "Sem técnico" + "Nova visita" abre a programação (P01, CP-01, CP-02)
- **Depois do PR-4**, porque os dois mexem em `programar/page.tsx` e `os/actions.ts`.
- A fila `visitasSemAgenda` ganha contagem e o atalho "Programar".
- "Nova visita" leva direto à programação. Depois de agendar, volta para a OS.
- **Testes:**
  - a fila mostra só as visitas da empresa;
  - o técnico não vê a fila.
- **Volta:** reverter o PR.

#### PR-7a · Tela única: cliente, tipo e kit
- **Server component** com clientes, tipos ativos com kit, competências, materiais e permissões. O formulário é o client component `nova-os-completa.tsx`.
- **Seções:**
  1. **Cliente:** busca. Se há um só local ou equipamento, já vem escolhido. Origem, contrato e retorno ficam em "Mais opções".
  2. **Tipo:** preenche competências, nº de técnicos, duração e kit. Trocar de tipo **não apaga** o que já foi editado sem pedir confirmação.
  3. **Kit editável** com o saldo mostrado e aviso do que falta.
- **Descrição.**
- Seção sem permissão fica travada e não vai no envio. Ao dar erro, o foco vai para a seção, com `aria-describedby`.
- Nesta etapa a tela já salva **sem data** (OS + visita na fila).
- A tela antiga vira `/os/nova/classica`.
- **[conferir]** como o React 19 limpa o formulário depois de um erro.
- **Pronto quando:**
  - `npm run build` passa;
  - salvar sem data funciona à mão nos dados demo;
  - os E2E `nova-os.spec` (troca de tipo) e `permissoes.spec` (seção travada) entram no PR-8.
- **Volta:** apontar "Nova OS" para `/os/nova/classica`.

#### PR-7b · Tela única: data, vaga e técnicos
- **Data e vaga:** amanhã sugerido, escolha da vaga com um toque, fim calculado.
- **Técnicos:** motivos e impedimentos, responsável pré-marcado, os outros em "trocar". O recálculo é o do PR-4.
- O conflito de agenda aparece na seção da equipe, e o formulário não perde nada.
- **Meta:** cliente + tipo + vaga + salvar = **4 interações**, mais a descrição.
- **Pronto quando:** `npm run build` passa e o caminho completo funciona à mão. O E2E entra no PR-8.
- **Volta:** reverter o 7b. O 7a continua salvando sem data.

#### PR-8 · Dados demo + Playwright + E2E
- **8a · Dados demo:**
  - competências;
  - 3 tipos com kit (um com saldo, um com falta, um VRF);
  - 3 técnicos (elegível, ocupado, sem competência);
  - cliente com 1 local e 1 equipamento.

  Entra **também no ramo do seed que hoje sai cedo** quando a empresa demo já existe (`seed-demo.ts:44`), sem duplicar. Só fora de produção.
- **8b · Infraestrutura:**
  - o navegador já está na máquina, mas o pacote `@playwright/test` **não** está no projeto: é dependência nova (Q6), assim como `@axe-core/playwright`;
  - `playwright.config.ts` sobe o `next dev` com o banco `thermobras_e2e`, migrado e com seed num `globalSetup`;
  - script `"e2e"`;
  - o `vitest` ignora `e2e/**`.
- **8c · Specs:**
  - `os-completa.spec`: ≤ 8 interações, servidor < 1 s, horário salvo = horário da tela;
  - `os-sem-tecnico.spec`;
  - `nova-os.spec`: troca de tipo;
  - `permissoes.spec`: seção travada;
  - `tipos-servico.spec`;
  - `a11y.spec`: Tab + axe.
- **Pronto quando:** AC-001 a AC-005, AC-009 (tela), AC-011 e AC-012 passam no E2E. O cronômetro manual com você fica registrado.
- **Volta:** reverter o PR. O seed não duplica dados.

#### PR-9 · Revisão final da documentação
- `docs/FLUXOS.md`: novo fluxo e reserva por visita.
- `docs/ACESSOS.md`: tipos e competências sob `configuracao.gerenciar`, e a assimetria entre reservar e liberar.
- `docs/diagnostico.md`: CP-01, 02, 03, 04, 05, 08, 10 e 11 resolvidos.
- O checklist do `PLANO.md` já foi atualizado em cada PR (regra I8).

### 4.4 O que fica de fora (próximas rodadas)
- CP-06: entrega dentro da OS.
- CP-07: "incluir item" com material do cadastro.
- CP-09: situação de material manual, que pode contradizer a automática.
- P14: questionário por tipo de serviço.
- P19: FTFR e reincidência.
- P09: reposição do técnico.
- Aviso "a caminho", GPS, offline e rotas.

## 5. Revisão adversarial (blueprint)

O revisor recebeu o plano e conferiu cada afirmação no código. Encontrou **2 críticos, 9 importantes e 7 menores**. **Todos foram incorporados acima.**

| Achado | Onde mudou |
|---|---|
| **C1:** criar visita exige `agenda.gerenciar`; sem essa permissão não há como criar visita sem afrouxar R-ag-04 | AC-005 e PR-5, passo 6: só a OS |
| **C2:** sincronizar podia reservar de novo o que já tinha sido entregue | PR-3a: fórmula da falta + atualizar a linha existente |
| `os_item.visita_id` já existe | §4.1 e PR-3a |
| Reserva ficava presa após a execução; `cancelarOS` não libera recursos | PR-3a + Q2 |
| Entrega consumia a reserva de outra visita | PR-3b + Q4 |
| Prontidão podia afrouxar R-pr-01 | PR-3b: "só reservado" continua alerta |
| Posição da reserva indefinida | Q3 |
| Liberação feita pelo sistema | PR-3a: função interna, auditada, documentada |
| PR-4 e PR-6 mexiam nos mesmos arquivos | PR-6 passa para depois do PR-4 |
| PR-3 e PR-7 grandes demais; AC-003 sem verificação possível | Divididos em 3a/3b e 7a/7b; AC-003 verificado por E2E |
| Erro de conflito sem campo | PR-5: `traduzirErroBanco` com `campo` |
| Competências inativas sumiam; comparação sensível a maiúsculas | PR-1 + Q7 |
| Seed sai cedo quando a empresa demo existe | PR-8a |
| "docs/ não publica" era falso nesta branch | Aviso no topo da seção 4 |

**Confirmado pelo revisor:**
- o contador da OS volta no rollback;
- a FK composta é viável só acrescentando;
- o erro de conflito dentro do savepoint deixa a transação externa usável;
- nenhum teste atual mexe em reserva ou cancelamento, então o AC-010 é viável.

## 6. Decisões para você aprovar antes de codar

| # | Pergunta | Recomendação |
|---|---|---|
| **D1–D4** | Veredito do council (seção 3) | Aprovar como está |
| **Q1** | Cancelar visita ou OS libera o material reservado? (Hoje não libera.) | **Sim**, libera |
| **Q2** | Visita finalizada ou OS encerrada libera o que sobrou reservado? | **Sim** |
| **Q3** | De onde sai a reserva automática? | Um **almoxarifado padrão** por empresa, configurável |
| **Q4** | A entrega pode usar a reserva de **outra** visita? | **Não** |
| **Q5** | Falta de material bloqueia o agendamento? | **Não**: avisa e marca como pendente |
| **Q6** | Aprova as dependências `@playwright/test` e `@axe-core/playwright` (só para teste)? | **Sim** |
| **Q7** | Normalizar as competências antigas para minúsculas (mexe em dados existentes)? | **Sim**, na migração do PR-1 |
| **Q8** | Reservar só se a data cair nos próximos N dias? | **Sem limite** por enquanto; medir |
| **Q9** | Quais são os 5 a 8 tipos de serviço e kits reais? | Você me passa a lista. Uso exemplos nos dados demo até lá |
