# Matriz de acessos

Gerado por `npx tsx scripts/gerar-matriz.ts` a partir de `src/server/auth/permissoes.ts` (fonte única). Não edite à mão.

- **Empresa**: todos os registros da empresa. **Próprio**: apenas registros ligados ao próprio profissional (visitas em que participa, custódias, valores próprios).
- A checagem é feita nos serviços do servidor (consultas, ações, anexos, exportações, contadores e notificações). Esconder botões é complementar.
- Um usuário pode acumular papéis; concessões individuais explícitas ficam registradas na auditoria. Ninguém altera os próprios papéis/permissões.

## Regras que não dependem só da matriz

| Regra | Onde |
|---|---|
| Vínculo profissional (autônomo × equipe própria) é atributo separado das permissões | `profissional.vinculo` |
| Autônomo nunca executa checklist de veículo, mesmo com permissão concedida | `podeChecklistVeiculo` |
| Técnico próprio só faz checklist do veículo designado; troca de responsável exige nova conferência | `veiculos.ts` |
| Equipe própria não gera pagamento por OS | `agenda.ts` (linha só para autônomos) |
| Ninguém confirma/aprova pagamento a si mesmo (exceto gestor, com autoaprovação registrada) | `financeiro.ts` |
| Quem informou movimento/divergência não confere nem aprova o próprio | `materiais.ts`, `pendencias.ts` |
| Somente o responsável da visita inicia e encerra; demais registram participação própria | `execucao.ts` |
| Dupla aprovação opcional por categoria/valor (definida pelos donos) | `categoria_financeira` |
| Categorias restritas (salários, retiradas) exigem `financeiro.restrito.ver` | `financeiro.ts`, `fluxo.ts` |
| Conta demo é recusada em produção (login e sessão) | `autenticacao.ts`, `contexto.ts` |
| Usuário desativado perde sessões e, com elas, o acesso a anexos | `usuarios.ts` |

## Matriz por papel padrão

| Permissão | Gestor geral / aprovador financeiro | Administrativo e agenda | Operador financeiro | Consulta financeira (sem edição) (desativado) | Técnico |
|---|:-:|:-:|:-:|:-:|:-:|
| Consultar OS `os.ver` | Empresa | Empresa | Empresa | Empresa | Próprio |
| Criar/editar/cancelar OS e itens `os.gerenciar` | Empresa | Empresa | — | — | — |
| Conferência administrativa de OS/visitas `os.conferir` | Empresa | Empresa | — | — | — |
| Ver preço cobrado do cliente `os.valores.ver` | Empresa | — | Empresa | — | — |
| Ver custo de compra `os.custos.ver` | Empresa | — | Empresa | — | — |
| Aprovar extras solicitados `os.extra.aprovar` | Empresa | — | — | — | — |
| Consultar agenda `agenda.ver` | Empresa | Empresa | — | — | Próprio |
| Agendar, remarcar, indisponibilidades `agenda.gerenciar` | Empresa | Empresa | — | — | — |
| Check-in/out e ficha de execução `visita.executar` | Empresa | — | — | — | Próprio |
| Consultar pedidos externos `pedido.ver` | Empresa | Empresa | — | — | — |
| Montar OS a partir de pedidos / conferir alterações `pedido.programar` | Empresa | Empresa | — | — | — |
| Configurar integrações e reprocessar `integracao.gerenciar` | Empresa | — | — | — | — |
| Consultar clientes `cliente.ver` | Empresa | Empresa | Empresa | Empresa | Próprio |
| Cadastrar clientes, locais, contatos, equipamentos `cliente.gerenciar` | Empresa | Empresa | — | — | — |
| Cadastrar fornecedores `fornecedor.gerenciar` | Empresa | Empresa | — | — | — |
| Consultar contratos `contrato.ver` | Empresa | Empresa | Empresa | — | — |
| Cadastrar contratos `contrato.gerenciar` | Empresa | Empresa | — | — | — |
| Ver valores de contrato `contrato.valores.ver` | Empresa | — | Empresa | — | — |
| Cadastrar profissionais e vínculos `profissional.gerenciar` | Empresa | Empresa | — | — | — |
| Consultar ferramentas `ferramenta.ver` | Empresa | Empresa | — | — | Próprio |
| Cadastrar ferramentas `ferramenta.gerenciar` | Empresa | Empresa | — | — | — |
| Separar, entregar, conferir devoluções `ferramenta.movimentar` | Empresa | Empresa | — | — | — |
| Confirmar recebimento / solicitar devolução `ferramenta.confirmar` | Empresa | — | — | — | Próprio |
| Consultar veículos `veiculo.ver` | Empresa | Empresa | — | — | Próprio |
| Cadastrar veículos, manutenções, pneus `veiculo.gerenciar` | Empresa | Empresa | — | — | — |
| Executar checklist de veículo `veiculo.checklist` | Empresa | Empresa | — | — | Próprio |
| Tratar irregularidades de veículo `veiculo.irregularidade.tratar` | Empresa | Empresa | — | — | — |
| Autorizar correção (redução) de odômetro `veiculo.odometro.corrigir` | Empresa | — | — | — | — |
| Consultar materiais e saldos `material.ver` | Empresa | Empresa | Empresa | — | Próprio |
| Cadastrar materiais e posições `material.gerenciar` | Empresa | Empresa | — | — | — |
| Registrar entrada, entrega, recebimento físico `material.movimentar` | Empresa | Empresa | — | — | — |
| Confirmar recebimento e informar consumo/sobra/perda `material.informar` | Empresa | — | — | — | Próprio |
| Validar consumo e conferir devoluções `material.conferir` | Empresa | Empresa | — | — | — |
| Ver custo de materiais `material.custos.ver` | Empresa | — | Empresa | — | — |
| Aprovar perdas, ajustes e divergências `divergencia.aprovar` | Empresa | — | — | — | — |
| Configurar modelos de checklist `checklist.gerenciar` | Empresa | Empresa | — | — | — |
| Consultar contas a receber/pagar `financeiro.ver` | Empresa | — | Empresa | Empresa | — |
| Preparar obrigações, parcelas e despesas `financeiro.lancar` | Empresa | — | Empresa | — | — |
| Registrar recebimentos/pagamentos para conferência `financeiro.baixa.registrar` | Empresa | — | Empresa | — | — |
| Confirmar recebimentos e pagamentos já aprovados `financeiro.baixa.confirmar` | Empresa | — | — | — | — |
| Aprovar despesas e obrigações, conferir baixas `financeiro.aprovar` | Empresa | — | — | — | — |
| Registrar pagamento já realizado sem aprovação prévia (com comprovante; gera exceção para revisão) `financeiro.baixa.excecao` | Empresa | — | — | — | — |
| Autorizar estornos e cancelamentos `financeiro.estornar` | Empresa | — | — | — | — |
| Autorizar descontos `financeiro.desconto` | Empresa | — | — | — | — |
| Cadastrar/alterar saldo inicial das contas `financeiro.saldo_inicial` | Empresa | — | — | — | — |
| Fluxo de caixa e saldos `financeiro.fluxo.ver` | Empresa | — | Empresa | Empresa | — |
| Categorias restritas (salários, retiradas) `financeiro.restrito.ver` | Empresa | — | — | — | — |
| Registrar contatos de cobrança `financeiro.cobranca` | Empresa | — | Empresa | — | — |
| Ver valores de autônomos `autonomo.valores.ver` | Empresa | — | Empresa | — | Próprio |
| Definir valor combinado com autônomo `autonomo.valores.definir` | Empresa | — | — | — | — |
| Preparar resumo semanal e solicitar liberação `autonomo.resumo.preparar` | Empresa | — | Empresa | — | — |
| Liberar pagamento de autônomos `autonomo.liberar` | Empresa | — | — | — | — |
| Consultar pendências `pendencia.ver` | Empresa | Empresa | Empresa | — | Próprio |
| Resolver pendências `pendencia.resolver` | Empresa | Empresa | — | — | — |
| Relatórios operacionais `relatorio.operacional` | Empresa | Empresa | — | — | — |
| Relatórios financeiros `relatorio.financeiro` | Empresa | — | Empresa | Empresa | — |
| Exportar CSV `relatorio.exportar` | Empresa | Empresa | Empresa | — | — |
| Administrar usuários e permissões `usuario.gerenciar` | Empresa | — | — | — | — |
| Configurações da empresa `configuracao.gerenciar` | Empresa | — | — | — | — |
| Consultar auditoria `auditoria.ver` | Empresa | — | — | — | — |

## Papéis padrão

- **Gestor geral / aprovador financeiro** (`gestor`): Donos. Acesso total, aprovações, exceções, configurações e auditoria.
- **Administrativo e agenda** (`administrativo`): Clientes, OS, agenda, equipes, ferramentas e materiais. Sem financeiro por padrão.
- **Operador financeiro** (`financeiro_operador`): Prepara obrigações, registra baixas para conferência, cobrança e resumo de autônomos. Não aprova.
- **Consulta financeira (sem edição)** (`financeiro_consulta`) — desativado inicialmente: Previsto para evolução. Desativado inicialmente.
- **Técnico** (`tecnico`): Visitas, ferramentas e materiais próprios. Vínculo (autônomo/próprio) define pagamentos e checklist de veículo.
