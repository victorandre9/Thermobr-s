# Referências de mercado: apps de serviço de campo (foco ar-condicionado)

> Feito em 2026-11-27. Usei as skills **competitive-platform-analysis** (escopo e camadas), **benchmark-methodology** (notas com evidência) e **competitive-report-structure** (formato do relatório).
> **Regra:** registrar **padrões**, não telas. Nada aqui é para copiar layout, texto ou marca.
> **Limite das fontes:** a pesquisa foi feita na web, com páginas públicas dos fornecedores, centrais de ajuda, lojas de apps e sites de review. Não testei nenhum dos apps. Quase tudo é **material do próprio fornecedor (declarado, não comprovado)**. Quando a fonte não confirma um recurso, está escrito "não confirmado", e isso não quer dizer que o recurso não exista.
> Os links ficam na seção 8, numerados como [A1], [S2] etc.

## 1. Resumo para decisão

1. **Todos tratam o despacho como "OS → visita/agendamento → técnico".** Ninguém obriga a criar a visita vazia e programar depois. A visita já nasce com data e técnico, e dá para deixar "sem técnico" e atribuir depois na agenda ou no quadro. O Polar OS faz isso em 2 passos (CP-01/CP-02 do `docs/diagnostico.md`).
2. **A escolha do técnico em dois níveis é o padrão mais útil**, e o ServiceTitan é a referência:
   - **habilidade + região**, que filtram quem pode fazer;
   - **capacidade/agenda**, que sugere horários livres.

   Auvo e Field Control fazem a versão simples: "mais perto e livre", no mapa. O Polar OS já tem uma recomendação melhor que a maioria das brasileiras (motivos, impedimentos, dados que faltam). Falta ela reagir sozinha quando muda o horário (CP-03) e usar competências de uma lista fechada (CP-11).
3. **Material é onde os gringos e a Auvo vão além.** O padrão é ter:
   - estoque **no veículo/técnico**;
   - **reposição** (repor o caminhão a partir do almoxarifado ou de uma compra);
   - **peça apontada na OS pelo técnico**, que dá baixa e lança o custo.

   O Polar OS já tem o modelo de custódia mais rigoroso do grupo (entrega → confirmação → consumo informado → conferido). O que falta é o vínculo **material ↔ visita/técnico** e uma tela de **reposição** (CP-05/CP-06).
4. **Na jornada do técnico, o padrão é "formulário obrigatório trava a conclusão".** Fotos, assinatura e aviso "a caminho" ao cliente são comuns. O Polar OS já trava a conclusão por ficha, teste e foto. Não tem: GPS no check-in, aviso "a caminho" ao cliente, assinatura na tela (hoje é "ciência" no PDF) e uso sem internet.
5. **Indicadores:**
   - os de **empresa de HVAC** são: resolução na 1ª visita, retrabalho/reincidência, SLA, preventivas no prazo e custo por OS/equipamento;
   - os de **técnico** são: ranking de faturamento, ticket e conversão.

   O Polar OS tem produtividade e custos, mas não calcula resolução na 1ª visita nem reincidência por equipamento, e os dados para isso já existem (resultado da visita, OS de retorno, ficha por equipamento).

## 2. Posição do Polar OS (brief usado)

> **Brief não confirmado:** montei este resumo a partir do repositório (`docs/PLANO.md`, `docs/FLUXOS.md`), sem entrevista. **Victor: confirme ou corrija.**

- **O que é:** gestão de campo + estoque + financeiro operacional para empresas brasileiras de ar-condicionado, pequenas e médias. Tem equipe própria e autônomos, contratos de manutenção e OS avulsas.
- **Diferencial atual:** rigor. Tudo é auditado, tudo passa por conferência feita por outra pessoa, e o estoque não fica negativo nem com concorrência. O financeiro separa obrigação, autorização, realizado e conferência.
- **Tensão estratégica (os dois eixos do mapa):**
  - **Controle/rastreabilidade:** quanto o sistema garante que nada se perde;
  - **Agilidade do gestor:** quantos cliques e telas o gestor gasta para colocar um técnico na rua com o material certo.
- **Quadrante-alvo:** alto/alto, ou seja, rigor de ServiceTitan com a fluidez de Jobber/Auvo.

## 3. Mapa do mercado (tensão)

```
 Controle / rastreabilidade
 5 |                 ServiceTitan ●         ← quadrante-alvo (alto/alto)
   |  Polar OS (hoje) ●
 4 |
   |          Auvo ●
 3 |                       Field Control ●
   |   Produttivo ●          Housecall Pro ●
 2 |                               Jobber ●
 1 +------------------------------------------------ Agilidade do gestor
   1         2          3          4          5
```

Posições estimadas pelas notas da seção 5.

**Quem está no alvo:** só o ServiceTitan chega perto. Ele é caro, americano e pensado para empresas grandes.

**No Brasil, o quadrante alto/alto está vazio.**
- Auvo é o concorrente mais próximo: tem estoque com reserva por OS e foco declarado em climatização.
- Field Control e Produttivo puxam para agilidade e formulários.

## 4. Camadas do conjunto

| Camada | Quem | Por quê |
|---|---|---|
| **Direto** | **Auvo**, **Field Control** | Brasileiros, para PMEs com equipe externa. A Auvo tem página própria para climatização e refrigeração [A2]. São os que o cliente do Polar OS compara. |
| **Adjacente** | **Produttivo** | Brasileiro, mas centrado em formulário/checklist e PDF [P1][P2], não em despacho ou estoque. Pressiona pela "jornada do técnico simples". |
| **Aspiracional** | **ServiceTitan** | O mais completo em HVAC: habilidades, zonas, capacidade, estoque no caminhão, compras [S1]–[S6]. É a régua de maturidade, não um concorrente direto. |
| **Aspiracional (simplicidade)** | **Jobber**, **Housecall Pro** | Para pequenos serviços residenciais nos EUA. São a referência de fluxo curto e de experiência do cliente (aviso "a caminho", ranking). Estoque fraco ou feito por integração [J3][H3]. |
| *Substitutos* | Planilha + WhatsApp; ERP genérico com módulo de OS | É o que o cliente usa hoje. É a principal ameaça na prática. |

## 5. Comparação por tema (o que cada um faz, com fonte)

### 5.1 Criar e despachar a OS
- **Auvo:** o despacho parte da OS, que carrega prazo, local, tipo de serviço e habilitação exigida. O cruzamento é com disponibilidade, região e especialidade. Chamado urgente vai para o técnico mais próximo e livre, e o técnico recebe no app. As tarefas aparecem no mapa e na agenda, com status "a caminho / em execução / em pausa / finalizada" [A3][A4].
- **Field Control:** recebe a solicitação, cria a OS e encaminha ao técnico. O gestor vê a agenda de cada técnico em tempo real e encaixa por disponibilidade e proximidade [F1][F2].
- **Produttivo:** OS e checklist a partir de modelos. O plano de manutenção gera agendamentos recorrentes com alerta e liga cada um à agenda do técnico e ao cadastro do ativo [P3][P4].
- **ServiceTitan:** quadro de despacho (Dispatch Board). A capacidade adaptativa calcula vagas reais pelos turnos, zonas, habilidades e compromissos já marcados, e sugere o horário já na hora de agendar [S1][S2].
- **Jobber:**
  - pedido (Request) → orçamento → "converter em trabalho" (Job), que mantém os itens do orçamento;
  - o Job tem **visitas**, e a equipe pode ser definida no job ou em cada visita;
  - visita sem equipe fica "não atribuída" para atribuir depois;
  - a agenda é de arrastar, e a equipe é avisada da mudança [J1][J2][J4].
- **Housecall Pro:**
  - quadro com calendário + mapa, de arrastar;
  - job de vários dias = um job com vários **agendamentos**, cada um com data, faixa e pelo menos 1 técnico;
  - a fatura é única [H1][H2].

### 5.2 Escolher o técnico (agenda, região, habilidade)
- **ServiceTitan:**
  - habilidades configuradas por tipo de serviço, e só quem tem a habilidade pode ser escolhido;
  - a recomendação é deixar como "do serviço" só as habilidades raras;
  - zonas primária e secundária por técnico, usadas na rota e no tempo de deslocamento [S1][S2].
- **Auvo:** "técnico mais próximo e habilitado", com localização em tempo real. A roteirização usa prioridade, duração, ponto de partida, jornada e intervalos, e a rota pode se repetir em dias fixos, o que serve para contrato [A3][A5].
- **Field Control:** proximidade e disponibilidade no mapa. A roteirização avançada é vendida à parte [F2].
- **Jobber:** "mais próximo ou primeiro disponível" e otimização de rota diária ou semanal [J1][J5]. Habilidades: não confirmado.
- **Housecall Pro:** distribuição pelo quadro e pelo mapa [H1]. Habilidades: não confirmado.
- **Produttivo:** agenda de todos os técnicos lado a lado, considerando local e disponibilidade [P4]. Habilidades: não confirmado.

### 5.3 Materiais (kits, estoque no veículo, baixa)
- **Auvo:**
  - estoque com **reserva por OS**;
  - **baixa na execução**;
  - controle da **peça defeituosa que volta ao fabricante**;
  - o técnico **aponta a peça no app**, o que dá baixa e lança o custo na OS;
  - a OS concluída vira cobrança [A1][A6].
- **ServiceTitan:**
  - estoque por armazém e por **caminhão**;
  - **reposição** (Replenishment) do caminhão por pedido de compra ou por transferência;
  - recebimento por app próprio com código de barras;
  - o técnico cria o pedido de compra a partir do job, se tiver permissão;
  - indicador sugerido: tempo entre o pedido de reposição e o recebimento, porque reposição lenta faz o técnico "estocar" peça no caminhão [S3][S4].
- **Housecall Pro:**
  - relatório de **uso de material por job e por técnico**;
  - estoque de caminhão e armazém só por integração (Ply): alocação, transferência e lista de reposição [H3];
  - custo do job = mão de obra + materiais + comissões [H4].
- **Jobber:** catálogo de produtos/serviços em itens de linha. O custo do material entra no item, e a mão de obra entra no apontamento de horas [J3]. Estoque com saldo: não confirmado.
- **Field Control:** "dados de estoque em tempo real" e lista de peças como campo opcional da OS [F2][F3]. Estoque por técnico: não confirmado.
- **Produttivo:** a OS registra os materiais usados [P4]. Baixa automática: não confirmado.
- **Kits** (conjunto padrão de peças por tipo de serviço): **nenhuma fonte confirmou** como recurso nomeado. O mais próximo:
  - o Housecall Pro tem *modelos de job* que trazem itens + checklist [H2];
  - a Auvo tem *questionário por tipo de tarefa* [A1].

### 5.4 Jornada do técnico
- **Check-in/out e GPS:**
  - a Auvo tem check-in/out **automático por localização** (cerca virtual), além do manual [A7];
  - o Jobber marca horas por entrada/saída no job, ou por timer de localização [J1];
  - o Housecall Pro começa o job com o "A caminho" (*On My Way*). Só o job inteiro é encerrado, não cada agendamento [H2];
  - o Field Control mostra os técnicos no mapa e dá ao cliente um link com trajeto e previsão de chegada [F2].
- **Checklist obrigatório:**
  - ServiceTitan: **formulário obrigatório bloqueia a conclusão do job e a cobrança** [S5];
  - Auvo: questionário por tipo de tarefa com resposta obrigatória, que impede fechar a visita incompleta [A1];
  - Field Control: checklists obrigatórios [F3];
  - Jobber: só **lembra** dos campos pendentes ao concluir, sem confirmação de bloqueio [J4].
- **Fotos:**
  - ServiceTitan: fotos no job e nos formulários, com orientação de foto "depois" e detalhe das conexões [S5];
  - Field Control: a foto vai direto para o checklist da visita [F3];
  - Produttivo: a foto é um tipo de resposta do formulário [P1].
- **Assinatura:**
  - ServiceTitan: tem assinatura **antes** (autorização) e **depois** (ciência) do serviço. O cliente assina no aparelho ou por link, e a empresa pode exigir assinatura para fechar [S5];
  - Auvo, Field Control e Produttivo: assinatura no app e PDF enviado por e-mail ou WhatsApp [A7][F3][P2].
- **Sem internet:** Produttivo e Field Control declaram uso offline [P1][F3].

### 5.5 Indicadores
- **Auvo** (o que ela recomenda para climatização):
  - preventivas no prazo;
  - SLA de corretivas;
  - **reincidência por equipamento**;
  - **resolução na 1ª visita** (FTFR);
  - MTTR e MTBF;
  - custo acumulado por equipamento;
  - receita recorrente de contratos [A2][A8].
- **Housecall Pro:**
  - **ranking de técnicos**: faturamento, nº de jobs, ticket médio, conversão e nota do cliente;
  - em julho/2026, passou a dividir a receita de jobs com vários técnicos, para não contar em dobro [H5];
  - custo do job por mão de obra e material [H4].
- **ServiceTitan:** fechar o job e lançar a fatura dispara comissão e folha [S5]. Painéis de desempenho do técnico: não confirmados nesta pesquisa.
- **Jobber:** custo e margem por job, só para jobs avulsos [J3]. Relatório de pedidos (novo → orçamento → job) [J4].
- **Produttivo:** cumprimento do plano preventivo, backlog, MTTR/MTBF, homem-hora por técnico; os dados do checklist viram gráfico [P3].
- **Field Control:** relatórios de atividades, avaliações, prazos, tempo médio e desempenho da equipe [F2].

## 6. Matriz de benchmark (1 a 5)

**Escala:**
- 1 = não tem / não confirmado;
- 3 = faz o básico;
- 5 = é a referência do grupo.

**Notas de leitura:**
- As notas medem o que as fontes **mostram**, não o produto inteiro.
- Sem total somado, de propósito: um número único esconderia onde cada um é forte.
- A linha do Polar OS é autoavaliação a partir do `docs/diagnostico.md`.

| | OS e despacho | Escolha do técnico | Materiais | Jornada do técnico | Indicadores | **Controle** | **Agilidade** |
|---|---|---|---|---|---|---|---|
| **Polar OS (hoje)** | 2 (visita vazia + programar à parte) | 4 (motivos e impedimentos; competência em texto livre) | 4 (custódia e conferência fortes; sem ligação com a visita) | 3 (trava por ficha/teste/foto; sem GPS/offline) | 2 (sem FTFR e sem reincidência) | 4–5 | 2 |
| Auvo | 4 | 3 | 4 | 4 | 4 (lista para HVAC) | 4 | 3 |
| Field Control | 3 | 3 | 2 | 4 | 3 | 3 | 3–4 |
| Produttivo | 3 (forte em preventiva recorrente) | 2 | 1–2 | 4 (formulário e offline) | 3 | 3 | 3 |
| ServiceTitan | 5 | 5 | 5 | 5 | 3* | 5 | 3 |
| Jobber | 4 | 2–3 | 1–2 | 3 | 3 | 2 | 4–5 |
| Housecall Pro | 4 | 3 | 2 (estoque por integração) | 3–4 | 4 (ranking) | 3 | 4 |

\* Os painéis de KPI do ServiceTitan não apareceram nas fontes desta rodada.

- **Onde o Polar OS lidera:** controle, e a recomendação de técnico com motivos.
- **Onde fica atrás:** agilidade do despacho e indicadores de qualidade (FTFR e reincidência).

## 7. Tabela de padrões: o que adotar

**Legenda:**
- **Adotar:** encaixa direto;
- **Adaptar:** a ideia serve, mas com as regras do Polar OS;
- **Não adotar:** não serve agora, com o motivo.

| # | Padrão (de quem) | Decisão | Como fica no Polar OS | Liga com |
|---|---|---|---|---|
| P01 | Visita nasce com data/técnico **ou** fica "não atribuída" para atribuir depois no quadro (Jobber, HCP) | **Adotar** | "Nova visita" abre direto a programação. Quem não tem horário fica numa fila "sem técnico" na agenda | CP-01, CP-02 |
| P02 | Habilidade obrigatória por tipo de serviço; rara = do serviço, comum = ampla (ServiceTitan) | **Adaptar** | Competências viram lista cadastrada, ligadas a "tipos de serviço" (instalação split, VRF, PMOC…), em vez de texto livre | CP-11, R-ag-11 |
| P03 | Zonas primária/secundária por técnico (ServiceTitan) | **Adaptar** | Já existe `profissional.regioes[]`. Falta usar como peso na recomendação e mostrar no quadro | R-ag-11 |
| P04 | Sugerir **horários livres** já cruzando turno, zona e habilidade (ServiceTitan) | **Adotar (depois)** | Hoje o gestor escolhe o horário e depois vê os técnicos. Inverter: mostrar as vagas em que há equipe elegível | CP-03 |
| P05 | Recomendação recalcula sozinha ao mudar horário/recurso (todos com quadro de arrastar) | **Adotar** | Fim dos campos ocultos; recalcular ao mudar dia, hora, veículo ou ferramenta | CP-03, CP-04 |
| P06 | Roteirização diária e repetição em dias fixos para contrato (Auvo, Jobber) | **Não adotar agora** | Exige mapa e serviço de rotas pago. Rever depois de P01–P05 | — |
| P07 | Plano de preventiva gera visitas recorrentes por equipamento, com alerta (Produttivo, Auvo/PMOC) | **Adaptar** | A rotina de mensalidade já existe por contrato. Estender para gerar OS ou visitas de preventiva por contrato e equipamento | R-con-02, `rotinas.ts` |
| P08 | Reserva de peça por OS + baixa na execução + custo na OS (Auvo) | **Já tem / adaptar** | Reserva e conciliação existem. Falta ligar a reserva à **visita** e ao **técnico** e mostrar o custo na OS | CP-05, R-mat-12 |
| P09 | Estoque no veículo/técnico + **reposição** por transferência ou compra (ServiceTitan; HCP via Ply) | **Adotar** | As posições de veículo e técnico já existem. Criar a tela "Repor técnico/veículo": sugere o que falta para as visitas dos próximos dias | CP-05, CP-06 |
| P10 | Técnico **aponta a peça usada** no app → baixa + custo (Auvo) | **Adaptar** | Já é "consumo informado". **Manter a conferência por outra pessoa** (regra R-mat-09/R-mat-10). Não adotar a baixa direta | R-mat-09 |
| P11 | Peça defeituosa que volta ao fabricante (Auvo) | **Adaptar** | Já existe "segregado" (R-mat-01, liberar segregado). Falta o motivo "garantia do fabricante" e o acompanhamento | — |
| P12 | Kit / modelo de serviço que traz itens + checklist (HCP: modelos de job) | **Adotar** | "Modelo de serviço" que preenche itens, material previsto, competências e nº de técnicos na Nova OS. Corta os 35 campos de itens | CP-07, CP-11 |
| P13 | Formulário obrigatório **bloqueia** a conclusão (ServiceTitan, Auvo) | **Já tem** | `checkout` já exige ficha, teste e foto (R-ex-06). Manter | R-ex-06 |
| P14 | Questionário **por tipo de serviço** (Auvo, Produttivo) | **Adaptar** | A ficha hoje é a mesma para tudo. Perguntas por tipo de serviço (PMOC, instalação, corretiva) | R-ex-05 |
| P15 | Assinatura antes (autorização) e depois (ciência), no aparelho ou por link (ServiceTitan) | **Adaptar** | Hoje é "ciência" registrada no relatório (R-ex-13). Somar a assinatura desenhada na tela. Por link: só depois. **Manter "ciência não é aprovação"** | R-ex-13 |
| P16 | Aviso "a caminho" + link de acompanhamento para o cliente (HCP, Field Control) | **Adotar (depois)** | Precisa de envio de mensagem (WhatsApp/SMS), que não existe hoje. Começar pelo botão "a caminho", que grava a hora | — |
| P17 | Check-in automático por cerca virtual com GPS (Auvo) | **Adaptar** | Gravar a localização no check-in manual (prova de presença). Check-in automático: **não**, porque conflita com a regra "só o responsável faz o check-in" (R-ex-02) | R-ex-02/04 |
| P18 | Uso sem internet (Produttivo, Field Control) | **Avaliar** | Importante no campo (casa de máquinas, subsolo), mas é custo alto. A idempotência já existe e facilita. Decidir na reformulação | — |
| P19 | Indicadores de HVAC: **resolução na 1ª visita, reincidência por equipamento**, preventiva no prazo, SLA, custo por equipamento (Auvo, Produttivo) | **Adotar** | Os dados já existem: resultado da visita, OS de retorno com `osOrigemId`, ficha por equipamento. Criar esses relatórios | Relatórios |
| P20 | Ranking de técnicos com divisão de receita em job com vários técnicos (HCP) | **Adaptar** | Ranking por **qualidade** (1ª visita, retorno, pontualidade) além de volume. Atenção à regra: equipe própria não gera pagamento por OS | R-aut-08 |
| P21 | Indicador de reposição: tempo do pedido até o recebimento (ServiceTitan) | **Adotar (depois)** | Junto com P09 | — |
| P22 | Converter orçamento em OS mantendo os itens (Jobber) | **Adaptar** | Hoje o rascunho → aprovação já faz esse papel. Útil se surgir "orçamento" como etapa separada | R-os-04/08 |

**Ordem sugerida (impacto × esforço):**
1. **P01, P05** e o vínculo material ↔ visita (**P08**): corrigem as perdas de contexto do diagnóstico.
2. **P02 + P12**: tipos de serviço com competências, kit e questionário. Corta a digitação na Nova OS.
3. **P19**: indicadores de HVAC, com dados que já existem.
4. **P09/P21**: reposição de estoque do técnico.
5. **P07**: preventiva recorrente por contrato.
6. **P15–P17**: assinatura, aviso ao cliente e GPS.
7. **P18** (offline) e **P06** (rotas): decisões maiores, para depois.

**Atenção (equilíbrio do produto):** P10, P13, P15 e P17 foram adaptados **para não enfraquecer o controle**. Conferência por outra pessoa, ciência ≠ aprovação e check-in só pelo responsável são regras do Polar OS (ver `docs/diagnostico.md` §4). Adotar a versão "simples" dos concorrentes trocaria controle por agilidade. Confirmar se é essa a intenção.

## 8. Fontes

Material do fornecedor = **declarado**. Review e loja de apps = indício. Nada foi testado.

**Auvo**
- [A1] https://www.auvo.com/software-assistencia-tecnica: estoque com reserva por OS, peça defeituosa, questionário obrigatório por tipo de tarefa
- [A2] https://www.auvo.com/software-climatizacao-refrigeracao: indicadores para climatização
- [A3] https://www.auvo.com/roteirizacao: roteirização, prioridade, repetição
- [A4] https://www.auvo.com/app-de-campo: app do técnico, status, apontamento de peça
- [A5] https://www.blog.auvo.com/gestao-de-agenda: agenda e técnico mais próximo
- [A6] https://www.auvo.com/ordem-servico-digital: peça dá baixa, OS vira cobrança
- [A7] https://apps.apple.com/app/id1340491998: check-in/out automático, fotos, assinatura
- [A8] https://www.auvo.com/field-service: FTFR, MTTR, SLA, NPS

**Field Control**
- [F1] https://www.omie.com.br/blog/como-integrar-uma-gestao-de-equipes-externas-ao-erp-omie/: fluxo solicitação → OS → técnico
- [F2] https://fieldcontrol.com.br/agendamento-e-despacho.html e https://fieldcontrol.com.br/funcionalidades.html: agenda, mapa, link de chegada, estoque, relatórios
- [F3] https://fieldcontrol.com.br/aplicativo-colaborador.html e https://fieldcontrol.com.br/blog/modelo-de-checklist.html: offline, checklist obrigatório, foto, assinatura

**Produttivo**
- [P1] https://apps.apple.com/br/app/formapp-checklists-e-formularios/id690303347: tipos de resposta, offline
- [P2] https://www.produttivo.com.br/aplicativo-checklist/ e https://www.produttivo.com.br/llms.txt: PDF automático, assinatura, GPS
- [P3] https://www.produttivo.com.br/blog/dashboard-de-manutencao/ e https://www.produttivo.com.br/blog/plano-de-manutencao/: indicadores, plano preventivo
- [P4] https://www.produttivo.com.br/blog/field-service-fsm/: agenda da equipe, materiais na OS

**ServiceTitan**
- [S1] https://www.servicetitan.com/industries/hvac-software/dispatching: habilidades por tipo de serviço
- [S2] https://help.servicetitan.com/docs/plan-your-team-s-capacity-2: capacidade adaptativa, zonas, habilidades
- [S3] https://help.servicetitan.com/docs/manage-parts-purchase-orders e https://help.servicetitan.com/docs/purchasing-module: reposição, compra pelo campo, recebimento
- [S4] https://www.servicetitan.com/blog/reduce-technician-windshield-time: estoque do caminhão no despacho (marketing)
- [S5] https://help.servicetitan.com/how-to/complete-and-send-forms-in-the-servicetitan-field-mobile-app e https://help.servicetitan.com/docs/complete-the-work-in-the-field-3: formulário bloqueia conclusão, assinaturas, fotos
- [S6] https://help.servicetitan.com/landing-page/inventory-and-po-home: estoque e compras

**Jobber**
- [J1] https://getjobber.com/features/service-dispatch-software/ e https://www.getjobber.com/features/jobs/: despacho, checklists, horas por localização
- [J2] https://help.getjobber.com/hc/en-us/articles/7924045219479-Visits: visitas e atribuição por visita
- [J3] https://help.getjobber.com/hc/en-us/articles/14343244961175-Job-Costing: custo do job, itens de linha
- [J4] https://help.getjobber.com/hc/en-us/articles/115009740048-Job-Forms e https://help.getjobber.com/hc/en-us/articles/115009378727-Quote-Basics: checklist com lembrete, conversão de orçamento
- [J5] https://www.getjobber.com/pricing/: otimização de rotas

**Housecall Pro**
- [H1] https://www.housecallpro.com/features/dispatching-software/: quadro com calendário e mapa
- [H2] https://help.housecallpro.com/en/articles/6930497-multi-day-job-appointments-overview e https://help.housecallpro.com/en/articles/12892543-appointments-vs-segments-vs-recurring-jobs: agendamentos, "a caminho", modelos de job
- [H3] https://help.housecallpro.com/en/articles/10431432-ply-inventory-management-integration-overview: estoque por integração
- [H4] https://help.housecallpro.com/en/articles/6536636-job-costing-complete-set-up-guide: custo do job
- [H5] https://help.housecallpro.com/en/articles/16771982-tech-leaderboard: ranking de técnicos

## 9. Perguntas para decidir com a equipe

1. O quadrante "controle alto + agilidade alta" é mesmo o alvo? Ou o cliente aceita perder um pouco de controle em troca de velocidade? (Ver P10/P17.)
2. A Auvo é o concorrente direto mais forte em climatização. Algum cliente atual já usou a Auvo? O que ele sentia falta?
3. Uso sem internet (P18) é obrigatório para os técnicos de vocês? Em quantos atendimentos falta sinal?
4. "Tipos de serviço" com kit e questionário (P02/P12/P14): quais são os 5 a 8 tipos mais comuns hoje?
5. Envio de mensagem ao cliente (P16) por WhatsApp: tem orçamento para um provedor?
