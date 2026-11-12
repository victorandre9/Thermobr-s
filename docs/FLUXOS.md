# Fluxos implementados

## 1. Pedido → OS → agenda
1. Pedido externo entra pelo adaptador (`pedidos.ts`): idempotente por `origem + id externo` e hash do conteúdo; versões preservadas; log de sincronização.
2. Fila **Pedidos para programar** → escritório seleciona o cliente cadastrado e monta a OS. A OS referencia o pedido (UNIQUE): um pedido gera no máximo uma OS; **dividir um pedido em várias OS é bloqueado** (use várias visitas).
3. Alteração/cancelamento do pedido depois da OS → situação **conferência** (nada é sobrescrito: serviços, parcelas e baixas ficam como estão).
4. Treeunfe: **aguardando validação** (API de pedidos não confirmada). Webhook responde 503; rotina periódica registra "ignorado". Nada é simulado como conectado.

## 2. OS e visitas
- Origens: serviço avulso (rascunho até aprovação comercial), visita de contrato, retorno/garantia vinculado à OS original.
- Dimensões separadas: etapa macro (resumo coerente calculado), situação comercial, material, conferência, resultado de cada visita, financeiro.
- **Programar visita**: recomendação de técnicos (competências cadastradas, indisponibilidade/conflito, quantidade necessária, recursos exclusivos, continuidade com cliente/equipamento, região). Mostra motivos e dados faltantes; não agenda sozinha.
- Reserva atômica de toda a equipe + veículo/ferramenta exclusiva (EXCLUDE no banco). Reagendamento com motivo e histórico; visita iniciada/finalizada não é reagendada (preserva horários reais).
- **Prontidão** antes da saída: endereço, contato, serviço/equipamentos, equipe, materiais, ferramentas (com conferência do kit), pendências, checklist do veículo (só técnico próprio designado; autônomo = não se aplica). Impeditivo × alerta; exceção com justificativa auditada.
- **Atendimento (celular)**: responsável faz check-in/check-out (horário do servidor, idempotente); demais registram chegada/saída individual. Ficha por equipamento, fotos privadas, solicitações (extra, material, retorno, remarcação). Concluída exige ficha completa, teste OK e foto; parcial/não realizada exige motivo padronizado, pendência e próxima ação.
- Conferência administrativa encerra a OS (distinta do encerramento técnico).
- **Relatório de atendimento em PDF** (visita ou OS), versões numeradas, campos externos por lista explícita, evidências selecionadas, ciência registrada (não é assinatura certificada). Download para envio manual.

## 3. Ferramentas
Entrega → confirmação do recebedor → custódia (pessoa identificável) → devolução solicitada → devolução conferida (por outro usuário). Transferência confirmada pelo novo responsável. Falta, dano, deixada no cliente → pendência. Conjuntos listam componentes. Conferência de kit reutilizável no turno somente com o mesmo responsável e a mesma composição.

## 4. Veículos
Checklist versionado (resposta guarda perguntas/regras da versão), reutilizável por veículo+responsável+validade. Irregularidade → pendência com prioridade pela criticidade, prazo e evidência; crítica pode bloquear o check-in até liberação excepcional do gestor (configurável). Odômetro: redução só como correção autorizada. Manutenções, pneus (duração em dias/km quando há dados), alertas por data **ou** km (o primeiro), com limitação quando o km está desatualizado e "sem base" quando faltam parâmetros/histórico.

## 5. Materiais
Previsão (itens da OS) → reserva → entrega (origem debitada, em trânsito) → confirmação do técnico → consumo/devolução/perda **informados** → **conferidos** por outro usuário. Devolução só informada não aumenta o disponível. Diferença na devolução vira divergência "a localizar" (sem baixa). Perda/ajuste só com aprovação. Peça divergente segregada. Retalhos preservam comprimento. Transferências sem criar/perder quantidade. Saldo com `CHECK >= 0` e reserva ≤ saldo: concorrência não gera negativo. Conciliação por OS (ex.: 10 entregue, 7 consumido validado, 3 devolvido conferido = conciliado). Estoque inicial conferido (uma vez por material+posição) e contagens físicas (esperado × físico). Compra → recebimento → uma única conta a pagar.

## 6. Financeiro operacional
- Separação: **obrigação** (a pagar/receber, origem identificável e chave única) → **autorização** (aprovação; autoaprovação registrada; dupla aprovação configurável) → **realizado** (baixa: fato) → **conferência**.
- Operador financeiro prepara e registra; baixas ficam aguardando conferência, salvo permissão delegada pelos donos (confirmar recebimentos e pagamentos já aprovados, dentro do saldo). Pagamento realizado sem aprovação prévia: registro como **exceção** com permissão específica, justificativa e comprovante — entra no caixa e alerta o gestor.
- Parcial, estorno (baixa inversa, original preservada), cancelamento (exige estorno/devolução das baixas), transferências entre contas (não são receita/despesa).
- Cobrança da OS avulsa: uma por OS (`os:<id>:principal`); extras aprovados à parte; contrato: uma mensalidade por competência; retorno e visita de contrato não geram venda. Item sem preço bloqueia (valor desconhecido ≠ gratuidade).
- Autônomos: linha por OS (base serviço/visita/pacote/adicional de retorno), valor definido pelo gestor, conferência, resumo semanal (previsão configurável, padrão sexta), adiantamentos abatidos uma vez, liberação → conta a pagar única. "Coberto pelo acordo original" não gera pagamento. Equipe própria nunca gera pagamento por OS.
- Caixa: saldo inicial por conta/data; realizado = baixas confirmadas; projeção 7/15/30/60/90 dias com data esperada de recebimento separada do vencimento; vencidos sem previsão à parte; alerta de saldo negativo com data, premissas e compromissos; visão incompleta sinalizada.
- Implantação: data de corte, saldos iniciais, contas antigas marcadas como legado (não são vendas novas), baixas anteriores ao saldo inicial bloqueadas.

## 7. Painel, notificações e relatórios
Balões por perfil, cada um com o mesmo filtro da lista de destino (testado). Central de pendências: críticas/vencidas, hoje, esta semana, aguardando terceiro, sem prazo — com responsável, prazo e próxima ação. Notificações agrupadas por problema; ler não resolve. Relatórios 1–11 + acompanhamento 6/12 meses (sem ROI/economia fictícios), paginados e exportáveis em CSV com as mesmas restrições (exportação auditada).
