/**
 * Esquema do banco — Thermobrás.
 * Convenções:
 *  - Toda tabela de negócio carrega empresa_id (fronteira de acesso).
 *  - Dinheiro: bigint em centavos (mode number). Nunca float.
 *  - Quantidade: numeric(14,3) + unidade do material.
 *  - Instantes: timestamptz. Vencimento/competência: date (sem fuso).
 *  - Registros concluídos não são apagados: correção por eventos (status, estorno, ajuste).
 * Restrições que o Drizzle não expressa (EXCLUDE, CHECK compostos, índices parciais especiais)
 * estão em drizzle/0001_constraints.sql.
 */
import { sql } from "drizzle-orm";
import {
  pgTable, uuid, text, boolean, integer, bigint, numeric, timestamp, date, jsonb,
  primaryKey, uniqueIndex, index, customType, time, smallint,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const empresaId = () => uuid("empresa_id").notNull().references(() => empresa.id);
const criadoEm = () => timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();
const atualizadoEm = () => timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow();
const centavos = (name: string) => bigint(name, { mode: "number" });
const qtd = (name: string) => numeric(name, { precision: 14, scale: 3 });
const ts = (name: string) => timestamp(name, { withTimezone: true });

/** Intervalo tstzrange: representado como string "[inicio,fim)". */
export const tstzrange = customType<{ data: string }>({ dataType: () => "tstzrange" });

// ---------------------------------------------------------------------------
// Empresa / configuração
// ---------------------------------------------------------------------------
export const empresa = pgTable("empresa", {
  id: id(),
  nome: text("nome").notNull(),
  documento: text("documento"),
  /** Configurações operacionais editáveis (ver src/server/services/config.ts para o formato). */
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  criadoEm: criadoEm(),
});

export const contador = pgTable("contador", {
  empresaId: empresaId(),
  chave: text("chave").notNull(),
  valor: bigint("valor", { mode: "number" }).notNull().default(0),
}, (t) => [primaryKey({ columns: [t.empresaId, t.chave] })]);

// ---------------------------------------------------------------------------
// Usuários, sessões, papéis e permissões
// ---------------------------------------------------------------------------
export const usuario = pgTable("usuario", {
  id: id(),
  empresaId: empresaId(),
  nome: text("nome").notNull(),
  email: text("email").notNull(),
  senhaHash: text("senha_hash"),
  ativo: boolean("ativo").notNull().default(true),
  /** Conta criada pelo seed de demonstração: bloqueada quando APP_ENV=production. */
  demo: boolean("demo").notNull().default(false),
  deveTrocarSenha: boolean("deve_trocar_senha").notNull().default(false),
  ultimoLoginEm: ts("ultimo_login_em"),
  desativadoEm: ts("desativado_em"),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
}, (t) => [uniqueIndex("usuario_email_uq").on(sql`lower(${t.email})`)]);

export const sessao = pgTable("sessao", {
  id: id(),
  usuarioId: uuid("usuario_id").notNull().references(() => usuario.id),
  tokenHash: text("token_hash").notNull(),
  expiraEm: ts("expira_em").notNull(),
  criadoEm: criadoEm(),
  ultimoUsoEm: ts("ultimo_uso_em").notNull().defaultNow(),
  userAgent: text("user_agent"),
  revogadaEm: ts("revogada_em"),
}, (t) => [uniqueIndex("sessao_token_uq").on(t.tokenHash), index("sessao_usuario_idx").on(t.usuarioId)]);

export const loginTentativa = pgTable("login_tentativa", {
  id: id(),
  email: text("email").notNull(),
  sucesso: boolean("sucesso").notNull(),
  em: ts("em").notNull().defaultNow(),
}, (t) => [index("login_tentativa_email_idx").on(t.email, t.em)]);

export const redefinicaoSenha = pgTable("redefinicao_senha", {
  id: id(),
  usuarioId: uuid("usuario_id").notNull().references(() => usuario.id),
  tokenHash: text("token_hash").notNull(),
  expiraEm: ts("expira_em").notNull(),
  usadoEm: ts("usado_em"),
  criadoPor: uuid("criado_por").references(() => usuario.id),
  criadoEm: criadoEm(),
}, (t) => [uniqueIndex("redef_token_uq").on(t.tokenHash)]);

export const papel = pgTable("papel", {
  id: id(),
  empresaId: empresaId(),
  codigo: text("codigo").notNull(),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  /** Papel previsto mas desativado (ex.: consulta financeira). */
  ativo: boolean("ativo").notNull().default(true),
  sistema: boolean("sistema").notNull().default(false),
}, (t) => [uniqueIndex("papel_codigo_uq").on(t.empresaId, t.codigo)]);

export const papelPermissao = pgTable("papel_permissao", {
  papelId: uuid("papel_id").notNull().references(() => papel.id),
  permissao: text("permissao").notNull(),
  escopo: text("escopo").notNull(), // proprio | empresa
}, (t) => [primaryKey({ columns: [t.papelId, t.permissao] })]);

export const usuarioPapel = pgTable("usuario_papel", {
  usuarioId: uuid("usuario_id").notNull().references(() => usuario.id),
  papelId: uuid("papel_id").notNull().references(() => papel.id),
  concedidoPor: uuid("concedido_por").references(() => usuario.id),
  concedidoEm: criadoEm(),
}, (t) => [primaryKey({ columns: [t.usuarioId, t.papelId] })]);

/** Concessões individuais explícitas (ex.: administrativo que vê preços; financeiro que confirma baixas). */
export const usuarioPermissao = pgTable("usuario_permissao", {
  usuarioId: uuid("usuario_id").notNull().references(() => usuario.id),
  permissao: text("permissao").notNull(),
  escopo: text("escopo").notNull(),
  concedidoPor: uuid("concedido_por").references(() => usuario.id),
  concedidoEm: criadoEm(),
}, (t) => [primaryKey({ columns: [t.usuarioId, t.permissao] })]);

// ---------------------------------------------------------------------------
// Profissionais (vínculo explícito, independente de permissões)
// ---------------------------------------------------------------------------
export const profissional = pgTable("profissional", {
  id: id(),
  empresaId: empresaId(),
  usuarioId: uuid("usuario_id").references(() => usuario.id),
  nome: text("nome").notNull(),
  /** autonomo | proprio — define pagamento por serviço e elegibilidade ao checklist de veículo. */
  vinculo: text("vinculo").notNull(),
  funcao: text("funcao").notNull().default("tecnico"), // tecnico | ajudante | administrativo | comercial | outro
  telefone: text("telefone"),
  veiculoId: uuid("veiculo_id"),
  /** Competências/tipos de serviço cadastrados (ex.: instalacao_split, vrf, eletrica). Nunca inferidas. */
  competencias: jsonb("competencias").$type<string[]>().notNull().default([]),
  /** Regiões de atendimento cadastradas (bairros/cidades). Sem geolocalização. */
  regioes: jsonb("regioes").$type<string[]>().notNull().default([]),
  ativo: boolean("ativo").notNull().default(true),
  observacoes: text("observacoes"),
  criadoEm: criadoEm(),
}, (t) => [uniqueIndex("profissional_usuario_uq").on(t.usuarioId), index("profissional_empresa_idx").on(t.empresaId)]);

// ---------------------------------------------------------------------------
// Clientes, contatos, locais, equipamentos, fornecedores
// ---------------------------------------------------------------------------
export const cliente = pgTable("cliente", {
  id: id(),
  empresaId: empresaId(),
  tipo: text("tipo").notNull().default("PJ"), // PF | PJ
  nome: text("nome").notNull(),
  documento: text("documento"),
  email: text("email"),
  telefone: text("telefone"),
  observacoes: text("observacoes"),
  ativo: boolean("ativo").notNull().default(true),
  demo: boolean("demo").notNull().default(false),
  versao: integer("versao").notNull().default(0),
  criadoEm: criadoEm(),
}, (t) => [index("cliente_empresa_nome_idx").on(t.empresaId, t.nome)]);

export const clienteContato = pgTable("cliente_contato", {
  id: id(),
  clienteId: uuid("cliente_id").notNull().references(() => cliente.id),
  nome: text("nome").notNull(),
  telefone: text("telefone"),
  email: text("email"),
  cargo: text("cargo"),
  principal: boolean("principal").notNull().default(false),
  ativo: boolean("ativo").notNull().default(true),
});

export const clienteLocal = pgTable("cliente_local", {
  id: id(),
  clienteId: uuid("cliente_id").notNull().references(() => cliente.id),
  nome: text("nome").notNull(),
  logradouro: text("logradouro"),
  numero: text("numero"),
  complemento: text("complemento"),
  bairro: text("bairro"),
  cidade: text("cidade"),
  uf: text("uf"),
  cep: text("cep"),
  instrucoesAcesso: text("instrucoes_acesso"),
  ativo: boolean("ativo").notNull().default(true),
});

export const equipamento = pgTable("equipamento", {
  id: id(),
  clienteId: uuid("cliente_id").notNull().references(() => cliente.id),
  localId: uuid("local_id").references(() => clienteLocal.id),
  tipo: text("tipo").notNull(), // split, cassete, piso-teto, VRF, janela...
  marca: text("marca"),
  modelo: text("modelo"),
  capacidadeBtu: integer("capacidade_btu"),
  numeroSerie: text("numero_serie"),
  identificacao: text("identificacao"), // ex.: "Sala 2 - evaporadora"
  observacoes: text("observacoes"),
  ativo: boolean("ativo").notNull().default(true),
});

export const fornecedor = pgTable("fornecedor", {
  id: id(),
  empresaId: empresaId(),
  nome: text("nome").notNull(),
  documento: text("documento"),
  telefone: text("telefone"),
  email: text("email"),
  observacoes: text("observacoes"),
  ativo: boolean("ativo").notNull().default(true),
});

// ---------------------------------------------------------------------------
// Contratos
// ---------------------------------------------------------------------------
export const contrato = pgTable("contrato", {
  id: id(),
  empresaId: empresaId(),
  clienteId: uuid("cliente_id").notNull().references(() => cliente.id),
  numero: text("numero").notNull(),
  descricao: text("descricao"),
  cobertura: text("cobertura"),
  /** Valor mensal: dado restrito (permissão contrato.valores.ver). */
  valorMensalCentavos: centavos("valor_mensal_centavos"),
  inicio: date("inicio").notNull(),
  fim: date("fim"),
  diaVencimento: smallint("dia_vencimento").notNull().default(10),
  visitasIncluidasMes: smallint("visitas_incluidas_mes"),
  status: text("status").notNull().default("ativo"), // ativo | suspenso | encerrado
  versao: integer("versao").notNull().default(0),
  criadoEm: criadoEm(),
}, (t) => [uniqueIndex("contrato_numero_uq").on(t.empresaId, t.numero)]);

export const contratoLocal = pgTable("contrato_local", {
  contratoId: uuid("contrato_id").notNull().references(() => contrato.id),
  localId: uuid("local_id").notNull().references(() => clienteLocal.id),
}, (t) => [primaryKey({ columns: [t.contratoId, t.localId] })]);

// ---------------------------------------------------------------------------
// Integração de pedidos (Treeunfe) — adaptador desacoplado
// ---------------------------------------------------------------------------
export const integracao = pgTable("integracao", {
  id: id(),
  empresaId: empresaId(),
  provedor: text("provedor").notNull(), // treeunfe
  /** aguardando_validacao | conectada | erro | desativada. Só "conectada" após teste válido. */
  status: text("status").notNull().default("aguardando_validacao"),
  modo: text("modo"), // webhook | consulta_periodica
  ultimoTesteEm: ts("ultimo_teste_em"),
  ultimoTesteResultado: text("ultimo_teste_resultado"),
  observacao: text("observacao"),
  atualizadoEm: atualizadoEm(),
}, (t) => [uniqueIndex("integracao_provedor_uq").on(t.empresaId, t.provedor)]);

export const pedidoExterno = pgTable("pedido_externo", {
  id: id(),
  empresaId: empresaId(),
  origem: text("origem").notNull(), // treeunfe | demo
  idExterno: text("id_externo").notNull(),
  versaoExterna: text("versao_externa"),
  atualizadoExternoEm: ts("atualizado_externo_em"),
  /** Dados originais normalizados (cliente, itens, valores, condições) — preservados sem edição. */
  dadosOriginais: jsonb("dados_originais").$type<Record<string, unknown>>().notNull(),
  hashConteudo: text("hash_conteudo").notNull(),
  clienteId: uuid("cliente_id").references(() => cliente.id),
  /** para_programar | os_criada | conferencia | cancelado | descartado */
  situacao: text("situacao").notNull().default("para_programar"),
  motivoConferencia: text("motivo_conferencia"),
  osId: uuid("os_id"),
  recebidoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
}, (t) => [uniqueIndex("pedido_externo_uq").on(t.empresaId, t.origem, t.idExterno)]);

export const pedidoExternoVersao = pgTable("pedido_externo_versao", {
  id: id(),
  pedidoId: uuid("pedido_id").notNull().references(() => pedidoExterno.id),
  hashConteudo: text("hash_conteudo").notNull(),
  versaoExterna: text("versao_externa"),
  dados: jsonb("dados").$type<Record<string, unknown>>().notNull(),
  recebidoEm: criadoEm(),
}, (t) => [uniqueIndex("pedido_versao_uq").on(t.pedidoId, t.hashConteudo)]);

export const sincronizacaoLog = pgTable("sincronizacao_log", {
  id: id(),
  empresaId: empresaId(),
  provedor: text("provedor").notNull(),
  tipo: text("tipo").notNull(), // webhook | consulta | teste | reprocessamento | demo
  status: text("status").notNull(), // sucesso | erro | ignorado_duplicado
  idExterno: text("id_externo"),
  mensagem: text("mensagem"),
  tentativa: integer("tentativa").notNull().default(1),
  payload: jsonb("payload").$type<unknown>(),
  em: criadoEm(),
  reprocessadoPor: uuid("reprocessado_por").references(() => usuario.id),
}, (t) => [index("sync_log_idx").on(t.empresaId, t.em)]);

// ---------------------------------------------------------------------------
// Ordem de serviço
// ---------------------------------------------------------------------------
export const ordemServico = pgTable("ordem_servico", {
  id: id(),
  empresaId: empresaId(),
  numero: integer("numero").notNull(),
  /** avulso | contrato | retorno_garantia */
  origem: text("origem").notNull(),
  pedidoExternoId: uuid("pedido_externo_id").references(() => pedidoExterno.id),
  referenciaExterna: text("referencia_externa"),
  contratoId: uuid("contrato_id").references(() => contrato.id),
  osOrigemId: uuid("os_origem_id"),
  clienteId: uuid("cliente_id").notNull().references(() => cliente.id),
  localId: uuid("local_id").references(() => clienteLocal.id),
  contatoId: uuid("contato_id").references(() => clienteContato.id),
  descricao: text("descricao").notNull(),
  prioridade: text("prioridade").notNull().default("normal"), // baixa | normal | alta | urgente
  observacoes: text("observacoes"),
  /** Situação comercial: rascunho (não gera cobrança) | aprovada | cancelada */
  situacaoComercial: text("situacao_comercial").notNull().default("rascunho"),
  /** Etapa macro (ver OS_ETAPAS). */
  etapa: text("etapa").notNull().default("aberta"),
  etapaDesde: ts("etapa_desde").notNull().defaultNow(),
  motivoEtapa: text("motivo_etapa"),
  /** Dimensão de material: nao_avaliado | sem_necessidade | pendente | disponivel */
  situacaoMaterial: text("situacao_material").notNull().default("nao_avaliado"),
  /** Conferência administrativa: nao_aplicavel | pendente | conferida */
  situacaoConferencia: text("situacao_conferencia").notNull().default("nao_aplicavel"),
  responsavelResolucaoId: uuid("responsavel_resolucao_id").references(() => usuario.id),
  proximaAcao: text("proxima_acao"),
  proximaAcaoEm: date("proxima_acao_em"),
  abertaPor: uuid("aberta_por").notNull().references(() => usuario.id),
  conferidaPor: uuid("conferida_por").references(() => usuario.id),
  conferidaEm: ts("conferida_em"),
  encerradaEm: ts("encerrada_em"),
  canceladaMotivo: text("cancelada_motivo"),
  demo: boolean("demo").notNull().default(false),
  /** Requisitos para recomendação de técnicos (cadastrados pelo escritório). */
  competenciasExigidas: jsonb("competencias_exigidas").$type<string[]>().notNull().default([]),
  qtdProfissionais: smallint("qtd_profissionais").notNull().default(1),
  /** Controle de concorrência otimista: edição com versão antiga é rejeitada. */
  versao: integer("versao").notNull().default(0),
  ultimoAvancoEm: ts("ultimo_avanco_em").notNull().defaultNow(),
  criadoEm: criadoEm(),
}, (t) => [
  uniqueIndex("os_numero_uq").on(t.empresaId, t.numero),
  uniqueIndex("os_pedido_externo_uq").on(t.pedidoExternoId),
  index("os_empresa_etapa_idx").on(t.empresaId, t.etapa),
]);

export const osEquipamento = pgTable("os_equipamento", {
  osId: uuid("os_id").notNull().references(() => ordemServico.id),
  equipamentoId: uuid("equipamento_id").notNull().references(() => equipamento.id),
}, (t) => [primaryKey({ columns: [t.osId, t.equipamentoId] })]);

export const osItem = pgTable("os_item", {
  id: id(),
  osId: uuid("os_id").notNull().references(() => ordemServico.id),
  tipo: text("tipo").notNull(), // servico | peca | material
  descricao: text("descricao").notNull(),
  materialId: uuid("material_id"),
  quantidade: qtd("quantidade").notNull().default("1"),
  unidade: text("unidade").notNull().default("un"),
  /** Preço cobrado: restrito (os.valores.ver). */
  precoUnitarioCentavos: centavos("preco_unitario_centavos"),
  /** Custo de compra: restrito (os.custos.ver). */
  custoUnitarioCentavos: centavos("custo_unitario_centavos"),
  /** previsto | extra_solicitado | aprovado | recusado | cancelado */
  situacao: text("situacao").notNull().default("previsto"),
  incluidoContrato: boolean("incluido_contrato").notNull().default(false),
  solicitadoPor: uuid("solicitado_por").references(() => usuario.id),
  visitaId: uuid("visita_id"),
  decididoPor: uuid("decidido_por").references(() => usuario.id),
  decididoEm: ts("decidido_em"),
  criadoEm: criadoEm(),
});

// ---------------------------------------------------------------------------
// Agenda e visitas
// ---------------------------------------------------------------------------
export const visita = pgTable("visita", {
  id: id(),
  empresaId: empresaId(),
  osId: uuid("os_id").notNull().references(() => ordemServico.id),
  sequencia: integer("sequencia").notNull(),
  tipo: text("tipo").notNull().default("atendimento"), // atendimento | continuacao | retorno | contrato
  inicioPrevisto: ts("inicio_previsto"),
  fimPrevisto: ts("fim_previsto"),
  /** nao_agendada | agendada | em_atendimento | finalizada | cancelada */
  situacao: text("situacao").notNull().default("nao_agendada"),
  /** concluida | parcial | nao_realizada */
  resultado: text("resultado"),
  motivoResultado: text("motivo_resultado"),
  comentarioResultado: text("comentario_resultado"),
  instrucoes: text("instrucoes"),
  veiculoId: uuid("veiculo_id"),
  checkinEm: ts("checkin_em"),
  checkinPor: uuid("checkin_por").references(() => usuario.id),
  checkoutEm: ts("checkout_em"),
  checkoutPor: uuid("checkout_por").references(() => usuario.id),
  pendenciaDescricao: text("pendencia_descricao"),
  proximaAcao: text("proxima_acao"),
  destinoMateriais: text("destino_materiais"),
  conferidaPor: uuid("conferida_por").references(() => usuario.id),
  conferidaEm: ts("conferida_em"),
  canceladaMotivo: text("cancelada_motivo"),
  criadoPor: uuid("criado_por").references(() => usuario.id),
  criadoEm: criadoEm(),
}, (t) => [
  uniqueIndex("visita_seq_uq").on(t.osId, t.sequencia),
  index("visita_empresa_inicio_idx").on(t.empresaId, t.inicioPrevisto),
]);

/**
 * Reserva de tempo de um profissional: participação em visita OU indisponibilidade.
 * EXCLUDE USING gist (profissional_id =, periodo &&) WHERE ativo — garante no banco
 * que duas operações concorrentes não reservam o mesmo profissional no mesmo intervalo.
 */
export const agendaReserva = pgTable("agenda_reserva", {
  id: id(),
  empresaId: empresaId(),
  profissionalId: uuid("profissional_id").notNull().references(() => profissional.id),
  visitaId: uuid("visita_id").references(() => visita.id),
  tipo: text("tipo").notNull(), // visita | indisponibilidade
  papelNaVisita: text("papel_na_visita"), // responsavel | auxiliar
  periodo: tstzrange("periodo").notNull(),
  motivo: text("motivo"),
  ativo: boolean("ativo").notNull().default(true),
  criadoPor: uuid("criado_por").references(() => usuario.id),
  criadoEm: criadoEm(),
}, (t) => [index("agenda_reserva_visita_idx").on(t.visitaId)]);

export const visitaReagendamento = pgTable("visita_reagendamento", {
  id: id(),
  visitaId: uuid("visita_id").notNull().references(() => visita.id),
  deInicio: ts("de_inicio"),
  deFim: ts("de_fim"),
  paraInicio: ts("para_inicio"),
  paraFim: ts("para_fim"),
  equipeAntes: jsonb("equipe_antes").$type<string[]>(),
  equipeDepois: jsonb("equipe_depois").$type<string[]>(),
  motivo: text("motivo").notNull(),
  por: uuid("por").notNull().references(() => usuario.id),
  em: criadoEm(),
});

export const agendaVaga = pgTable("agenda_vaga", {
  id: id(),
  empresaId: empresaId(),
  nome: text("nome").notNull(),
  horaInicio: time("hora_inicio").notNull(),
  horaFim: time("hora_fim").notNull(),
  /** 0=domingo ... 6=sábado */
  diasSemana: jsonb("dias_semana").$type<number[]>().notNull().default([1, 2, 3, 4, 5]),
  ordem: integer("ordem").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
});

export const visitaExecucao = pgTable("visita_execucao", {
  id: id(),
  visitaId: uuid("visita_id").notNull().references(() => visita.id),
  equipamentoId: uuid("equipamento_id").references(() => equipamento.id),
  diagnostico: text("diagnostico"),
  servicoRealizado: text("servico_realizado"),
  /** ok | falhou | nao_testado */
  testeFuncionamento: text("teste_funcionamento").notNull().default("nao_testado"),
  /** concluido | parcial | nao_realizado */
  resultado: text("resultado"),
  observacoes: text("observacoes"),
  atualizadoPor: uuid("atualizado_por").references(() => usuario.id),
  atualizadoEm: atualizadoEm(),
}, (t) => [uniqueIndex("visita_exec_uq").on(t.visitaId, sql`coalesce(${t.equipamentoId}, '00000000-0000-0000-0000-000000000000'::uuid)`)]);

// ---------------------------------------------------------------------------
// Pendências genéricas (tratativas com responsável/prazo)
// ---------------------------------------------------------------------------
export const pendencia = pgTable("pendencia", {
  id: id(),
  empresaId: empresaId(),
  /** visita_impedimento | solicitacao_retorno | solicitacao_remarcacao | extra_solicitado | material_necessario
   *  | ferramenta_falta | ferramenta_dano | ferramenta_no_cliente | veiculo_irregularidade | veiculo_sem_designacao
   *  | material_divergencia | outro */
  tipo: text("tipo").notNull(),
  titulo: text("titulo").notNull(),
  descricao: text("descricao"),
  prioridade: text("prioridade").notNull().default("media"), // baixa | media | alta | critica
  entidadeTipo: text("entidade_tipo"),
  entidadeId: uuid("entidade_id"),
  osId: uuid("os_id"),
  visitaId: uuid("visita_id"),
  veiculoId: uuid("veiculo_id"),
  ferramentaId: uuid("ferramenta_id"),
  profissionalId: uuid("profissional_id"),
  responsavelId: uuid("responsavel_id").references(() => usuario.id),
  prazo: date("prazo"),
  situacao: text("situacao").notNull().default("aberta"), // aberta | em_andamento | resolvida | cancelada
  /** Chave para não duplicar a mesma pendência aberta (ex.: veiculo_sem_designacao:<prof>). */
  chave: text("chave"),
  abertaPor: uuid("aberta_por").references(() => usuario.id),
  abertaEm: criadoEm(),
  resolvidaPor: uuid("resolvida_por").references(() => usuario.id),
  resolvidaEm: ts("resolvida_em"),
  resolucao: text("resolucao"),
  /** Liberação excepcional do gestor (ex.: veículo com irregularidade crítica). */
  liberacaoExcepcional: text("liberacao_excepcional"),
  proximaAcao: text("proxima_acao"),
  /** Quando a resolução depende de terceiro (fornecedor, cliente, oficina): quem/qual condição. */
  aguardandoTerceiro: text("aguardando_terceiro"),
}, (t) => [index("pendencia_empresa_sit_idx").on(t.empresaId, t.situacao)]);

// ---------------------------------------------------------------------------
// Veículos
// ---------------------------------------------------------------------------
export const veiculo = pgTable("veiculo", {
  id: id(),
  empresaId: empresaId(),
  identificacao: text("identificacao").notNull(),
  placa: text("placa"),
  modelo: text("modelo"),
  ano: smallint("ano"),
  responsavelProfissionalId: uuid("responsavel_profissional_id").references(() => profissional.id),
  odometroKm: integer("odometro_km"),
  odometroAtualizadoEm: ts("odometro_atualizado_em"),
  /** Parâmetros de manutenção por veículo: {oleo:{km,dias}, alinhamento:{km,dias}, rodizio:{km,dias}} */
  parametrosManutencao: jsonb("parametros_manutencao").$type<Record<string, { km?: number | null; dias?: number | null }>>().notNull().default({}),
  ativo: boolean("ativo").notNull().default(true),
  demo: boolean("demo").notNull().default(false),
  versao: integer("versao").notNull().default(0),
}, (t) => [uniqueIndex("veiculo_ident_uq").on(t.empresaId, t.identificacao)]);

export const veiculoOdometro = pgTable("veiculo_odometro", {
  id: id(),
  veiculoId: uuid("veiculo_id").notNull().references(() => veiculo.id),
  km: integer("km").notNull(),
  fonte: text("fonte").notNull(), // checklist | manutencao | manual | correcao
  correcao: boolean("correcao").notNull().default(false),
  motivo: text("motivo"),
  autorizadoPor: uuid("autorizado_por").references(() => usuario.id),
  registradoPor: uuid("registrado_por").notNull().references(() => usuario.id),
  em: criadoEm(),
});

export const veiculoManutencao = pgTable("veiculo_manutencao", {
  id: id(),
  veiculoId: uuid("veiculo_id").notNull().references(() => veiculo.id),
  tipo: text("tipo").notNull(), // oleo | alinhamento | rodizio | pneu | revisao | outro
  data: date("data").notNull(),
  km: integer("km"),
  descricao: text("descricao"),
  fornecedorId: uuid("fornecedor_id").references(() => fornecedor.id),
  obrigacaoId: uuid("obrigacao_id"),
  registradoPor: uuid("registrado_por").notNull().references(() => usuario.id),
  criadoEm: criadoEm(),
});

export const pneu = pgTable("pneu", {
  id: id(),
  empresaId: empresaId(),
  veiculoId: uuid("veiculo_id").references(() => veiculo.id),
  identificacao: text("identificacao").notNull(),
  marca: text("marca"),
  modelo: text("modelo"),
  posicao: text("posicao"), // DE | DD | TE | TD | estepe
  instaladoEm: date("instalado_em"),
  kmInstalacao: integer("km_instalacao"),
  retiradoEm: date("retirado_em"),
  kmRetirada: integer("km_retirada"),
  motivoRetirada: text("motivo_retirada"),
  situacao: text("situacao").notNull().default("instalado"), // instalado | retirado | estoque
}, (t) => [uniqueIndex("pneu_ident_uq").on(t.empresaId, t.identificacao)]);

// ---------------------------------------------------------------------------
// Checklists (veículo e ferramentas)
// ---------------------------------------------------------------------------
export const checklistModelo = pgTable("checklist_modelo", {
  id: id(),
  empresaId: empresaId(),
  /** veiculo_saida | veiculo_retorno | ferramentas_saida | ferramentas_retorno */
  tipo: text("tipo").notNull(),
  nome: text("nome").notNull(),
  /** Versão do modelo. Alterações criam nova versão; respostas antigas apontam para a versão usada. */
  versao: integer("versao").notNull().default(1),
  /** Validade de uma resposta para reutilização (horas). Ex.: 12h = turno. */
  validadeHoras: integer("validade_horas").notNull().default(12),
  ativo: boolean("ativo").notNull().default(true),
});

export const checklistModeloItem = pgTable("checklist_modelo_item", {
  id: id(),
  modeloId: uuid("modelo_id").notNull().references(() => checklistModelo.id),
  ordem: integer("ordem").notNull().default(0),
  descricao: text("descricao").notNull(),
  exigeFotoIrregular: boolean("exige_foto_irregular").notNull().default(false),
  /** baixa | media | alta | critica — critica pode bloquear saída até liberação do gestor. */
  criticidade: text("criticidade").notNull().default("media"),
  ativo: boolean("ativo").notNull().default(true),
});

export const checklistResposta = pgTable("checklist_resposta", {
  id: id(),
  empresaId: empresaId(),
  modeloId: uuid("modelo_id").notNull().references(() => checklistModelo.id),
  tipo: text("tipo").notNull(),
  veiculoId: uuid("veiculo_id").references(() => veiculo.id),
  profissionalId: uuid("profissional_id").references(() => profissional.id),
  usuarioId: uuid("usuario_id").notNull().references(() => usuario.id),
  km: integer("km"),
  modeloVersao: integer("modelo_versao").notNull().default(1),
  /** Composição conferida (kit de ferramentas): hash dos itens; reutilização exige a mesma composição. */
  composicaoHash: text("composicao_hash"),
  realizadoEm: criadoEm(),
  validoAte: ts("valido_ate").notNull(),
  observacoes: text("observacoes"),
  chaveIdempotencia: text("chave_idempotencia"),
}, (t) => [uniqueIndex("checklist_resp_idem_uq").on(t.chaveIdempotencia)]);

export const checklistRespostaItem = pgTable("checklist_resposta_item", {
  id: id(),
  respostaId: uuid("resposta_id").notNull().references(() => checklistResposta.id),
  itemId: uuid("item_id").references(() => checklistModeloItem.id),
  ferramentaId: uuid("ferramenta_id"),
  descricao: text("descricao").notNull(),
  /** Snapshot das regras da versão usada. */
  criticidade: text("criticidade"),
  exigeFotoIrregular: boolean("exige_foto_irregular").notNull().default(false),
  resultado: text("resultado").notNull(), // conforme | irregular | nao_aplica
  observacao: text("observacao"),
  pendenciaId: uuid("pendencia_id"),
});

// ---------------------------------------------------------------------------
// Ferramentas
// ---------------------------------------------------------------------------
export const ferramenta = pgTable("ferramenta", {
  id: id(),
  empresaId: empresaId(),
  codigo: text("codigo").notNull(),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  tipo: text("tipo").notNull().default("ferramenta"), // ferramenta | conjunto
  conjuntoId: uuid("conjunto_id"),
  /** boa | desgastada | danificada | em_manutencao | baixada */
  condicao: text("condicao").notNull().default("boa"),
  /** disponivel | reservada | aguardando_confirmacao | em_custodia | devolucao_pendente | no_cliente | extraviada | baixada */
  situacao: text("situacao").notNull().default("disponivel"),
  /** Custódia: profissional responsável identificável; opcionalmente veículo/equipe. */
  custodianteProfissionalId: uuid("custodiante_profissional_id").references(() => profissional.id),
  custodianteVeiculoId: uuid("custodiante_veiculo_id").references(() => veiculo.id),
  custodiaDesde: ts("custodia_desde"),
  osReservaId: uuid("os_reserva_id"),
  /** Recurso exclusivo: reservado por intervalo na agenda (sem sobreposição). */
  exclusiva: boolean("exclusiva").notNull().default(false),
  versao: integer("versao").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
}, (t) => [uniqueIndex("ferramenta_codigo_uq").on(t.empresaId, t.codigo)]);

export const ferramentaMovimento = pgTable("ferramenta_movimento", {
  id: id(),
  empresaId: empresaId(),
  ferramentaId: uuid("ferramenta_id").notNull().references(() => ferramenta.id),
  /** reserva | separacao | entrega | devolucao | transferencia | falta | dano | deixada_cliente | localizada | baixa | ajuste */
  tipo: text("tipo").notNull(),
  /** pendente (aguarda confirmação da outra parte) | confirmado | recusado | cancelado */
  status: text("status").notNull(),
  deProfissionalId: uuid("de_profissional_id").references(() => profissional.id),
  paraProfissionalId: uuid("para_profissional_id").references(() => profissional.id),
  veiculoId: uuid("veiculo_id").references(() => veiculo.id),
  osId: uuid("os_id"),
  visitaId: uuid("visita_id"),
  condicao: text("condicao"),
  observacao: text("observacao"),
  registradoPor: uuid("registrado_por").notNull().references(() => usuario.id),
  registradoEm: criadoEm(),
  confirmadoPor: uuid("confirmado_por").references(() => usuario.id),
  confirmadoEm: ts("confirmado_em"),
  chaveIdempotencia: text("chave_idempotencia"),
}, (t) => [
  uniqueIndex("ferr_mov_idem_uq").on(t.chaveIdempotencia),
  index("ferr_mov_ferr_idx").on(t.ferramentaId, t.registradoEm),
]);

// ---------------------------------------------------------------------------
// Materiais
// ---------------------------------------------------------------------------
export const material = pgTable("material", {
  id: id(),
  empresaId: empresaId(),
  codigo: text("codigo").notNull(),
  nome: text("nome").notNull(),
  categoria: text("categoria"), // cobre | gas | eletrico | fixacao | peca | isolamento | outro
  /** Especificação técnica: bitola/tipo (cobre), modelo de peça etc. */
  especificacao: text("especificacao"),
  /** Unidade única do material: un | m | kg | l | cx | rolo | par */
  unidade: text("unidade").notNull(),
  fracionavel: boolean("fracionavel").notNull().default(false),
  controlaRetalho: boolean("controla_retalho").notNull().default(false),
  estoqueMinimo: qtd("estoque_minimo"),
  /** Custo de referência (restrito: material.custos.ver). */
  custoReferenciaCentavos: centavos("custo_referencia_centavos"),
  ativo: boolean("ativo").notNull().default(true),
  versao: integer("versao").notNull().default(0),
}, (t) => [uniqueIndex("material_codigo_uq").on(t.empresaId, t.codigo)]);

/**
 * Posições de saldo: almoxarifado, veículo (custódia móvel), profissional (custódia), segregado (quarentena),
 * e posições virtuais de saída: fornecedor (entrada), consumo, perda, ajuste.
 */
export const materialPosicao = pgTable("material_posicao", {
  id: id(),
  empresaId: empresaId(),
  tipo: text("tipo").notNull(), // almoxarifado | veiculo | profissional | segregado | fornecedor | consumo | perda | ajuste
  nome: text("nome").notNull(),
  veiculoId: uuid("veiculo_id").references(() => veiculo.id),
  profissionalId: uuid("profissional_id").references(() => profissional.id),
  /** Profissional responsável identificável (para posição veículo). */
  responsavelProfissionalId: uuid("responsavel_profissional_id").references(() => profissional.id),
  virtual: boolean("virtual").notNull().default(false),
  ativo: boolean("ativo").notNull().default(true),
}, (t) => [
  uniqueIndex("mat_pos_prof_uq").on(t.profissionalId),
  uniqueIndex("mat_pos_veic_uq").on(t.veiculoId),
]);

/** Saldo físico por material e posição (somente posições não virtuais). CHECK quantidade >= 0 e reservado <= quantidade. */
export const materialSaldo = pgTable("material_saldo", {
  materialId: uuid("material_id").notNull().references(() => material.id),
  posicaoId: uuid("posicao_id").notNull().references(() => materialPosicao.id),
  quantidade: qtd("quantidade").notNull().default("0"),
  reservado: qtd("reservado").notNull().default("0"),
  atualizadoEm: atualizadoEm(),
}, (t) => [primaryKey({ columns: [t.materialId, t.posicaoId] })]);

export const materialReserva = pgTable("material_reserva", {
  id: id(),
  empresaId: empresaId(),
  materialId: uuid("material_id").notNull().references(() => material.id),
  posicaoId: uuid("posicao_id").notNull().references(() => materialPosicao.id),
  osId: uuid("os_id").notNull().references(() => ordemServico.id),
  quantidade: qtd("quantidade").notNull(),
  situacao: text("situacao").notNull().default("ativa"), // ativa | atendida | cancelada
  criadoPor: uuid("criado_por").notNull().references(() => usuario.id),
  criadoEm: criadoEm(),
});

/**
 * Movimento de material (razão). Efeito no saldo:
 *  - origem é debitada quando status ∈ {em_transito, confirmado};
 *  - destino é creditado quando status = confirmado;
 *  - informado (pelo técnico) não altera saldo até conferência.
 */
export const materialMovimento = pgTable("material_movimento", {
  id: id(),
  empresaId: empresaId(),
  materialId: uuid("material_id").notNull().references(() => material.id),
  /** entrada_compra | entrega | transferencia | consumo | devolucao | perda | ajuste | segregacao | liberacao_segregado */
  tipo: text("tipo").notNull(),
  /** informado | em_transito | confirmado | recusado | cancelado */
  status: text("status").notNull(),
  origemPosicaoId: uuid("origem_posicao_id").notNull().references(() => materialPosicao.id),
  destinoPosicaoId: uuid("destino_posicao_id").notNull().references(() => materialPosicao.id),
  quantidadeInformada: qtd("quantidade_informada"),
  quantidade: qtd("quantidade").notNull(),
  unidade: text("unidade").notNull(),
  osId: uuid("os_id"),
  visitaId: uuid("visita_id"),
  compraId: uuid("compra_id"),
  divergenciaId: uuid("divergencia_id"),
  retalho: boolean("retalho").notNull().default(false),
  observacao: text("observacao"),
  registradoPor: uuid("registrado_por").notNull().references(() => usuario.id),
  registradoEm: criadoEm(),
  confirmadoPor: uuid("confirmado_por").references(() => usuario.id),
  confirmadoEm: ts("confirmado_em"),
  chaveIdempotencia: text("chave_idempotencia"),
}, (t) => [
  uniqueIndex("mat_mov_idem_uq").on(t.chaveIdempotencia),
  index("mat_mov_os_idx").on(t.osId),
  index("mat_mov_mat_idx").on(t.materialId, t.registradoEm),
]);

/** Retalhos de cobre (ou outro material com controla_retalho): preservam especificação e comprimento. */
export const materialRetalho = pgTable("material_retalho", {
  id: id(),
  empresaId: empresaId(),
  materialId: uuid("material_id").notNull().references(() => material.id),
  posicaoId: uuid("posicao_id").notNull().references(() => materialPosicao.id),
  comprimento: qtd("comprimento").notNull(),
  situacao: text("situacao").notNull().default("disponivel"), // disponivel | utilizado | descartado
  movimentoOrigemId: uuid("movimento_origem_id"),
  criadoEm: criadoEm(),
});

export const materialDivergencia = pgTable("material_divergencia", {
  id: id(),
  empresaId: empresaId(),
  materialId: uuid("material_id").notNull().references(() => material.id),
  posicaoId: uuid("posicao_id").references(() => materialPosicao.id),
  profissionalId: uuid("profissional_id").references(() => profissional.id),
  osId: uuid("os_id"),
  /** falta | sobra | danificado | peca_divergente | diferenca_inventario */
  tipo: text("tipo").notNull(),
  quantidade: qtd("quantidade").notNull(),
  descricao: text("descricao"),
  /** aberta | em_investigacao | mantida_custodia | localizada | perda_aprovada | resolvida */
  situacao: text("situacao").notNull().default("aberta"),
  abertaPor: uuid("aberta_por").notNull().references(() => usuario.id),
  abertaEm: criadoEm(),
  justificativa: text("justificativa"),
  decididaPor: uuid("decidida_por").references(() => usuario.id),
  decididaEm: ts("decidida_em"),
  autoaprovacao: boolean("autoaprovacao").notNull().default(false),
});

/** Contagem física: saldo esperado x físico conferido. Diferença abre divergência, nunca ajuste automático. */
export const materialContagem = pgTable("material_contagem", {
  id: id(),
  empresaId: empresaId(),
  materialId: uuid("material_id").notNull().references(() => material.id),
  posicaoId: uuid("posicao_id").notNull().references(() => materialPosicao.id),
  quantidadeEsperada: qtd("quantidade_esperada").notNull(),
  quantidadeContada: qtd("quantidade_contada").notNull(),
  divergenciaId: uuid("divergencia_id"),
  contadoPor: uuid("contado_por").notNull().references(() => usuario.id),
  em: criadoEm(),
});

export const compra = pgTable("compra", {
  id: id(),
  empresaId: empresaId(),
  fornecedorId: uuid("fornecedor_id").references(() => fornecedor.id),
  osId: uuid("os_id"),
  data: date("data").notNull(),
  documento: text("documento"),
  /** registrada | recebida | cancelada */
  situacao: text("situacao").notNull().default("registrada"),
  /** Uma compra gera no máximo uma obrigação (UNIQUE em obrigacao.chave_unicidade = compra:<id>). */
  obrigacaoId: uuid("obrigacao_id"),
  registradaPor: uuid("registrada_por").notNull().references(() => usuario.id),
  criadoEm: criadoEm(),
});

export const compraItem = pgTable("compra_item", {
  id: id(),
  compraId: uuid("compra_id").notNull().references(() => compra.id),
  materialId: uuid("material_id").notNull().references(() => material.id),
  quantidade: qtd("quantidade").notNull(),
  custoUnitarioCentavos: centavos("custo_unitario_centavos").notNull(),
  destinoPosicaoId: uuid("destino_posicao_id").references(() => materialPosicao.id),
});

// ---------------------------------------------------------------------------
// Financeiro operacional
// ---------------------------------------------------------------------------
export const contaFinanceira = pgTable("conta_financeira", {
  id: id(),
  empresaId: empresaId(),
  nome: text("nome").notNull(),
  tipo: text("tipo").notNull().default("banco"), // banco | caixa | outro
  /** Saldo inicial por data, cadastrado somente pelo gestor. Nulo = não informado (projeção incompleta). */
  saldoInicialCentavos: centavos("saldo_inicial_centavos"),
  saldoInicialData: date("saldo_inicial_data"),
  saldoInicialPor: uuid("saldo_inicial_por").references(() => usuario.id),
  ativo: boolean("ativo").notNull().default(true),
});

export const categoriaFinanceira = pgTable("categoria_financeira", {
  id: id(),
  empresaId: empresaId(),
  natureza: text("natureza").notNull(), // receber | pagar
  codigo: text("codigo").notNull(),
  nome: text("nome").notNull(),
  /** Restrita: salários, retiradas dos sócios — exige financeiro.restrito.ver. */
  restrita: boolean("restrita").notNull().default(false),
  /** Dupla aprovação a partir deste valor (centavos). Nulo = não exige. 0 = sempre. */
  duplaAprovacaoAcimaCentavos: centavos("dupla_aprovacao_acima_centavos"),
  ativo: boolean("ativo").notNull().default(true),
}, (t) => [uniqueIndex("categoria_codigo_uq").on(t.empresaId, t.codigo)]);

/** Obrigação financeira (conta a receber ou a pagar). */
export const obrigacao = pgTable("obrigacao", {
  id: id(),
  empresaId: empresaId(),
  natureza: text("natureza").notNull(), // receber | pagar
  categoriaId: uuid("categoria_id").notNull().references(() => categoriaFinanceira.id),
  clienteId: uuid("cliente_id").references(() => cliente.id),
  fornecedorId: uuid("fornecedor_id").references(() => fornecedor.id),
  profissionalId: uuid("profissional_id").references(() => profissional.id),
  beneficiarioNome: text("beneficiario_nome"),
  descricao: text("descricao").notNull(),
  competencia: date("competencia"),
  valorBrutoCentavos: centavos("valor_bruto_centavos").notNull(),
  descontoCentavos: centavos("desconto_centavos").notNull().default(0),
  descontoAutorizadoPor: uuid("desconto_autorizado_por").references(() => usuario.id),
  /** os | contrato | compra | autonomo | manutencao | manual | adiantamento */
  origemTipo: text("origem_tipo").notNull(),
  origemId: uuid("origem_id"),
  osId: uuid("os_id"),
  veiculoId: uuid("veiculo_id"),
  /** Chave idempotente por origem (ex.: contrato:<id>:2026-11, os:<id>:principal, compra:<id>, autonomo-semana:<prof>:<data>). */
  chaveUnicidade: text("chave_unicidade"),
  /** rascunho | aguardando_aprovacao | aprovada | rejeitada | cancelada */
  situacaoAprovacao: text("situacao_aprovacao").notNull().default("aguardando_aprovacao"),
  contaPrevistaId: uuid("conta_prevista_id").references(() => contaFinanceira.id),
  documento: text("documento"),
  notaFiscalRef: text("nota_fiscal_ref"),
  criadoPor: uuid("criado_por").notNull().references(() => usuario.id),
  criadoEm: criadoEm(),
  canceladaPor: uuid("cancelada_por").references(() => usuario.id),
  canceladaMotivo: text("cancelada_motivo"),
  demo: boolean("demo").notNull().default(false),
  /** Obrigação anterior à data de corte (implantação): não é venda nova do período. */
  legado: boolean("legado").notNull().default(false),
  versao: integer("versao").notNull().default(0),
}, (t) => [
  uniqueIndex("obrigacao_chave_uq").on(t.empresaId, t.chaveUnicidade),
  index("obrigacao_empresa_nat_idx").on(t.empresaId, t.natureza),
]);

export const parcela = pgTable("parcela", {
  id: id(),
  obrigacaoId: uuid("obrigacao_id").notNull().references(() => obrigacao.id),
  numero: integer("numero").notNull(),
  descricao: text("descricao"), // "Entrada", "Parcela 2/3"
  vencimento: date("vencimento").notNull(),
  /** Data esperada de recebimento/pagamento (combinada na cobrança). Distinta do vencimento contratual. */
  dataEsperada: date("data_esperada"),
  valorCentavos: centavos("valor_centavos").notNull(),
  cancelada: boolean("cancelada").notNull().default(false),
  canceladaMotivo: text("cancelada_motivo"),
}, (t) => [uniqueIndex("parcela_num_uq").on(t.obrigacaoId, t.numero), index("parcela_venc_idx").on(t.vencimento)]);

/**
 * Baixa = registro de fato (recebimento/pagamento), não movimentação bancária.
 * Só status=confirmada altera o realizado. Estorno = nova baixa com valor negativo (estorno_de_id), original preservada.
 */
export const baixa = pgTable("baixa", {
  id: id(),
  empresaId: empresaId(),
  parcelaId: uuid("parcela_id").notNull().references(() => parcela.id),
  contaId: uuid("conta_id").notNull().references(() => contaFinanceira.id),
  valorCentavos: centavos("valor_centavos").notNull(),
  dataPagamento: date("data_pagamento").notNull(),
  forma: text("forma"), // pix | boleto | dinheiro | transferencia | cartao | outro
  /** aguardando_conferencia | confirmada | rejeitada */
  status: text("status").notNull().default("aguardando_conferencia"),
  estornoDeId: uuid("estorno_de_id"),
  motivo: text("motivo"),
  registradaPor: uuid("registrada_por").notNull().references(() => usuario.id),
  registradaEm: criadoEm(),
  confirmadaPor: uuid("confirmada_por").references(() => usuario.id),
  confirmadaEm: ts("confirmada_em"),
  autoconfirmacao: boolean("autoconfirmacao").notNull().default(false),
  /** Pagamento que efetivamente ocorreu sem aprovação prévia: registrado com comprovante e exceção para revisão. */
  excecaoSemAprovacao: boolean("excecao_sem_aprovacao").notNull().default(false),
  chaveIdempotencia: text("chave_idempotencia"),
}, (t) => [uniqueIndex("baixa_idem_uq").on(t.chaveIdempotencia), index("baixa_parcela_idx").on(t.parcelaId)]);

export const transferenciaConta = pgTable("transferencia_conta", {
  id: id(),
  empresaId: empresaId(),
  origemContaId: uuid("origem_conta_id").notNull().references(() => contaFinanceira.id),
  destinoContaId: uuid("destino_conta_id").notNull().references(() => contaFinanceira.id),
  valorCentavos: centavos("valor_centavos").notNull(),
  data: date("data").notNull(),
  descricao: text("descricao"),
  status: text("status").notNull().default("aguardando_conferencia"), // aguardando_conferencia | confirmada | rejeitada | estornada
  registradaPor: uuid("registrada_por").notNull().references(() => usuario.id),
  confirmadaPor: uuid("confirmada_por").references(() => usuario.id),
  confirmadaEm: ts("confirmada_em"),
  chaveIdempotencia: text("chave_idempotencia"),
  criadoEm: criadoEm(),
}, (t) => [uniqueIndex("transf_idem_uq").on(t.chaveIdempotencia)]);

/** Decisões de aprovação (obrigações, baixas, estornos, perdas, ajustes, descontos, odômetro, valores de autônomos). */
export const aprovacao = pgTable("aprovacao", {
  id: id(),
  empresaId: empresaId(),
  entidadeTipo: text("entidade_tipo").notNull(),
  entidadeId: uuid("entidade_id").notNull(),
  acao: text("acao").notNull(),
  decisao: text("decisao").notNull(), // aprovada | rejeitada
  solicitadoPor: uuid("solicitado_por").references(() => usuario.id),
  decididoPor: uuid("decidido_por").notNull().references(() => usuario.id),
  /** Quem lançou também aprovou — registrado explicitamente. */
  autoaprovacao: boolean("autoaprovacao").notNull().default(false),
  motivo: text("motivo"),
  valorCentavos: centavos("valor_centavos"),
  em: criadoEm(),
}, (t) => [
  index("aprovacao_ent_idx").on(t.entidadeTipo, t.entidadeId),
  uniqueIndex("aprovacao_unica_por_decisor").on(t.entidadeTipo, t.entidadeId, t.acao, t.decididoPor),
]);

export const cobrancaContato = pgTable("cobranca_contato", {
  id: id(),
  empresaId: empresaId(),
  obrigacaoId: uuid("obrigacao_id").references(() => obrigacao.id),
  clienteId: uuid("cliente_id").notNull().references(() => cliente.id),
  canal: text("canal").notNull(), // telefone | whatsapp | email | presencial | outro
  resumo: text("resumo").notNull(),
  responsavelId: uuid("responsavel_id").notNull().references(() => usuario.id),
  proximaAcao: text("proxima_acao"),
  proximaAcaoEm: date("proxima_acao_em"),
  em: criadoEm(),
});

/** Serviço de autônomo por OS: valor combinado definido pelo gestor; técnico só consulta. */
export const autonomoServico = pgTable("autonomo_servico", {
  id: id(),
  empresaId: empresaId(),
  osId: uuid("os_id").notNull().references(() => ordemServico.id),
  profissionalId: uuid("profissional_id").notNull().references(() => profissional.id),
  descricao: text("descricao").notNull(),
  /** Base do acordo: servico | visita | pacote | adicional_retorno */
  base: text("base").notNull().default("servico"),
  /** Diferencia linhas na mesma OS: principal | visita:<id> | adicional:<n> */
  chave: text("chave").notNull().default("principal"),
  visitaId: uuid("visita_id"),
  /** Atendimento já coberto por acordo anterior (ex.: pacote, OS original do retorno): não gera novo pagamento. */
  cobertoPorId: uuid("coberto_por_id"),
  valorCombinadoCentavos: centavos("valor_combinado_centavos"),
  valorDefinidoPor: uuid("valor_definido_por").references(() => usuario.id),
  /** aguardando_valor | aguardando_conferencia | conferido | liberado | pago | cancelado */
  situacao: text("situacao").notNull().default("aguardando_valor"),
  conferidoPor: uuid("conferido_por").references(() => usuario.id),
  conferidoEm: ts("conferido_em"),
  liberadoPor: uuid("liberado_por").references(() => usuario.id),
  liberadoEm: ts("liberado_em"),
  resumoId: uuid("resumo_id"),
  criadoEm: criadoEm(),
}, (t) => [uniqueIndex("autonomo_servico_uq").on(t.osId, t.profissionalId, t.chave)]);

export const adiantamento = pgTable("adiantamento", {
  id: id(),
  empresaId: empresaId(),
  profissionalId: uuid("profissional_id").notNull().references(() => profissional.id),
  valorCentavos: centavos("valor_centavos").notNull(),
  data: date("data").notNull(),
  descricao: text("descricao"),
  obrigacaoId: uuid("obrigacao_id"),
  /** Abatido uma única vez: resumo_id preenchido. */
  resumoId: uuid("resumo_id"),
  registradoPor: uuid("registrado_por").notNull().references(() => usuario.id),
  criadoEm: criadoEm(),
});

export const resumoSemanalAutonomo = pgTable("resumo_semanal_autonomo", {
  id: id(),
  empresaId: empresaId(),
  profissionalId: uuid("profissional_id").notNull().references(() => profissional.id),
  semanaInicio: date("semana_inicio").notNull(),
  dataPrevistaPagamento: date("data_prevista_pagamento").notNull(),
  totalServicosCentavos: centavos("total_servicos_centavos").notNull(),
  totalAdiantamentosCentavos: centavos("total_adiantamentos_centavos").notNull(),
  liquidoCentavos: centavos("liquido_centavos").notNull(),
  /** preparado | liberacao_solicitada | liberado | cancelado */
  situacao: text("situacao").notNull().default("preparado"),
  obrigacaoId: uuid("obrigacao_id"),
  preparadoPor: uuid("preparado_por").notNull().references(() => usuario.id),
  criadoEm: criadoEm(),
}, (t) => [uniqueIndex("resumo_semana_uq").on(t.profissionalId, t.semanaInicio)]);

// ---------------------------------------------------------------------------
// Comuns: anexos, notificações, auditoria
// ---------------------------------------------------------------------------
export const anexo = pgTable("anexo", {
  id: id(),
  empresaId: empresaId(),
  entidadeTipo: text("entidade_tipo").notNull(), // visita | visita_execucao | checklist_item | pendencia | baixa | obrigacao | ferramenta | veiculo | os | material_divergencia
  entidadeId: uuid("entidade_id").notNull(),
  categoria: text("categoria").notNull().default("foto"), // foto | comprovante | nota_fiscal | documento
  nomeArquivo: text("nome_arquivo").notNull(),
  mime: text("mime").notNull(),
  tamanhoBytes: integer("tamanho_bytes").notNull(),
  chaveStorage: text("chave_storage").notNull(),
  enviadoPor: uuid("enviado_por").notNull().references(() => usuario.id),
  enviadoEm: criadoEm(),
}, (t) => [index("anexo_ent_idx").on(t.entidadeTipo, t.entidadeId)]);

export const notificacao = pgTable("notificacao", {
  id: id(),
  empresaId: empresaId(),
  usuarioId: uuid("usuario_id").notNull().references(() => usuario.id),
  tipo: text("tipo").notNull(),
  /** Agrupa eventos do mesmo problema: uma notificação aberta por usuário+chave. */
  chaveAgrupamento: text("chave_agrupamento").notNull(),
  titulo: text("titulo").notNull(),
  mensagem: text("mensagem"),
  link: text("link"),
  prioridade: text("prioridade").notNull().default("media"),
  vencimento: date("vencimento"),
  ocorrencias: integer("ocorrencias").notNull().default(1),
  lidaEm: ts("lida_em"),
  /** Encerrada quando o registro de origem é resolvido (não ao ler). */
  encerradaEm: ts("encerrada_em"),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
}, (t) => [index("notif_usuario_idx").on(t.usuarioId, t.encerradaEm)]);

export const auditoria = pgTable("auditoria", {
  id: id(),
  empresaId: empresaId(),
  usuarioId: uuid("usuario_id").references(() => usuario.id),
  acao: text("acao").notNull(),
  entidadeTipo: text("entidade_tipo").notNull(),
  entidadeId: text("entidade_id"),
  motivo: text("motivo"),
  antes: jsonb("antes").$type<unknown>(),
  depois: jsonb("depois").$type<unknown>(),
  sensivel: boolean("sensivel").notNull().default(false),
  em: criadoEm(),
}, (t) => [index("auditoria_ent_idx").on(t.entidadeTipo, t.entidadeId), index("auditoria_em_idx").on(t.empresaId, t.em)]);

// ---------------------------------------------------------------------------
// Aditivo: recursos exclusivos, participação, prontidão, relatórios, rotinas
// ---------------------------------------------------------------------------
/** Reserva de recurso exclusivo (veículo ou ferramenta) por intervalo. EXCLUDE impede sobreposição. */
export const recursoReserva = pgTable("recurso_reserva", {
  id: id(),
  empresaId: empresaId(),
  visitaId: uuid("visita_id").notNull().references(() => visita.id),
  veiculoId: uuid("veiculo_id").references(() => veiculo.id),
  ferramentaId: uuid("ferramenta_id").references(() => ferramenta.id),
  periodo: tstzrange("periodo").notNull(),
  ativo: boolean("ativo").notNull().default(true),
  criadoPor: uuid("criado_por").references(() => usuario.id),
  criadoEm: criadoEm(),
}, (t) => [index("recurso_reserva_visita_idx").on(t.visitaId)]);

/** Participação individual: cada integrante registra a própria chegada/saída. O responsável inicia/encerra a visita. */
export const visitaParticipacao = pgTable("visita_participacao", {
  id: id(),
  visitaId: uuid("visita_id").notNull().references(() => visita.id),
  profissionalId: uuid("profissional_id").notNull().references(() => profissional.id),
  chegadaEm: ts("chegada_em"),
  saidaEm: ts("saida_em"),
  observacao: text("observacao"),
  registradoPor: uuid("registrado_por").notNull().references(() => usuario.id),
}, (t) => [uniqueIndex("visita_part_uq").on(t.visitaId, t.profissionalId)]);

/** Exceção autorizada de prontidão (item impeditivo liberado com justificativa). */
export const visitaLiberacao = pgTable("visita_liberacao", {
  id: id(),
  visitaId: uuid("visita_id").notNull().references(() => visita.id),
  item: text("item").notNull(),
  justificativa: text("justificativa").notNull(),
  autorizadoPor: uuid("autorizado_por").notNull().references(() => usuario.id),
  em: criadoEm(),
}, (t) => [uniqueIndex("visita_lib_uq").on(t.visitaId, t.item)]);

/** Relatório de atendimento emitido (visita ou OS), versionado, com snapshot dos campos externos e ciência. */
export const relatorioAtendimento = pgTable("relatorio_atendimento", {
  id: id(),
  empresaId: empresaId(),
  escopo: text("escopo").notNull(), // visita | os
  osId: uuid("os_id").notNull().references(() => ordemServico.id),
  visitaId: uuid("visita_id").references(() => visita.id),
  versao: integer("versao").notNull(),
  /** Somente campos da lista permitida para documento externo. */
  conteudo: jsonb("conteudo").$type<Record<string, unknown>>().notNull(),
  anexosIds: jsonb("anexos_ids").$type<string[]>().notNull().default([]),
  emitidoPor: uuid("emitido_por").notNull().references(() => usuario.id),
  emitidoEm: criadoEm(),
  /** registrada | ausente | recusada | pendente — ciência não é assinatura digital certificada. */
  cienciaSituacao: text("ciencia_situacao").notNull().default("pendente"),
  cienciaNome: text("ciencia_nome"),
  cienciaEm: ts("ciencia_em"),
  cienciaObservacao: text("ciencia_observacao"),
  cienciaRegistradaPor: uuid("ciencia_registrada_por").references(() => usuario.id),
}, (t) => [uniqueIndex("relatorio_versao_uq").on(t.osId, t.escopo, sql`coalesce(${t.visitaId}, '00000000-0000-0000-0000-000000000000'::uuid)`, t.versao)]);

/** Execuções de rotinas agendadas (recorrência, sincronização). chave única por período = idempotência. */
export const rotinaExecucao = pgTable("rotina_execucao", {
  id: id(),
  empresaId: uuid("empresa_id").references(() => empresa.id),
  rotina: text("rotina").notNull(),
  chave: text("chave").notNull(),
  status: text("status").notNull(), // executando | sucesso | erro
  tentativa: integer("tentativa").notNull().default(1),
  iniciadoEm: criadoEm(),
  finalizadoEm: ts("finalizado_em"),
  mensagem: text("mensagem"),
  resultado: jsonb("resultado").$type<unknown>(),
  disparadoPor: text("disparado_por").notNull().default("agendador"), // agendador | usuario:<id>
}, (t) => [uniqueIndex("rotina_chave_uq").on(t.rotina, t.chave)]);
